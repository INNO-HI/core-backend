/**
 * Dashboard REST API Router
 * 프론트엔드(dashboard-web)용 CRUD 엔드포인트
 *
 * 설계 원칙: core_backend_system의 Presentation 레이어
 * - HTTP 검증/응답 포맷만 담당
 * - 비즈니스 로직은 서비스/어댑터에 위임
 */

const express = require('express');
const crypto = require('crypto');
const { prisma } = require('../lib/prisma');

const ADMIN_SYSTEM_PASSWORD = process.env.ADMIN_SYSTEM_PASSWORD || 'safehiadmin';
const PRISMA_STUDIO_SESSION_TTL_MS = 5 * 60 * 1000;
const PRISMA_STUDIO_BASE_URL =
  process.env.PRISMA_STUDIO_BASE_URL || 'https://api.safe-hi.xyz/prisma-studio';
const prismaStudioSessions = new Map();

function isValidSystemPassword(password) {
  return typeof password === 'string' && password.length > 0 && password === ADMIN_SYSTEM_PASSWORD;
}

function readSystemPassword(req) {
  const headerPassword = req.headers['x-admin-system-password'];
  if (Array.isArray(headerPassword)) {
    return headerPassword[0];
  }
  return headerPassword;
}

function prunePrismaStudioSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of prismaStudioSessions.entries()) {
    if (expiresAt <= now) {
      prismaStudioSessions.delete(token);
    }
  }
}

function createPrismaStudioSessionToken() {
  prunePrismaStudioSessions();
  const token = crypto.randomBytes(24).toString('hex');
  prismaStudioSessions.set(token, Date.now() + PRISMA_STUDIO_SESSION_TTL_MS);
  return token;
}

function hasValidPrismaStudioSession(token) {
  if (typeof token !== 'string' || token.length === 0) {
    return false;
  }

  prunePrismaStudioSessions();
  const expiresAt = prismaStudioSessions.get(token);
  if (!expiresAt) {
    return false;
  }

  if (expiresAt <= Date.now()) {
    prismaStudioSessions.delete(token);
    return false;
  }

  return true;
}

function hasBearerAuthorization(req) {
  const authHeader = req.headers['authorization'] || '';
  return typeof authHeader === 'string' && authHeader.startsWith('Bearer ');
}

function createDashboardRouter(container) {
  const router = express.Router();

  // ============================================================
  // 인증 (Auth)
  // ============================================================

  /** POST /dashboard/auth/login */
  router.post('/auth/login', async (req, res, next) => {
    try {
      const { email, password, rememberMe } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'email and password are required' },
        });
      }

      const result = await container.dashboardService.login({ email, password, rememberMe });
      if (!result.success) {
        return res.status(401).json({ ok: false, error: { code: 'AUTH_FAILED', message: result.error } });
      }

      return res.json({ ok: true, data: result.data });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/auth/register */
  router.post('/auth/register', async (req, res, next) => {
    try {
      const result = await container.dashboardService.register(req.body);
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'REGISTER_FAILED', message: result.error } });
      }
      return res.json({ ok: true, data: result.data });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/auth/logout */
  router.post('/auth/logout', async (_req, res) => {
    return res.json({ ok: true });
  });

  /** POST /dashboard/auth/forgot-password */
  router.post('/auth/forgot-password', async (req, res, next) => {
    try {
      await container.dashboardService.forgotPassword(req.body);
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/auth/reset-password */
  router.post('/auth/reset-password', async (req, res, next) => {
    try {
      const result = await container.dashboardService.resetPassword(req.body);
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'RESET_FAILED', message: result.error } });
      }
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/auth/send-verification */
  router.post('/auth/send-verification', async (req, res, next) => {
    try {
      const result = await container.dashboardService.sendEmailVerification(req.body.email);
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'VERIFY_FAILED', message: result.error } });
      }
      return res.json({ ok: true, data: result.data });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/auth/verify-code */
  router.post('/auth/verify-code', async (req, res, next) => {
    try {
      const result = await container.dashboardService.verifyEmailCode(req.body.email, req.body.code);
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'VERIFY_FAILED', message: result.error } });
      }
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/auth/organization-verify */
  router.post('/auth/organization-verify', async (req, res, next) => {
    try {
      const result = await container.dashboardService.requestOrganizationVerification(req.body);
      return res.json({ ok: true, data: result.data });
    } catch (err) {
      next(err);
    }
  });

  /** DELETE /dashboard/auth/account */
  router.delete('/auth/account', async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'] || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } });
      }
      const { reason } = req.body || {};
      await container.dashboardService.deleteAccount({ userId: null, reason });
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/auth/delete-account (Flutter 폴백 엔드포인트) */
  router.post('/auth/delete-account', async (req, res, next) => {
    try {
      const authHeader = req.headers['authorization'] || '';
      if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ ok: false, error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' } });
      }
      const { reason } = req.body || {};
      await container.dashboardService.deleteAccount({ userId: null, reason });
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 대시보드 KPI
  // ============================================================

  /** GET /dashboard/kpi */
  router.get('/kpi', async (req, res, next) => {
    try {
      const { dashboardRepo } = container.repos(req);
      const data = await dashboardRepo.getKPI();
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/system/prisma-studio/session */
  router.post('/system/prisma-studio/session', async (req, res) => {
    if (!hasBearerAuthorization(req)) {
      return res.status(401).json({
        ok: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '인증이 필요합니다.',
        },
      });
    }

    const token = createPrismaStudioSessionToken();

    return res.json({
      ok: true,
      data: {
        launchUrl: `${PRISMA_STUDIO_BASE_URL}/launch?token=${token}`,
        expiresInSec: PRISMA_STUDIO_SESSION_TTL_MS / 1000,
      },
    });
  });

  /** POST /dashboard/system/postgres-access/verify */
  router.post('/system/postgres-access/verify', async (req, res) => {
    const { password } = req.body || {};

    if (!isValidSystemPassword(password)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: '관리자 비밀번호가 올바르지 않습니다.',
        },
      });
    }

    return res.json({ ok: true, data: { verified: true } });
  });

  /** GET /dashboard/system/postgres-status */
  router.get('/system/postgres-status', async (req, res) => {
    const password = readSystemPassword(req);
    if (!isValidSystemPassword(password)) {
      return res.status(403).json({
        ok: false,
        error: {
          code: 'FORBIDDEN',
          message: '관리자 비밀번호가 필요합니다.',
        },
      });
    }

    const checkedAt = new Date().toISOString();

    if (process.env.USE_INMEMORY === 'true') {
      return res.json({
        ok: true,
        data: {
          provider: 'postgresql',
          mode: 'inmemory',
          status: 'inmemory',
          database: null,
          version: null,
          latencyMs: 0,
          sizeBytes: null,
          sizePretty: null,
          tableCount: 0,
          activeConnections: 0,
          idleConnections: 0,
          maxConnections: null,
          checkedAt,
          message: 'USE_INMEMORY=true 상태라 PostgreSQL 대신 InMemory 저장소를 사용 중입니다.',
        },
      });
    }

    try {
      const startedAt = Date.now();
      const [stats] = await prisma.$queryRawUnsafe(`
        SELECT
          current_database() AS database,
          version() AS version,
          pg_database_size(current_database())::bigint AS size_bytes,
          pg_size_pretty(pg_database_size(current_database())) AS size_pretty,
          current_setting('max_connections')::int AS max_connections,
          (
            SELECT COUNT(*)::int
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type = 'BASE TABLE'
          ) AS table_count,
          (
            SELECT COUNT(*)::int
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND state = 'active'
          ) AS active_connections,
          (
            SELECT COUNT(*)::int
            FROM pg_stat_activity
            WHERE datname = current_database()
              AND state = 'idle'
          ) AS idle_connections
      `);

      return res.json({
        ok: true,
        data: {
          provider: 'postgresql',
          mode: 'postgres',
          status: 'connected',
          database: stats.database,
          version: stats.version,
          latencyMs: Date.now() - startedAt,
          sizeBytes: Number(stats.size_bytes),
          sizePretty: stats.size_pretty,
          tableCount: Number(stats.table_count),
          activeConnections: Number(stats.active_connections),
          idleConnections: Number(stats.idle_connections),
          maxConnections: Number(stats.max_connections),
          checkedAt,
          message: 'PostgreSQL 연결이 정상입니다.',
        },
      });
    } catch (err) {
      return res.status(503).json({
        ok: false,
        error: {
          code: 'POSTGRES_UNAVAILABLE',
          message: err?.message || 'PostgreSQL 상태를 확인할 수 없습니다.',
        },
      });
    }
  });

  /** GET /dashboard/recent-reports?limit=5 */
  router.get('/recent-reports', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 5;
      const { dashboardRepo } = container.repos(req);
      const data = await dashboardRepo.getRecentReports(limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/notifications?limit=4 */
  router.get('/notifications', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 4;
      const { dashboardRepo } = container.repos(req);
      const data = await dashboardRepo.getNotifications(limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/welfare-news?limit=10 */
  router.get('/welfare-news', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const { dashboardRepo } = container.repos(req);
      const data = await dashboardRepo.getWelfareNews(limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/tasks?limit=10 */
  router.get('/tasks', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const { dashboardRepo } = container.repos(req);
      const data = await dashboardRepo.getTasks(limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/notices?limit=10 */
  router.get('/notices', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const { dashboardRepo } = container.repos(req);
      const data = await dashboardRepo.getNotices(limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 돌봄 일지 (Care Logs)
  // ============================================================

  /** GET /dashboard/care-logs?status=all&search=&page=1&pageSize=10 */
  router.get('/care-logs', async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || 'all',
        search: req.query.search || '',
        dateStart: req.query.dateStart || null,
        dateEnd: req.query.dateEnd || null,
        dong: req.query.dong || 'all',
      };
      const page = Number(req.query.page) || 1;
      const pageSize = Math.min(Number(req.query.pageSize) || 10, 100);

      const { careLogRepo } = container.repos(req);
      const data = await careLogRepo.getCareLogs(filters, page, pageSize);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/care-logs/:id */
  router.get('/care-logs/:id', async (req, res, next) => {
    try {
      const { careLogRepo } = container.repos(req);
      const data = await careLogRepo.getCareLogById(req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '돌봄 일지를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** PATCH /dashboard/care-logs/bulk-status */
  router.patch('/care-logs/bulk-status', async (req, res, next) => {
    try {
      const { ids, status } = req.body;
      const validStatuses = ['pending', 'urgent', 'approved', 'rejected'];
      if (!Array.isArray(ids) || !status) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'ids(array) and status are required' },
        });
      }
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: `status must be one of: ${validStatuses.join(', ')}` },
        });
      }

      const { careLogRepo } = container.repos(req);
      const result = await careLogRepo.updateBulkStatus(ids, status);
      return res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  /** PATCH /dashboard/care-logs/:id/status */
  router.patch('/care-logs/:id/status', async (req, res, next) => {
    try {
      const { status, reason } = req.body;
      const validStatuses = ['pending', 'urgent', 'approved', 'rejected'];
      if (!status) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'status is required' },
        });
      }
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: `status must be one of: ${validStatuses.join(', ')}` },
        });
      }

      const { careLogRepo } = container.repos(req);
      const result = await careLogRepo.updateStatus(req.params.id, status, reason);
      return res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/care-logs/:id/feedback */
  router.post('/care-logs/:id/feedback', async (req, res, next) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'content is required' },
        });
      }

      const { careLogRepo } = container.repos(req);
      const result = await careLogRepo.addFeedback(req.params.id, content);
      return res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 매니저 (Managers)
  // ============================================================

  /** GET /dashboard/managers?status=all&search=&dong=all&center=all */
  router.get('/managers', async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || 'all',
        search: req.query.search || '',
        dong: req.query.dong || 'all',
        center: req.query.center || 'all',
      };

      const { managerRepo } = container.repos(req);
      const data = await managerRepo.getManagers(filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/managers/kpi */
  router.get('/managers/kpi', async (req, res, next) => {
    try {
      const { managerRepo } = container.repos(req);
      const data = await managerRepo.getKPIs();
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/managers/:id */
  router.get('/managers/:id', async (req, res, next) => {
    try {
      const { managerRepo } = container.repos(req);
      const data = await managerRepo.getManagerById(req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '매니저를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/managers/:id/reports?status=all&dateStart=&dateEnd= */
  router.get('/managers/:id/reports', async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || 'all',
        dateStart: req.query.dateStart || null,
        dateEnd: req.query.dateEnd || null,
      };
      const { managerRepo } = container.repos(req);
      const data = await managerRepo.getManagerReports(req.params.id, filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/managers/:id/visits?visitType=all&search=&dateStart=&dateEnd= */
  router.get('/managers/:id/visits', async (req, res, next) => {
    try {
      const filters = {
        visitType: req.query.visitType || 'all',
        search: req.query.search || '',
        dateStart: req.query.dateStart || null,
        dateEnd: req.query.dateEnd || null,
      };
      const { managerRepo } = container.repos(req);
      const data = await managerRepo.getManagerVisits(req.params.id, filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/managers/:id/visits */
  router.post('/managers/:id/visits', async (req, res, next) => {
    try {
      const { recipientId, visitDate, visitType, summary } = req.body || {};
      if (!recipientId || !visitDate) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'recipientId and visitDate are required' },
        });
      }

      const { visitRepo } = container.repos(req);
      const data = await visitRepo.createVisitForManager(req.params.id, {
        recipientId,
        visitDate,
        visitType,
        summary,
      });
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 대상자 (Recipients)
  // ============================================================

  /** GET /dashboard/recipients?status=all&search=&dong=all&manager=all */
  router.get('/recipients', async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || 'all',
        search: req.query.search || '',
        dong: req.query.dong || 'all',
        manager: req.query.manager || 'all',
      };

      const { recipientRepo } = container.repos(req);
      const data = await recipientRepo.getRecipients(filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/recipients/kpi */
  router.get('/recipients/kpi', async (req, res, next) => {
    try {
      const { recipientRepo } = container.repos(req);
      const data = await recipientRepo.getKPIs();
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/recipients/:id */
  router.get('/recipients/:id', async (req, res, next) => {
    try {
      const { recipientRepo } = container.repos(req);
      const data = await recipientRepo.getRecipientById(req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '대상자를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** GET /dashboard/recipients/:id/care-logs?status=all&page=1&pageSize=20&dateStart=&dateEnd= */
  router.get('/recipients/:id/care-logs', async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || 'all',
        dateStart: req.query.dateStart || null,
        dateEnd: req.query.dateEnd || null,
      };
      const page = Number(req.query.page) || 1;
      const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);

      const { careLogRepo } = container.repos(req);
      const data = await careLogRepo.getCareLogsByRecipientId(req.params.id, filters, page, pageSize);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 방문 기록 (Visits)
  // ============================================================

  /** GET /dashboard/recipients/:id/visits?dateStart=&dateEnd= */
  router.get('/recipients/:id/visits', async (req, res, next) => {
    try {
      const filters = {
        dateStart: req.query.dateStart || null,
        dateEnd: req.query.dateEnd || null,
      };

      const { visitRepo } = container.repos(req);
      const data = await visitRepo.getVisitsByRecipientId(req.params.id, filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 메모 (Memos)
  // ============================================================

  /** GET /dashboard/recipients/:id/memos */
  router.get('/recipients/:id/memos', async (req, res, next) => {
    try {
      const { memoRepo } = container.repos(req);
      const data = await memoRepo.getMemosByRecipientId(req.params.id);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/recipients/:id/memos */
  router.post('/recipients/:id/memos', async (req, res, next) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'content is required' },
        });
      }

      const { memoRepo } = container.repos(req);
      const data = await memoRepo.addMemo(req.params.id, content, req.body.authorId, req.body.authorName);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // AI 정책 추천 (Policies)
  // ============================================================

  /** GET /dashboard/recipients/:id/policies */
  router.get('/recipients/:id/policies', async (req, res, next) => {
    try {
      const { policyRepo } = container.repos(req);
      const data = await policyRepo.getPoliciesForRecipient(req.params.id);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  /** POST /dashboard/recipients/:id/policies/refresh */
  router.post('/recipients/:id/policies/refresh', async (req, res, next) => {
    try {
      const { policyRepo } = container.repos(req);
      const data = await policyRepo.refreshPolicies(req.params.id);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = {
  createDashboardRouter,
  hasValidPrismaStudioSession,
};
