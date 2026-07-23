ALTER TABLE "Conversation" ADD COLUMN "phoneJid" TEXT;

UPDATE "Conversation"
SET "phoneJid" = "remoteJid"
WHERE "remoteJid" LIKE '%@s.whatsapp.net';

CREATE UNIQUE INDEX "Conversation_instanceId_phoneJid_key"
ON "Conversation"("instanceId", "phoneJid");
