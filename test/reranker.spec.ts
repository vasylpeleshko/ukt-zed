import { RerankerService } from '../src/classification/reranker.service';
import { UktzedCandidate } from '../src/domain/classification.types';

describe('RerankerService', () => {
  const service = new RerankerService();

  it('boosts generic names for vague queries', () => {
    const candidates: UktzedCandidate[] = [
      { code: '0302 49 90 00', name: 'інші', score: 0.8, groupCode: '03' },
      { code: '0302 47 00', name: 'меч-риба', score: 1, groupCode: '03' },
    ];

    const ranked = service.rerank(
      candidates,
      [{ groupCodes: ['03'], boost: 0.15, reason: 'риба', preferGeneric: true }],
      10,
      true,
      false,
    );

    expect(ranked[0].code).toBe('0302 49 90 00');
  });

  it('prefers 6-digit headings for broad queries', () => {
    const candidates: UktzedCandidate[] = [
      { code: '0303 42 90 00', name: 'leaf detail', score: 0.5, groupCode: '03' },
      { code: '0303 42', name: 'жовтоперий', score: 1, groupCode: '03' },
    ];

    const ranked = service.rerank(
      candidates,
      [{ groupCodes: ['03'], boost: 0.15, reason: 'тунець' }],
      10,
      false,
      true,
    );

    expect(ranked[0].code).toBe('0303 42');
  });

  it('limits output size', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      code: `0302 ${String(i).padStart(2, '0')}`,
      name: `item ${i}`,
      score: 1 - i * 0.01,
      groupCode: '03',
    }));

    const ranked = service.rerank(candidates, [], 5);
    expect(ranked).toHaveLength(5);
  });
});
