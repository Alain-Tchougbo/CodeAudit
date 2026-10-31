ALTER TABLE "Project" ADD COLUMN "qualityPolicy" JSONB;
ALTER TABLE "Analysis" ADD COLUMN "qualityPolicySnapshot" JSONB;
CREATE TABLE "ApiKey" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tokenHash" CHAR(64) NOT NULL,
  "userId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "name" VARCHAR(80) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  "lastUsedAt" TIMESTAMPTZ(3),
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ApiKey_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ApiKey_name_not_blank" CHECK (length(btrim("name")) > 0 AND "name" = btrim("name")),
  CONSTRAINT "ApiKey_expiry_after_creation" CHECK ("expiresAt" > "createdAt")
);
CREATE UNIQUE INDEX "ApiKey_tokenHash_key" ON "ApiKey"("tokenHash");
CREATE INDEX "ApiKey_userId_projectId_idx" ON "ApiKey"("userId", "projectId");
CREATE INDEX "ApiKey_expiresAt_idx" ON "ApiKey"("expiresAt");
