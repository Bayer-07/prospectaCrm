-- Restore content erased by earlier versions when a locally deleted message
-- still has its original values in the audit trail.
WITH deletion_audits AS (
  SELECT DISTINCT ON ("entityId")
    "entityId",
    "before"
  FROM "AuditLog"
  WHERE "action" = 'conversation.message_deleted'
    AND "entityType" = 'Message'
    AND "entityId" IS NOT NULL
    AND "before" IS NOT NULL
  ORDER BY "entityId", "createdAt" DESC
)
UPDATE "Message" AS message
SET
  "text" = COALESCE(deletion_audits."before"->>'text', message."text"),
  "type" = COALESCE(deletion_audits."before"->>'type', message."payload"->>'originalType', message."type"),
  "payload" = COALESCE(message."payload", '{}'::jsonb) || jsonb_build_object(
    'deleted', true,
    'deletedAt', COALESCE(message."payload"->>'deletedAt', message."updatedAt"::text),
    'originalType', COALESCE(deletion_audits."before"->>'type', message."payload"->>'originalType', message."type"),
    'originalText', COALESCE(deletion_audits."before"->>'text', message."payload"->>'originalText', message."text")
  )
FROM deletion_audits
WHERE message."id"::text = deletion_audits."entityId"
  AND message."type" = 'deleted';
