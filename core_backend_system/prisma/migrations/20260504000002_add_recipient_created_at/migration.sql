-- AlterTable: recipients — add createdAt column
ALTER TABLE "recipients" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
