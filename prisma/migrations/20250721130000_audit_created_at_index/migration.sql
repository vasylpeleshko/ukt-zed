-- Index for audit retention queries
CREATE INDEX IF NOT EXISTS "classification_audit_created_at_idx"
  ON "classification_audit" ("created_at" DESC);
