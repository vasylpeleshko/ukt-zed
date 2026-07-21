import { UktzedCandidate } from './classification.types';

export type KeywordMatchMode = 'and' | 'or';

export interface UktzedPositionRecord {
  code: string;
  name: string;
  groupCode: string;
  parentCode?: string | null;
  level: number;
  searchContext?: string | null;
}

export interface PositionSearchPort {
  count(): Promise<number>;
  countEmbedded(): Promise<number>;
  ping(): Promise<boolean>;
  findByCode(code: string): Promise<UktzedPositionRecord | null>;
  keywordSearch(
    tokens: string[],
    limit?: number,
    groupFilter?: string[],
    codePrefixFilter?: string[],
    matchMode?: KeywordMatchMode,
  ): Promise<UktzedCandidate[]>;
  genericInGroupSearch(
    groupCodes: string[],
    limit?: number,
  ): Promise<UktzedCandidate[]>;
  vectorSearch(
    embedding: number[],
    limit?: number,
    groupFilter?: string[],
    codePrefixFilter?: string[],
  ): Promise<UktzedCandidate[]>;
}

export const POSITION_SEARCH_PORT = Symbol('POSITION_SEARCH_PORT');

/** Builds a safe tsquery string for PostgreSQL full-text search. */
export function buildTsQuery(tokens: string[], matchMode: KeywordMatchMode): string {
  const clean = tokens
    .map((t) => t.toLowerCase().trim().replace(/[^\p{L}\p{N}]+/gu, ' ').trim())
    .filter((t) => t.length > 1);

  if (clean.length === 0) return '';

  const operator = matchMode === 'and' ? ' & ' : ' | ';
  return clean.join(operator);
}
