ALTER TABLE "ChatbotSession" ADD COLUMN "wakeAt" TIMESTAMP(3);

CREATE INDEX "ChatbotSession_status_wake_idx" ON "ChatbotSession"("status", "wakeAt");
