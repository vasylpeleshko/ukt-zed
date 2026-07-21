import { Module } from '@nestjs/common';
import { InfrastructureModule } from '../infrastructure/infrastructure.module';
import { ClassificationModule } from '../classification/classification.module';
import { ClassifyProductUseCase } from './classify-product.use-case';
import { HealthCheckUseCase } from './health-check.use-case';

@Module({
  imports: [InfrastructureModule, ClassificationModule],
  providers: [ClassifyProductUseCase, HealthCheckUseCase],
  exports: [ClassifyProductUseCase, HealthCheckUseCase],
})
export class ApplicationModule {}
