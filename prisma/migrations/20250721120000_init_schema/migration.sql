-- Extensions
CREATE EXTENSION IF NOT EXISTS vector;

-- Tables
CREATE TABLE IF NOT EXISTS "uktzed_positions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "code_raw" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group_code" TEXT NOT NULL,
    "parent_code" TEXT,
    "level" INTEGER NOT NULL,
    "search_context" TEXT,
    "embedding" vector(1536),
    "search_vector" tsvector,
    "source" TEXT NOT NULL DEFAULT 'tariff',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "uktzed_positions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uktzed_positions_code_key" ON "uktzed_positions"("code");
CREATE INDEX IF NOT EXISTS "uktzed_positions_group_code_idx" ON "uktzed_positions"("group_code");
CREATE INDEX IF NOT EXISTS "uktzed_positions_level_idx" ON "uktzed_positions"("level");
CREATE INDEX IF NOT EXISTS "idx_uktzed_search_vector" ON "uktzed_positions" USING GIN("search_vector");
CREATE INDEX IF NOT EXISTS "idx_uktzed_embedding_hnsw" ON "uktzed_positions" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE IF NOT EXISTS "classification_audit" (
    "id" TEXT NOT NULL,
    "product_query" TEXT NOT NULL,
    "result_code" TEXT,
    "confidence" DOUBLE PRECISION,
    "requires_review" BOOLEAN NOT NULL DEFAULT false,
    "candidates" JSONB,
    "reason" TEXT,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "classification_audit_pkey" PRIMARY KEY ("id")
);

-- Full-text search trigger
CREATE OR REPLACE FUNCTION uktzed_positions_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', coalesce(NEW.code, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.name, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.search_context, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.group_code, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS uktzed_positions_search_vector_trigger ON uktzed_positions;

CREATE TRIGGER uktzed_positions_search_vector_trigger
BEFORE INSERT OR UPDATE ON uktzed_positions
FOR EACH ROW EXECUTE FUNCTION uktzed_positions_search_vector_update();
