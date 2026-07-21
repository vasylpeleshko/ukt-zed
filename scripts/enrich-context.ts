/**
 * Builds search_context for all UKTZED positions (parent chain + group keywords).
 * Usage: npm run context:enrich
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  buildSearchContext,
  PositionNode,
} from '../src/domain/search-context.builder';

const prisma = new PrismaClient();

async function main() {
  const forceReembed = process.argv.includes('--reembed');

  const rows = await prisma.uktzedPosition.findMany({
    select: {
      code: true,
      name: true,
      groupCode: true,
      parentCode: true,
      level: true,
    },
    orderBy: { code: 'asc' },
  });

  const byCode = new Map<string, PositionNode>(
    rows.map((r) => [r.code, r]),
  );

  console.log(`Enriching ${rows.length} positions...`);

  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    await prisma.$transaction(
      batch.map((row) => {
        const context = buildSearchContext(row, byCode);
        return prisma.uktzedPosition.update({
          where: { code: row.code },
          data: { searchContext: context },
        });
      }),
    );
    console.log(`  ${Math.min(i + 500, rows.length)}/${rows.length}`);
  }

  if (forceReembed) {
    await prisma.$executeRawUnsafe(`
      UPDATE uktzed_positions SET embedding = NULL WHERE level >= 4
    `);
    console.log('Embeddings cleared — run npm run embeddings:generate');
  }

  await prisma.$executeRawUnsafe(`UPDATE uktzed_positions SET name = name`);

  const sample = await prisma.uktzedPosition.findFirst({
    where: { code: '0302 32 90 00' },
    select: { code: true, searchContext: true },
  });

  console.log('\nSample 0302 32 90 00 context:');
  console.log(sample?.searchContext ?? 'not found');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
