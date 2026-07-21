import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { NormalizerService } from './normalizer.service';
import { RulesEngineService } from './rules-engine.service';
import { KeywordSearchService } from './keyword-search.service';
import { VectorSearchService } from './vector-search.service';
import { HybridSearchService } from './hybrid-search.service';
import { RerankerService } from './reranker.service';
import { ValidatorService } from './validator.service';
import { ClassificationPipeline } from './classification.pipeline';

@Module({
  imports: [InfrastructureModule],
  providers: [
    NormalizerService,
    RulesEngineService,
    KeywordSearchService,
    VectorSearchService,
    HybridSearchService,
    RerankerService,
    ValidatorService,
    ClassificationPipeline,
  ],
  exports: [ClassificationPipeline],
})
export class ClassificationModule {}
