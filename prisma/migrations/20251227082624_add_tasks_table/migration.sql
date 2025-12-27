-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "taskDate" TIMESTAMP(3) NOT NULL,
    "isDoneTask" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'medium',
    "userId" TEXT NOT NULL,
    "gmailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);
