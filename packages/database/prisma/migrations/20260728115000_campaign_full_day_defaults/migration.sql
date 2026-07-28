ALTER TABLE "Campaign"
  ALTER COLUMN "sendingWindowStart" SET DEFAULT '00:00',
  ALTER COLUMN "sendingWindowEnd" SET DEFAULT '23:59',
  ALTER COLUMN "sendingDays" SET DEFAULT '[0,1,2,3,4,5,6]';
