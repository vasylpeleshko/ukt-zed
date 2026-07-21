import { Injectable, OnModuleInit, Inject } from '@nestjs/common';
import {
  EmbeddingStatusPort,
} from '../../domain/embedding.port';
import { POSITION_SEARCH_PORT, PositionSearchPort } from '../../domain/position-search.port';

const CACHE_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class EmbeddingStatusService implements EmbeddingStatusPort, OnModuleInit {
  private embeddedCount = 0;
  private refreshedAt = 0;

  constructor(
    @Inject(POSITION_SEARCH_PORT)
    private readonly repository: PositionSearchPort,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.refresh();
  }

  getEmbeddedCount(): number {
    return this.embeddedCount;
  }

  hasEmbeddings(): boolean {
    if (this.isStale()) {
      void this.refresh();
    }
    return this.embeddedCount > 0;
  }

  async refresh(): Promise<void> {
    this.embeddedCount = await this.repository.countEmbedded();
    this.refreshedAt = Date.now();
  }

  private isStale(): boolean {
    return Date.now() - this.refreshedAt > CACHE_TTL_MS;
  }
}
