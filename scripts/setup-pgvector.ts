/**
 * Ensures pgvector extension and HNSW index exist (schema managed by Prisma migration).
 * Usage: npm run embeddings:setup
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS vector`);

  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_uktzed_embedding_hnsw
    ON uktzed_positions USING hnsw (embedding vector_cosine_ops)
  `);

  console.log('pgvector extension and HNSW index ready.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
