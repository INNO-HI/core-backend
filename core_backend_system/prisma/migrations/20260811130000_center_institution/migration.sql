-- AlterTable
ALTER TABLE "centers" ADD COLUMN     "institutionId" TEXT;

-- AddForeignKey
ALTER TABLE "centers" ADD CONSTRAINT "centers_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

