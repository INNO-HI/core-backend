// Make Backend Container itself
const pool = require('./DB/funcs/db_connection');

const { resolveTenantFromReq } = require('./tenancy/tenantResolver');

// preferred structure: presentation + usecase + adapters
const { MysqlYangChunSttRepository } = require('./adapters/mysql/yangchunSttRepository');
const { MysqlVisitCategoryRepository } = require('./adapters/mysql/visitCategoryRepository');
const { MysqlWelfarePolicyRepository } = require('./adapters/mysql/welfarePolicyRepository');

const { FlaskAiClient } = require('./adapters/ai/flaskAiClient');

// usecases
const { EnsureSummaryUsecase } = require('./usecases/ensureSummaryUsecase');
const { EnsurePolicyRecommendationsUsecase } = require('./usecases/ensurePolicyRecommendationsUsecase');

// dashboard 서비스 (인증 로직)
const { DashboardService } = require('./services/dashboardService');

// Prisma (PostgreSQL) 리포지토리 어댑터
const { prisma } = require('./lib/prisma');
const {
  PrismaDashboardRepo,
  PrismaCareLogRepo,
  PrismaManagerRepo,
  PrismaRecipientRepo,
  PrismaVisitRepo,
  PrismaMemoRepo,
  PrismaPolicyRepo,
} = require('./adapters/prisma');

function createContainer(options = {}) {
  // AI URL 구성 (환경변수 우선, 없으면 기본값)
  const aiHost = process.env.AI_HOST || '127.0.0.1';
  const aiPort = process.env.AI_PORT || '5000';
  const defaultAiBaseUrl = `http://${aiHost}:${aiPort}`;

  const config = {
    aiBaseUrl: process.env.AI_BASE_URL || defaultAiBaseUrl,
    defaultTenant: process.env.DEFAULT_TENANT || 'safe-hi',
    aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000),
    ...options.config,
  };

  const aiClient = new FlaskAiClient({
    baseUrl: config.aiBaseUrl,
    timeoutMs: config.aiTimeoutMs,
  });

  // PostgreSQL (Prisma) 리포지토리 – DB 연동 완료
  const dashboardRepo = new PrismaDashboardRepo({ prisma });
  const careLogRepo = new PrismaCareLogRepo({ prisma });
  const managerRepo = new PrismaManagerRepo({ prisma });
  const recipientRepo = new PrismaRecipientRepo({ prisma });
  const visitRepo = new PrismaVisitRepo({ prisma });
  const memoRepo = new PrismaMemoRepo({ prisma });
  const policyRepo = new PrismaPolicyRepo({ prisma });

  const dashboardService = new DashboardService();

  // MySQL repos — singleton (같은 pool 공유)
  const sttRepo = new MysqlYangChunSttRepository({ pool });
  const visitCategoryRepo = new MysqlVisitCategoryRepository({ pool });
  const welfarePolicyRepo = new MysqlWelfarePolicyRepository({ pool });

  function repos(req) {
    const tenant = resolveTenantFromReq(req, config.defaultTenant);

    return {
      tenant,
      sttRepo,
      visitCategoryRepo,
      welfarePolicyRepo,
      // dashboard (PostgreSQL via Prisma)
      dashboardRepo,
      careLogRepo,
      managerRepo,
      recipientRepo,
      visitRepo,
      memoRepo,
      policyRepo,
    };
  }

  return {
    config,
    repos,
    aiClient,
    dashboardService,
    usecases: {
      ensureSummary: new EnsureSummaryUsecase({ aiClient }),
      ensurePolicyRecommendations: new EnsurePolicyRecommendationsUsecase({ aiClient }),
    },
  };
}

module.exports = { createContainer };
