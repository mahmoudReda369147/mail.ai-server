/*
  Warnings:

  - The `emails` column on the `bots` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "bots" DROP COLUMN "emails",
ADD COLUMN     "emails" TEXT[];
