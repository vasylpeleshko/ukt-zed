import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { ParsedTariffPosition } from '../scripts/parse-pdf';

const prisma = new PrismaClient();

async function refreshSearchVectors(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    UPDATE uktzed_positions SET name = name
  `);
}

async function removeObsoleteCodes(codes: Set<string>): Promise<number> {
  const result = await prisma.uktzedPosition.deleteMany({
    where: { code: { notIn: [...codes] } },
  });
  return result.count;
}

async function main() {
  const jsonPath = path.join(process.cwd(), 'data', 'uktzed-positions.json');

  if (!fs.existsSync(jsonPath)) {
    console.error('Missing data/uktzed-positions.json — run: npm run parse:pdf');
    process.exit(1);
  }

  const positions = JSON.parse(
    fs.readFileSync(jsonPath, 'utf-8'),
  ) as ParsedTariffPosition[];

  console.log(`Seeding ${positions.length} positions...`);

  const codes = new Set(positions.map((p) => p.code));
  const batchSize = 500;

  for (let i = 0; i < positions.length; i += batchSize) {
    const batch = positions.slice(i, i + batchSize);
    await prisma.$transaction(
      batch.map((p) =>
        prisma.uktzedPosition.upsert({
          where: { code: p.code },
          create: {
            code: p.code,
            codeRaw: p.codeRaw,
            name: p.name,
            groupCode: p.groupCode,
            parentCode: p.parentCode,
            level: p.level,
          },
          update: {
            name: p.name,
            groupCode: p.groupCode,
            parentCode: p.parentCode,
            level: p.level,
            codeRaw: p.codeRaw,
          },
        }),
      ),
    );
    console.log(`  ${Math.min(i + batchSize, positions.length)}/${positions.length}`);
  }

  const removed = await removeObsoleteCodes(codes);
  if (removed > 0) {
    console.log(`Removed ${removed} obsolete positions`);
  }

  await refreshSearchVectors();
  console.log('Search vectors refreshed.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
