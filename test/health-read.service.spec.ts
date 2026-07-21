import { HealthReadService } from '../src/infrastructure/health/health-read.service';

describe('HealthReadService', () => {
  const positions = {
    ping: jest.fn(),
    count: jest.fn(),
  };
  const embeddingStatus = {
    getEmbeddedCount: jest.fn(),
  };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'SEARCH_MODE') return 'hybrid';
      return fallback;
    }),
  };

  const service = new HealthReadService(
    config as never,
    positions as never,
    embeddingStatus as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns ok when database, positions and embeddings are available', async () => {
    positions.ping.mockResolvedValue(true);
    positions.count.mockResolvedValue(14872);
    embeddingStatus.getEmbeddedCount.mockReturnValue(14776);

    const stats = await service.getStats();

    expect(stats.status).toBe('ok');
    expect(stats.checks.database).toBe(true);
    expect(stats.checks.positions).toBe(true);
    expect(stats.checks.embeddings).toBe(true);
  });

  it('returns degraded when positions are missing', async () => {
    positions.ping.mockResolvedValue(true);
    positions.count.mockResolvedValue(0);
    embeddingStatus.getEmbeddedCount.mockReturnValue(0);

    const stats = await service.getStats();

    expect(stats.status).toBe('degraded');
    expect(stats.checks.positions).toBe(false);
  });

  it('returns down when database is unavailable', async () => {
    positions.ping.mockResolvedValue(false);

    const stats = await service.getStats();

    expect(stats.status).toBe('down');
    expect(stats.checks.database).toBe(false);
  });
});
