ALTER TABLE "OrganizationAiSettings"
ADD COLUMN "model" TEXT NOT NULL DEFAULT 'gpt-5.6-luna',
ADD COLUMN "openAiApiKeyEncrypted" TEXT,
ADD COLUMN "openAiApiKeyLastFour" TEXT;
