import { ClassificationPipeline } from '../../src/classification/classification.pipeline';
import { NormalizerService } from '../../src/classification/normalizer.service';
import { RulesEngineService } from '../../src/classification/rules-engine.service';
import { RerankerService } from '../../src/classification/reranker.service';
import { ValidatorService } from '../../src/classification/validator.service';
import { LlmClassifierPort } from '../../src/domain/classification.types';

export interface PipelineMocks {
  hybridSearch: { search: jest.Mock };
  llmClassifier: jest.Mocked<LlmClassifierPort>;
  auditLogger: { log: jest.Mock };
  repository: { findByCode: jest.Mock };
}

export function createTestPipeline(): {
  pipeline: ClassificationPipeline;
  mocks: PipelineMocks;
} {
  const config = {
    get: jest.fn((key: string, fallback?: string) => {
      if (key === 'CONFIDENCE_AUTO_THRESHOLD') return '0.75';
      if (key === 'CONFIDENCE_REVIEW_THRESHOLD') return '0.45';
      return fallback;
    }),
  };

  const mocks: PipelineMocks = {
    hybridSearch: { search: jest.fn() },
    llmClassifier: { classify: jest.fn() },
    auditLogger: { log: jest.fn().mockResolvedValue(undefined) },
    repository: { findByCode: jest.fn() },
  };

  const validator = new ValidatorService(config as never, mocks.repository as never);

  const pipeline = new ClassificationPipeline(
    new NormalizerService(),
    new RulesEngineService(),
    mocks.hybridSearch as never,
    new RerankerService(),
    validator,
    mocks.auditLogger as never,
    mocks.llmClassifier as never,
  );

  return { pipeline, mocks };
}
