import { computeWeightedConfidence } from '../src/domain/confidence.utils';

describe('computeWeightedConfidence', () => {
  it('returns high score when all signals are strong', () => {
    const score = computeWeightedConfidence(0.98, 1, 1, 0.15, [1, 0.5]);
    expect(score).toBeGreaterThanOrEqual(0.75);
  });

  it('returns low score when LLM confidence is weak', () => {
    const score = computeWeightedConfidence(0.1, 1, 1, 0, [1, 0.9]);
    expect(score).toBeLessThan(0.45);
  });
});
