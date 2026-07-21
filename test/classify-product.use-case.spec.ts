import { BadRequestException } from '@nestjs/common';
import { ClassifyProductUseCase } from '../src/application/classify-product.use-case';

describe('ClassifyProductUseCase', () => {
  const pipeline = { classify: jest.fn() };
  const useCase = new ClassifyProductUseCase(pipeline as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects empty product description', () => {
    expect(() => useCase.execute('')).toThrow(BadRequestException);
    expect(() => useCase.execute('   ')).toThrow(BadRequestException);
    expect(pipeline.classify).not.toHaveBeenCalled();
  });

  it('trims product and delegates to pipeline', async () => {
    pipeline.classify.mockResolvedValue({
      code: '5607 41',
      name: 'мотузка',
      group: '56',
      confidence: 0.9,
      reason: 'ok',
      requiresReview: false,
      candidates: [],
    });

    const result = await useCase.execute('  мотузка  ');

    expect(pipeline.classify).toHaveBeenCalledWith('мотузка');
    expect(result.code).toBe('5607 41');
  });
});
