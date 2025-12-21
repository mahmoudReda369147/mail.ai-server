-- CreateTable
CREATE TABLE "sended_emails" (
    "id" TEXT NOT NULL,
    "emailId" TEXT NOT NULL,
    "theridedId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sended_emails_pkey" PRIMARY KEY ("id")
);
