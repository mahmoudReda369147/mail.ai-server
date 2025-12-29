-- CreateEnum
CREATE TYPE "ReplayTony" AS ENUM ('Professional', 'Friendly', 'Concise', 'Detailed');

-- CreateTable
CREATE TABLE "bots" (
    "id" TEXT NOT NULL,
    "emails" TEXT NOT NULL,
    "botName" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isactive" BOOLEAN NOT NULL DEFAULT true,
    "replayTony" "ReplayTony" NOT NULL,
    "isAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "userPrompet" TEXT NOT NULL,
    "isautoSummarize" BOOLEAN NOT NULL DEFAULT false,
    "isautoExtractTaskes" BOOLEAN NOT NULL DEFAULT false,
    "isautoExtractMettengs" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bots_pkey" PRIMARY KEY ("id")
);
