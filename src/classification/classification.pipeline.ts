import { Inject, Injectable, Logger } from '@nestjs/common';
import { NormalizerService } from './normalizer.service';
import { RulesEngineService } from './rules-engine.service';
import { HybridSearchService } from './hybrid-search.service';
import { RerankerService } from './reranker.service';
import { ValidatorService } from './validator.service';
import {
  ClassifyResult,
  LLM_CLASSIFIER_PORT,
  LlmClassifierPort,
} from '../domain/classification.types';
import { AUDIT_LOG_PORT, AuditLogPort } from '../domain/audit-log.port';
import {
  BROAD_CANDIDATE_LIMIT,
  DEFAULT_CANDIDATE_LIMIT,
  diversifyCandidates,
} from '../domain/candidate-diversifier';

@Injectable()
export class ClassificationPipeline {
  private readonly logger = new Logger(ClassificationPipeline.name);

  constructor(
    private readonly normalizer: NormalizerService,
    private readonly rulesEngine: RulesEngineService,
    private readonly hybridSearch: HybridSearchService,
    private readonly reranker: RerankerService,
    private readonly validator: ValidatorService,
    @Inject(AUDIT_LOG_PORT)
    private readonly auditLogger: AuditLogPort,
    @Inject(LLM_CLASSIFIER_PORT)
    private readonly llmClassifier: LlmClassifierPort,
  ) {}

  async classify(product: string): Promise<ClassifyResult> {
    const started = Date.now();

    const normalized = this.normalizer.normalize(product);
    const hints = this.rulesEngine.analyze(normalized);
    const searchLimit = normalized.isBroad ? 40 : 20;
    const rerankLimit = normalized.isBroad ? 25 : 10;

    const searched = await this.hybridSearch.search(
      normalized,
      hints,
      searchLimit,
    );
    const reranked = this.reranker.rerank(
      searched,
      hints,
      rerankLimit,
      normalized.isVague,
      normalized.isBroad,
    );

    const displayCandidates = normalized.isBroad
      ? diversifyCandidates(reranked, BROAD_CANDIDATE_LIMIT)
      : reranked.slice(0, DEFAULT_CANDIDATE_LIMIT);

    const llmCandidates = normalized.isBroad
      ? displayCandidates
      : reranked.slice(0, 10);

    if (llmCandidates.length === 0) {
      const result: ClassifyResult = {
        code: null,
        name: null,
        group: null,
        confidence: 0,
        reason: 'Не знайдено релевантних позицій у базі УКТ ЗЕД',
        requiresReview: true,
        candidates: [],
      };
      void this.auditLogger.log(product, result, Date.now() - started);
      return result;
    }

    const llmOutput = await this.classifyWithFallback(
      product,
      llmCandidates,
      hints,
      normalized.isVague,
      normalized.isBroad,
    );

    const hintBoost = hints.reduce((m, h) => Math.max(m, h.boost), 0);
    const result = await this.validator.validate(
      llmOutput,
      reranked,
      reranked[0]?.score ?? 0,
      hintBoost,
      {
        isBroad: normalized.isBroad,
        isVague: normalized.isVague,
        displayCandidates,
      },
    );

    void this.auditLogger.log(product, result, Date.now() - started);
    return result;
  }

  private async classifyWithFallback(
    product: string,
    candidates: Parameters<LlmClassifierPort['classify']>[1],
    hints: Parameters<LlmClassifierPort['classify']>[2],
    isVague: boolean,
    isBroad: boolean,
  ) {
    try {
      return await this.llmClassifier.classify(product, candidates, hints, {
        isVague,
        isBroad,
      });
    } catch (error) {
      this.logger.warn(
        `LLM classify failed for "${product.slice(0, 80)}": ${error instanceof Error ? error.message : error}`,
      );

      if (isBroad) {
        return {
          code: candidates[0]?.code ?? '',
          confidence: 0.5,
          reason:
            'LLM недоступний — запит занадто загальний для автоматичного коду.',
        };
      }
      const top = candidates[0];
      return {
        code: top.code,
        confidence: Math.min(top.score, 0.65),
        reason: `LLM недоступний — обрано найкращий keyword match: ${top.name}`,
      };
    }
  }
}
