/**
 * PostgreSQL Audit Log Repository (Prisma)
 * BACKEND_DB_SPEC.md §3.10 감사
 *
 * 최소한 이 셋은 반드시 남긴다 — 동의 등록·철회, 위기 큐 확인 처리, 기록 생성·승인.
 * 감사 기록 실패가 본 요청을 막지 않도록 호출부에서 log() 는 실패를 삼킨다.
 */

class PrismaAuditRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /** 감사 기록 조회 (마스터 콘솔) — 행위자 이메일을 붙여 내려준다 */
  async list({ action, limit = 100 } = {}) {
    const where = {};
    if (action && action !== 'all') where.action = { startsWith: action };

    const items = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 100, 500),
    });

    const actorIds = [...new Set(items.map((i) => i.actorId).filter(Boolean))];
    const actors = actorIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, email: true, name: true },
        })
      : [];
    const actorOf = (id) => actors.find((a) => a.id === id) || null;

    return items.map((i) => ({
      id: i.id,
      action: i.action,
      actorId: i.actorId,
      actorEmail: actorOf(i.actorId)?.email || null,
      actorName: actorOf(i.actorId)?.name || null,
      targetType: i.targetType,
      targetId: i.targetId,
      payload: i.payload ?? null,
      ip: i.ip,
      createdAt: i.createdAt.toISOString(),
    }));
  }

  /** 전역 운영 현황 (마스터 콘솔 KPI) */
  async systemOverview() {
    const now = new Date();
    const [institutions, centers, users, recipients, careLogs, openRisk, overdueRisk, masters, institutionsRole, caregivers] =
      await Promise.all([
        this.prisma.institution.count(),
        this.prisma.center.count(),
        this.prisma.user.count(),
        this.prisma.recipient.count(),
        this.prisma.careLog.count(),
        this.prisma.riskQueue.count({ where: { acknowledgedAt: null } }),
        this.prisma.riskQueue.count({ where: { acknowledgedAt: null, dueAt: { lt: now } } }),
        this.prisma.user.count({ where: { role: { in: ['master', 'admin'] } } }),
        this.prisma.user.count({ where: { role: { in: ['institution', 'user'] } } }),
        this.prisma.user.count({ where: { role: 'caregiver' } }),
      ]);
    const recentAccounts = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    const instRows = await this.prisma.institution.findMany({
      select: { id: true, name: true, code: true, users: { select: { id: true } } },
    });
    const perInstitution = [];
    for (const inst of instRows) {
      const memberIds = inst.users.map((u) => u.id);
      const [rcp, mgr] = await Promise.all([
        this.prisma.recipient.count({ where: { ownerId: { in: memberIds } } }),
        this.prisma.manager.count({ where: { ownerId: { in: memberIds } } }),
      ]);
      perInstitution.push({
        id: inst.id, name: inst.name, code: inst.code,
        userCount: memberIds.length, recipientCount: rcp, managerCount: mgr,
      });
    }

    return {
      institutions,
      centers,
      users,
      usersByRole: { master: masters, institution: institutionsRole, caregiver: caregivers },
      recipients,
      careLogs,
      risk: { open: openRisk, overdue: overdueRisk },
      recentAccounts: recentAccounts.map((u) => ({
        id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt.toISOString(),
      })),
      perInstitution,
    };
  }

  async log({ ownerId, actorId, action, targetType, targetId, payload, ip }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          ownerId: ownerId || null,
          actorId: actorId || null,
          action,
          targetType: targetType || null,
          targetId: targetId || null,
          payload: payload ?? undefined,
          ip: ip || null,
        },
      });
    } catch (err) {
      // 감사 기록 실패는 본 동작을 막지 않는다 — 로그만 남긴다
      console.error('[audit] 기록 실패:', err.message);
    }
  }
}

module.exports = { PrismaAuditRepo };
