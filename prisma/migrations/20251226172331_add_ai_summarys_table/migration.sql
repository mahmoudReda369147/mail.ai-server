-- CreateTable
CREATE TABLE "ai_summarys" (
    "id" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "priority" INTEGER NOT NULL,
    "userId" TEXT NOT NULL,
    "gmailId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_summarys_pkey" PRIMARY KEY ("id")
);
