import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  POSITION_SEARCH_PORT,
  PositionSearchPort,
} from '../domain/position-search.port';
import {
  NormalizedQuery,
  RuleHint,
  UktzedCandidate,
} from '../domain/classification.types';

export type KeywordMatchMode = 'and' | 'or';

@Injectable()
export class KeywordSearchService {
  constructor(
    @Inject(POSITION_SEARCH_PORT)
    private readonly repository: PositionSearchPort,
  ) {}

  async search(
    query: NormalizedQuery,
    hints: RuleHint[],
    limit = 20,
  ): Promise<UktzedCandidate[]> {
    const groupFilter = [
      ...new Set(hints.flatMap((h) => h.groupCodes ?? [])),
    ];
    const codePrefixFilter = [
      ...new Set(hints.flatMap((h) => h.codePrefixes ?? [])),
    ];
    const tokens =
      query.tokens.length > 0 ? query.tokens : [query.searchText].filter(Boolean);

    let merged = await this.runKeywordQuery(
      tokens,
      limit,
      groupFilter,
      codePrefixFilter,
      'and',
    );

    if (query.isVague && groupFilter.length > 0) {
      const generic = await this.repository.genericInGroupSearch(
        groupFilter,
        10,
      );
      const map = new Map(merged.map((r) => [r.code, r]));
      for (const r of generic) {
        const existing = map.get(r.code);
        map.set(
          r.code,
          existing
            ? { ...existing, score: existing.score + r.score * 0.5 }
            : r,
        );
      }
      merged = [...map.values()].sort((a, b) => b.score - a.score);
    }

    if (merged.length >= 5) {
      return merged.slice(0, limit);
    }

    const broadResults = await this.runKeywordQuery(
      tokens,
      limit,
      groupFilter,
      codePrefixFilter,
      'or',
    );
    const map = new Map(merged.map((r) => [r.code, r]));
    for (const r of broadResults) {
      if (!map.has(r.code)) map.set(r.code, r);
    }

    return [...map.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async runKeywordQuery(
    tokens: string[],
    limit: number,
    groupFilter: string[],
    codePrefixFilter: string[],
    matchMode: KeywordMatchMode,
  ): Promise<UktzedCandidate[]> {
    return this.repository.keywordSearch(
      tokens,
      limit,
      groupFilter.length ? groupFilter : undefined,
      codePrefixFilter.length ? codePrefixFilter : undefined,
      matchMode,
    );
  }
}
