-- DropIndex
DROP INDEX "care_logs_recipientId_idx";

-- AlterTable
ALTER TABLE "care_logs" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "elapsedSeconds" INTEGER,
ADD COLUMN     "mode" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "sessionNo" INTEGER,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "kind" TEXT;

-- AlterTable
ALTER TABLE "recipients" ADD COLUMN     "addressDetail" TEXT,
ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "guardianName" TEXT,
ADD COLUMN     "guardianPhone" TEXT,
ADD COLUMN     "livingAlone" BOOLEAN;

-- CreateTable
CREATE TABLE "care_log_sections" (
    "id" TEXT NOT NULL,
    "careLogId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "care_log_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_assessments" (
    "id" TEXT NOT NULL,
    "careLogId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "workerGrade" TEXT,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "conflictResolved" BOOLEAN NOT NULL DEFAULT false,
    "rationale" TEXT NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_evidence" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "signal" TEXT NOT NULL,
    "span" TEXT,
    "grade" TEXT NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "risk_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_queue" (
    "id" TEXT NOT NULL,
    "assessmentId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "grade" TEXT NOT NULL,
    "raisedAt" TIMESTAMP(3) NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedById" TEXT,
    "ackNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "risk_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "status" TEXT NOT NULL DEFAULT 'scheduled',
    "recipientId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "careLogId" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "voiceConsent" BOOLEAN NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedById" TEXT NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "documentUrl" TEXT,
    "note" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "payload" JSONB,
    "ip" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "care_log_sections_careLogId_idx" ON "care_log_sections"("careLogId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_assessments_careLogId_key" ON "risk_assessments"("careLogId");

-- CreateIndex
CREATE INDEX "risk_evidence_assessmentId_idx" ON "risk_evidence"("assessmentId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_queue_assessmentId_key" ON "risk_queue"("assessmentId");

-- CreateIndex
CREATE INDEX "risk_queue_ownerId_acknowledgedAt_dueAt_idx" ON "risk_queue"("ownerId", "acknowledgedAt", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "tasks_careLogId_key" ON "tasks"("careLogId");

-- CreateIndex
CREATE INDEX "tasks_managerId_startAt_idx" ON "tasks"("managerId", "startAt");

-- CreateIndex
CREATE INDEX "tasks_ownerId_startAt_idx" ON "tasks"("ownerId", "startAt");

-- CreateIndex
CREATE INDEX "consents_recipientId_idx" ON "consents"("recipientId");

-- CreateIndex
CREATE INDEX "consents_ownerId_idx" ON "consents"("ownerId");

-- CreateIndex
CREATE INDEX "audit_logs_ownerId_createdAt_idx" ON "audit_logs"("ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "care_logs_recipientId_visitDate_idx" ON "care_logs"("recipientId", "visitDate" DESC);

-- CreateIndex
CREATE INDEX "care_logs_ownerId_status_idx" ON "care_logs"("ownerId", "status");

-- AddForeignKey
ALTER TABLE "care_log_sections" ADD CONSTRAINT "care_log_sections_careLogId_fkey" FOREIGN KEY ("careLogId") REFERENCES "care_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_assessments" ADD CONSTRAINT "risk_assessments_careLogId_fkey" FOREIGN KEY ("careLogId") REFERENCES "care_logs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_evidence" ADD CONSTRAINT "risk_evidence_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_queue" ADD CONSTRAINT "risk_queue_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "risk_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_queue" ADD CONSTRAINT "risk_queue_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_careLogId_fkey" FOREIGN KEY ("careLogId") REFERENCES "care_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

