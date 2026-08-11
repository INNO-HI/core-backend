/**
 * Dashboard REST API Router
 *
 * 인증/회원가입 라우트는 공개, 그 외 모든 dashboard 데이터 라우트는
 * requireAuth 미들웨어로 보호된다. req.user.id 를 ownerId 로 사용해
 * 모든 데이터를 계정 단위로 격리한다.
 */

const express = require('express');
const { requireAuth, requireAdmin, requireCapability } = require('./authMiddleware');

// ── 앱 요청 모양 정규화 (BACKEND_REQUEST §11 — 서버가 양쪽 모양을 수용한다) ──

const GRADE_ALIASES = {
  긴급: 'urgent',
  경보: 'alert',
  주의: 'caution',
  관찰: 'observe',
  emergency: 'urgent',
  urgent: 'urgent',
  alert: 'alert',
  caution: 'caution',
  observe: 'observe',
};

function normalizeGrade(value) {
  return GRADE_ALIASES[String(value || '').trim()] || null;
}

/**
 * 앱 평면 모양(top-level grade·signals·evidence, sections.bullets, 한국어 등급)을
 * 내부 모양(risk 객체, sections.body, 영문 등급)으로 변환한다.
 * 대시보드가 쓰는 내부 모양은 그대로 통과한다.
 */
function normalizeCareLogPayload(body) {
  const p = { ...(body || {}) };

  if (Array.isArray(p.sections)) {
    p.sections = p.sections.map((s, i) => ({
      kind: s.kind,
      title: s.title,
      body: Array.isArray(s.body) ? s.body : Array.isArray(s.bullets) ? s.bullets : [],
      sortOrder: s.sortOrder ?? i,
    }));
  }

  if (!p.risk && (p.grade || p.signals || p.evidence)) {
    const grade = normalizeGrade(p.grade);
    if (grade) {
      const signals = Array.isArray(p.signals) ? p.signals : [];
      const evidence = (Array.isArray(p.evidence) ? p.evidence : []).map((e) => ({
        signal: e.signal,
        span: e.span ?? null,
        grade: normalizeGrade(e.grade) || grade,
        source: e.source === 'worker_tag' ? 'worker_tag' : 'transcript',
      }));
      p.risk = {
        grade,
        workerGrade: normalizeGrade(p.workerGrade),
        escalated: Boolean(p.escalated),
        conflictResolved: false,
        rationale:
          p.rationale ||
          (signals.length ? `${signals.join(', ')} 신호가 확인되었습니다.` : '앱에서 확인된 판정'),
        engineVersion: p.engineVersion || 'app-v1',
        evidence: evidence.length
          ? evidence
          : signals.map((s) => ({ signal: s, span: null, grade, source: 'worker_tag' })),
      };
    }
    delete p.grade;
    delete p.signals;
    delete p.evidence;
    delete p.workerGrade;
    delete p.rationale;
    delete p.engineVersion;
    delete p.escalated;
  } else if (p.risk && p.risk.grade) {
    const grade = normalizeGrade(p.risk.grade) || p.risk.grade;
    p.risk = {
      ...p.risk,
      grade,
      workerGrade: normalizeGrade(p.risk.workerGrade) || p.risk.workerGrade || null,
      evidence: Array.isArray(p.risk.evidence)
        ? p.risk.evidence.map((e) => ({ ...e, grade: normalizeGrade(e.grade) || grade }))
        : [],
    };
  }

  delete p.confirmedBy; // 확인자는 토큰 사용자 — 몸통 값을 믿지 않는다
  return p;
}

// ── 대상자 필드 엄격 검증 (BACKEND_REQUEST §1 — 받지 않는 필드는 400) ──

const RECIPIENT_FIELDS = new Set([
  'name', 'age', 'gender', 'status', 'dong', 'managerId', 'managerName', 'manager',
  'phone', 'address', 'careStartDate', 'healthInfo', 'emergencyContact',
  'birthDate', 'livingAlone', 'guardianName', 'guardianPhone', 'addressDetail',
]);

function unknownRecipientFields(body) {
  return Object.keys(body || {}).filter((k) => !RECIPIENT_FIELDS.has(k));
}

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

  // 소식함 발송 (BACKEND_DB_SPEC.md §4.4) — 상태 변화 / 복지 소식 / 공지사항
  router.post('/notifications', async (req, res, next) => {
    try {
      const { title, content, kind, isUrgent, link, icon } = req.body || {};
      if (!title || !content) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: '제목과 내용은 필수입니다.' },
        });
      }

      const { dashboardRepo, ownerId } = container.repos(req);
      const data = await dashboardRepo.createNotification(ownerId, {
        kind,
        title: String(title).trim(),
        content: String(content).trim(),
        isUrgent,
        link,
        icon,
      });
      return res.status(201).json({ ok: true, data });
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

  // 일정 (BACKEND_DB_SPEC.md §3.3, §7 1단계)
  // ?date=YYYY-MM-DD 또는 ?assigneeId= 가 오면 실제 tasks 테이블에서
  // type·startAt·durationMin·status 를 내려준다 (앱의 홀짝 추측 제거).
  // 파라미터 없이 부르면 기존 대시보드 홈 위젯용 응답을 유지한다.
  router.get('/tasks', async (req, res, next) => {
    try {
      const { date, assigneeId, recipientId, status } = req.query;
      const { dashboardRepo, taskRepo, ownerId } = container.repos(req);

      if (date || assigneeId || recipientId) {
        const data = await taskRepo.listTasks(ownerId, { date, assigneeId, recipientId, status });
        return res.json({ ok: true, data });
      }

      const limit = Number(req.query.limit) || 10;
      const data = await dashboardRepo.getTasks(ownerId, limit);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // 일정 배포 (대시보드) — tasks 는 대시보드가 만들고 앱은 읽는다
  router.post('/tasks', requireCapability('manager:assign'), async (req, res, next) => {
    try {
      const { recipientId, startAt } = req.body || {};
      if (!recipientId || !startAt) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'recipientId와 startAt은 필수입니다.' },
        });
      }
      const { taskRepo, ownerId } = container.repos(req);
      const data = await taskRepo.createTask(ownerId, req.body);
      return res.status(201).json({ ok: true, data });
    } catch (err) {
      if (err && /찾을 수 없|배정|지정되지/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  router.patch('/tasks/:id', async (req, res, next) => {
    try {
      const { status } = req.body || {};
      if (status && !['scheduled', 'done', 'canceled'].includes(status)) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'status는 scheduled, done, canceled 중 하나여야 합니다.' },
        });
      }
      const { taskRepo, ownerId } = container.repos(req);
      const data = await taskRepo.updateTask(ownerId, req.params.id, req.body || {});
      return res.json({ ok: true, data });
    } catch (err) {
      if (err && /찾을 수 없/.test(err.message || '')) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: err.message } });
      }
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

  // 공지 상세 (BACKEND_REQUEST §4)
  router.get('/notices/:id', async (req, res, next) => {
    try {
      const { dashboardRepo, ownerId } = container.repos(req);
      const data = await dashboardRepo.getNoticeById(ownerId, req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '공지사항을 찾을 수 없습니다' } });
      }
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

  /**
   * 앱 기록 적재 (BACKEND_DB_SPEC.md §7 2단계)
   * care_log + sections + risk_assessment + evidence 를 한 트랜잭션으로 넣고,
   * 경보 이상이면 risk_queue 에 올린다. confirmedBy = 토큰 사용자.
   */
  router.post('/care-logs', requireCapability('careLog:write'), async (req, res, next) => {
    try {
      const payload = normalizeCareLogPayload(req.body);
      const { recipientId, visitedAt } = payload;
      if (!recipientId || !visitedAt) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'recipientId와 visitedAt은 필수입니다.' },
        });
      }

      const { careLogRepo, auditRepo, ownerId } = container.repos(req);
      const data = await careLogRepo.createFromApp(ownerId, payload, req.user.id);

      await auditRepo.log({
        ownerId,
        actorId: req.user.id,
        action: 'care_log.create',
        targetType: 'care_log',
        targetId: data.id,
        payload: { grade: data.riskAssessment?.grade || null },
        ip: req.ip,
      });

      return res.status(201).json({ ok: true, data });
    } catch (err) {
      if (err && /찾을 수 없|배정|형식/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
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

  router.patch('/care-logs/bulk-status', requireCapability('careLog:approve'), async (req, res, next) => {
    try {
      const { ids, status } = req.body;
      // 스펙 검토 흐름: submitted → in_review → approved | rejected (§4.2)
      const validStatuses = ['draft', 'submitted', 'in_review', 'pending', 'urgent', 'approved', 'rejected'];
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

  router.patch('/care-logs/:id/status', requireCapability('careLog:approve'), async (req, res, next) => {
    try {
      const { status, reason } = req.body;
      const validStatuses = ['draft', 'submitted', 'in_review', 'pending', 'urgent', 'approved', 'rejected'];
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

      const { careLogRepo, auditRepo, ownerId } = container.repos(req);
      const result = await careLogRepo.updateStatus(ownerId, req.params.id, status, reason, req.user.id);

      if (status === 'approved' || status === 'rejected') {
        await auditRepo.log({
          ownerId,
          actorId: req.user.id,
          action: status === 'approved' ? 'care_log.approve' : 'care_log.reject',
          targetType: 'care_log',
          targetId: req.params.id,
          payload: reason ? { reason } : undefined,
          ip: req.ip,
        });
      }

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
  // 위기 큐 (Risk Queue) — BACKEND_DB_SPEC.md §3.8, §7 3단계
  // 경보(24h)·긴급(4h)만 들어오며, 사람이 확인 처리를 해야 내려간다.
  // ============================================================

  router.get('/risk-queue', async (req, res, next) => {
    try {
      const { riskRepo, ownerId } = container.repos(req);
      const data = await riskRepo.getQueue(ownerId);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/risk-queue/:id/ack', async (req, res, next) => {
    try {
      const { note } = req.body || {};
      if (!note || String(note).trim().length < 5) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: '처리 사유는 5자 이상 입력해야 합니다.' },
        });
      }

      const { riskRepo, auditRepo, ownerId } = container.repos(req);
      const data = await riskRepo.acknowledge(ownerId, req.params.id, String(note).trim(), req.user.id);

      // 누가, 언제 확인했는지가 감사의 대상이다 (스펙 §1)
      await auditRepo.log({
        ownerId,
        actorId: req.user.id,
        action: 'risk.ack',
        targetType: 'risk_queue',
        targetId: req.params.id,
        payload: { note: String(note).trim() },
        ip: req.ip,
      });

      return res.json({ ok: true, data });
    } catch (err) {
      if (err && /찾을 수 없/.test(err.message || '')) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: err.message } });
      }
      if (err && /이미 확인/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  // ============================================================
  // 심리케어 분석 (Analysis) — 프론트 main 계보 위기 케이스 화면 계약
  // risk_queue·risk_assessments 데이터를 CrisisCase 형태로 서빙한다.
  // ============================================================

  router.get('/analysis/crisis-cases', async (req, res, next) => {
    try {
      const { analysisRepo, ownerId } = container.repos(req);
      const data = await analysisRepo.listCrisisCases(ownerId);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/analysis/crisis-cases/:id', async (req, res, next) => {
    try {
      const { analysisRepo, ownerId } = container.repos(req);
      const data = await analysisRepo.getCrisisCaseDetail(ownerId, req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '위기 케이스를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
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

  router.post('/managers', async (req, res, next) => {
    try {
      const { name } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: '이름은 필수입니다.' } });
      }
      const { managerRepo, ownerId } = container.repos(req);
      const data = await managerRepo.createManager(ownerId, req.body || {});
      return res.status(201).json({ ok: true, data });
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

  router.patch('/managers/:id', async (req, res, next) => {
    try {
      const { managerRepo, ownerId } = container.repos(req);
      const data = await managerRepo.updateManager(ownerId, req.params.id, req.body || {});
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '매니저를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/managers/:id', async (req, res, next) => {
    try {
      const { managerRepo, ownerId } = container.repos(req);
      const result = await managerRepo.deleteManager(ownerId, req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '매니저를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data: { success: true } });
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

  router.post('/recipients', async (req, res, next) => {
    try {
      const { name } = req.body || {};
      if (!name || !String(name).trim()) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: '이름은 필수입니다.' } });
      }
      // §1 — 받지 않는 필드는 200이 아니라 400
      const unknown = unknownRecipientFields(req.body);
      if (unknown.length > 0) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: `지원하지 않는 필드입니다: ${unknown.join(', ')}. 담당자 배정은 managerId를 사용하세요.` },
        });
      }
      const { recipientRepo, ownerId } = container.repos(req);
      const data = await recipientRepo.createRecipient(ownerId, req.body || {});
      return res.status(201).json({ ok: true, data });
    } catch (err) {
      if (err && /찾을 수 없/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
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

  // 배정 필드가 오면 manager:assign 능력을 요구한다 (일반 정보 수정은 통과)
  const assignGuard = requireCapability('manager:assign');
  router.patch(
    '/recipients/:id',
    (req, res, next) => {
      const body = req.body || {};
      const touchesAssignment = 'managerId' in body || 'managerName' in body || 'manager' in body;
      if (touchesAssignment) return assignGuard(req, res, next);
      return next();
    },
    async (req, res, next) => {
      try {
        // §1 — 받지 않는 필드는 200이 아니라 400
        const unknown = unknownRecipientFields(req.body);
        if (unknown.length > 0) {
          return res.status(400).json({
            ok: false,
            error: { code: 'BAD_REQUEST', message: `지원하지 않는 필드입니다: ${unknown.join(', ')}. 담당자 배정은 managerId를 사용하세요.` },
          });
        }
        const { recipientRepo, ownerId } = container.repos(req);
        const data = await recipientRepo.updateRecipient(ownerId, req.params.id, req.body || {});
        if (!data) {
          return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '대상자를 찾을 수 없습니다' } });
        }
        return res.json({ ok: true, data });
      } catch (err) {
        if (err && /찾을 수 없/.test(err.message || '')) {
          return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
        }
        next(err);
      }
    }
  );

  router.delete('/recipients/:id', async (req, res, next) => {
    try {
      const { recipientRepo, ownerId } = container.repos(req);
      const result = await recipientRepo.deleteRecipient(ownerId, req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '대상자를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data: { success: true } });
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
      const data = await memoRepo.addMemo(ownerId, req.params.id, content, req.user.id, req.body.type);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/recipients/:id/memos/:memoId', async (req, res, next) => {
    try {
      const { content, type } = req.body || {};
      const { memoRepo, ownerId } = container.repos(req);
      const data = await memoRepo.updateMemo(ownerId, req.params.memoId, { content, type });
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '메모를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/recipients/:id/memos/:memoId', async (req, res, next) => {
    try {
      const { memoRepo, ownerId } = container.repos(req);
      const result = await memoRepo.deleteMemo(ownerId, req.params.memoId);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '메모를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 음성 수집 동의 (Consents) — BACKEND_DB_SPEC.md §3.2, §4.3
  // 동의를 받는 주체는 기관이다. 앱이 동의 값을 만들 수 있는 경로는 없다.
  // 이력은 덮어쓰지 않고 쌓는다.
  // ============================================================

  router.get('/recipients/:id/consents', async (req, res, next) => {
    try {
      const { consentRepo, ownerId } = container.repos(req);
      const data = await consentRepo.listConsents(ownerId, req.params.id);
      return res.json({ ok: true, data });
    } catch (err) {
      if (err && /찾을 수 없/.test(err.message || '')) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: err.message } });
      }
      next(err);
    }
  });

  router.post('/recipients/:id/consents', async (req, res, next) => {
    try {
      const { consentRepo, auditRepo, ownerId } = container.repos(req);
      const data = await consentRepo.grantConsent(ownerId, req.params.id, req.body || {}, req.user.id);

      await auditRepo.log({
        ownerId,
        actorId: req.user.id,
        action: 'consent.grant',
        targetType: 'consent',
        targetId: data.id,
        payload: { recipientId: req.params.id, voiceConsent: data.voiceConsent },
        ip: req.ip,
      });

      return res.status(201).json({ ok: true, data });
    } catch (err) {
      if (err && /찾을 수 없/.test(err.message || '')) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: err.message } });
      }
      next(err);
    }
  });

  router.post('/recipients/:id/consents/:consentId/revoke', async (req, res, next) => {
    try {
      const { consentRepo, auditRepo, ownerId } = container.repos(req);
      const data = await consentRepo.revokeConsent(
        ownerId,
        req.params.id,
        req.params.consentId,
        (req.body || {}).note
      );

      await auditRepo.log({
        ownerId,
        actorId: req.user.id,
        action: 'consent.revoke',
        targetType: 'consent',
        targetId: req.params.consentId,
        payload: { recipientId: req.params.id },
        ip: req.ip,
      });

      return res.json({ ok: true, data });
    } catch (err) {
      if (err && /찾을 수 없/.test(err.message || '')) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: err.message } });
      }
      if (err && /이미 철회/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
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

  // ============================================================
  // 통계/리포트 (Statistics)
  // ============================================================

  router.get('/statistics/overview', async (req, res, next) => {
    try {
      const { statisticsRepo, ownerId } = container.repos(req);
      const data = await statisticsRepo.getOverview(ownerId, req.query.month);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/statistics/visit-trend', async (req, res, next) => {
    try {
      const period = Number(req.query.period) === 12 ? 12 : 6;
      const { statisticsRepo, ownerId } = container.repos(req);
      const data = await statisticsRepo.getVisitTrend(ownerId, period);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 설정 (Settings)
  // ============================================================

  router.get('/settings', async (req, res, next) => {
    try {
      const { settingsRepo, ownerId } = container.repos(req);
      const data = await settingsRepo.getSettings(ownerId);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/settings/profile', async (req, res, next) => {
    try {
      const { settingsRepo, ownerId } = container.repos(req);
      const data = await settingsRepo.updateProfile(ownerId, req.body || {});
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/settings/password', async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body || {};
      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'currentPassword and newPassword are required' },
        });
      }

      const { settingsRepo, ownerId } = container.repos(req);
      const result = await settingsRepo.changePassword(ownerId, { currentPassword, newPassword });
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'PASSWORD_CHANGE_FAILED', message: result.error } });
      }
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 필터 옵션 (동/센터/매니저 — 실 데이터)
  // ============================================================

  router.get('/filter-options', async (req, res, next) => {
    try {
      const { dashboardRepo, ownerId } = container.repos(req);
      const data = await dashboardRepo.getFilterOptions(ownerId);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 계정 관리 (Accounts) — 관리자(admin) 전용
  // ============================================================

  router.get('/accounts', requireAdmin, async (req, res, next) => {
    try {
      const { userRepo } = container.repos(req);
      const data = await userRepo.listUsers();
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/accounts', requireAdmin, async (req, res, next) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: '이메일과 비밀번호는 필수입니다.' },
        });
      }
      const { userRepo } = container.repos(req);
      const data = await userRepo.createUser(req.body || {});
      return res.status(201).json({ ok: true, data });
    } catch (err) {
      if (err && /이미 사용|필수|8자/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  router.patch('/accounts/:id', requireAdmin, async (req, res, next) => {
    try {
      const { userRepo } = container.repos(req);
      const data = await userRepo.updateUser(req.params.id, req.body || {});
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      if (err && /마지막 관리자/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  router.post('/accounts/:id/reset-password', requireAdmin, async (req, res, next) => {
    try {
      const { newPassword } = req.body || {};
      const { userRepo } = container.repos(req);
      const result = await userRepo.resetPassword(req.params.id, newPassword);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: result.error } });
      }
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/accounts/:id', requireAdmin, async (req, res, next) => {
    try {
      const { userRepo } = container.repos(req);
      const result = await userRepo.deleteUser(req.user.id, req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: result.error } });
      }
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 계정별 권한 (PERMISSIONS.md — 마스터가 계정마다 능력을 열고 닫는다)
  // 실제 권한 = rolePreset(role) + grants − revokes
  // ============================================================

  router.get('/accounts/:id/capabilities', requireCapability('account:grant'), async (req, res, next) => {
    try {
      const { userRepo } = container.repos(req);
      const data = await userRepo.getCapabilities(req.params.id);
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.put('/accounts/:id/capabilities', requireCapability('account:grant'), async (req, res, next) => {
    try {
      const { grants, revokes } = req.body || {};
      const { userRepo, auditRepo, ownerId } = container.repos(req);
      const data = await userRepo.setCapabilities(req.params.id, { grants, revokes });
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }

      await auditRepo.log({
        ownerId,
        actorId: req.user.id,
        action: 'account.grant',
        targetType: 'user',
        targetId: req.params.id,
        payload: { grants: data.grants, revokes: data.revokes },
        ip: req.ip,
      });

      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 기관 관리 (BACKEND_REQUEST §8 — 가입 시 institutionCode 검증 대상)
  // ============================================================

  router.get('/institutions', requireAdmin, async (req, res, next) => {
    try {
      const { institutionRepo } = container.repos(req);
      const data = await institutionRepo.list();
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.post('/institutions', requireAdmin, async (req, res, next) => {
    try {
      const { institutionRepo } = container.repos(req);
      const data = await institutionRepo.create(req.body || {});
      return res.status(201).json({ ok: true, data });
    } catch (err) {
      if (err && /필수|4자리|사용 중/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  router.delete('/institutions/:id', requireAdmin, async (req, res, next) => {
    try {
      const { institutionRepo } = container.repos(req);
      const result = await institutionRepo.remove(req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '기관을 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createDashboardRouter };
