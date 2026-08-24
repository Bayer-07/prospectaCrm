ALTER TABLE "Team" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Team"
SET "isDefault" = true
WHERE "name" = 'Geral';

INSERT INTO "Team" ("id", "organizationId", "name", "color", "isDefault", "createdAt", "updatedAt")
SELECT gen_random_uuid(), organization."id", 'Geral', '#64748b', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Organization" AS organization
WHERE NOT EXISTS (
  SELECT 1
  FROM "Team" AS team
  WHERE team."organizationId" = organization."id"
    AND team."isDefault" = true
);

CREATE UNIQUE INDEX "Team_one_default_per_organization_idx"
ON "Team" ("organizationId")
WHERE "isDefault" = true;

CREATE TABLE "UserTeam" (
  "userId" UUID NOT NULL,
  "teamId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserTeam_pkey" PRIMARY KEY ("userId", "teamId")
);

CREATE INDEX "UserTeam_teamId_idx" ON "UserTeam" ("teamId");

ALTER TABLE "UserTeam"
ADD CONSTRAINT "UserTeam_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserTeam"
ADD CONSTRAINT "UserTeam_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "UserTeam" ("userId", "teamId")
SELECT "id", "teamId"
FROM "User"
WHERE "teamId" IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO "UserTeam" ("userId", "teamId")
SELECT app_user."id", default_team."id"
FROM "User" AS app_user
JOIN "Team" AS default_team
  ON default_team."organizationId" = app_user."organizationId"
 AND default_team."isDefault" = true
ON CONFLICT DO NOTHING;

ALTER TABLE "Conversation" ADD COLUMN "teamId" UUID;

UPDATE "Conversation" AS conversation
SET "teamId" = default_team."id"
FROM "Team" AS default_team
WHERE default_team."organizationId" = conversation."organizationId"
  AND default_team."isDefault" = true;

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Conversation_org_team_status_recent_idx"
ON "Conversation" ("organizationId", "teamId", "status", "lastMessageAt" DESC, "id" DESC);
