import { UktzedCandidate } from './classification.types';
import { cleanTariffName, isGenericTariffName } from './search-context.builder';

export const BROAD_CANDIDATE_LIMIT = 7;
export const DEFAULT_CANDIDATE_LIMIT = 3;

/** Single-word product families with many tariff subcodes (e.g. тунець → 10+ species). */
export const BROAD_PRODUCT_TERMS = [
  'тунець',
  'tuna',
  'сир',
  'ковбаса',
  'олія',
  'кава',
];

export function isBroadProductQuery(tokens: string[], raw: string): boolean {
  if (tokens.length !== 1) return false;
  if (VAGUE_SPECIFIC.test(raw)) return false;
  const token = tokens[0].toLowerCase();
  return BROAD_PRODUCT_TERMS.some(
    (term) => token === term || token.startsWith(term) || term.startsWith(token),
  );
}

const VAGUE_SPECIFIC =
  /заморож|свіж|жив|сушен|консерв|варен|копчен|слайс|філе|жовтопер|синій|смугаст/i;

export function codeDepth(code: string): number {
  return code.split(' ').filter(Boolean).length;
}

export function speciesDedupKey(candidate: UktzedCandidate): string {
  const parts = candidate.code.split(' ').filter(Boolean);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  const name = cleanTariffName(candidate.name).toLowerCase();
  return name.slice(0, 60) || candidate.code;
}

export function diversifyCandidates(
  candidates: UktzedCandidate[],
  limit = BROAD_CANDIDATE_LIMIT,
  options: { skipGeneric?: boolean; preferHeadingLevel?: boolean } = {},
): UktzedCandidate[] {
  const { skipGeneric = true, preferHeadingLevel = true } = options;
  const sorted = [...candidates].sort((a, b) => {
    const boost = (c: UktzedCandidate) => {
      let extra = 0;
      const depth = codeDepth(c.code);
      if (preferHeadingLevel && depth === 2) extra += 0.08;
      if (preferHeadingLevel && depth >= 4) extra -= 0.04;
      return c.score + extra;
    };
    return boost(b) - boost(a);
  });

  const picked: UktzedCandidate[] = [];
  const seen = new Set<string>();

  const tryPick = (filter?: (c: UktzedCandidate) => boolean) => {
    for (const c of sorted) {
      if (filter && !filter(c)) continue;
      if (skipGeneric && isGenericTariffName(c.name)) continue;
      const key = speciesDedupKey(c);
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(c);
      if (picked.length >= limit) return true;
    }
    return false;
  };

  if (tryPick((c) => codeDepth(c.code) === 2)) return picked;
  tryPick();
  return picked;
}
