-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "centers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "centers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dongs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "dongs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "managers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3),
    "centerId" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "monthlyVisits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "manager_dongs" (
    "managerId" TEXT NOT NULL,
    "dongId" TEXT NOT NULL,

    CONSTRAINT "manager_dongs_pkey" PRIMARY KEY ("managerId","dongId")
);

-- CreateTable
CREATE TABLE "recipients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'normal',
    "address" TEXT,
    "dongId" TEXT,
    "phone" TEXT,
    "careStartDate" TIMESTAMP(3),
    "managerId" TEXT,
    "healthInfo" JSONB,
    "emergencyContact" JSONB,
    "visitCount" INTEGER NOT NULL DEFAULT 0,
    "lastVisitDate" TIMESTAMP(3),

    CONSTRAINT "recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_logs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "recipientId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "centerId" TEXT,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "visitType" TEXT DEFAULT 'visit',
    "visitLocation" TEXT,
    "careContent" JSONB,
    "careContentBlocks" JSONB,
    "requiredActions" JSONB,
    "recommendedPolicies" JSONB,
    "notes" TEXT,
    "photos" JSONB,
    "rejectionReason" TEXT,

    CONSTRAINT "care_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "authorRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "careLogId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "visitDate" TIMESTAMP(3) NOT NULL,
    "visitType" TEXT NOT NULL DEFAULT 'visit',
    "summary" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "careLogId" TEXT,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memos" (
    "id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "type" TEXT DEFAULT 'normal',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recipientId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "memos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "summary" TEXT,
    "applicationMethod" TEXT,
    "details" JSONB,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipient_policies" (
    "recipientId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "matchScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recipient_policies_pkey" PRIMARY KEY ("recipientId","policyId")
);

-- CreateTable
CREATE TABLE "dashboard_kpi" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "todayVisits" INTEGER NOT NULL DEFAULT 0,
    "pendingReports" INTEGER NOT NULL DEFAULT 0,
    "approvedCount" INTEGER NOT NULL DEFAULT 0,
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_kpi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "link" TEXT,
    "icon" TEXT DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "centers_name_key" ON "centers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "dongs_name_key" ON "dongs"("name");

-- CreateIndex
CREATE UNIQUE INDEX "visits_careLogId_key" ON "visits"("careLogId");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_kpi_date_key" ON "dashboard_kpi"("date");

-- AddForeignKey
ALTER TABLE "managers" ADD CONSTRAINT "managers_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_dongs" ADD CONSTRAINT "manager_dongs_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "manager_dongs" ADD CONSTRAINT "manager_dongs_dongId_fkey" FOREIGN KEY ("dongId") REFERENCES "dongs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_dongId_fkey" FOREIGN KEY ("dongId") REFERENCES "dongs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipients" ADD CONSTRAINT "recipients_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_logs" ADD CONSTRAINT "care_logs_centerId_fkey" FOREIGN KEY ("centerId") REFERENCES "centers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_careLogId_fkey" FOREIGN KEY ("careLogId") REFERENCES "care_logs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "managers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_careLogId_fkey" FOREIGN KEY ("careLogId") REFERENCES "care_logs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memos" ADD CONSTRAINT "memos_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memos" ADD CONSTRAINT "memos_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_policies" ADD CONSTRAINT "recipient_policies_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipient_policies" ADD CONSTRAINT "recipient_policies_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
