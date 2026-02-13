/**
 * Prisma Adapters – 배럴 Export
 *
 * 모든 Prisma 리포지토리를 한 곳에서 export합니다.
 */

const { PrismaDashboardRepo } = require('./dashboardRepo');
const { PrismaCareLogRepo } = require('./careLogRepo');
const { PrismaManagerRepo } = require('./managerRepo');
const { PrismaRecipientRepo } = require('./recipientRepo');
const { PrismaVisitRepo } = require('./visitRepo');
const { PrismaMemoRepo } = require('./memoRepo');
const { PrismaPolicyRepo } = require('./policyRepo');

module.exports = {
  PrismaDashboardRepo,
  PrismaCareLogRepo,
  PrismaManagerRepo,
  PrismaRecipientRepo,
  PrismaVisitRepo,
  PrismaMemoRepo,
  PrismaPolicyRepo,
};
