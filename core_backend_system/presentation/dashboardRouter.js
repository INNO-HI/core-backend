/**
 * Dashboard REST API Router
 *
 * 인증/회원가입 라우트는 공개, 그 외 모든 dashboard 데이터 라우트는
 * requireAuth 미들웨어로 보호된다. req.user.id 를 ownerId 로 사용해
 * 모든 데이터를 계정 단위로 격리한다.
 */

const express = require('express');
const { requireAuth } = require('./authMiddleware');

function createDashboardRouter(container) {
  const router = express.Router();

  // ============================================================
  // 인증 (Auth) — 공개 엔드포인트
  // ============================================================

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

  router.post('/auth/logout', async (_req, res) => {
    return res.json({ ok: true });
  });

  router.post('/auth/forgot-password', async (req, res, next) => {
    try {
      await container.dashboardService.forgotPassword(req.body);
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

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

  router.post('/auth/organization-verify', async (req, res, next) => {
    try {
      const result = await container.dashboardService.requestOrganizationVerification(req.body);
      return res.json({ ok: true, data: result.data });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/auth/account', requireAuth, async (req, res, next) => {
    try {
      const { reason } = req.body || {};
      await container.dashboardService.deleteAccount({ userId: req.user.id, reason });
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/delete-account', requireAuth, async (req, res, next) => {
    try {
      const { reason } = req.body || {};
      await container.dashboardService.deleteAccount({ userId: req.user.id, reason });
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 이 아래는 모두 인증 필요 — req.user.id 를 ownerId 로 사용
  // ============================================================
  router.use(requireAuth);

  // ============================================================
  // 대시보드 KPI
  // ============================================================

  router.get('/kpi', async (req, res, next) => {
    try {
      const { dashboardRepo, ownerId } = container.repos(req);
      const data = await dashboardRepo.getKPI(ownerId);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/recent-reports', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 5;
      const { dashboardRepo, ownerId } = container.repos(req);
      const data = await dashboardRepo.getRecentReports(ownerId, limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/notifications', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 4;
      const { dashboardRepo, ownerId } = container.repos(req);
      const data = await dashboardRepo.getNotifications(ownerId, limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/welfare-news', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const { dashboardRepo, ownerId } = container.repos(req);
      const data = await dashboardRepo.getWelfareNews(ownerId, limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/tasks', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const { dashboardRepo, ownerId } = container.repos(req);
      const data = await dashboardRepo.getTasks(ownerId, limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/notices', async (req, res, next) => {
    try {
      const limit = Number(req.query.limit) || 10;
      const { dashboardRepo, ownerId } = container.repos(req);
      const data = await dashboardRepo.getNotices(ownerId, limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 돌봄 일지 (Care Logs)
  // ============================================================

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

      const { careLogRepo, ownerId } = container.repos(req);
      const data = await careLogRepo.getCareLogs(ownerId, filters, page, pageSize);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/care-logs/:id', async (req, res, next) => {
    try {
      const { careLogRepo, ownerId } = container.repos(req);
      const data = await careLogRepo.getCareLogById(ownerId, req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '돌봄 일지를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

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

      const { careLogRepo, ownerId } = container.repos(req);
      const result = await careLogRepo.updateBulkStatus(ownerId, ids, status);
      return res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

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

      const { careLogRepo, ownerId } = container.repos(req);
      const result = await careLogRepo.updateStatus(ownerId, req.params.id, status, reason);
      return res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  router.post('/care-logs/:id/feedback', async (req, res, next) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'content is required' },
        });
      }

      const { careLogRepo, ownerId } = container.repos(req);
      const result = await careLogRepo.addFeedback(
        ownerId,
        req.params.id,
        content,
        req.user.id,
        req.body.authorRole
      );
      return res.json({ ok: true, data: result });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 매니저 (Managers)
  // ============================================================

  router.get('/managers', async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || 'all',
        search: req.query.search || '',
        dong: req.query.dong || 'all',
        center: req.query.center || 'all',
      };

      const { managerRepo, ownerId } = container.repos(req);
      const data = await managerRepo.getManagers(ownerId, filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/managers/kpi', async (req, res, next) => {
    try {
      const { managerRepo, ownerId } = container.repos(req);
      const data = await managerRepo.getKPIs(ownerId);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/managers/:id', async (req, res, next) => {
    try {
      const { managerRepo, ownerId } = container.repos(req);
      const data = await managerRepo.getManagerById(ownerId, req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '매니저를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/managers/:id/reports', async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || 'all',
        dateStart: req.query.dateStart || null,
        dateEnd: req.query.dateEnd || null,
      };
      const { managerRepo, ownerId } = container.repos(req);
      const data = await managerRepo.getManagerReports(ownerId, req.params.id, filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/managers/:id/visits', async (req, res, next) => {
    try {
      const filters = {
        visitType: req.query.visitType || 'all',
        search: req.query.search || '',
        dateStart: req.query.dateStart || null,
        dateEnd: req.query.dateEnd || null,
      };
      const { managerRepo, ownerId } = container.repos(req);
      const data = await managerRepo.getManagerVisits(ownerId, req.params.id, filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/managers/:id/visits', async (req, res, next) => {
    try {
      const { recipientId, visitDate, visitType, summary } = req.body || {};
      if (!recipientId || !visitDate) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'recipientId and visitDate are required' },
        });
      }

      const { visitRepo, ownerId } = container.repos(req);
      const data = await visitRepo.createVisitForManager(ownerId, req.params.id, {
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

  router.get('/recipients', async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || 'all',
        search: req.query.search || '',
        dong: req.query.dong || 'all',
        manager: req.query.manager || 'all',
      };

      const { recipientRepo, ownerId } = container.repos(req);
      const data = await recipientRepo.getRecipients(ownerId, filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/recipients/kpi', async (req, res, next) => {
    try {
      const { recipientRepo, ownerId } = container.repos(req);
      const data = await recipientRepo.getKPIs(ownerId);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/recipients/:id', async (req, res, next) => {
    try {
      const { recipientRepo, ownerId } = container.repos(req);
      const data = await recipientRepo.getRecipientById(ownerId, req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '대상자를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/recipients/:id/care-logs', async (req, res, next) => {
    try {
      const filters = {
        status: req.query.status || 'all',
        dateStart: req.query.dateStart || null,
        dateEnd: req.query.dateEnd || null,
      };
      const page = Number(req.query.page) || 1;
      const pageSize = Math.min(Number(req.query.pageSize) || 20, 100);

      const { careLogRepo, ownerId } = container.repos(req);
      const data = await careLogRepo.getCareLogsByRecipientId(ownerId, req.params.id, filters, page, pageSize);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 방문 기록 (Visits)
  // ============================================================

  router.get('/recipients/:id/visits', async (req, res, next) => {
    try {
      const filters = {
        dateStart: req.query.dateStart || null,
        dateEnd: req.query.dateEnd || null,
      };

      const { visitRepo, ownerId } = container.repos(req);
      const data = await visitRepo.getVisitsByRecipientId(ownerId, req.params.id, filters);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 메모 (Memos)
  // ============================================================

  router.get('/recipients/:id/memos', async (req, res, next) => {
    try {
      const { memoRepo, ownerId } = container.repos(req);
      const data = await memoRepo.getMemosByRecipientId(ownerId, req.params.id);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/recipients/:id/memos', async (req, res, next) => {
    try {
      const { content } = req.body;
      if (!content) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'content is required' },
        });
      }

      const { memoRepo, ownerId } = container.repos(req);
      const data = await memoRepo.addMemo(ownerId, req.params.id, content, req.user.id);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // AI 정책 추천 (Policies)
  // ============================================================

  router.get('/recipients/:id/policies', async (req, res, next) => {
    try {
      const { policyRepo, ownerId } = container.repos(req);
      const data = await policyRepo.getPoliciesForRecipient(ownerId, req.params.id);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/recipients/:id/policies/refresh', async (req, res, next) => {
    try {
      const { policyRepo, ownerId } = container.repos(req);
      const data = await policyRepo.refreshPolicies(ownerId, req.params.id);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createDashboardRouter };
