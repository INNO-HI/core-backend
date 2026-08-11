-- AlterTable
ALTER TABLE "managers" ADD COLUMN     "userId" TEXT,
ALTER COLUMN "centerId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "managers_userId_key" ON "managers"("userId");

