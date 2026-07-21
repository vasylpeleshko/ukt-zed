import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { ClassifyResult } from '../../domain/classification.types';

@Injectable()
export class AuditLoggerService {
  private readonly logger = new Logger(AuditLoggerService.name);

  constructor(private readonly prisma: PrismaService) {}

  async log(
    query: string,
    result: ClassifyResult,
    latencyMs: number,
  ): Promise<void> {
    try {
      await this.prisma.classificationAudit.create({
        data: {
          productQuery: query,
          resultCode: result.code,
          confidence: result.confidence,
          requiresReview: result.requiresReview,
          candidates: result.candidates as object,
          reason: result.reason,
          latencyMs,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to write classification audit: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
}
