import { Injectable } from '@nestjs/common';
import { NormalizedQuery } from '../domain/classification.types';
import { isBroadProductQuery } from '../domain/candidate-diversifier';
import { isVagueProductQuery } from '../domain/search-context.builder';

@Injectable()
export class NormalizerService {
  normalize(raw: string): NormalizedQuery {
    const normalized = raw
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const allTokens = normalized.split(' ').filter((t) => t.length > 1);

    const cyrillicTokens = allTokens.filter((t) => /[\u0400-\u04FF]/u.test(t));
    const tokens = (cyrillicTokens.length > 0 ? cyrillicTokens : allTokens).slice(
      0,
      8,
    );

    return {
      raw,
      normalized,
      tokens,
      searchText: normalized.slice(0, 2000),
      isVague: isVagueProductQuery(tokens, raw),
      isBroad: isBroadProductQuery(tokens, raw),
    };
  }
}
