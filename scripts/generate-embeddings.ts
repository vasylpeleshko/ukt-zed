/**
 * Generates OpenAI embeddings for UKTZED positions and stores in pgvector.
 * Usage: npm run embeddings:generate
 * Force rebuild: npm run embeddings:generate -- --force
 */
import 'dotenv/config';
import OpenAI from 'openai';
import { PrismaClient } from '@prisma/client';
import { buildEmbedText } from '../src/domain/search-context.builder';

const prisma = new PrismaClient();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
const BATCH_SIZE = 100;
const MIN_LEVEL = Math.max(2, Number(process.env.EMBEDDING_MIN_LEVEL ?? '4') | 0);
const force = process.argv.includes('--force');

function toVectorLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required');
  }

  if (force) {
    await prisma.$executeRawUnsafe(`
      UPDATE uktzed_positions SET embedding = NULL WHERE level >= ${MIN_LEVEL}
    `);
    console.log('Force mode: cleared existing embeddings');
  }

  const pending = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      code: string;
      name: string;
      group_code: string;
      search_context: string | null;
    }>
  >(`
    SELECT id, code, name, group_code, search_context
    FROM uktzed_positions
    WHERE level >= ${MIN_LEVEL}
      AND embedding IS NULL
      AND search_context IS NOT NULL
    ORDER BY code
  `);

  console.log(`Pending embeddings: ${pending.length}`);

  if (pending.length === 0 && !force) {
    const missingContext = await prisma.uktzedPosition.count({
      where: { searchContext: null },
    });
    if (missingContext > 0) {
      console.log(`Run npm run context:enrich first (${missingContext} without context)`);
    }
    return;
  }

  for (let i = 0; i < pending.length; i += BATCH_SIZE) {
    const batch = pending.slice(i, i + BATCH_SIZE);
    const inputs = batch.map((r) =>
      buildEmbedText(
        r.search_context ??
          `УКТ ЗЕД ${r.code} група ${r.group_code}: ${r.name}`,
      ),
    );

    const response = await openai.embeddings.create({
      model: MODEL,
      input: inputs,
    });

    for (let j = 0; j < batch.length; j++) {
      const vector = response.data[j]?.embedding;
      if (!vector) continue;

      await prisma.$executeRawUnsafe(
        `UPDATE uktzed_positions SET embedding = $1::vector WHERE id = $2`,
        toVectorLiteral(vector),
        batch[j].id,
      );
    }

    console.log(`  ${Math.min(i + BATCH_SIZE, pending.length)}/${pending.length}`);
  }

  const [{ count }] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `SELECT COUNT(*)::bigint AS count FROM uktzed_positions WHERE embedding IS NOT NULL`,
  );

  console.log(`Done. Embedded positions: ${count}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
