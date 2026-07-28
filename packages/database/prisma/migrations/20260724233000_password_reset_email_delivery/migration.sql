ALTER TABLE "PasswordResetToken"
ADD COLUMN "emailStatus" "InviteEmailStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "emailAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "emailSentAt" TIMESTAMP(3),
ADD COLUMN "providerMessageId" TEXT,
ADD COLUMN "emailError" TEXT;

CREATE INDEX "PasswordResetToken_emailStatus_expiresAt_idx"
ON "PasswordResetToken"("emailStatus", "expiresAt");
