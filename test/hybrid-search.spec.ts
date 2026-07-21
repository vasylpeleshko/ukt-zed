import { HybridSearchService } from '../src/classification/hybrid-search.service';
import { UktzedCandidate } from '../src/domain/classification.types';

describe('HybridSearchService merge', () => {
  const keywordSearch = { search: jest.fn() };
  const vectorSearch = { search: jest.fn() };
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'SEARCH_MODE') return 'hybrid';
      if (key === 'HYBRID_KEYWORD_WEIGHT') return '0.6';
      return fallback;
    }),
  };

  const service = new HybridSearchService(
    config as never,
    keywordSearch as never,
    vectorSearch as never,
  );

  it('merges keyword and vector scores with configured weight', async () => {
    const keywordResults: UktzedCandidate[] = [
      { code: 'A', name: 'a', groupCode: '03', score: 10 },
    ];
    const vectorResults: UktzedCandidate[] = [
      { code: 'A', name: 'a', groupCode: '03', score: 0.5 },
      { code: 'B', name: 'b', groupCode: '03', score: 1 },
    ];

    keywordSearch.search.mockResolvedValue(keywordResults);
    vectorSearch.search.mockResolvedValue(vectorResults);

    const merged = await service.search(
      {
        raw: 'test',
        normalized: 'test',
        tokens: ['test'],
        searchText: 'test',
        isVague: false,
        isBroad: false,
      },
      [],
      10,
    );

    expect(merged[0].code).toBe('A');
    expect(merged[0].score).toBeCloseTo(0.6 + 0.2, 2);
    expect(merged.some((c) => c.code === 'B')).toBe(true);
  });
});
