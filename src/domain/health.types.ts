export type HealthStatus = 'ok' | 'degraded' | 'down';

export interface HealthChecks {
  database: boolean;
  positions: boolean;
  embeddings: boolean;
}

export interface HealthStats {
  status: HealthStatus;
  positionsLoaded: number;
  embeddingsLoaded: number;
  searchMode: string;
  checks: HealthChecks;
}

export const HEALTH_READ_PORT = Symbol('HEALTH_READ_PORT');

export interface HealthReadPort {
  getStats(): Promise<HealthStats>;
}
