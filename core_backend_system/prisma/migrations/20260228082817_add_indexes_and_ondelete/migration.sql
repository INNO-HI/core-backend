-- DropForeignKey
ALTER TABLE "care_logs" DROP CONSTRAINT "care_logs_managerId_fkey";

-- DropForeignKey
ALTER TABLE "care_logs" DROP CONSTRAINT "care_logs_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "feedbacks" DROP CONSTRAINT "feedbacks_careLogId_fkey";

-- DropForeignKey
ALTER TABLE "manager_dongs" DROP CONSTRAINT "manager_dongs_dongId_fkey";

-- DropForeignKey
ALTER TABLE "manager_dongs" DROP CONSTRAINT "manager_dongs_managerId_fkey";

-- DropForeignKey
ALTER TABLE "memos" DROP CONSTRAINT "memos_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "recipient_policies" DROP CONSTRAINT "recipient_policies_policyId_fkey";

-- DropForeignKey
ALTER TABLE "recipient_policies" DROP CONSTRAINT "recipient_policies_recipientId_fkey";

-- DropForeignKey
ALTER TABLE "visits" DROP CONSTRAINT "visits_managerId_fkey";

-- DropForeignKey
ALTER TABLE "visits" DROP CONSTRAINT "visits_recipientId_fkey";

-- CreateIndex
CREATE INDEX "care_logs_recipientId_idx" ON "care_logs"("recipientId");

-- CreateIndex
CREATE INDEX "care_logs_managerId_idx" ON "care_logs"("managerId");

-- CreateIndex
CREATE INDEX "feedbacks_careLogId_idx" ON "feedbacks"("careLogId");

-- CreateIndex
CREATE INDEX "managers_centerId_idx" ON "managers"("centerId");

-- CreateIndex
CREATE INDEX "memos_recipientId_idx" ON "memos"("recipientId");

-- CreateIndex
CREATE INDEX "recipients_managerId_idx" ON "recipients"("managerId");

-- CreateIndex
CREATE INDEX "recipients_dongId_idx" ON "recipients"("dongId");

-- CreateIndex
CREATE INDEX "visits_recipientId_idx" ON "visits"("recipientId");

-- CreateIndex
CREATE INDEX "visits_managerId_idx" ON "visits"("managerId");

-- AddForeignKey
ALTER TABLE "manager_dongs" ADD CONSTRAINT "manager_dongs_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_dongs" ADD CONSTRAINT "manager_dongs_dongId_fkey" FOREIGN KEY ("dongId") REFERENCES "dongs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_careLogId_fkey" FOREIGN KEY ("careLogId") REFERENCES "care_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memos" ADD CONSTRAINT "memos_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_policies" ADD CONSTRAINT "recipient_policies_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_policies" ADD CONSTRAINT "recipient_policies_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
