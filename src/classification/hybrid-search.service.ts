import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KeywordSearchService } from './keyword-search.service';
import { VectorSearchService } from './vector-search.service';
import {
  NormalizedQuery,
  RuleHint,
  SearchMode,
  UktzedCandidate,
} from '../domain/classification.types';

@Injectable()
export class HybridSearchService {
  private readonly mode: SearchMode;
  private readonly keywordWeight: number;

  constructor(
    private readonly config: ConfigService,
    private readonly keywordSearch: KeywordSearchService,
    private readonly vectorSearch: VectorSearchService,
  ) {
    this.mode = (this.config.get<string>('SEARCH_MODE', 'hybrid') ??
      'hybrid') as SearchMode;
    this.keywordWeight = Number(
      this.config.get('HYBRID_KEYWORD_WEIGHT', '0.6'),
    );
  }

  getMode(): SearchMode {
    return this.mode;
  }

  async search(
    query: NormalizedQuery,
    hints: RuleHint[],
    limit = 20,
  ): Promise<UktzedCandidate[]> {
    if (this.mode === 'keyword') {
      return this.keywordSearch.search(query, hints, limit);
    }

    if (this.mode === 'vector') {
      const vectorResults = await this.vectorSearch.search(query, hints, limit);
      if (vectorResults.length > 0) return vectorResults;
      return this.keywordSearch.search(query, hints, limit);
    }

    const [keywordResults, vectorResults] = await Promise.all([
      this.keywordSearch.search(query, hints, limit),
      this.vectorSearch.search(query, hints, limit),
    ]);

    return this.merge(keywordResults, vectorResults, limit);
  }

  private merge(
    keywordResults: UktzedCandidate[],
    vectorResults: UktzedCandidate[],
    limit: number,
  ): UktzedCandidate[] {
    const maxKeyword = Math.max(...keywordResults.map((r) => r.score), 1);
    const merged = new Map<string, UktzedCandidate>();

    for (const item of keywordResults) {
      merged.set(item.code, {
        ...item,
        score: (item.score / maxKeyword) * this.keywordWeight,
      });
    }

    const vectorWeight = 1 - this.keywordWeight;
    for (const item of vectorResults) {
      const vectorScore = item.score * vectorWeight;
      const existing = merged.get(item.code);
      if (existing) {
        merged.set(item.code, {
          ...existing,
          score: existing.score + vectorScore,
        });
      } else {
        merged.set(item.code, { ...item, score: vectorScore });
      }
    }

    return [...merged.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
