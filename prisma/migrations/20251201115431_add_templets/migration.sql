-- CreateTable
CREATE TABLE "templets" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "usedTimes" INTEGER NOT NULL,
    "categury" TEXT NOT NULL,
    "isFivoret" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "templets_pkey" PRIMARY KEY ("id")
);
