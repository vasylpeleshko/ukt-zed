import { buildTsQuery } from '../src/domain/position-search.port';

describe('buildTsQuery', () => {
  it('joins tokens with AND operator', () => {
    expect(buildTsQuery(['мотузка', 'поліпропіленова'], 'and')).toBe(
      'мотузка & поліпропіленова',
    );
  });

  it('joins tokens with OR operator', () => {
    expect(buildTsQuery(['мотузка', 'поліпропіленова'], 'or')).toBe(
      'мотузка | поліпропіленова',
    );
  });

  it('filters short tokens and normalizes case', () => {
    expect(buildTsQuery(['a', 'риба'], 'and')).toBe('риба');
  });

  it('returns empty string when no valid tokens', () => {
    expect(buildTsQuery(['a'], 'and')).toBe('');
  });
});
