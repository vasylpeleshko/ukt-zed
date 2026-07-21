import { ValidatorService } from '../src/classification/validator.service';
import { UktzedCandidate } from '../src/domain/classification.types';

describe('ValidatorService', () => {
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'CONFIDENCE_AUTO_THRESHOLD') return '0.75';
      if (key === 'CONFIDENCE_REVIEW_THRESHOLD') return '0.45';
      return fallback;
    }),
  };

  const repository = {
    findByCode: jest.fn(),
  };

  const service = new ValidatorService(config as never, repository as never);

  const candidates: UktzedCandidate[] = [
    { code: '0302 32', name: 'жовтоперий', score: 1, groupCode: '03' },
    { code: '0302 35', name: 'синій', score: 0.9, groupCode: '03' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null code for broad queries', async () => {
    const result = await service.validate(
      { code: '0302 35', confidence: 0.8, reason: 'загальний тунець' },
      candidates,
      1,
      0.15,
      {
        isBroad: true,
        displayCandidates: candidates,
      },
    );

    expect(result.code).toBeNull();
    expect(result.requiresReview).toBe(true);
    expect(result.confidence).toBeLessThanOrEqual(0.55);
    expect(result.reason).toContain('свіжий');
  });

  it('accepts high-confidence exact match', async () => {
    repository.findByCode.mockResolvedValue({
      code: '0302 32',
      name: 'жовтоперий',
      groupCode: '03',
    });

    const result = await service.validate(
      { code: '0302 32', confidence: 0.98, reason: 'точний вид' },
      [
        { code: '0302 32', name: 'жовтоперий', score: 1, groupCode: '03' },
        { code: '0302 35', name: 'синій', score: 0.5, groupCode: '03' },
      ],
      1,
      0.15,
    );

    expect(result.code).toBe('0302 32');
    expect(result.requiresReview).toBe(false);
    expect(result.candidates).toEqual([]);
  });

  it('resolves hierarchical LLM code to candidate', async () => {
    repository.findByCode.mockResolvedValue({
      code: '0302 32',
      name: 'жовтоперий',
      groupCode: '03',
    });

    const result = await service.validate(
      { code: '0302 32 90 00', confidence: 0.85, reason: 'leaf code' },
      candidates,
      1,
      0.15,
    );

    expect(result.code).toBe('0302 32');
  });

  it('hard fallbacks when confidence below review threshold', async () => {
    repository.findByCode.mockResolvedValue({
      code: '0302 32',
      name: 'жовтоперий',
      groupCode: '03',
    });

    const result = await service.validate(
      { code: '0302 32', confidence: 0.1, reason: 'weak' },
      [
        { code: '0302 32', name: 'a', score: 1, groupCode: '03' },
        { code: '0302 35', name: 'b', score: 1, groupCode: '03' },
      ],
      1,
      0,
    );

    expect(result.code).toBeNull();
    expect(result.reason).toContain('потрібен ручний вибір');
  });

  it('hard fallbacks when code not in database', async () => {
    repository.findByCode.mockResolvedValue(null);

    const result = await service.validate(
      { code: '0302 32', confidence: 0.9, reason: 'missing row' },
      candidates,
      1,
      0.15,
    );

    expect(result.code).toBeNull();
    expect(result.requiresReview).toBe(true);
  });
});
