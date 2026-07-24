-- CreateEnum
CREATE TYPE "InviteEmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- AlterTable
ALTER TABLE "InviteToken"
ADD COLUMN "emailStatus" "InviteEmailStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "emailAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "emailSentAt" TIMESTAMP(3),
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "emailError" TEXT;

-- CreateIndex
CREATE INDEX "InviteToken_emailStatus_expiresAt_idx" ON "InviteToken"("emailStatus", "expiresAt");
