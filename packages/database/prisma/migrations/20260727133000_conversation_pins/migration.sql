CREATE TABLE "ConversationPin" (
    "userId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationPin_pkey" PRIMARY KEY ("userId", "conversationId")
);

CREATE INDEX "ConversationPin_user_recent_idx"
ON "ConversationPin"("userId", "createdAt" DESC);

ALTER TABLE "ConversationPin"
ADD CONSTRAINT "ConversationPin_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ConversationPin"
ADD CONSTRAINT "ConversationPin_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
