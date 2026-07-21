import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  HealthReadPort,
  HealthStats,
  HealthStatus,
} from '../../domain/health.types';
import { POSITION_SEARCH_PORT, PositionSearchPort } from '../../domain/position-search.port';
import {
  EMBEDDING_STATUS_PORT,
  EmbeddingStatusPort,
} from '../../domain/embedding.port';

@Injectable()
export class HealthReadService implements HealthReadPort {
  constructor(
    private readonly config: ConfigService,
    @Inject(POSITION_SEARCH_PORT)
    private readonly positions: PositionSearchPort,
    @Inject(EMBEDDING_STATUS_PORT)
    private readonly embeddingStatus: EmbeddingStatusPort,
  ) {}

  async getStats(): Promise<HealthStats> {
    const searchMode = this.config.get<string>('SEARCH_MODE', 'hybrid') ?? 'hybrid';
    const needsEmbeddings = searchMode === 'hybrid' || searchMode === 'vector';

    let database = false;
    let positionsLoaded = 0;
    let embeddingsLoaded = 0;

    try {
      database = await this.positions.ping();
      if (database) {
        [positionsLoaded, embeddingsLoaded] = await Promise.all([
          this.positions.count(),
          Promise.resolve(this.embeddingStatus.getEmbeddedCount()),
        ]);
      }
    } catch {
      database = false;
    }

    const checks = {
      database,
      positions: positionsLoaded > 0,
      embeddings: !needsEmbeddings || embeddingsLoaded > 0,
    };

    const status = this.resolveStatus(checks);

    return {
      status,
      positionsLoaded,
      embeddingsLoaded,
      searchMode,
      checks,
    };
  }

  private resolveStatus(checks: HealthStats['checks']): HealthStatus {
    if (!checks.database) return 'down';
    if (!checks.positions || !checks.embeddings) return 'degraded';
    return 'ok';
  }
}
