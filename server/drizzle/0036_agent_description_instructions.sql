ALTER TABLE "agent_profiles" ADD COLUMN "description" text;
ALTER TABLE "agent_profiles" ADD COLUMN "instructions" text;

UPDATE "agent_profiles"
SET "description" = "role_description"
WHERE "description" IS NULL;

UPDATE "agent_profiles"
SET "instructions" = "role_description"
WHERE "instructions" IS NULL;
