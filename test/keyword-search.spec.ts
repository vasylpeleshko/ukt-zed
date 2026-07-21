import { KeywordSearchService } from '../src/classification/keyword-search.service';

describe('KeywordSearchService', () => {
  const repository = {
    keywordSearch: jest.fn(),
    genericInGroupSearch: jest.fn(),
  };

  const service = new KeywordSearchService(repository as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses AND match first', async () => {
    repository.keywordSearch.mockResolvedValueOnce(
      Array.from({ length: 5 }, (_, i) => ({
        code: `5607 4${i}`,
        name: `мотузка ${i}`,
        score: 1 - i * 0.01,
        groupCode: '56',
      })),
    );

    await service.search(
      {
        raw: 'мотузка поліпропіленова',
        normalized: 'мотузка поліпропіленова',
        tokens: ['мотузка', 'поліпропіленова'],
        searchText: 'мотузка поліпропіленова',
        isVague: false,
        isBroad: false,
      },
      [{ groupCodes: ['56'], boost: 0.15, reason: 'rope' }],
      20,
    );

    expect(repository.keywordSearch).toHaveBeenCalledWith(
      ['мотузка', 'поліпропіленова'],
      20,
      ['56'],
      undefined,
      'and',
    );
  });

  it('falls back to OR when AND returns too few results', async () => {
    repository.keywordSearch
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { code: '5607 41', name: 'мотузка', score: 0.8, groupCode: '56' },
        { code: '3920 10', name: 'поліmer', score: 0.7, groupCode: '39' },
      ]);

    const results = await service.search(
      {
        raw: 'мотузка поліпропіленова',
        normalized: 'мотузка поліпропіленова',
        tokens: ['мотузка', 'поліпропіленова'],
        searchText: 'мотузка поліпропіленова',
        isVague: false,
        isBroad: false,
      },
      [],
      20,
    );

    expect(repository.keywordSearch).toHaveBeenNthCalledWith(
      2,
      ['мотузка', 'поліпропіленова'],
      20,
      undefined,
      undefined,
      'or',
    );
    expect(results).toHaveLength(2);
  });

  it('merges generic group results for vague queries', async () => {
    repository.keywordSearch.mockResolvedValue([
      { code: '0302 19 00', name: 'інші', score: 1, groupCode: '03' },
      { code: '0302 29 80 00', name: 'інші', score: 0.9, groupCode: '03' },
      { code: '0302 47 00', name: 'меч-риба', score: 0.8, groupCode: '03' },
      { code: '0302 48 00', name: 'скумбрія', score: 0.7, groupCode: '03' },
      { code: '0302 49 00', name: 'інші свіжі', score: 0.6, groupCode: '03' },
    ]);
    repository.genericInGroupSearch.mockResolvedValue([
      { code: '0302 29 80 00', name: 'інші', score: 2, groupCode: '03' },
    ]);

    const results = await service.search(
      {
        raw: 'риба',
        normalized: 'риба',
        tokens: ['риба'],
        searchText: 'риба',
        isVague: true,
        isBroad: false,
      },
      [{ groupCodes: ['03'], boost: 0.15, reason: 'риба', preferGeneric: true }],
      20,
    );

    expect(repository.genericInGroupSearch).toHaveBeenCalledWith(['03'], 10);
    expect(results.some((r) => r.code === '0302 29 80 00')).toBe(true);
  });
});
