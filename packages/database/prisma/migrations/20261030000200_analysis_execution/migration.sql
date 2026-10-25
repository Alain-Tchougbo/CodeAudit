-- AlterTable
ALTER TABLE "Analysis" ADD COLUMN     "deadlineAt" TIMESTAMPTZ(3),
ADD COLUMN     "errorCode" VARCHAR(64),
ADD COLUMN     "errorMessage" VARCHAR(500),
ADD COLUMN     "finishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "heartbeatAt" TIMESTAMPTZ(3),
ADD COLUMN     "leaseExpiresAt" TIMESTAMPTZ(3),
ADD COLUMN     "lockToken" UUID,
ADD COLUMN     "profileVersion" VARCHAR(120),
ADD COLUMN     "report" JSONB,
ADD COLUMN     "sourceDigest" CHAR(64),
ADD COLUMN     "sourceKey" UUID,
ADD COLUMN     "sourcesDeletedAt" TIMESTAMPTZ(3),
ADD COLUMN     "startedAt" TIMESTAMPTZ(3),
ADD COLUMN     "statistics" JSONB,
ADD COLUMN     "workerId" VARCHAR(120);

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_lockToken_key" ON "Analysis"("lockToken");

-- CreateIndex
CREATE UNIQUE INDEX "Analysis_sourceKey_key" ON "Analysis"("sourceKey");

-- CreateIndex
CREATE INDEX "Analysis_status_createdAt_id_idx" ON "Analysis"("status", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Analysis_status_leaseExpiresAt_idx" ON "Analysis"("status", "leaseExpiresAt");
