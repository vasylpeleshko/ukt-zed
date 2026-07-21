import { UktzedCandidate } from './classification.types';

/** Finds exact or best hierarchical UKTZED prefix match among candidates. */
export function findBestCandidateMatch(
  llmCode: string,
  candidates: UktzedCandidate[],
): UktzedCandidate | undefined {
  const normalized = llmCode.trim();
  const exact = candidates.find((c) => c.code === normalized);
  if (exact) return exact;

  const hierarchical = candidates.filter(
    (c) =>
      c.code.startsWith(`${normalized} `) ||
      normalized.startsWith(`${c.code} `) ||
      c.code.startsWith(normalized) ||
      normalized.startsWith(c.code),
  );

  if (hierarchical.length === 0) return undefined;

  return hierarchical.sort((a, b) => b.code.length - a.code.length)[0];
}
