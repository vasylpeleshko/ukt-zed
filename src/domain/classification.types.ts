export interface UktzedCandidate {
  code: string;
  name: string;
  score: number;
  groupCode: string;
  searchContext?: string;
}

export interface ClassifyResult {
  code: string | null;
  name: string | null;
  group: string | null;
  confidence: number;
  reason: string;
  requiresReview: boolean;
  candidates: UktzedCandidate[];
}

export interface RuleHint {
  groupCodes?: string[];
  codePrefixes?: string[];
  keywords?: string[];
  boost: number;
  reason: string;
  preferGeneric?: boolean;
}

export interface NormalizedQuery {
  raw: string;
  normalized: string;
  /** Cyrillic-focused tokens for keyword search */
  tokens: string[];
  /** Full text for embedding / semantic search */
  searchText: string;
  /** Generic query like "риба" without details */
  isVague: boolean;
  /** Product family with many subcodes, e.g. "тунець" */
  isBroad: boolean;
}

export type SearchMode = 'keyword' | 'vector' | 'hybrid';

export interface LlmClassificationOutput {
  code: string;
  confidence: number;
  reason: string;
}

export const LLM_CLASSIFIER_PORT = Symbol('LLM_CLASSIFIER_PORT');

export interface LlmClassifierPort {
  classify(
    product: string,
    candidates: UktzedCandidate[],
    hints: RuleHint[],
    options?: { isVague?: boolean; isBroad?: boolean },
  ): Promise<LlmClassificationOutput>;
}
