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

function createContainer(options = {}) {
  const config = {
    aiBaseUrl: process.env.AI_BASE_URL || 'http://127.0.0.1:5000',
    defaultTenant: process.env.DEFAULT_TENANT || 'safe-hi',
    aiTimeoutMs: Number(process.env.AI_TIMEOUT_MS || 120000),
    ...options.config,
  };

  const aiClient = new FlaskAiClient({
    baseUrl: config.aiBaseUrl,
    timeoutMs: config.aiTimeoutMs,
  });

  function repos(req) {
    const tenant = resolveTenantFromReq(req, config.defaultTenant);

    // 확장 포인트: tenant별 구현체 매핑
    switch (tenant) {
      case 'yangchun':
      default:
        return {
          tenant,
          sttRepo: new MysqlYangChunSttRepository({ pool }),
          visitCategoryRepo: new MysqlVisitCategoryRepository({ pool }),
          welfarePolicyRepo: new MysqlWelfarePolicyRepository({ pool }),
        };
    }
  }

  return {
    config,
    repos,
    aiClient,
    usecases: {
      ensureSummary: new EnsureSummaryUsecase({ aiClient }),
      ensurePolicyRecommendations: new EnsurePolicyRecommendationsUsecase({ aiClient }),
    },
  };
}

module.exports = { createContainer };
