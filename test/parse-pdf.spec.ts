import {
  cleanPositionName,
  extractCodePrefix,
  formatCodeFromDigits,
  parentCode,
  parseText,
  resolveAllParents,
} from '../scripts/parse-pdf';

describe('parse-pdf', () => {
  it('extracts 6-digit heading with dashes', () => {
    const r = extractCodePrefix('0302 32- - тунець жовтоперий (Thunnus');
    expect(r?.digits).toBe('030232');
    expect(formatCodeFromDigits(r!.digits)).toBe('0302 32');
  });

  it('extracts 10-digit code glued to dash', () => {
    const r = extractCodePrefix('0302 32 10 00- - - для промислового виробництва');
    expect(r?.digits).toBe('0302321000');
    expect(formatCodeFromDigits(r!.digits)).toBe('0302 32 10 00');
  });

  it('cleans tariff name noise', () => {
    expect(cleanPositionName('00- - - інший00-')).toBe('інший');
    expect(cleanPositionName('00- - - для промислового виробництва1010-')).toContain(
      'промислового',
    );
  });

  it('parses yellowfin tuna hierarchy from sample text', () => {
    const text = `
0302 32- - тунець жовтоперий (Thunnus
albacares):
0302 32 10 00- - - для промислового виробництва
продуктів товарної позиції 1604
00-
0302 32 90 00- - - інший00-
`;
    const map = new Map();
    parseText(text, map);
    resolveAllParents(map);

    expect(map.get('0302 32')?.name).toContain('жовтоперий');
    expect(map.get('0302 32 10 00')?.name).toContain('промислового');
    expect(map.get('0302 32 90 00')?.name).toBe('інший');
    expect(map.get('0302 32 10 00')?.parentCode).toBe('0302 32');
  });

  it('keeps 4-digit codes unsplit', () => {
    expect(formatCodeFromDigits('0302')).toBe('0302');
    expect(formatCodeFromDigits('0204')).toBe('0204');
  });
});
