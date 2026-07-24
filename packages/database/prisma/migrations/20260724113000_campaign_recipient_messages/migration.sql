ALTER TABLE "CampaignRecipient"
ADD COLUMN "messages" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "whatsappVerifiedAt" TIMESTAMP(3);

