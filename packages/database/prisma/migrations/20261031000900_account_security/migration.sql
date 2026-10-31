ALTER TABLE "User" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "emailVerifiedAt" TIMESTAMPTZ(3);
ALTER TABLE "Session" ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Team" DROP CONSTRAINT "Team_createdById_fkey";
ALTER TABLE "Team" ALTER COLUMN "createdById" DROP NOT NULL;
ALTER TABLE "Team" ADD CONSTRAINT "Team_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "EmailVerification" (
  "userId" UUID PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "email" VARCHAR(254) NOT NULL, "changeEmail" BOOLEAN NOT NULL DEFAULT false, "authVersion" INTEGER NOT NULL,
  "tokenHash" CHAR(64) NOT NULL UNIQUE, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "EmailVerification_expiry" CHECK ("expiresAt" > "createdAt"), CONSTRAINT "EmailVerification_email" CHECK ("email" = lower(btrim("email")))
);
CREATE INDEX "EmailVerification_expiresAt_idx" ON "EmailVerification"("expiresAt");
CREATE TABLE "MfaCredential" (
  "userId" UUID PRIMARY KEY REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE, "secretEncrypted" VARCHAR(512) NOT NULL,
  "enabledAt" TIMESTAMPTZ(3), "pendingExpiresAt" TIMESTAMPTZ(3), "lastUsedStep" BIGINT NOT NULL DEFAULT -1,
  CONSTRAINT "MfaCredential_state" CHECK (("enabledAt" IS NULL AND "pendingExpiresAt" IS NOT NULL) OR ("enabledAt" IS NOT NULL AND "pendingExpiresAt" IS NULL))
);
CREATE TABLE "MfaRecoveryCode" (
  "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE, "codeHash" CHAR(64) NOT NULL,
  CONSTRAINT "MfaRecoveryCode_pkey" PRIMARY KEY ("userId", "codeHash")
);
CREATE TABLE "OAuthIdentity" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "provider" VARCHAR(10) NOT NULL, "subject" VARCHAR(120) NOT NULL, "login" VARCHAR(255) NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OAuthIdentity_provider" CHECK ("provider" IN ('GITHUB','GITLAB'))
);
CREATE UNIQUE INDEX "OAuthIdentity_provider_subject_key" ON "OAuthIdentity"("provider", "subject");
CREATE UNIQUE INDEX "OAuthIdentity_userId_provider_key" ON "OAuthIdentity"("userId", "provider");
CREATE TABLE "OAuthFlow" (
  "tokenHash" CHAR(64) PRIMARY KEY, "browserHash" CHAR(64) NOT NULL, "provider" VARCHAR(10) NOT NULL, "purpose" VARCHAR(10) NOT NULL,
  "verifierEncrypted" VARCHAR(512), "userId" UUID REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE, "sessionHash" CHAR(64), "authVersion" INTEGER, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OAuthFlow_provider" CHECK ("provider" IN ('GITHUB','GITLAB')),
  CONSTRAINT "OAuthFlow_purpose" CHECK ("purpose" IN ('LOGIN','LINK','MFA'))
);
CREATE INDEX "OAuthFlow_expiresAt_idx" ON "OAuthFlow"("expiresAt");
CREATE TABLE "SecurityEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(), "userId" UUID NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "type" VARCHAR(64) NOT NULL, "provider" VARCHAR(10), "sessionId" UUID, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "SecurityEvent_userId_createdAt_id_idx" ON "SecurityEvent"("userId", "createdAt", "id");
