import { Inject, Injectable } from '@nestjs/common';
import {
  EMBEDDING_PORT,
  EMBEDDING_STATUS_PORT,
  EmbeddingPort,
  EmbeddingStatusPort,
} from '../domain/embedding.port';
import { POSITION_SEARCH_PORT, PositionSearchPort } from '../domain/position-search.port';
import {
  NormalizedQuery,
  RuleHint,
  UktzedCandidate,
} from '../domain/classification.types';

@Injectable()
export class VectorSearchService {
  constructor(
    @Inject(POSITION_SEARCH_PORT)
    private readonly repository: PositionSearchPort,
    @Inject(EMBEDDING_PORT)
    private readonly embeddings: EmbeddingPort,
    @Inject(EMBEDDING_STATUS_PORT)
    private readonly embeddingStatus: EmbeddingStatusPort,
  ) {}

  async search(
    query: NormalizedQuery,
    hints: RuleHint[],
    limit = 20,
  ): Promise<UktzedCandidate[]> {
    if (!this.embeddingStatus.hasEmbeddings()) return [];

    const groupFilter = [...new Set(hints.flatMap((h) => h.groupCodes ?? []))];
    const codePrefixFilter = [
      ...new Set(hints.flatMap((h) => h.codePrefixes ?? [])),
    ];

    const vector = await this.embeddings.embed(query.searchText);

    return this.repository.vectorSearch(
      vector,
      limit,
      groupFilter.length ? groupFilter : undefined,
      codePrefixFilter.length ? codePrefixFilter : undefined,
    );
  }
}
