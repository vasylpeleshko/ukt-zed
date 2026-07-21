import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { UktzedCandidate } from '../../domain/classification.types';
import {
  buildTsQuery,
  KeywordMatchMode,
  PositionSearchPort,
  UktzedPositionRecord,
} from '../../domain/position-search.port';

export interface ParsedPosition {
  code: string;
  codeRaw: string;
  name: string;
  groupCode: string;
  parentCode?: string;
  level: number;
}

export type { KeywordMatchMode };

@Injectable()
export class UktzedPositionRepository implements PositionSearchPort {
  constructor(private readonly prisma: PrismaService) {}

  async count(): Promise<number> {
    return this.prisma.uktzedPosition.count();
  }

  async ping(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  async findByCode(code: string): Promise<UktzedPositionRecord | null> {
    return this.prisma.uktzedPosition.findUnique({ where: { code } });
  }

  async upsertMany(positions: ParsedPosition[]): Promise<void> {
    const batchSize = 500;
    for (let i = 0; i < positions.length; i += batchSize) {
      const batch = positions.slice(i, i + batchSize);
      await this.prisma.$transaction(
        batch.map((p) =>
          this.prisma.uktzedPosition.upsert({
            where: { code: p.code },
            create: p,
            update: {
              name: p.name,
              groupCode: p.groupCode,
              parentCode: p.parentCode,
              level: p.level,
              codeRaw: p.codeRaw,
            },
          }),
        ),
      );
    }
  }

  async countEmbedded(): Promise<number> {
    const [{ count }] = await this.prisma.$queryRawUnsafe<
      Array<{ count: bigint }>
    >(
      `SELECT COUNT(*)::bigint AS count FROM uktzed_positions WHERE embedding IS NOT NULL`,
    );
    return Number(count);
  }

  async keywordSearch(
    tokens: string[],
    limit = 20,
    groupFilter?: string[],
    codePrefixFilter?: string[],
    matchMode: KeywordMatchMode = 'and',
  ): Promise<UktzedCandidate[]> {
    if (tokens.length === 0) return [];

    const tsQueryText = buildTsQuery(tokens, matchMode);
    if (!tsQueryText) return [];

    const params: unknown[] = [tsQueryText];
    let paramIdx = 2;
    const filters: string[] = [`search_vector @@ to_tsquery('simple', $1)`];

    if (groupFilter?.length) {
      filters.push(`group_code = ANY($${paramIdx})`);
      params.push(groupFilter);
      paramIdx++;
    }

    if (codePrefixFilter?.length) {
      const prefixConds = codePrefixFilter.map((_, i) => {
        const idx = paramIdx + i;
        return `code LIKE $${idx}`;
      });
      filters.push(`(${prefixConds.join(' OR ')})`);
      for (const prefix of codePrefixFilter) {
        params.push(`${prefix}%`);
      }
      paramIdx += codePrefixFilter.length;
    }

    params.push(limit);

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        code: string;
        name: string;
        group_code: string;
        search_context: string | null;
        score: number;
      }>
    >(
      `
      SELECT code, name, group_code, search_context,
        (
          ts_rank(search_vector, to_tsquery('simple', $1)) *
          CASE WHEN level = 10 THEN 1.2 WHEN level = 6 THEN 1.1 WHEN level = 4 THEN 1.0 ELSE 0.8 END
        )::float AS score
      FROM uktzed_positions
      WHERE ${filters.join(' AND ')}
      ORDER BY score DESC, level DESC, code ASC
      LIMIT $${paramIdx}
      `,
      ...params,
    );

    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      groupCode: r.group_code,
      searchContext: r.search_context ?? undefined,
      score: Number(r.score),
    }));
  }

  async genericInGroupSearch(
    groupCodes: string[],
    limit = 10,
  ): Promise<UktzedCandidate[]> {
    if (groupCodes.length === 0) return [];

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{
        code: string;
        name: string;
        group_code: string;
        search_context: string | null;
        score: number;
      }>
    >(
      `
      SELECT code, name, group_code, search_context,
        (
          CASE WHEN LOWER(name) LIKE '%інші%' THEN 3 ELSE 0 END +
          CASE WHEN LOWER(COALESCE(search_context, '')) LIKE '%інші%' THEN 2 ELSE 0 END +
          CASE WHEN level >= 8 THEN 1.1 WHEN level >= 6 THEN 1.0 ELSE 0.9 END
        )::float AS score
      FROM uktzed_positions
      WHERE group_code = ANY($1)
        AND (
          LOWER(name) LIKE '%інші%'
          OR LOWER(COALESCE(search_context, '')) LIKE '%інші%'
        )
      ORDER BY score DESC, level DESC, code ASC
      LIMIT $2
      `,
      groupCodes,
      limit,
    );

    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      groupCode: r.group_code,
      searchContext: r.search_context ?? undefined,
      score: Number(r.score),
    }));
  }

  async vectorSearch(
    embedding: number[],
    limit = 20,
    groupFilter?: string[],
    codePrefixFilter?: string[],
  ): Promise<UktzedCandidate[]> {
    const vectorLiteral = `[${embedding.join(',')}]`;
    const params: unknown[] = [vectorLiteral];
    let paramIdx = 2;
    const filters: string[] = ['embedding IS NOT NULL'];

    if (groupFilter?.length) {
      filters.push(`group_code = ANY($${paramIdx})`);
      params.push(groupFilter);
      paramIdx++;
    }

    if (codePrefixFilter?.length) {
      const prefixConds = codePrefixFilter.map((_, i) => {
        const idx = paramIdx + i;
        return `code LIKE $${idx}`;
      });
      filters.push(`(${prefixConds.join(' OR ')})`);
      for (const prefix of codePrefixFilter) {
        params.push(`${prefix}%`);
      }
      paramIdx += codePrefixFilter.length;
    }

    params.push(limit);

    const rows = await this.prisma.$queryRawUnsafe<
      Array<{ code: string; name: string; group_code: string; score: number }>
    >(
      `
      SELECT code, name, group_code,
        (1 - (embedding <=> $1::vector))::float AS score
      FROM uktzed_positions
      WHERE ${filters.join(' AND ')}
      ORDER BY embedding <=> $1::vector
      LIMIT $${paramIdx}
      `,
      ...params,
    );

    return rows.map((r) => ({
      code: r.code,
      name: r.name,
      groupCode: r.group_code,
      score: Number(r.score),
    }));
  }
}
