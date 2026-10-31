ALTER TABLE "Analysis" ADD COLUMN "captureContext" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Analysis" ADD COLUMN "codeContext" JSONB;
