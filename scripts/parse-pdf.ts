/**
 * Parses Ukrainian customs tariff PDFs into structured UKTZED positions JSON.
 * Usage: npm run parse:pdf
 */
import fs from 'fs';
import path from 'path';
import pdf from 'pdf-parse';

export interface ParsedTariffPosition {
  code: string;
  codeRaw: string;
  name: string;
  groupCode: string;
  parentCode?: string;
  level: number;
}

function resolvePdfPaths(): string[] {
  const fromEnv = [
    process.env.TARIFF_PDF_GROUPS_01_49,
    process.env.TARIFF_PDF_GROUPS_50_97,
  ].filter((p): p is string => Boolean(p && fs.existsSync(p)));

  if (fromEnv.length > 0) return fromEnv;

  const dataDir = path.join(process.cwd(), 'data', 'pdfs');
  const defaults = [
    path.join(dataDir, 'groups-01-49.pdf'),
    path.join(dataDir, 'groups-50-97.pdf'),
  ];

  const existing = defaults.filter((p) => fs.existsSync(p));
  if (existing.length > 0) return existing;

  throw new Error(
    'PDF files not found. Set TARIFF_PDF_GROUPS_01_49 and TARIFF_PDF_GROUPS_50_97 env vars, or place PDFs in data/pdfs/',
  );
}

const GROUP_HEADER = /^Група\s+(\d{2})\s*$/;
const GROUP_INLINE = /^Група\s+(\d{2})\s+(.+)/;
const SKIP_LINE =
  /^(?:00-|77-|1010-|http|www\.|zakon\.rada\.gov)/i;
const CONTINUATION_SKIP =
  /^продуктів\s+товарної\s+позиції|^стор\.|^сторінка/i;

export function formatCodeFromDigits(digits: string): string {
  const d = digits.replace(/\s/g, '');
  if (d.length === 2) return d;
  if (d.length === 4) return d;
  if (d.length === 6) return `${d.slice(0, 4)} ${d.slice(4, 6)}`;
  if (d.length === 8) return `${d.slice(0, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)}`;
  if (d.length === 10) {
    return `${d.slice(0, 4)} ${d.slice(4, 6)} ${d.slice(6, 8)} ${d.slice(8, 10)}`;
  }
  return d;
}

export function codeLevel(codeRaw: string): number {
  const len = codeRaw.replace(/\s/g, '').length;
  if (len >= 10) return 10;
  if (len >= 8) return 8;
  if (len >= 6) return 6;
  if (len >= 4) return 4;
  return 2;
}

export function parentCode(code: string): string | undefined {
  const parts = code.split(' ').filter(Boolean);
  if (parts.length <= 1) return undefined;
  return parts.slice(0, -1).join(' ');
}

const PAGE_FOOTER =
  /\d{1,2}\/\d{1,2}\/\d{2,4},?\s*\d{1,2}:\d{2}\s*[AP]M.*?(?:Митний тариф|$)/i;
const PAGE_FOOTER_LINE = /Митний тариф України/i;

export function cleanPositionName(raw: string): string {
  return raw
    .replace(PAGE_FOOTER, '')
    .replace(/Митний тариф України.*$/i, '')
    .replace(/\(Групи\s+\.{3}.*$/i, '')
    .replace(/(?:^|\s)(?:\d{2}\s*[-–—]\s*)+/g, ' ')
    .replace(/^[\s\-–—:]+/, '')
    .replace(/\s+\d+\s+\d+\s*[-–—]?\s*$/g, '')
    .replace(/\d+шт/gi, '')
    .replace(/\d{4}-$/g, '')
    .replace(/1010-$/g, '')
    .replace(/77-$/g, '')
    .replace(/00-$/g, '')
    .replace(/:\s*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractCodePrefix(line: string): {
  digits: string;
  remainder: string;
} | null {
  const trimmed = line.replace(/\t+/g, ' ').trim();
  if (!trimmed) return null;

  const merged = trimmed.match(/^(\d{4})([A-Za-zА-Яа-яІіЇїЄєҐґ])/);
  if (merged) {
    return { digits: merged[1], remainder: merged[2] + trimmed.slice(merged[0].length) };
  }

  const match = trimmed.match(/^(\d{4}(?:\s*\d{2}){0,3})/);
  if (!match) return null;

  const digits = match[1].replace(/\s/g, '');
  if (![4, 6, 8, 10].includes(digits.length)) return null;

  const remainder = trimmed.slice(match[0].length);
  return { digits, remainder };
}

function isContinuationLine(line: string): boolean {
  const trimmed = line.replace(/\t+/g, ' ').trim();
  if (!trimmed) return false;
  if (SKIP_LINE.test(trimmed)) return false;
  if (CONTINUATION_SKIP.test(trimmed)) return false;
  if (PAGE_FOOTER_LINE.test(trimmed)) return false;
  if (GROUP_HEADER.test(trimmed) || GROUP_INLINE.test(trimmed)) return false;
  if (extractCodePrefix(trimmed)) return false;
  if (/^\d+\s+\d+\s*[-–—]?\s*$/.test(trimmed)) return false;
  return true;
}

function shouldSkipLine(line: string): boolean {
  const trimmed = line.replace(/\t+/g, ' ').trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('http') || trimmed.includes('zakon.rada.gov.ua')) return true;
  if (SKIP_LINE.test(trimmed)) return true;
  if (CONTINUATION_SKIP.test(trimmed)) return true;
  if (PAGE_FOOTER_LINE.test(trimmed) && !extractCodePrefix(trimmed)) return true;
  return false;
}

function addPosition(
  positions: Map<string, ParsedTariffPosition>,
  digits: string,
  rawName: string,
  currentGroup: string,
) {
  const cleaned = cleanPositionName(rawName);
  if (cleaned.length < 2) return;

  const codeRaw = digits;
  const code = formatCodeFromDigits(digits);
  const groupCode = digits.slice(0, 2);

  const existing = positions.get(code);
  if (existing) {
    if (cleaned.length > existing.name.length) {
      existing.name = cleaned.slice(0, 500);
    }
    return;
  }

  positions.set(code, {
    code,
    codeRaw,
    name: cleaned.slice(0, 500),
    groupCode: groupCode || currentGroup,
    parentCode: parentCode(code),
    level: codeLevel(codeRaw),
  });
}

function addGroup(
  positions: Map<string, ParsedTariffPosition>,
  groupCode: string,
  name: string,
) {
  const cleanName = cleanPositionName(name);
  if (!cleanName || cleanName.startsWith('(')) return;

  const normalizedGroup = groupCode.padStart(2, '0');
  positions.set(normalizedGroup, {
    code: normalizedGroup,
    codeRaw: normalizedGroup,
    name: cleanName.slice(0, 500),
    groupCode: normalizedGroup,
    level: 2,
  });
}

export function resolveParentCode(
  code: string,
  positions: Map<string, ParsedTariffPosition>,
): string | undefined {
  let current = parentCode(code);
  while (current) {
    const node = positions.get(current);
    if (node && node.name !== '—') return current;
    current = parentCode(current);
  }
  return undefined;
}

export function resolveAllParents(
  positions: Map<string, ParsedTariffPosition>,
): void {
  for (const position of positions.values()) {
    position.parentCode = resolveParentCode(position.code, positions);
  }
}

export function ensureParentChain(
  positions: Map<string, ParsedTariffPosition>,
): number {
  let created = 0;

  for (const position of [...positions.values()]) {
    let current = position.parentCode;
    while (current) {
      if (!positions.has(current)) {
        const digits = current.replace(/\s/g, '');
        const groupCode = digits.slice(0, 2);
        positions.set(current, {
          code: current,
          codeRaw: digits,
          name: '—',
          groupCode,
          parentCode: parentCode(current),
          level: codeLevel(digits),
        });
        created++;
      }
      const parent = positions.get(current);
      current = parent?.parentCode;
    }
  }

  return created;
}

export function parseText(text: string, positions: Map<string, ParsedTariffPosition>) {
  let currentGroup = '00';
  let pendingName: string | null = null;
  let pendingCode: string | null = null;

  const flushPending = () => {
    if (pendingCode && pendingName) {
      addPosition(positions, pendingCode, pendingName, currentGroup);
    }
    pendingCode = null;
    pendingName = null;
  };

  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\t+/g, ' ').trim();
    if (shouldSkipLine(line)) continue;

    const groupOnly = line.match(GROUP_HEADER);
    if (groupOnly) {
      flushPending();
      currentGroup = groupOnly[1];
      const nextLine = lines[i + 1]?.trim() ?? '';
      if (nextLine && !extractCodePrefix(nextLine) && !nextLine.startsWith('Група')) {
        addGroup(positions, currentGroup, nextLine);
      }
      continue;
    }

    const groupInline = line.match(GROUP_INLINE);
    if (groupInline && !extractCodePrefix(line)) {
      flushPending();
      currentGroup = groupInline[1];
      addGroup(positions, currentGroup, groupInline[2]);
      continue;
    }

    const extracted = extractCodePrefix(line);
    if (extracted) {
      flushPending();

      let namePart = extracted.remainder
        .replace(/^[\s\-–—:]+/, '')
        .replace(/\s+\d+\s+\d+\s*[-–—]?\s*$/, '')
        .trim();

      if (namePart.length < 2) {
        const next = lines[i + 1]?.trim();
        if (next && isContinuationLine(next)) {
          namePart = next;
          i++;
        }
      }

      addPosition(positions, extracted.digits, namePart, currentGroup);

      pendingCode = extracted.digits;
      pendingName = namePart;

      while (i + 1 < lines.length && isContinuationLine(lines[i + 1].trim())) {
        i++;
        const cont = lines[i].replace(/\t+/g, ' ').trim();
        pendingName = `${pendingName} ${cont}`.replace(/\s+/g, ' ').trim();
        addPosition(positions, pendingCode, pendingName, currentGroup);
      }

      pendingCode = null;
      pendingName = null;
      continue;
    }

    if (pendingCode && pendingName && isContinuationLine(line)) {
      pendingName = `${pendingName} ${line}`.replace(/\s+/g, ' ').trim();
      addPosition(positions, pendingCode, pendingName, currentGroup);
    }
  }

  flushPending();
}

export function validatePositions(positions: ParsedTariffPosition[]): {
  missingParents: string[];
  byLevel: Record<number, number>;
} {
  const byCode = new Set(positions.map((p) => p.code));
  const missingParents = new Set<string>();
  const byLevel: Record<number, number> = {};

  for (const p of positions) {
    byLevel[p.level] = (byLevel[p.level] ?? 0) + 1;
    if (p.parentCode && !byCode.has(p.parentCode)) {
      missingParents.add(p.parentCode);
    }
  }

  return {
    missingParents: [...missingParents].sort(),
    byLevel,
  };
}

async function extractPdf(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const result = await pdf(buffer);
  return result.text;
}

async function main() {
  const all = new Map<string, ParsedTariffPosition>();
  const pdfPaths = resolvePdfPaths();

  if (pdfPaths.length === 0) {
    console.error(
      'No tariff PDFs found. Set TARIFF_PDF_GROUPS_01_49 / TARIFF_PDF_GROUPS_50_97 or place files in data/pdfs/',
    );
    process.exit(1);
  }

  for (const pdfPath of pdfPaths) {
    console.log(`Parsing: ${path.basename(pdfPath)}`);
    const text = await extractPdf(pdfPath);
    parseText(text, all);
    console.log(`  Total positions so far: ${all.size}`);
  }

  const synthesized = ensureParentChain(all);
  if (synthesized > 0) {
    console.log(`  Linked through ${synthesized} implicit hierarchy nodes`);
  }
  resolveAllParents(all);
  for (const code of [...all.keys()]) {
    if (all.get(code)?.name === '—') all.delete(code);
  }

  const output = [...all.values()].sort((a, b) =>
    a.codeRaw.localeCompare(b.codeRaw),
  );

  const validation = validatePositions(output);
  if (validation.missingParents.length > 0) {
    console.warn(
      `  Warning: ${validation.missingParents.length} missing parents remain`,
    );
    console.warn(`  Examples: ${validation.missingParents.slice(0, 5).join(', ')}`);
  }

  const outDir = path.join(process.cwd(), 'data');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'uktzed-positions.json');
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`\nSaved ${output.length} positions → ${outPath}`);
  console.log('By level:', validation.byLevel);
  console.log(`Groups (level 2): ${output.filter((p) => p.level === 2).length}`);
  console.log(`10-digit (level 10): ${output.filter((p) => p.level === 10).length}`);

  const tuna = output.find((p) => p.code === '0302 32');
  if (tuna) {
    console.log(`\nSample 0302 32: ${tuna.name}`);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
