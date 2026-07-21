import { Module } from '@nestjs/common';
import { PrismaService } from './database/prisma.service';
import { UktzedPositionRepository } from './database/uktzed-position.repository';
import { OpenAiClassifierService } from './llm/openai-classifier.service';
import { OpenAiEmbeddingService } from './embeddings/openai-embedding.service';
import { EmbeddingStatusService } from './embeddings/embedding-status.service';
import { AuditLoggerService } from './logger/audit-logger.service';
import { HealthReadService } from './health/health-read.service';
import { LLM_CLASSIFIER_PORT } from '../domain/classification.types';
import { HEALTH_READ_PORT } from '../domain/health.types';
import { POSITION_SEARCH_PORT } from '../domain/position-search.port';
import { AUDIT_LOG_PORT } from '../domain/audit-log.port';
import {
  EMBEDDING_PORT,
  EMBEDDING_STATUS_PORT,
} from '../domain/embedding.port';

@Module({
  providers: [
    PrismaService,
    UktzedPositionRepository,
    AuditLoggerService,
    OpenAiClassifierService,
    OpenAiEmbeddingService,
    EmbeddingStatusService,
    HealthReadService,
    { provide: POSITION_SEARCH_PORT, useExisting: UktzedPositionRepository },
    { provide: AUDIT_LOG_PORT, useExisting: AuditLoggerService },
    { provide: EMBEDDING_PORT, useExisting: OpenAiEmbeddingService },
    { provide: EMBEDDING_STATUS_PORT, useExisting: EmbeddingStatusService },
    { provide: LLM_CLASSIFIER_PORT, useExisting: OpenAiClassifierService },
    { provide: HEALTH_READ_PORT, useExisting: HealthReadService },
  ],
  exports: [
    PrismaService,
    POSITION_SEARCH_PORT,
    AUDIT_LOG_PORT,
    EMBEDDING_PORT,
    EMBEDDING_STATUS_PORT,
    LLM_CLASSIFIER_PORT,
    HEALTH_READ_PORT,
  ],
})
export class InfrastructureModule {}
