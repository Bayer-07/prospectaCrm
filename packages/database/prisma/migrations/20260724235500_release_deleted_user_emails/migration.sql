UPDATE "User"
SET
  "email" = 'deleted.' || "id"::text || '@users.invalid',
  "passwordHash" = NULL
WHERE
  "status" = 'SUSPENDED'
  AND "email" NOT LIKE 'deleted.%@users.invalid';
