/**
 * PostgreSQL Care Log Repository (Prisma) — ownerId 격리
 */

const { rangeStart, rangeEndExclusive } = require('../../lib/dateRange');

class PrismaCareLogRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async getCareLogs(ownerId, filters, page = 1, pageSize = 10, restrictManagerId) {
    const where = { ownerId };
    // caregiver 서버 스코핑 (§5) — 담당분만. 화면에서 거르는 것으로 충분하지 않다
    if (restrictManagerId) where.managerId = restrictManagerId;

    if (filters.status && filters.status !== 'all') where.status = filters.status;

    if (filters.search) {
      const s = filters.search;
      where.OR = [
        { recipient: { name: { contains: s, mode: 'insensitive' } } },
        { manager: { name: { contains: s, mode: 'insensitive' } } },
        { center: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (filters.dateStart) where.visitDate = { ...(where.visitDate || {}), gte: rangeStart(filters.dateStart) };
    if (filters.dateEnd) where.visitDate = { ...(where.visitDate || {}), lt: rangeEndExclusive(filters.dateEnd) };

    if (filters.dong && filters.dong !== 'all') {
      where.recipient = { ...(where.recipient || {}), dong: { name: filters.dong } };
    }

    // 상태별 카운트 — 스펙 상태(submitted/in_review)와 현행 상태를 모두 집계
    const grouped = await this.prisma.careLog.groupBy({
      by: ['status'],
      where: restrictManagerId ? { ownerId, managerId: restrictManagerId } : { ownerId },
      _count: { _all: true },
    });
    const statusCounts = {
      all: 0,
      draft: 0,
      submitted: 0,
      in_review: 0,
      pending: 0,
      urgent: 0,
      approved: 0,
      rejected: 0,
    };
    for (const g of grouped) {
      statusCounts[g.status] = g._count._all;
      statusCounts.all += g._count._all;
    }

    const totalCount = await this.prisma.careLog.count({ where });
    const logs = await this.prisma.careLog.findMany({
      where,
      orderBy: { visitDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        recipient: { select: { name: true } },
        manager: { select: { name: true } },
        center: { select: { name: true } },
      },
    });

    return {
      logs: logs.map((l) => ({
        id: l.id,
        recipientName: l.recipient.name,
        managerName: l.manager.name,
        centerName: l.center?.name || '',
        visitDate: l.visitDate.toISOString(),
        visitType: l.visitType || 'visit',
        registeredAt: l.createdAt.toISOString(),
        status: l.status,
        // 목록 카드가 첫 줄에 보여줄 요약. 이게 없어서 앱 기록 탭 카드마다
        // "남기신 내용이 아직 올라오지 않았습니다" 가 떴다 — 상세에는 있는데
        // 목록만 비어 있었다.
        summary: l.summary || '',
        sessionNo: l.sessionNo ?? null,
        elapsedSeconds: l.elapsedSeconds ?? null,
      })),
      totalCount,
      statusCounts,
    };
  }

  async getCareLogsByRecipientId(ownerId, recipientId, filters = {}, page = 1, pageSize = 20) {
    const where = { ownerId, recipientId };

    if (filters.status && filters.status !== 'all') where.status = filters.status;
    if (filters.dateStart) where.visitDate = { ...(where.visitDate || {}), gte: rangeStart(filters.dateStart) };
    if (filters.dateEnd) where.visitDate = { ...(where.visitDate || {}), lt: rangeEndExclusive(filters.dateEnd) };

    const totalCount = await this.prisma.careLog.count({ where });
    const logs = await this.prisma.careLog.findMany({
      where,
      orderBy: { visitDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        recipient: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        center: { select: { name: true } },
      },
    });

    return {
      logs: logs.map((l) => ({
        id: l.id,
        recipientId: l.recipient.id,
        recipientName: l.recipient.name,
        managerId: l.manager.id,
        managerName: l.manager.name,
        centerName: l.center?.name || '',
        visitDate: l.visitDate.toISOString(),
        visitType: l.visitType || 'visit',
        status: l.status,
        registeredAt: l.createdAt.toISOString(),
        rejectionReason: l.rejectionReason || null,
        summary: l.summary || '',
        sessionNo: l.sessionNo ?? null,
        elapsedSeconds: l.elapsedSeconds ?? null,
      })),
      totalCount,
    };
  }

  async getCareLogById(ownerId, id, restrictManagerId) {
    const log = await this.prisma.careLog.findFirst({
      where: restrictManagerId ? { id, ownerId, managerId: restrictManagerId } : { id, ownerId },
      include: {
        recipient: { select: { id: true, name: true } },
        manager: { select: { name: true } },
        center: { select: { name: true } },
        feedbacks: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        sections: { orderBy: { sortOrder: 'asc' } },
        riskAssessment: { include: { evidence: true } },
      },
    });

    if (!log) return null;

    // 확인자·검토자 이름 조회 (users)
    const userIds = [log.confirmedById, log.reviewedById].filter(Boolean);
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const nameOf = (uid) => users.find((u) => u.id === uid)?.name || null;

    return {
      id: log.id,
      recipientId: log.recipient.id,
      recipientName: log.recipient.name,
      status: log.status,
      createdAt: log.createdAt.toISOString(),
      visitInfo: {
        visitDate: log.visitDate.toISOString(),
        visitType: log.visitType || 'visit',
        managerName: log.manager.name,
        centerName: log.center?.name || '',
      },
      visitLocation: log.visitLocation || '',
      careContent: log.careContent || null,
      careContentBlocks: log.careContentBlocks || [],
      requiredActions: log.requiredActions || [],
      recommendedPolicies: log.recommendedPolicies || [],
      notes: log.notes || '',
      photos: log.photos || [],
      rejectionReason: log.rejectionReason || null,
      // BACKEND_DB_SPEC.md §3.4~3.7 확장 필드
      mode: log.mode || null,
      transcript: log.transcript || null,
      summary: log.summary || null,
      sessionNo: log.sessionNo ?? null,
      elapsedSeconds: log.elapsedSeconds ?? null, // 못 쟀으면 null 그대로 — 기본값을 넣지 않는다
      confirmedByName: nameOf(log.confirmedById),
      confirmedAt: log.confirmedAt ? log.confirmedAt.toISOString() : null,
      reviewedByName: nameOf(log.reviewedById),
      reviewedAt: log.reviewedAt ? log.reviewedAt.toISOString() : null,
      sections: log.sections.map((s) => ({
        id: s.id,
        careLogId: s.careLogId,
        kind: s.kind,
        title: s.title,
        body: Array.isArray(s.body) ? s.body : [],
        sortOrder: s.sortOrder,
      })),
      riskAssessment: log.riskAssessment
        ? {
            id: log.riskAssessment.id,
            careLogId: log.riskAssessment.careLogId,
            grade: log.riskAssessment.grade,
            workerGrade: log.riskAssessment.workerGrade || null,
            escalated: log.riskAssessment.escalated,
            conflictResolved: log.riskAssessment.conflictResolved,
            rationale: log.riskAssessment.rationale,
            engineVersion: log.riskAssessment.engineVersion,
            createdAt: log.riskAssessment.createdAt.toISOString(),
            evidence: log.riskAssessment.evidence.map((e) => ({
              id: e.id,
              assessmentId: e.assessmentId,
              signal: e.signal,
              span: e.span, // 비었으면 null 그대로 — 신호 이름으로 채우지 않는다
              grade: e.grade,
              source: e.source,
            })),
          }
        : null,
      feedbacks: log.feedbacks.map((f) => ({
        id: f.id,
        careLogId: f.careLogId,
        authorId: f.author.id,
        authorName: f.author.name,
        authorRole: f.authorRole || '',
        content: f.content,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  async updateBulkStatus(ownerId, ids, status) {
    const result = await this.prisma.careLog.updateMany({
      where: { id: { in: ids }, ownerId },
      data: { status },
    });
    return { success: true, count: result.count };
  }

  async updateStatus(ownerId, id, status, reason, reviewerId) {
    const data = { status };
    if (reason) data.rejectionReason = reason;

    // 검토 행위(검토 시작·승인·반려)는 검토자와 시각을 남긴다 (스펙 §3.4 reviewed_by)
    if (reviewerId && ['in_review', 'approved', 'rejected'].includes(status)) {
      data.reviewedById = reviewerId;
      data.reviewedAt = new Date();
    }

    const result = await this.prisma.careLog.updateMany({
      where: { id, ownerId },
      data,
    });

    if (result.count === 0) {
      throw new Error('해당 돌봄 일지를 찾을 수 없거나 권한이 없습니다.');
    }

    // 반려 사유는 종사자 소식함으로 내려간다 (스펙 §4.2)
    if (status === 'rejected' && reason) {
      const log = await this.prisma.careLog.findUnique({
        where: { id },
        include: { recipient: { select: { name: true } } },
      });
      await this.prisma.notification.create({
        data: {
          // 소유 계정은 검토자 본인 (기관 공유 스코프로 실무자도 본다).
          // reviewerId 가 없던 구 호출은 원 기록의 소유 계정으로 남긴다.
          ownerId: reviewerId || log?.ownerId,
          kind: 'status',
          icon: 'warning',
          isUrgent: false,
          title: `기록 반려: ${log?.recipient?.name || ''}`,
          content: reason,
          link: `/care-logs/${id}`,
        },
      });
    }

    return { success: true, id, newStatus: status };
  }

  /**
   * 앱 기록 적재 (POST /care-logs) — BACKEND_DB_SPEC.md §7 2단계
   *
   * care_log + care_log_sections + risk_assessment + risk_evidence 를
   * 한 트랜잭션으로 넣고, 경보 이상이면 risk_queue 에 올린다.
   * confirmedBy 는 요청 토큰의 사용자 — 사람이 확인하지 않은 기록은 만들어지지 않는다.
   */
  async createFromApp(ownerId, payload, authorUserId) {
    const SLA_HOURS = { alert: 24, urgent: 4 };

    const recipient = await this.prisma.recipient.findFirst({
      where: { id: payload.recipientId, ownerId },
      include: { manager: { select: { id: true, centerId: true } } },
    });
    if (!recipient) throw new Error('대상자를 찾을 수 없거나 권한이 없습니다.');
    if (!recipient.manager) {
      throw new Error('담당자가 배정되지 않은 대상자입니다. 대시보드에서 담당자를 먼저 배정해주세요.');
    }

    const visitedAt = new Date(payload.visitedAt);
    if (isNaN(visitedAt.getTime())) throw new Error('visitedAt 이 올바른 날짜 형식이 아닙니다.');

    const sessionNo =
      Number(payload.sessionNo) ||
      (await this.prisma.careLog.count({ where: { ownerId, recipientId: recipient.id } })) + 1;

    const created = await this.prisma.$transaction(async (tx) => {
      const careLog = await tx.careLog.create({
        data: {
          ownerId: authorUserId, // 소유 계정은 작성자 본인 — 기관 공유 스코프로 관리자가 본다
          recipientId: recipient.id,
          managerId: recipient.manager.id,
          centerId: recipient.manager.centerId || null,
          status: payload.status || 'submitted',
          visitDate: visitedAt,
          visitType: payload.type === 'call' ? 'call' : 'visit',
          notes: payload.notes ? String(payload.notes) : null,
          // 웹 수기 작성은 mode 없이 온다 — 앱 기록에만 남긴다
          mode: payload.mode ? (payload.mode === 'liveRecording' ? 'liveRecording' : 'postVoiceMemo') : null,
          transcript: payload.transcript || null, // 마스킹된 텍스트만 — 원본 오디오는 받지 않는다
          summary: payload.summary || null,
          sessionNo,
          // 실측 못 했으면 null 그대로 둔다 — 기본값 금지 (스펙 §9)
          elapsedSeconds:
            payload.elapsedSeconds === null || payload.elapsedSeconds === undefined
              ? null
              : Number(payload.elapsedSeconds),
          careContent: payload.careContent ?? null,
          confirmedById: authorUserId,
          confirmedAt: new Date(),
        },
      });

      if (Array.isArray(payload.sections) && payload.sections.length > 0) {
        await tx.careLogSection.createMany({
          data: payload.sections.map((s, i) => ({
            careLogId: careLog.id,
            kind: String(s.kind || 'log'),
            title: String(s.title || ''),
            body: Array.isArray(s.body) ? s.body : [],
            sortOrder: Number.isFinite(Number(s.sortOrder)) ? Number(s.sortOrder) : i,
          })),
        });
      }

      if (payload.risk && payload.risk.grade) {
        const risk = payload.risk;
        const assessment = await tx.riskAssessment.create({
          data: {
            careLogId: careLog.id,
            grade: risk.grade,
            workerGrade: risk.workerGrade || null,
            escalated: Boolean(risk.escalated),
            conflictResolved: Boolean(risk.conflictResolved),
            rationale: String(risk.rationale || ''),
            engineVersion: String(risk.engineVersion || 'unknown'),
          },
        });

        if (Array.isArray(risk.evidence) && risk.evidence.length > 0) {
          await tx.riskEvidence.createMany({
            data: risk.evidence.map((e) => ({
              assessmentId: assessment.id,
              signal: String(e.signal || ''),
              span: e.span || null, // 비었으면 null — 신호 이름으로 채우지 않는다 (스펙 §3.7)
              grade: String(e.grade || risk.grade),
              source: e.source === 'worker_tag' ? 'worker_tag' : 'transcript',
            })),
          });
        }

        // 경보 이상만 큐에 올린다. dueAt 은 저장해 둔다 — 규칙이 바뀌어도 소급되지 않는다.
        // 단, 음성 수집 동의가 유효하지 않은 분은 큐에 올리지 않는다 —
        // 동의 없는 분의 AI 판정을 기관 화면에 노출하지 않는 것이 원칙이다.
        const activeConsent = SLA_HOURS[risk.grade]
          ? await tx.consent.findFirst({
              where: { recipientId: recipient.id, voiceConsent: true, revokedAt: null },
              select: { id: true },
            })
          : null;
        if (SLA_HOURS[risk.grade] && activeConsent) {
          const raisedAt = new Date();
          await tx.riskQueue.create({
            data: {
              assessmentId: assessment.id,
              recipientId: recipient.id,
              ownerId: authorUserId,
              grade: risk.grade,
              raisedAt,
              dueAt: new Date(raisedAt.getTime() + SLA_HOURS[risk.grade] * 60 * 60 * 1000),
            },
          });
        }
      }

      // 방문 이력·대상자 집계 갱신 (기존 방문 기록 화면과의 정합)
      await tx.visit.create({
        data: {
          ownerId: authorUserId,
          recipientId: recipient.id,
          managerId: recipient.manager.id,
          visitDate: visitedAt,
          visitType: payload.type === 'call' ? 'call' : 'visit',
          summary: payload.summary || null,
          careLogId: careLog.id,
        },
      });
      await tx.recipient.update({
        where: { id: recipient.id },
        data: { visitCount: { increment: 1 }, lastVisitDate: visitedAt },
      });

      // 일정과 연결 (있으면 done 처리)
      if (payload.taskId) {
        await tx.task.updateMany({
          where: { id: payload.taskId, ownerId },
          data: { status: 'done', careLogId: careLog.id },
        });
      }

      return careLog;
    });

    return this.getCareLogById(ownerId, created.id);
  }

  async addFeedback(ownerId, careLogId, content, authorId, authorRole) {
    // 본인 소유 careLog 인지 확인
    const careLog = await this.prisma.careLog.findFirst({
      where: { id: careLogId, ownerId },
    });
    if (!careLog) {
      throw new Error('해당 돌봄 일지를 찾을 수 없거나 권한이 없습니다.');
    }

    const fb = await this.prisma.feedback.create({
      data: {
        careLogId,
        authorId,
        authorRole: authorRole || '담당자',
        content,
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    return {
      id: fb.id,
      careLogId: fb.careLogId,
      authorId: fb.author.id,
      authorName: fb.author.name,
      authorRole: fb.authorRole,
      content: fb.content,
      createdAt: fb.createdAt.toISOString(),
    };
  }
}

module.exports = { PrismaCareLogRepo };
