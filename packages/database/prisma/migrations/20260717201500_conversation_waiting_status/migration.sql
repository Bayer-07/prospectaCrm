CREATE TYPE "ConversationStatus_new" AS ENUM ('WAITING', 'OPEN', 'CLOSED');

ALTER TABLE "Conversation" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Conversation"
ALTER COLUMN "status" TYPE "ConversationStatus_new"
USING ("status"::text::"ConversationStatus_new");

DROP TYPE "ConversationStatus";
ALTER TYPE "ConversationStatus_new" RENAME TO "ConversationStatus";

ALTER TABLE "Conversation" ALTER COLUMN "status" SET DEFAULT 'WAITING';

UPDATE "Conversation"
SET "status" = 'WAITING'
WHERE "status" = 'OPEN' AND "assigneeId" IS NULL;
