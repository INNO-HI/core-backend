/**
 * Dashboard REST API Router
 *
 * 인증/회원가입 라우트는 공개, 그 외 모든 dashboard 데이터 라우트는
 * requireAuth 미들웨어로 보호된다. req.user.id 를 ownerId 로 사용해
 * 모든 데이터를 계정 단위로 격리한다.
 */

const express = require('express');
const { requireAuth, requireAdmin, requireCapability } = require('./authMiddleware');
const { resolveScope } = require('./scopeMiddleware');
const { verifyToken } = require('../lib/auth');
const { prisma } = require('../lib/prisma');

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

  // 대시보드(웹) 모양 수용 — visitDate/visitType 로 보내온다 (specs/006 계약)
  if (!p.visitedAt && p.visitDate) p.visitedAt = p.visitDate;
  if (!p.type && p.visitType) p.type = p.visitType;
  delete p.visitDate;
  delete p.visitType;

  // 작성 주체 판별: 앱은 mode/transcript/sections/risk 를 실어 보낸다.
  // 앱 기록은 submitted, 웹 수기 작성은 pending(긴급 체크 시 urgent)로 들어간다.
  const isAppShape = Boolean(
    p.mode || p.transcript || (Array.isArray(p.sections) && p.sections.length) ||
    p.risk || p.grade || p.signals || p.evidence
  );
  p.status = p.isUrgent === true ? 'urgent' : isAppShape ? 'submitted' : 'pending';
  delete p.isUrgent;

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
  'ownerUserId', 'institutionId', // 마스터 콘솔 전용 — 소속 기관 또는 소속 계정 지정
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

  /**
   * 로그아웃 — 세션을 실제로 끊는다.
   *
   * sessionVersion 을 올리면 이전에 발급된 토큰은 scopeMiddleware 에서
   * SESSION_TERMINATED 로 거절된다. 예전에는 {ok:true} 만 돌려줘서, 폰을 잃어버려도
   * 그 토큰이 만료일까지 살아 있었다.
   *
   * JWT 라 토큰 하나만 골라 끊을 수 없어 그 계정의 모든 기기가 함께 로그아웃된다.
   * 토큰이 없거나 이미 만료됐어도 200 이다 — 클라이언트는 어차피 로컬 토큰을 지우고,
   * 여기서 401 을 주면 앱이 로그아웃을 끝내지 못한다.
   */
  router.post('/auth/logout', async (req, res) => {
    const header = req.headers['authorization'] || '';
    if (header.startsWith('Bearer ')) {
      try {
        const payload = verifyToken(header.slice('Bearer '.length).trim());
        await prisma.user.update({
          where: { id: payload.userId },
          data: { sessionVersion: { increment: 1 } },
        });
      } catch (err) {
        // 만료·위조 토큰이면 끊을 세션이 없다. 그대로 성공으로 끝낸다.
      }
    }
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

  async function handleDeleteAccount(req, res, next) {
    try {
      const { reason, password } = req.body || {};
      const result = await container.dashboardService.deleteAccount({
        userId: req.user.id,
        password,
        reason,
      });
      if (!result.success) {
        return res
          .status(401)
          .json({ ok: false, error: { code: result.code || 'AUTH_FAILED', message: result.error } });
      }
      return res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }

  router.delete('/auth/account', requireAuth, handleDeleteAccount);
  router.post('/auth/delete-account', requireAuth, handleDeleteAccount);

  // 점검 모드 등 공개 런타임 설정 (로그인 화면 배너용 — 인증 전에 읽는다)
  router.get('/system-config', async (req, res, next) => {
    try {
      const { prisma } = require('../lib/prisma');
      const rows = await prisma.systemConfig.findMany();
      const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      return res.json({
        ok: true,
        data: { maintenance: map.maintenance === 'true', maintenanceMessage: map.maintenanceMessage || '' },
      });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 이 아래는 모두 인증 필요.
  // resolveScope 가 기관 공유 스코프(req.ownerScope)와 caregiver 담당
  // 기준점(req.callerManagerId)을 주입한다 — 같은 기관은 하나의 워크스페이스.
  // ============================================================
  router.use(requireAuth);
  router.use(resolveScope);

  /** caregiver 는 담당분만 본다 (§5 서버 강제). 연결된 매니저가 없으면 아무것도 안 보인다 */
  function restrictOf(repos) {
    return repos.callerRole === 'caregiver' ? (repos.callerManagerId || '__none__') : undefined;
  }


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

      const { dashboardRepo, writerId, callerRole } = container.repos(req);
      let targetOwner = writerId;
      if (req.body?.institutionId && (callerRole === 'master' || callerRole === 'admin')) {
        const { prisma } = require('../lib/prisma');
        const member = await prisma.user.findFirst({
          where: { institutionId: String(req.body.institutionId) },
          select: { id: true },
        });
        if (member) targetOwner = member.id; // 기관 공유 스코프로 구성원 전원이 본다
      }
      const data = await dashboardRepo.createNotification(targetOwner, {
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
      const { date, recipientId, status } = req.query;
      const repos = container.repos(req);
      const { dashboardRepo, taskRepo, ownerId } = repos;
      const restrict = restrictOf(repos);
      const assigneeId = restrict || req.query.assigneeId;

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
      const { taskRepo, ownerId, writerId } = container.repos(req);
      const data = await taskRepo.createTask(ownerId, req.body, writerId);
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

      const repos = container.repos(req);
      const data = await repos.careLogRepo.getCareLogs(repos.ownerId, filters, page, pageSize, restrictOf(repos));
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
          error: { code: 'BAD_REQUEST', message: 'recipientId와 visitedAt(visitDate)은 필수입니다.' },
        });
      }

      const { careLogRepo, auditRepo, ownerId, writerId } = container.repos(req);
      const data = await careLogRepo.createFromApp(ownerId, payload, writerId);

      await auditRepo.log({
        ownerId: writerId,
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
      const repos = container.repos(req);
      const data = await repos.careLogRepo.getCareLogById(repos.ownerId, req.params.id, restrictOf(repos));
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

      const { careLogRepo, auditRepo, ownerId, writerId } = container.repos(req);
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
      const repos = container.repos(req);
      const data = await repos.riskRepo.getQueue(repos.ownerId, restrictOf(repos));
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

      const { riskRepo, auditRepo, dashboardRepo, ownerId, writerId } = container.repos(req);
      const data = await riskRepo.acknowledge(ownerId, req.params.id, String(note).trim(), req.user.id);

      // 확인 결과를 실무자 소식함으로 회신 — 반려만 내려가고 위기 처리는 조용하던 공백을 메운다
      await dashboardRepo.createNotification(writerId, {
        kind: 'status',
        icon: 'success',
        isUrgent: false,
        title: `위기 확인 완료: ${data.recipientName || ''}`,
        content: String(note).trim(),
        link: data.careLogId ? `/care-logs/${data.careLogId}` : null,
      }).catch(() => null);

      // 누가, 언제 확인했는지가 감사의 대상이다 (스펙 §1)
      await auditRepo.log({
        ownerId: writerId,
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
      const repos = container.repos(req);
      const data = await repos.analysisRepo.listCrisisCases(repos.ownerId, restrictOf(repos));
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/analysis/crisis-cases/:id', async (req, res, next) => {
    try {
      const repos = container.repos(req);
      const data = await repos.analysisRepo.getCrisisCaseDetail(repos.ownerId, req.params.id, restrictOf(repos));
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
      const { managerRepo, ownerId, writerId, callerRole } = container.repos(req);
      const body = { ...(req.body || {}) };
      // 마스터는 소속 기관(institutionId) 또는 소속 계정(ownerUserId)을 지정해 만든다
      let effectiveWriter = writerId;
      if (callerRole === 'master' || callerRole === 'admin') {
        if (body.institutionId) {
          const { prisma } = require('../lib/prisma');
          const inst = String(body.institutionId);
          const owner = await prisma.user.findFirst({
            where: { institutionId: inst },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
            select: { id: true },
          });
          if (!owner) {
            return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: '해당 기관에 소속 계정이 없습니다. 먼저 계정을 만들어 주세요.' } });
          }
          effectiveWriter = owner.id;
        } else if (body.ownerUserId) {
          effectiveWriter = String(body.ownerUserId);
        }
      }
      delete body.ownerUserId;
      delete body.institutionId;
      const data = await managerRepo.createManager(ownerId, body, effectiveWriter);
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
      const { managerRepo, auditRepo, ownerId, writerId } = container.repos(req);
      const result = await managerRepo.deleteManager(ownerId, req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '매니저를 찾을 수 없습니다' } });
      }
      // 삭제 사유 감사 — 권한·계정 변경 내역 3년 보관 대상 (?reason=)
      await auditRepo.log({
        ownerId: writerId,
        actorId: req.user.id,
        action: 'manager.delete',
        targetType: 'manager',
        targetId: req.params.id,
        payload: req.query.reason ? { reason: String(req.query.reason) } : undefined,
        ip: req.ip,
      });
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

      const { visitRepo, ownerId, writerId } = container.repos(req);
      const data = await visitRepo.createVisitForManager(ownerId, req.params.id, {
        recipientId,
        visitDate,
        visitType,
        summary,
      }, writerId);
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

      const repos = container.repos(req);
      const data = await repos.recipientRepo.getRecipients(repos.ownerId, filters, restrictOf(repos));
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.get('/recipients/kpi', async (req, res, next) => {
    try {
      const repos = container.repos(req);
      const { recipientRepo, ownerId } = repos;
      const data = await recipientRepo.getKPIs(ownerId, restrictOf(repos));
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
      const { recipientRepo, ownerId, writerId, callerRole } = container.repos(req);
      const body = { ...(req.body || {}) };
      // 마스터는 소속 기관(institutionId) 또는 소속 계정(ownerUserId)을 지정해 만든다
      let effectiveWriter = writerId;
      if (callerRole === 'master' || callerRole === 'admin') {
        if (body.institutionId) {
          const { prisma } = require('../lib/prisma');
          const inst = String(body.institutionId);
          const owner = await prisma.user.findFirst({
            where: { institutionId: inst },
            orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
            select: { id: true },
          });
          if (!owner) {
            return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: '해당 기관에 소속 계정이 없습니다. 먼저 계정을 만들어 주세요.' } });
          }
          effectiveWriter = owner.id;
        } else if (body.ownerUserId) {
          effectiveWriter = String(body.ownerUserId);
        }
      }
      delete body.ownerUserId;
      delete body.institutionId;
      const data = await recipientRepo.createRecipient(ownerId, body, effectiveWriter);
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
      const repos = container.repos(req);
      const data = await repos.recipientRepo.getRecipientById(repos.ownerId, req.params.id, restrictOf(repos));
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
        const { recipientRepo, auditRepo, ownerId, writerId } = container.repos(req);
        const data = await recipientRepo.updateRecipient(ownerId, req.params.id, req.body || {});
        if (!data) {
          return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '대상자를 찾을 수 없습니다' } });
        }
        // 담당 변경은 접근 범위가 바뀌는 사건이다 — 감사에 남긴다 (인사이동 말소 추적)
        if ('managerId' in (req.body || {}) || 'managerName' in (req.body || {}) || 'manager' in (req.body || {})) {
          await auditRepo.log({ ownerId: writerId, actorId: req.user.id, action: 'recipient.assign', targetType: 'recipient', targetId: req.params.id, payload: { managerId: req.body.managerId ?? null }, ip: req.ip });
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
      const { recipientRepo, auditRepo, ownerId, writerId } = container.repos(req);
      const result = await recipientRepo.deleteRecipient(ownerId, req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '대상자를 찾을 수 없습니다' } });
      }
      await auditRepo.log({
        ownerId: writerId,
        actorId: req.user.id,
        action: 'recipient.delete',
        targetType: 'recipient',
        targetId: req.params.id,
        payload: req.query.reason ? { reason: String(req.query.reason) } : undefined,
        ip: req.ip,
      });
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
      const { consentRepo, auditRepo, ownerId, writerId } = container.repos(req);
      const data = await consentRepo.grantConsent(ownerId, req.params.id, req.body || {}, req.user.id);

      await auditRepo.log({
        ownerId: writerId,
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
      const { consentRepo, auditRepo, ownerId, writerId } = container.repos(req);
      const data = await consentRepo.revokeConsent(
        ownerId,
        req.params.id,
        req.params.consentId,
        (req.body || {}).note
      );

      await auditRepo.log({
        ownerId: writerId,
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
      const { settingsRepo, writerId: ownerId } = container.repos(req);
      const data = await settingsRepo.getSettings(ownerId);
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/settings/profile', async (req, res, next) => {
    try {
      const { settingsRepo, writerId: ownerId } = container.repos(req);
      const data = await settingsRepo.updateProfile(ownerId, req.body || {});
      return res.json({ ok: true, data });
    } catch (err) {
      if (err && /이미 사용 중인 이메일/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
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

      const { settingsRepo, writerId: ownerId } = container.repos(req);
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
  // 시스템 (DB 관리 패널) — 관리자 전용
  // ADMIN_SYSTEM_PASSWORD 가 설정돼 있으면 그 값으로, 없으면
  // 호출한 관리자 본인 계정의 비밀번호로 재확인한다.
  // ============================================================

  async function verifySystemPassword(req, password) {
    const configured = process.env.ADMIN_SYSTEM_PASSWORD;
    if (configured) {
      const given = Buffer.from(String(password || ''));
      const expected = Buffer.from(String(configured));
      return given.length === expected.length && require('crypto').timingSafeEqual(given, expected);
    }
    const { systemRepo } = container.repos(req);
    return systemRepo.verifyUserPassword(req.user.id, password);
  }

  router.post('/system/postgres-access/verify', requireAdmin, async (req, res, next) => {
    try {
      const { password } = req.body || {};
      const ok = await verifySystemPassword(req, password);
      if (!ok) {
        return res
          .status(401)
          .json({ ok: false, error: { code: 'AUTH_FAILED', message: '비밀번호가 올바르지 않습니다.' } });
      }
      return res.json({ ok: true, data: { verified: true } });
    } catch (err) {
      next(err);
    }
  });

  router.get('/system/postgres-status', requireAdmin, async (req, res, next) => {
    try {
      const password = req.headers['x-admin-system-password'];
      const ok = await verifySystemPassword(req, password);
      if (!ok) {
        return res
          .status(401)
          .json({ ok: false, error: { code: 'AUTH_FAILED', message: '비밀번호 확인이 필요합니다.' } });
      }

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
            checkedAt: new Date().toISOString(),
            message: 'In-Memory 모드로 동작 중입니다 (PostgreSQL 미사용).',
          },
        });
      }

      const { systemRepo } = container.repos(req);
      const data = await systemRepo.getPostgresStatus();
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // Prisma Studio 는 별도 프로세스로 띄운다 (scripts/start-prisma-studio.sh).
  // 주소를 PRISMA_STUDIO_URL 로 알려주면 그 주소를 내려준다.
  router.post('/system/prisma-studio/session', requireAdmin, async (_req, res) => {
    const launchUrl = process.env.PRISMA_STUDIO_URL;
    if (!launchUrl) {
      return res.status(404).json({
        ok: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Prisma Studio가 설정되어 있지 않습니다. 서버에 PRISMA_STUDIO_URL을 설정해 주세요.',
        },
      });
    }
    return res.json({ ok: true, data: { launchUrl, expiresInSec: 3600 } });
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
      if (err && /마지막 관리자|이미 사용|올바른 이메일|찾을 수 없/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  router.post('/accounts/:id/reset-password', requireAdmin, async (req, res, next) => {
    try {
      const { newPassword, reason } = req.body || {};
      const { userRepo, auditRepo, writerId } = container.repos(req);
      const result = await userRepo.resetPassword(req.params.id, newPassword);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: result.error } });
      }
      await auditRepo.log({
        ownerId: writerId,
        actorId: req.user.id,
        action: 'account.reset_password',
        targetType: 'user',
        targetId: req.params.id,
        payload: reason ? { reason: String(reason) } : undefined,
        ip: req.ip,
      });
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/accounts/:id', requireAdmin, async (req, res, next) => {
    try {
      const { userRepo, auditRepo, writerId } = container.repos(req);
      const result = await userRepo.deleteUser(req.user.id, req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: result.error } });
      }
      await auditRepo.log({
        ownerId: writerId,
        actorId: req.user.id,
        action: 'account.delete',
        targetType: 'user',
        targetId: req.params.id,
        payload: req.query.reason ? { reason: String(req.query.reason) } : undefined,
        ip: req.ip,
      });
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
      const { userRepo, auditRepo, writerId } = container.repos(req);
      const data = await userRepo.setCapabilities(req.params.id, { grants, revokes });
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }

      await auditRepo.log({
        ownerId: writerId,
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

  router.patch('/institutions/:id', requireAdmin, async (req, res, next) => {
    try {
      const { institutionRepo } = container.repos(req);
      const data = await institutionRepo.update(req.params.id, req.body || {});
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '기관을 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      if (err && /필수|4자리|사용 중/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  // 가입 코드 재발급 — 4자리 랜덤. 유출 의심 시 마스터가 즉시 회전
  router.post('/institutions/:id/reissue-code', requireAdmin, async (req, res, next) => {
    try {
      const { prisma } = require('../lib/prisma');
      let code;
      for (let attempt = 0; attempt < 50; attempt++) {
        code = String(Math.floor(1000 + Math.random() * 9000));
        const dup = await prisma.institution.findUnique({ where: { code } });
        if (!dup) break;
      }
      const updated = await prisma.institution.update({
        where: { id: req.params.id },
        data: { code },
      });
      const { auditRepo, writerId } = container.repos(req);
      await auditRepo.log({ ownerId: writerId, actorId: req.user.id, action: 'institution.reissue_code', targetType: 'institution', targetId: req.params.id, payload: { newCode: code }, ip: req.ip });
      return res.json({ ok: true, data: { id: updated.id, name: updated.name, code: updated.code, phone: updated.phone, address: updated.address, createdAt: updated.createdAt } });
    } catch (err) {
      if (err && err.code === 'P2025') {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '기관을 찾을 수 없습니다' } });
      }
      next(err);
    }
  });

  router.delete('/institutions/:id', requireAdmin, async (req, res, next) => {
    try {
      const { institutionRepo, auditRepo, writerId } = container.repos(req);
      const result = await institutionRepo.remove(req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '기관을 찾을 수 없습니다' } });
      }
      await auditRepo.log({
        ownerId: writerId,
        actorId: req.user.id,
        action: 'institution.delete',
        targetType: 'institution',
        targetId: req.params.id,
        payload: req.query.reason ? { reason: String(req.query.reason) } : undefined,
        ip: req.ip,
      });
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 마스터 콘솔 — 전역 현황·감사 기록
  // ============================================================

  router.get('/master/overview', requireAdmin, async (req, res, next) => {
    try {
      const mailer = require('../lib/mailer');
      const { auditRepo } = container.repos(req);
      const data = await auditRepo.systemOverview();
      return res.json({ ok: true, data: { ...data, smtpConfigured: mailer.isConfigured } });
    } catch (err) {
      next(err);
    }
  });

  // 점검 모드 토글 (마스터)
  router.put('/system-config', requireAdmin, async (req, res, next) => {
    try {
      const { prisma } = require('../lib/prisma');
      const { maintenance, maintenanceMessage } = req.body || {};
      const entries = [
        ['maintenance', String(Boolean(maintenance))],
        ['maintenanceMessage', String(maintenanceMessage || '')],
      ];
      for (const [key, value] of entries) {
        await prisma.systemConfig.upsert({ where: { key }, update: { value }, create: { key, value } });
      }
      return res.json({ ok: true, data: { maintenance: Boolean(maintenance), maintenanceMessage: maintenanceMessage || '' } });
    } catch (err) {
      next(err);
    }
  });

  // 로그인 잠금 해제 (5회 실패 잠금)
  router.post('/accounts/:id/unlock', requireAdmin, async (req, res, next) => {
    try {
      const { prisma } = require('../lib/prisma');
      const user = await prisma.user.findUnique({ where: { id: req.params.id }, select: { email: true } });
      if (!user) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }
      container.dashboardService.unlockAccount(user.email);
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  // 세션 강제 종료 — 발급된 모든 토큰 무효화
  router.post('/accounts/:id/terminate-sessions', requireAdmin, async (req, res, next) => {
    try {
      const { userRepo, auditRepo, writerId } = container.repos(req);
      const result = await userRepo.terminateSessions(req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '계정을 찾을 수 없습니다' } });
      }
      await auditRepo.log({ ownerId: writerId, actorId: req.user.id, action: 'account.terminate_sessions', targetType: 'user', targetId: req.params.id, ip: req.ip });
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  // 초대 메일로 계정 생성 — 임시 비밀번호는 메일로만 나간다
  router.post('/accounts/invite', requireAdmin, async (req, res, next) => {
    try {
      const crypto = require('crypto');
      const mailer = require('../lib/mailer');
      const { email, name, role, institutionId } = req.body || {};
      if (!email || !name) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: '이메일과 이름은 필수입니다.' } });
      }
      const tempPassword = 'Hi' + crypto.randomBytes(5).toString('hex') + '!';
      const { userRepo, auditRepo, writerId } = container.repos(req);
      const created = await userRepo.createUser({ email, name, password: tempPassword, role: role || 'institution' });
      if (institutionId) await userRepo.updateUser(created.id, { institutionId });
      await mailer.sendMail({
        to: email,
        subject: '[안심하이] 계정 초대',
        text: name + ' 님, 안심하이 계정이 생성되었습니다.\n\n이메일: ' + email + '\n임시 비밀번호: ' + tempPassword + '\n\n로그인 후 설정에서 비밀번호를 꼭 변경해 주세요.\nhttps://safe-hi.xyz/login',
      });
      await auditRepo.log({ ownerId: writerId, actorId: req.user.id, action: 'account.invite', targetType: 'user', targetId: created.id, payload: { email }, ip: req.ip });
      const invitationUrl = `${process.env.PUBLIC_APP_URL || 'https://safe-hi.xyz'}/login?email=${encodeURIComponent(email)}`;
      return res.status(201).json({ ok: true, data: { ...created, invitationUrl, invitationToken: tempPassword } });
    } catch (err) {
      if (err && /이미 사용|필수|8자/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  // 담당 대상자 일괄 재배정 (퇴직 인수인계)
  router.post('/managers/:id/reassign', requireCapability('manager:assign'), async (req, res, next) => {
    try {
      const { toManagerId } = req.body || {};
      if (!toManagerId) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: 'toManagerId는 필수입니다.' } });
      }
      const { managerRepo, auditRepo, ownerId, writerId } = container.repos(req);
      const result = await managerRepo.reassignRecipients(ownerId, req.params.id, toManagerId);
      await auditRepo.log({ ownerId: writerId, actorId: req.user.id, action: 'recipient.assign', targetType: 'manager', targetId: req.params.id, payload: { toManagerId, moved: result.moved }, ip: req.ip });
      return res.json({ ok: true, data: result });
    } catch (err) {
      if (err && /찾을 수 없/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  // 기관 데이터 JSON 내보내기 (백업)
  router.get('/master/export', requireAdmin, async (req, res, next) => {
    try {
      const { prisma } = require('../lib/prisma');
      const instId = req.query.institutionId;
      const members = instId
        ? (await prisma.user.findMany({ where: { institutionId: String(instId) }, select: { id: true } })).map((u) => u.id)
        : null;
      const ownerFilter = members ? { ownerId: { in: members } } : {};
      const [users, managers, recipients] = await Promise.all([
        prisma.user.findMany({
          where: instId ? { institutionId: String(instId) } : {},
          select: { email: true, name: true, role: true, createdAt: true },
        }),
        prisma.manager.findMany({ where: ownerFilter, select: { name: true, status: true, phone: true } }),
        prisma.recipient.findMany({ where: ownerFilter, select: { name: true, age: true, birthDate: true, status: true, address: true } }),
      ]);
      res.setHeader('Content-Disposition', 'attachment; filename="safehi-export.json"');
      return res.json({ exportedAt: new Date().toISOString(), users, managers, recipients });
    } catch (err) {
      next(err);
    }
  });

  // 기관 업무 데이터 초기화 (계정은 유지) — 시연 리셋용
  router.delete('/master/institutions/:id/data', requireAdmin, async (req, res, next) => {
    try {
      const { prisma } = require('../lib/prisma');
      const members = (await prisma.user.findMany({ where: { institutionId: req.params.id }, select: { id: true } })).map((u) => u.id);
      if (members.length === 0) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '소속 계정이 없는 기관입니다' } });
      }
      const ownerIn = { ownerId: { in: members } };
      const [r1, r2, r3] = await prisma.$transaction([
        prisma.recipient.deleteMany({ where: ownerIn }),
        prisma.manager.deleteMany({ where: ownerIn }),
        prisma.notification.deleteMany({ where: ownerIn }),
      ]);
      const { auditRepo, writerId } = container.repos(req);
      await auditRepo.log({ ownerId: writerId, actorId: req.user.id, action: 'institution.reset_data', targetType: 'institution', targetId: req.params.id, payload: { recipients: r1.count, managers: r2.count }, ip: req.ip });
      return res.json({ ok: true, data: { recipients: r1.count, managers: r2.count, notifications: r3.count } });
    } catch (err) {
      next(err);
    }
  });

  // 감사 기록 열람 — 권한 부여·변경·말소 내역은 법정 3년 보관 대상 (PERMISSIONS.md §2.1)
  router.get('/audit-logs', requireCapability('account:grant'), async (req, res, next) => {
    try {
      const { auditRepo } = container.repos(req);
      const data = await auditRepo.list({
        action: req.query.action,
        limit: req.query.limit,
        from: req.query.from,
        to: req.query.to,
        actorId: req.query.actorId,
      });
      return res.json({ ok: true, data });
    } catch (err) {
      next(err);
    }
  });

  // ============================================================
  // 센터 관리 (전역 참조 데이터) — 마스터 콘솔
  // ============================================================

  router.get('/centers', requireAdmin, async (req, res, next) => {
    try {
      const { institutionRepo } = container.repos(req);
      return res.json({ ok: true, data: await institutionRepo.listCenters() });
    } catch (err) {
      next(err);
    }
  });

  router.post('/centers', requireAdmin, async (req, res, next) => {
    try {
      const { institutionRepo } = container.repos(req);
      const data = await institutionRepo.createCenter(req.body || {});
      return res.status(201).json({ ok: true, data });
    } catch (err) {
      if (err && /필수|이미 등록/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  router.patch('/centers/:id', requireAdmin, async (req, res, next) => {
    try {
      const { institutionRepo } = container.repos(req);
      const data = await institutionRepo.updateCenter(req.params.id, req.body || {});
      if (!data) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '센터를 찾을 수 없습니다' } });
      }
      return res.json({ ok: true, data });
    } catch (err) {
      if (err && /필수|이미 등록|찾을 수 없/.test(err.message || '')) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: err.message } });
      }
      next(err);
    }
  });

  router.delete('/centers/:id', requireAdmin, async (req, res, next) => {
    try {
      const { institutionRepo } = container.repos(req);
      const result = await institutionRepo.removeCenter(req.params.id);
      if (result.notFound) {
        return res.status(404).json({ ok: false, error: { code: 'NOT_FOUND', message: '센터를 찾을 수 없습니다' } });
      }
      if (!result.success) {
        return res.status(400).json({ ok: false, error: { code: 'BAD_REQUEST', message: result.error } });
      }
      return res.json({ ok: true, data: { success: true } });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createDashboardRouter };
