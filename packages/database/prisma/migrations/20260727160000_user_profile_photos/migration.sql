ALTER TABLE "User"
ADD COLUMN "profilePhotoId" UUID;

CREATE UNIQUE INDEX "User_profilePhotoId_key"
ON "User"("profilePhotoId");

ALTER TABLE "User"
ADD CONSTRAINT "User_profilePhotoId_fkey"
FOREIGN KEY ("profilePhotoId")
REFERENCES "MediaAsset"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
