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
const { PrismaStatisticsRepo } = require('./statisticsRepo');
const { PrismaSettingsRepo } = require('./settingsRepo');
const { PrismaUserRepo } = require('./userRepo');
const { PrismaTaskRepo } = require('./taskRepo');
const { PrismaConsentRepo } = require('./consentRepo');
const { PrismaRiskRepo } = require('./riskRepo');
const { PrismaAuditRepo } = require('./auditRepo');

module.exports = {
  PrismaDashboardRepo,
  PrismaCareLogRepo,
  PrismaManagerRepo,
  PrismaRecipientRepo,
  PrismaVisitRepo,
  PrismaMemoRepo,
  PrismaPolicyRepo,
  PrismaStatisticsRepo,
  PrismaSettingsRepo,
  PrismaUserRepo,
  PrismaTaskRepo,
  PrismaConsentRepo,
  PrismaRiskRepo,
  PrismaAuditRepo,
};
