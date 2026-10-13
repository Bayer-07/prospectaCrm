ALTER TABLE "Campaign"
ADD COLUMN "chatbotId" UUID;

ALTER TABLE "Campaign"
ADD CONSTRAINT "Campaign_chatbotId_fkey"
FOREIGN KEY ("chatbotId") REFERENCES "Chatbot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Campaign_chatbotId_idx" ON "Campaign" ("chatbotId");
