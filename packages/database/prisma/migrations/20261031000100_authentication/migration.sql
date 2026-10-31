CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(120) NOT NULL,
  "email" VARCHAR(254) NOT NULL, "passwordHash" VARCHAR(255) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_name_not_blank" CHECK (length(btrim("name")) > 0),
  CONSTRAINT "User_email_normalized" CHECK ("email" = lower(btrim("email")))
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE TABLE "Session" (
  "tokenHash" CHAR(64) NOT NULL, "userId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("tokenHash"),
  CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");
CREATE TABLE "AuthThrottle" (
  "keyHash" CHAR(64) NOT NULL, "count" INTEGER NOT NULL,
  "windowStart" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("keyHash")
);
CREATE INDEX "AuthThrottle_windowStart_idx" ON "AuthThrottle"("windowStart");
-- Legacy projects remain unassigned and inaccessible. Never assign to the first signup.
ALTER TABLE "Project" ADD COLUMN "ownerId" UUID;
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Project_ownerId_createdAt_id_idx" ON "Project"("ownerId", "createdAt", "id");
