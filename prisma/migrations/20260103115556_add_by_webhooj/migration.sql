-- AlterTable
ALTER TABLE "calendar_tasks" ADD COLUMN     "botId" TEXT,
ADD COLUMN     "isCreatedByBot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "botId" TEXT,
ADD COLUMN     "isCreatedByBot" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "calendar_tasks" ADD CONSTRAINT "calendar_tasks_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_botId_fkey" FOREIGN KEY ("botId") REFERENCES "bots"("id") ON DELETE SET NULL ON UPDATE CASCADE;
