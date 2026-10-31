CREATE TYPE "TeamRole" AS ENUM ('ADMIN', 'MEMBER', 'READER');
CREATE TABLE "Team" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "name" VARCHAR(120) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdById" UUID NOT NULL,
  CONSTRAINT "Team_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Team_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Team_name_valid" CHECK (length(btrim("name")) > 0 AND "name" = btrim("name"))
);
CREATE TABLE "TeamMember" (
  "teamId" UUID NOT NULL, "userId" UUID NOT NULL, "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId", "userId"),
  CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE TABLE "TeamInvitation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "teamId" UUID NOT NULL, "email" VARCHAR(254) NOT NULL,
  "role" "TeamRole" NOT NULL, "tokenHash" CHAR(64) NOT NULL, "invitedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TeamInvitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TeamInvitation_email_normalized" CHECK ("email" = lower(btrim("email")) AND length("email") > 0),
  CONSTRAINT "TeamInvitation_role_limited" CHECK ("role" <> 'ADMIN'),
  CONSTRAINT "TeamInvitation_expiry" CHECK ("expiresAt" > "createdAt")
);
CREATE UNIQUE INDEX "TeamInvitation_tokenHash_key" ON "TeamInvitation"("tokenHash");
CREATE UNIQUE INDEX "TeamInvitation_teamId_email_key" ON "TeamInvitation"("teamId", "email");
CREATE INDEX "TeamInvitation_expiresAt_idx" ON "TeamInvitation"("expiresAt");
ALTER TABLE "Project" ADD COLUMN "teamId" UUID;
ALTER TABLE "Project" ADD CONSTRAINT "Project_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Project_teamId_createdAt_id_idx" ON "Project"("teamId", "createdAt", "id");
