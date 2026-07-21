import * as fs from 'fs';
import * as path from 'path';
import { createTestPipeline } from './helpers/pipeline.factory';
import { findBestCandidateMatch } from '../src/domain/uktzed-code.utils';

interface BenchmarkCase {
  product: string;
  expectedCode: string;
}

const cases: BenchmarkCase[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures/benchmark.json'), 'utf8'),
);

describe('benchmark regression (mocked pipeline)', () => {
  it.each(cases)(
    'classifies "$product" to expected code when search and LLM agree',
    async ({ product, expectedCode }) => {
      const { pipeline, mocks } = createTestPipeline();
      const heading = expectedCode.split(' ').slice(0, 2).join(' ');

      mocks.hybridSearch.search.mockResolvedValue([
        {
          code: expectedCode,
          name: product,
          score: 1,
          groupCode: expectedCode.slice(0, 2),
        },
        {
          code: heading,
          name: 'heading',
          score: 0.8,
          groupCode: expectedCode.slice(0, 2),
        },
      ]);
      mocks.llmClassifier.classify.mockResolvedValue({
        code: expectedCode,
        confidence: 0.9,
        reason: 'benchmark match',
      });
      mocks.repository.findByCode.mockImplementation(async (code: string) => {
        const match = findBestCandidateMatch(code, [
          { code: expectedCode, name: product, score: 1, groupCode: expectedCode.slice(0, 2) },
          { code: heading, name: 'heading', score: 0.8, groupCode: expectedCode.slice(0, 2) },
        ]);
        if (!match) return null;
        return {
          code: match.code,
          name: product,
          groupCode: expectedCode.slice(0, 2),
        };
      });

      const result = await pipeline.classify(product);

      expect(result.code).not.toBeNull();
      expect(
        result.code === expectedCode ||
          expectedCode.startsWith(`${result.code} `) ||
          result.code!.startsWith(`${heading} `),
      ).toBe(true);
    },
  );
});
