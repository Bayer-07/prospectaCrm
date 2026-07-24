-- Brazilian mobile numbers in the legacy eight-digit format and in the
-- current nine-digit format must share the same uniqueness key.
--
-- Existing collisions are preserved rather than deleted: the oldest active
-- contact owns the key and any additional historical record keeps a NULL key.
-- New writes are still blocked by the unique index and application validation.
UPDATE "Contact"
SET "phoneKey" = NULL
WHERE "archivedAt" IS NULL
  AND "phone" IS NOT NULL;

WITH normalized AS (
  SELECT
    "id",
    "organizationId",
    CASE
      WHEN "phone" ~ '^\+55[1-9][0-9][6-9][0-9]{7}$'
        THEN substring("phone" FROM 1 FOR 5) || '9' || substring("phone" FROM 6)
      ELSE "phone"
    END AS canonical_phone,
    row_number() OVER (
      PARTITION BY
        "organizationId",
        CASE
          WHEN "phone" ~ '^\+55[1-9][0-9][6-9][0-9]{7}$'
            THEN substring("phone" FROM 1 FOR 5) || '9' || substring("phone" FROM 6)
          ELSE "phone"
        END
      ORDER BY "createdAt", "id"
    ) AS duplicate_position
  FROM "Contact"
  WHERE "archivedAt" IS NULL
    AND "phone" IS NOT NULL
)
UPDATE "Contact" AS contact
SET "phoneKey" = normalized.canonical_phone
FROM normalized
WHERE contact."id" = normalized."id"
  AND normalized.duplicate_position = 1;
