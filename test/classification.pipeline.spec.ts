import { createTestPipeline } from './helpers/pipeline.factory';

describe('ClassificationPipeline', () => {
  it('returns null code for broad queries like тунець', async () => {
    const { pipeline, mocks } = createTestPipeline();

    const tunaCandidates = [
      { code: '0302 32', name: 'жовтоперий', score: 1, groupCode: '03' },
      { code: '0302 35', name: 'синій', score: 0.95, groupCode: '03' },
      { code: '0303 42', name: 'жовтоперий морож', score: 0.9, groupCode: '03' },
    ];

    mocks.hybridSearch.search.mockResolvedValue(tunaCandidates);
    mocks.llmClassifier.classify.mockResolvedValue({
      code: '0302 32',
      confidence: 0.8,
      reason: 'тунець без уточнення виду',
    });
    mocks.repository.findByCode.mockResolvedValue({
      code: '0302 32',
      name: 'жовтоперий',
      groupCode: '03',
    });

    const result = await pipeline.classify('тунець');

    expect(result.code).toBeNull();
    expect(result.requiresReview).toBe(true);
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(mocks.auditLogger.log).toHaveBeenCalled();
  });

  it('accepts specific high-confidence classification', async () => {
    const { pipeline, mocks } = createTestPipeline();

    mocks.hybridSearch.search.mockResolvedValue([
      { code: '5607 41', name: 'мотузка', score: 1, groupCode: '56' },
      { code: '5607 49', name: 'інші', score: 0.4, groupCode: '56' },
    ]);
    mocks.llmClassifier.classify.mockResolvedValue({
      code: '5607 41',
      confidence: 0.98,
      reason: 'поліпропіленова мотузка',
    });
    mocks.repository.findByCode.mockResolvedValue({
      code: '5607 41',
      name: 'мотузка',
      groupCode: '56',
    });

    const result = await pipeline.classify('мотузка поліпропіленова');

    expect(result.code).toBe('5607 41');
    expect(result.requiresReview).toBe(false);
  });

  it('returns empty result when search finds nothing', async () => {
    const { pipeline, mocks } = createTestPipeline();

    mocks.hybridSearch.search.mockResolvedValue([]);

    const result = await pipeline.classify('xyznonexistent123');

    expect(result.code).toBeNull();
    expect(result.reason).toContain('Не знайдено');
    expect(mocks.llmClassifier.classify).not.toHaveBeenCalled();
  });

  it('falls back to top candidate when LLM fails', async () => {
    const { pipeline, mocks } = createTestPipeline();

    mocks.hybridSearch.search.mockResolvedValue([
      { code: '5607 41', name: 'мотузка', score: 0.9, groupCode: '56' },
      { code: '5607 49', name: 'інші', score: 0.5, groupCode: '56' },
    ]);
    mocks.llmClassifier.classify.mockRejectedValue(new Error('openai down'));
    mocks.repository.findByCode.mockResolvedValue({
      code: '5607 41',
      name: 'мотузка',
      groupCode: '56',
    });

    const result = await pipeline.classify('мотузка поліпропіленова');

    expect(result.code).toBe('5607 41');
    expect(result.reason).toContain('LLM недоступний');
  });
});
