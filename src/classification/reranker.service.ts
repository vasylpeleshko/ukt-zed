import { Injectable } from '@nestjs/common';
import { RuleHint, UktzedCandidate } from '../domain/classification.types';
import { isGenericTariffName } from '../domain/search-context.builder';
import { codeDepth } from '../domain/candidate-diversifier';

@Injectable()
export class RerankerService {
  rerank(
    candidates: UktzedCandidate[],
    hints: RuleHint[],
    limit = 10,
    isVague = false,
    isBroad = false,
  ): UktzedCandidate[] {
    if (candidates.length === 0) return [];

    const groupBoosts = new Set(hints.flatMap((h) => h.groupCodes ?? []));
    const prefixBoosts = hints.flatMap((h) => h.codePrefixes ?? []);
    const maxHintBoost = hints.reduce((m, h) => Math.max(m, h.boost), 0);
    const preferGeneric =
      isVague || hints.some((h) => h.preferGeneric === true);
    const maxScore = Math.max(...candidates.map((x) => x.score), 1);

    const scored = candidates.map((c) => {
      let boost = 0;

      if (groupBoosts.has(c.groupCode)) boost += maxHintBoost;
      if (prefixBoosts.some((p) => c.code.startsWith(p))) boost += maxHintBoost;

      if (preferGeneric) {
        if (isGenericTariffName(c.name)) boost += 0.25;
        if (c.searchContext?.toLowerCase().includes('інші')) boost += 0.1;
      } else if (isGenericTariffName(c.name)) {
        boost -= isBroad ? 0.15 : 0.05;
      }

      if (isBroad) {
        if (codeDepth(c.code) === 2) boost += 0.12;
        if (codeDepth(c.code) >= 4) boost -= 0.06;
      }

      const normalizedScore = c.score / maxScore;

      return {
        ...c,
        score: Math.min(1, normalizedScore + boost),
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
