import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ApplicationModule } from './application/application.module';
import { ClassificationModule } from './classification/classification.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { ClassifyController } from './presentation/api/classify.controller';
import { ApiKeyGuard } from './presentation/guards/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: Number(process.env.THROTTLE_TTL_MS ?? 60_000),
        limit: Number(process.env.THROTTLE_LIMIT ?? 30),
      },
    ]),
    InfrastructureModule,
    ClassificationModule,
    ApplicationModule,
  ],
  controllers: [ClassifyController],
  providers: [ApiKeyGuard],
})
export class AppModule {}
