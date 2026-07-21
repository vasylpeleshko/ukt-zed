import { AuditLoggerService } from '../src/infrastructure/logger/audit-logger.service';

describe('AuditLoggerService', () => {
  const prisma = {
    classificationAudit: {
      create: jest.fn(),
    },
  };

  const service = new AuditLoggerService(prisma as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('persists classification audit entry', async () => {
    prisma.classificationAudit.create.mockResolvedValue({ id: 1 });

    await service.log(
      'мотузка',
      {
        code: '5607 41',
        name: 'мотузка',
        group: '56',
        confidence: 0.9,
        reason: 'ok',
        requiresReview: false,
        candidates: [],
      },
      120,
    );

    expect(prisma.classificationAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          productQuery: 'мотузка',
          resultCode: '5607 41',
          latencyMs: 120,
        }),
      }),
    );
  });

  it('does not throw when audit write fails', async () => {
    prisma.classificationAudit.create.mockRejectedValue(new Error('db down'));

    await expect(
      service.log(
        'мотузка',
        {
          code: null,
          name: null,
          group: null,
          confidence: 0,
          reason: 'fail',
          requiresReview: true,
          candidates: [],
        },
        50,
      ),
    ).resolves.toBeUndefined();
  });
});
