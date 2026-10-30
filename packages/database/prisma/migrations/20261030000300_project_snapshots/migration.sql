ALTER TABLE "Analysis" ADD COLUMN "projectSnapshot" JSONB;

-- Existing analyses have no historical project snapshot. Preserve the values
-- available at migration time and expose that provenance explicitly.
UPDATE "Analysis" AS analysis
SET "projectSnapshot" = jsonb_build_object(
  'id', project."id", 'name', project."name", 'description', project."description",
  'createdAt', to_char(project."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'updatedAt', to_char(project."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'capturedAt', to_char(statement_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'origin', 'MIGRATION_BACKFILL'
)
FROM "Project" AS project WHERE analysis."projectId" = project."id";
