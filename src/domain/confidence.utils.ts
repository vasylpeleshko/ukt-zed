/** Weighted confidence formula used by ValidatorService. */
export const CONFIDENCE_WEIGHTS = {
  llm: 0.4,
  retrieval: 0.3,
  hint: 0.2,
  gap: 0.1,
} as const;

export function computeWeightedConfidence(
  llmConfidence: number,
  candidateScore: number,
  topScore: number,
  hintBoost: number,
  candidateScores: number[],
): number {
  const retrievalScore = topScore > 0 ? candidateScore / topScore : 0;
  const gap =
    candidateScores.length >= 2
      ? (candidateScores[0] - candidateScores[1]) /
        Math.max(candidateScores[0], 1)
      : 0.5;

  return (
    llmConfidence * CONFIDENCE_WEIGHTS.llm +
    retrievalScore * CONFIDENCE_WEIGHTS.retrieval +
    hintBoost * CONFIDENCE_WEIGHTS.hint +
    Math.min(gap, 1) * CONFIDENCE_WEIGHTS.gap
  );
}
