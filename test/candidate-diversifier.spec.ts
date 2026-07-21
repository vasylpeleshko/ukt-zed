import {
  diversifyCandidates,
  isBroadProductQuery,
  speciesDedupKey,
} from '../src/domain/candidate-diversifier';

describe('candidate-diversifier', () => {
  it('detects broad species queries', () => {
    expect(isBroadProductQuery(['тунець'], 'тунець')).toBe(true);
    expect(isBroadProductQuery(['тунець', 'жовтоперий'], 'тунець жовтоперий')).toBe(
      false,
    );
    expect(isBroadProductQuery(['риба'], 'риба')).toBe(false);
  });

  it('deduplicates by 6-digit heading', () => {
    const candidates = [
      { code: '0301 94 10 00', name: 'синій', score: 1, groupCode: '03' },
      { code: '0301 94 90 00', name: 'блакитний', score: 0.9, groupCode: '03' },
      { code: '0302 32', name: 'жовтоперий', score: 0.95, groupCode: '03' },
    ];

    const diverse = diversifyCandidates(candidates, 7);
    const keys = diverse.map(speciesDedupKey);

    expect(diverse.length).toBe(2);
    expect(keys).toContain('0301 94');
    expect(keys).toContain('0302 32');
  });

  it('returns up to 7 distinct species', () => {
    const candidates = [
      { code: '0302 32', name: 'жовтопerий', score: 1, groupCode: '03' },
      { code: '0302 33', name: 'скіпджек', score: 0.99, groupCode: '03' },
      { code: '0302 34', name: 'великоокий', score: 0.98, groupCode: '03' },
      { code: '0302 35', name: 'синій', score: 0.97, groupCode: '03' },
      { code: '0303 42', name: 'жовтопerий морож', score: 0.96, groupCode: '03' },
      { code: '0302 36', name: 'південний', score: 0.95, groupCode: '03' },
      { code: '0302 31', name: 'альбакор', score: 0.94, groupCode: '03' },
      { code: '0302 49', name: 'інші', score: 0.93, groupCode: '03' },
    ];

    const diverse = diversifyCandidates(candidates, 7);
    expect(diverse.length).toBe(7);
    expect(diverse.some((c) => c.code === '0302 32')).toBe(true);
    expect(diverse.some((c) => c.code === '0302 33')).toBe(true);
  });
});
