import { NormalizerService } from '../src/classification/normalizer.service';
import { RulesEngineService } from '../src/classification/rules-engine.service';

describe('NormalizerService', () => {
  const service = new NormalizerService();

  it('normalizes ukrainian product text', () => {
    const result = service.normalize('  МОТУЗКА поліпропіленова!!!  ');
    expect(result.normalized).toBe('мотузка поліпропіленова');
    expect(result.tokens).toContain('мотузка');
    expect(result.searchText).toContain('мотузка');
    expect(result.isVague).toBe(false);
    expect(result.isBroad).toBe(false);
  });

  it('marks broad species queries', () => {
    const result = service.normalize('тунець');
    expect(result.isBroad).toBe(true);
    expect(result.isVague).toBe(false);
  });
});

describe('RulesEngineService', () => {
  const normalizer = new NormalizerService();
  const rules = new RulesEngineService();

  it('detects rope products', () => {
    const q = normalizer.normalize('мотузка для пакування');
    const hints = rules.analyze(q);
    expect(hints.some((h) => h.groupCodes?.includes('56'))).toBe(true);
  });

  it('detects water products', () => {
    const q = normalizer.normalize('мінеральна вода');
    const hints = rules.analyze(q);
    expect(hints.some((h) => h.groupCodes?.includes('22'))).toBe(true);
  });

  it('does not treat unrelated words with "вод" as water', () => {
    const q = normalizer.normalize('водонагрівач побутовий');
    const hints = rules.analyze(q);
    expect(hints.some((h) => h.groupCodes?.includes('22'))).toBe(false);
  });
});
