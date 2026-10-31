ALTER TABLE "Project" ADD COLUMN "analysisProfileVersion" VARCHAR(120) NOT NULL DEFAULT 'codeaudit-js-ts-v1';
ALTER TABLE "Project" ADD CONSTRAINT "Project_profile_supported" CHECK ("analysisProfileVersion" IN ('codeaudit-js-ts-v1', 'codeaudit-js-ts-strict-v1'));
