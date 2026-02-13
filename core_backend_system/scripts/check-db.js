require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const counts = {};
  counts.users = await p.user.count();
  counts.centers = await p.center.count();
  counts.dongs = await p.dong.count();
  counts.managers = await p.manager.count();
  counts.recipients = await p.recipient.count();
  counts.careLogs = await p.careLog.count();
  counts.visits = await p.visit.count();
  counts.memos = await p.memo.count();
  counts.policies = await p.policy.count();
  counts.feedbacks = await p.feedback.count();
  counts.notifications = await p.notification.count();
  counts.dashboardKPI = await p.dashboardKPI.count();
  counts.recipientPolicies = await p.recipientPolicy.count();
  counts.managerDongs = await p.managerDong.count();
  console.log('=== DB Record Counts ===');
  console.log(JSON.stringify(counts, null, 2));
  await p.$disconnect();
})();
