ALTER TABLE "Message"
  ADD COLUMN "transcriptionStatus" TEXT,
  ADD COLUMN "transcriptionText" TEXT,
  ADD COLUMN "transcriptionError" TEXT,
  ADD COLUMN "transcriptionProvider" TEXT,
  ADD COLUMN "transcribedAt" TIMESTAMP(3);
