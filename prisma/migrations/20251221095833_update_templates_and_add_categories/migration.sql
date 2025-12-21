/*
  Warnings:

  - You are about to drop the column `categury` on the `templets` table. All the data in the column will be lost.
  - You are about to drop the column `content` on the `templets` table. All the data in the column will be lost.
  - You are about to drop the column `isFivoret` on the `templets` table. All the data in the column will be lost.
  - You are about to drop the column `usedTimes` on the `templets` table. All the data in the column will be lost.

*/

-- Add new columns with default values first
ALTER TABLE "templets" 
ADD COLUMN     "body" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "categure" TEXT NOT NULL DEFAULT 'general',
ADD COLUMN     "isFavorets" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subject" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "usedtimes" INTEGER NOT NULL DEFAULT 0;

-- Migrate data from old columns to new columns
UPDATE "templets" 
SET 
  "body" = "content",
  "categure" = COALESCE("categury", 'general'),
  "isFavorets" = "isFivoret",
  "usedtimes" = "usedTimes",
  "subject" = "name";

-- Now drop the old columns
ALTER TABLE "templets" 
DROP COLUMN "categury",
DROP COLUMN "content", 
DROP COLUMN "isFivoret",
DROP COLUMN "usedTimes";

-- CreateTable
CREATE TABLE "template_categories" (
    "id" TEXT NOT NULL,
    "Name" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "template_categories_pkey" PRIMARY KEY ("id")
);
