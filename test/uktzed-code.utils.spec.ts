import { findBestCandidateMatch } from '../src/domain/uktzed-code.utils';
import { UktzedCandidate } from '../src/domain/classification.types';

describe('uktzed-code.utils', () => {
  const candidates: UktzedCandidate[] = [
    { code: '0301 94 10 00', name: 'синій', score: 1, groupCode: '03' },
    { code: '0302 32', name: 'жовтоперий', score: 0.9, groupCode: '03' },
    { code: '0301 94', name: 'heading', score: 0.8, groupCode: '03' },
  ];

  it('matches exact code', () => {
    expect(findBestCandidateMatch('0302 32', candidates)?.code).toBe('0302 32');
  });

  it('matches hierarchical prefix without false group match', () => {
    expect(findBestCandidateMatch('0301 94 10 00', candidates)?.code).toBe(
      '0301 94 10 00',
    );
    expect(findBestCandidateMatch('0301 94 10', candidates)?.code).toBe(
      '0301 94 10 00',
    );
  });

  it('does not match unrelated code by first 4 chars only', () => {
    expect(findBestCandidateMatch('0302 99 00', candidates)).toBeUndefined();
  });
});
