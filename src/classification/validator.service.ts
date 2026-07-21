import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  POSITION_SEARCH_PORT,
  PositionSearchPort,
} from '../domain/position-search.port';
import {
  ClassifyResult,
  LlmClassificationOutput,
  UktzedCandidate,
} from '../domain/classification.types';
import {
  BROAD_CANDIDATE_LIMIT,
  DEFAULT_CANDIDATE_LIMIT,
  diversifyCandidates,
} from '../domain/candidate-diversifier';
import { findBestCandidateMatch } from '../domain/uktzed-code.utils';
import { computeWeightedConfidence } from '../domain/confidence.utils';

export interface ValidateOptions {
  isBroad?: boolean;
  isVague?: boolean;
  displayCandidates?: UktzedCandidate[];
}

@Injectable()
export class ValidatorService {
  private readonly autoThreshold: number;
  private readonly reviewThreshold: number;

  constructor(
    private readonly config: ConfigService,
    @Inject(POSITION_SEARCH_PORT)
    private readonly repository: PositionSearchPort,
  ) {
    this.autoThreshold = Number(
      this.config.get('CONFIDENCE_AUTO_THRESHOLD', '0.75'),
    );
    this.reviewThreshold = Number(
      this.config.get('CONFIDENCE_REVIEW_THRESHOLD', '0.45'),
    );
  }

  async validate(
    llmOutput: LlmClassificationOutput,
    candidates: UktzedCandidate[],
    retrievalTopScore: number,
    hintBoost: number,
    options: ValidateOptions = {},
  ): Promise<ClassifyResult> {
    const displayLimit = options.isBroad
      ? BROAD_CANDIDATE_LIMIT
      : DEFAULT_CANDIDATE_LIMIT;
    const displayCandidates =
      options.displayCandidates ??
      (options.isBroad
        ? diversifyCandidates(candidates, displayLimit)
        : candidates.slice(0, displayLimit));

    if (options.isBroad) {
      const confidence = this.computeConfidence(
        llmOutput.confidence,
        candidates.find((c) => c.code === llmOutput.code)?.score ?? 0,
        retrievalTopScore,
        hintBoost,
        candidates,
      );

      return {
        code: null,
        name: null,
        group: null,
        confidence: round(Math.min(confidence, 0.55)),
        reason: appendBroadHint(llmOutput.reason),
        requiresReview: true,
        candidates: displayCandidates,
      };
    }

    const candidateCodes = new Set(candidates.map((c) => c.code));
    let code = llmOutput.code;
    let matchedCandidate = candidates.find((c) => c.code === code);

    if (!candidateCodes.has(code)) {
      const bestMatch = findBestCandidateMatch(code, candidates);
      if (bestMatch) {
        code = bestMatch.code;
        matchedCandidate = bestMatch;
      } else {
        const confidence = this.computeConfidence(
          llmOutput.confidence,
          0,
          retrievalTopScore,
          hintBoost,
          candidates,
        );
        return this.hardFallback(
          displayCandidates,
          llmOutput.reason,
          confidence,
          displayLimit,
        );
      }
    }

    let confidence = this.computeConfidence(
      llmOutput.confidence,
      matchedCandidate?.score ?? 0,
      retrievalTopScore,
      hintBoost,
      candidates,
    );

    if (!candidateCodes.has(code)) {
      confidence *= 0.85;
    }

    const position = await this.repository.findByCode(code);
    if (!position) {
      return this.hardFallback(
        displayCandidates,
        llmOutput.reason,
        confidence,
        displayLimit,
      );
    }

    if (confidence < this.reviewThreshold) {
      return this.hardFallback(
        displayCandidates,
        llmOutput.reason,
        confidence,
        displayLimit,
      );
    }

    const requiresReview = confidence < this.autoThreshold;

    return {
      code: position.code,
      name: position.name,
      group: position.groupCode,
      confidence: round(confidence),
      reason: llmOutput.reason,
      requiresReview,
      candidates: requiresReview ? displayCandidates : [],
    };
  }

  private computeConfidence(
    llmConfidence: number,
    candidateScore: number,
    topScore: number,
    hintBoost: number,
    candidates: UktzedCandidate[],
  ): number {
    return computeWeightedConfidence(
      llmConfidence,
      candidateScore,
      topScore,
      hintBoost,
      candidates.map((c) => c.score),
    );
  }

  private hardFallback(
    candidates: UktzedCandidate[],
    reason: string,
    confidence: number,
    limit = DEFAULT_CANDIDATE_LIMIT,
  ): ClassifyResult {
    return {
      code: null,
      name: null,
      group: null,
      confidence: round(confidence),
      reason: `${reason} (confidence нижче порогу — потрібен ручний вибір)`,
      requiresReview: true,
      candidates: candidates.slice(0, limit),
    };
  }
}

function appendBroadHint(reason: string): string {
  const hint =
    'Запит загальний — оберіть вид і обробку з кандидатів (свіжий / морожений / консерви).';
  if (reason.includes('свіж') || reason.includes('морож')) return reason;
  return `${reason} ${hint}`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
