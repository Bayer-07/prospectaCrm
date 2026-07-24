-- CreateEnum
CREATE TYPE "TaskDigestStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "TaskDigestDelivery" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "digestDate" DATE NOT NULL,
    "status" "TaskDigestStatus" NOT NULL DEFAULT 'PENDING',
    "taskCount" INTEGER NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskDigestDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskDigestDelivery_userId_digestDate_key" ON "TaskDigestDelivery"("userId", "digestDate");

-- CreateIndex
CREATE INDEX "TaskDigestDelivery_organizationId_digestDate_status_idx" ON "TaskDigestDelivery"("organizationId", "digestDate", "status");

-- AddForeignKey
ALTER TABLE "TaskDigestDelivery" ADD CONSTRAINT "TaskDigestDelivery_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskDigestDelivery" ADD CONSTRAINT "TaskDigestDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
