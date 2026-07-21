export interface PositionNode {
  code: string;
  name: string;
  groupCode: string;
  parentCode?: string | null;
  level: number;
}

export const GROUP_SEMANTICS: Record<
  string,
  { title: string; keywords: string[] }
> = {
  '02': {
    title: "М'ясо та їстівні субпродукти",
    keywords: ["м'ясо", 'мʼясо', 'субпродукти'],
  },
  '03': {
    title: 'Риба і ракоподібні, молюски та інші водяні безхребетні',
    keywords: ['риба', 'рибина', 'ракоподібні', 'молюски'],
  },
  '04': {
    title: 'Молоко та молочні продукти',
    keywords: ['молоко', 'молочні', 'сир', 'вершки'],
  },
  '22': {
    title: 'Алкогольні та безалкогольні напої',
    keywords: ['напої', 'вода', 'напій'],
  },
};

const VAGUE_SPECIFIC_WORDS =
  /заморож|свіж|жив|сушен|консерв|варен|копчен|слайс|філе|без\s*кіст|обвал|фарм|невел|велик|пород|вид|родин|spp|жіноч|чоловіч|дитяч/i;

export function cleanTariffName(name: string): string {
  return name
    .replace(/\d+шт/gi, '')
    .replace(/\d{1,2}\s*-\s*$/g, '')
    .replace(/^[\d\s.\-–—:]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isGenericTariffName(name: string): boolean {
  const clean = cleanTariffName(name).toLowerCase();
  return (
    clean === 'інші' ||
    clean.startsWith('інші ') ||
    clean.startsWith('інша ') ||
    clean.startsWith('інше ') ||
    clean.endsWith(' інші') ||
    clean.includes('інші:')
  );
}

const GENERIC_CATEGORY_TERMS = new Set(
  Object.values(GROUP_SEMANTICS).flatMap((m) => m.keywords),
);

function isGenericCategoryTerm(token: string): boolean {
  const t = token.toLowerCase();
  if (GENERIC_CATEGORY_TERMS.has(t)) return true;
  return [...GENERIC_CATEGORY_TERMS].some(
    (k) => t.startsWith(k) || k.startsWith(t),
  );
}

export function isVagueProductQuery(tokens: string[], raw: string): boolean {
  if (tokens.length === 0) return true;
  if (tokens.length > 1) return false;
  if (VAGUE_SPECIFIC_WORDS.test(raw)) return false;
  return isGenericCategoryTerm(tokens[0]);
}

export function buildSearchContext(
  position: PositionNode,
  byCode: Map<string, PositionNode>,
): string {
  const parts: string[] = [];
  const groupMeta = GROUP_SEMANTICS[position.groupCode];

  if (groupMeta) {
    parts.push(groupMeta.title);
    parts.push(...groupMeta.keywords);
  }

  const groupNode = byCode.get(position.groupCode);
  if (groupNode && groupNode.code !== position.code) {
    parts.push(cleanTariffName(groupNode.name));
  }

  const ancestors: string[] = [];
  let currentCode = position.parentCode;
  const visited = new Set<string>();

  while (currentCode && !visited.has(currentCode)) {
    visited.add(currentCode);
    const parent = byCode.get(currentCode);
    if (!parent) break;
    const cleaned = cleanTariffName(parent.name);
    if (cleaned) ancestors.unshift(cleaned);
    currentCode = parent.parentCode ?? undefined;
  }

  parts.push(...ancestors);

  const ownName = cleanTariffName(position.name);
  if (ownName) parts.push(ownName);

  if (isGenericTariffName(position.name) && groupMeta) {
    parts.push('інші товари групи');
    parts.push(...groupMeta.keywords);
  }

  const unique = [...new Set(parts.map((p) => p.trim()).filter(Boolean))];

  return `УКТ ЗЕД ${position.code} група ${position.groupCode}: ${unique.join('. ')}`.slice(
    0,
    4000,
  );
}

export function buildEmbedText(searchContext: string): string {
  return searchContext.slice(0, 2000);
}
