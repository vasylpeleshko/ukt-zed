import { BadRequestException, Injectable } from '@nestjs/common';
import { ClassificationPipeline } from '../classification/classification.pipeline';
import { ClassifyResult } from '../domain/classification.types';

@Injectable()
export class ClassifyProductUseCase {
  constructor(private readonly pipeline: ClassificationPipeline) {}

  execute(product: string): Promise<ClassifyResult> {
    const trimmed = product.trim();
    if (!trimmed) {
      throw new BadRequestException('Опис товару не може бути порожнім');
    }
    return this.pipeline.classify(trimmed);
  }
}
