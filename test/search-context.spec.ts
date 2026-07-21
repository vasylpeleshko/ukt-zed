import {
  buildSearchContext,
  cleanTariffName,
  isGenericTariffName,
  isVagueProductQuery,
} from '../src/domain/search-context.builder';

describe('search-context.builder', () => {
  it('detects vague queries', () => {
    expect(isVagueProductQuery(['риба'], 'риба')).toBe(true);
    expect(isVagueProductQuery(['лосось', 'свіжий'], 'лосось свіжий')).toBe(false);
  });

  it('detects generic tariff names', () => {
    expect(isGenericTariffName('00- - - інші00-')).toBe(true);
    expect(isGenericTariffName('риба роду Rhombosolea')).toBe(false);
  });

  it('builds context with group keywords for generic codes', () => {
    const byCode = new Map([
      ['03', { code: '03', name: 'Риба і ракоподібні', groupCode: '03', level: 2 }],
      [
        '0302 49',
        {
          code: '0302 49',
          name: 'риба родин Gadidae',
          groupCode: '03',
          parentCode: undefined,
          level: 4,
        },
      ],
      [
        '0302 49 90',
        {
          code: '0302 49 90',
          name: '00- - - інші00-',
          groupCode: '03',
          parentCode: '0302 49',
          level: 8,
        },
      ],
    ]);

    const context = buildSearchContext(
      byCode.get('0302 49 90')!,
      byCode,
    );

    expect(context).toContain('риба');
    expect(context).toContain('інші');
    expect(cleanTariffName('00- - - інші00-')).toBe('інші');
  });
});
