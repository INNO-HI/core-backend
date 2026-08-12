/**
 * PostgreSQL Manager Repository (Prisma) — ownerId 격리
 */

/**
 * 아직 결재가 끝나지 않은 일지 상태들.
 *
 * 앱은 일지를 `submitted` 로 올리는데(careLogRepo.createCareLog 기본값) 실무자 화면은
 * approved/pending/rejected 세 칸만 그린다. pending 만 세면 앱이 올린 일지가
 * "0건"으로 사라져, 같은 화면의 최근 보고서 목록과 숫자가 어긋난다.
 */
const PENDING_CARELOG_STATUSES = ['draft', 'submitted', 'in_review', 'pending', 'urgent'];

/** 이번 달 [시작, 다음 달 시작) 범위 — 월 방문 집계 기준 */
function currentMonthRange() {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

class PrismaManagerRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /** 매니저 id 배열 → 이번 달 방문 수 Map */
  async _monthlyVisitCounts(managerIds) {
    if (!managerIds.length) return new Map();
    const { start, end } = currentMonthRange();
    const groups = await this.prisma.visit.groupBy({
      by: ['managerId'],
      where: { managerId: { in: managerIds }, visitDate: { gte: start, lt: end } },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.managerId, g._count._all]));
  }

  async getManagers(ownerId, filters) {
    const where = { ownerId };

    if (filters.status && filters.status !== 'all') where.status = filters.status;
    if (filters.search) where.name = { contains: filters.search, mode: 'insensitive' };
    if (filters.dong && filters.dong !== 'all') {
      where.assignedDongs = { some: { dong: { name: filters.dong } } };
    }
    if (filters.center && filters.center !== 'all') {
      where.center = { name: filters.center };
    }

    const [allCount, activeCount, leaveCount, retiredCount] = await Promise.all([
      this.prisma.manager.count({ where: { ownerId } }),
      this.prisma.manager.count({ where: { ownerId, status: 'active' } }),
      this.prisma.manager.count({ where: { ownerId, status: 'leave' } }),
      this.prisma.manager.count({ where: { ownerId, status: 'retired' } }),
    ]);

    const statusCounts = {
      all: allCount,
      active: activeCount,
      leave: leaveCount,
      retired: retiredCount,
    };

    const managers = await this.prisma.manager.findMany({
      where,
      include: {
        center: { select: { name: true } },
        assignedDongs: { include: { dong: { select: { name: true } } } },
        // 담당 대상자 수는 실제 배정 관계를 센다.
        // manager.recipientCount 컬럼은 배정 시 갱신되지 않아 항상 0으로 남았다.
        _count: { select: { recipients: true } },
      },
      orderBy: { name: 'asc' },
    });

    // 이번 달 방문 수도 같은 이유로 실집계 — 매니저별 한 번의 groupBy 로 끝낸다
    const monthlyVisitMap = await this._monthlyVisitCounts(managers.map((m) => m.id));

    return {
      managers: managers.map((m) => ({
        id: m.id,
        name: m.name,
        gender: m.gender,
        centerName: m.center?.name || '',
        phone: m.phone || '',
        assignedDongs: m.assignedDongs.map((md) => md.dong.name),
        recipientCount: m._count.recipients,
        monthlyVisits: monthlyVisitMap.get(m.id) || 0,
        status: m.status,
        linkedUser: Boolean(m.userId), // 앱 실무자 계정 연결 여부
      })),
      totalCount: managers.length,
      statusCounts,
    };
  }

  async getKPIs(ownerId) {
    const [total, active, leave, retired] = await Promise.all([
      this.prisma.manager.count({ where: { ownerId } }),
      this.prisma.manager.count({ where: { ownerId, status: 'active' } }),
      this.prisma.manager.count({ where: { ownerId, status: 'leave' } }),
      this.prisma.manager.count({ where: { ownerId, status: 'retired' } }),
    ]);
    return { total, active, leave, retired };
  }

  async getManagerById(ownerId, id) {
    const m = await this.prisma.manager.findFirst({
      where: { id, ownerId },
      include: {
        center: { select: { name: true } },
        assignedDongs: { include: { dong: { select: { name: true } } } },
        recipients: {
          take: 20,
          include: { dong: { select: { name: true } } },
        },
        careLogs: {
          orderBy: { visitDate: 'desc' },
          take: 10,
          include: { recipient: { select: { name: true } } },
        },
        visits: {
          orderBy: { visitDate: 'desc' },
          take: 10,
          include: { recipient: { select: { name: true } } },
        },
      },
    });

    if (!m) return null;

    const { start: monthStart, end: monthEnd } = currentMonthRange();

    const [
      approvedReports,
      pendingReports,
      rejectedReports,
      totalVisits,
      monthlyReportsCount,
      recipientCount,
      monthlyVisits,
    ] = await Promise.all([
      this.prisma.careLog.count({ where: { ownerId, managerId: id, status: 'approved' } }),
      this.prisma.careLog.count({ where: { ownerId, managerId: id, status: { in: PENDING_CARELOG_STATUSES } } }),
      this.prisma.careLog.count({ where: { ownerId, managerId: id, status: 'rejected' } }),
      this.prisma.visit.count({ where: { ownerId, managerId: id } }),
      this.prisma.careLog.count({ where: { ownerId, managerId: id, createdAt: { gte: monthStart } } }),
      // 저장 컬럼(recipientCount/monthlyVisits)은 배정 때 갱신되지 않는다.
      // 아래 assignedRecipients 목록과 같은 기준(배정 관계)으로 세야 KPI 와 목록이 어긋나지 않는다.
      this.prisma.recipient.count({ where: { managerId: id } }),
      this.prisma.visit.count({ where: { managerId: id, visitDate: { gte: monthStart, lt: monthEnd } } }),
    ]);

    // 승인율은 "결재가 끝난 것 중 승인 비율"이다. 미결까지 분모에 넣으면
    // 검토가 밀렸을 뿐인데 실무자 승인율이 떨어진다 (프론트 care-logs.ts 도 같은 규칙).
    const decidedReports = approvedReports + rejectedReports;
    const approvalRate = decidedReports > 0 ? Math.round((approvedReports / decidedReports) * 100) : 0;

    return {
      id: m.id,
      name: m.name,
      gender: m.gender,
      centerName: m.center?.name || '',
      phone: m.phone || '',
      email: m.email || '',
      assignedDongs: m.assignedDongs.map((md) => md.dong.name),
      recipientCount,
      monthlyVisits,
      status: m.status,
      startDate: m.startDate ? m.startDate.toISOString().split('T')[0] : null,
      stats: {
        monthlyVisits,
        monthlyReports: monthlyReportsCount,
        approvalRate,
        totalRecipients: recipientCount,
      },
      recentReports: m.careLogs.map((cl) => ({
        id: cl.id,
        recipientId: cl.recipientId,
        recipientName: cl.recipient.name,
        visitDate: cl.visitDate.toISOString(),
        registeredAt: cl.createdAt.toISOString(),
        status: cl.status,
      })),
      recentVisits: m.visits.map((v) => ({
        id: v.id,
        recipientId: v.recipientId,
        recipientName: v.recipient.name,
        visitDate: v.visitDate.toISOString(),
        visitType: v.visitType === 'visit' ? 'regular' : v.visitType,
        result: v.summary || '방문 완료',
      })),
      totalVisits,
      reportCounts: { approved: approvedReports, pending: pendingReports, rejected: rejectedReports },
      assignedRecipients: m.recipients.map((r) => ({
        id: r.id,
        name: r.name,
        gender: r.gender,
        dong: r.dong?.name || '',
        careStartDate: r.careStartDate ? r.careStartDate.toISOString().split('T')[0] : null,
        lastVisitDate: r.lastVisitDate ? r.lastVisitDate.toISOString() : null,
        isUrgent: r.status === 'urgent',
      })),
      monthlyActivities: [],
    };
  }

  async getManagerReports(ownerId, managerId, filters = {}) {
    const where = { ownerId, managerId };

    // '대기' 탭은 결재 전 상태를 모두 포함한다 — 카운트와 목록이 같은 기준이어야 한다
    if (filters.status && filters.status !== 'all') {
      where.status = filters.status === 'pending' ? { in: PENDING_CARELOG_STATUSES } : filters.status;
    }
    if (filters.dateStart) where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    if (filters.dateEnd) where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };

    const [allCount, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      this.prisma.careLog.count({ where: { ownerId, managerId } }),
      this.prisma.careLog.count({ where: { ownerId, managerId, status: { in: PENDING_CARELOG_STATUSES } } }),
      this.prisma.careLog.count({ where: { ownerId, managerId, status: 'approved' } }),
      this.prisma.careLog.count({ where: { ownerId, managerId, status: 'rejected' } }),
    ]);

    const logs = await this.prisma.careLog.findMany({
      where,
      include: { recipient: { select: { name: true } } },
      orderBy: { visitDate: 'desc' },
    });

    return {
      reports: logs.map((cl) => ({
        id: cl.id,
        recipientId: cl.recipientId,
        recipientName: cl.recipient.name,
        visitDate: cl.visitDate.toISOString(),
        registeredAt: cl.createdAt.toISOString(),
        status: cl.status,
      })),
      totalCount: logs.length,
      statusCounts: { all: allCount, pending: pendingCount, approved: approvedCount, rejected: rejectedCount },
    };
  }

  async getManagerVisits(ownerId, managerId, filters = {}) {
    const where = { ownerId, managerId };

    if (filters.visitType && filters.visitType !== 'all') {
      if (filters.visitType === 'regular') where.visitType = 'visit';
      else where.visitType = filters.visitType;
    }

    if (filters.search) {
      where.recipient = { name: { contains: filters.search, mode: 'insensitive' } };
    }

    if (filters.dateStart) where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    if (filters.dateEnd) where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };

    const allVisits = await this.prisma.visit.findMany({ where: { ownerId, managerId } });
    const regularCount = allVisits.filter((v) => v.visitType === 'visit').length;
    const callCount = allVisits.filter((v) => v.visitType === 'call').length;
    const emergencyCount = 0;

    const visits = await this.prisma.visit.findMany({
      where,
      include: {
        recipient: {
          select: { name: true, phone: true, address: true, status: true },
        },
      },
      orderBy: { visitDate: 'desc' },
    });

    return {
      visits: visits.map((v) => ({
        id: v.id,
        recipientId: v.recipientId,
        recipientName: v.recipient.name,
        recipientPhone: v.recipient.phone || '',
        recipientAddress: v.recipient.address || '',
        recipientStatus: v.recipient.status || 'normal',
        visitDate: v.visitDate.toISOString(),
        visitType: v.visitType === 'visit' ? 'regular' : v.visitType,
        result: v.summary || '방문 완료',
      })),
      totalCount: visits.length,
      typeCounts: { all: allVisits.length, regular: regularCount, emergency: emergencyCount, call: callCount },
    };
  }

  /** 센터 이름 → id. 못 찾으면 첫 센터로 fallback (centerId 는 필수) */
  async _resolveCenterId(name) {
    if (name) {
      const c = await this.prisma.center.findFirst({ where: { name } });
      if (c) return c.id;
    }
    const first = await this.prisma.center.findFirst();
    return first?.id || null;
  }

  /** 매니저 담당 동 연결 재설정 (동 이름 배열) */
  async _setAssignedDongs(managerId, dongNames = []) {
    await this.prisma.managerDong.deleteMany({ where: { managerId } });
    if (!Array.isArray(dongNames) || dongNames.length === 0) return;
    const dongs = await this.prisma.dong.findMany({ where: { name: { in: dongNames } }, select: { id: true } });
    for (const d of dongs) {
      await this.prisma.managerDong.create({ data: { managerId, dongId: d.id } });
    }
  }

  /** 매니저 생성 */
  async createManager(ownerId, data = {}, writerId) {
    if (!data.name || !String(data.name).trim()) {
      throw new Error('이름은 필수입니다.');
    }

    // 센터는 선택 — 기관 코드 도입 후 센터 없는 기관도 실무자를 등록한다
    let centerId = await this._resolveCenterId(data.center || data.centerName);

    // 기관 = 센터: 센터를 지정하지 않으면 소유 계정의 기관 센터를 자동 배정한다
    if (!centerId && writerId) {
      const ownerUser = await this.prisma.user.findUnique({
        where: { id: writerId },
        select: { institution: { select: { name: true } } },
      });
      if (ownerUser?.institution?.name) {
        const c = await this.prisma.center.findUnique({ where: { name: ownerUser.institution.name } });
        centerId = c?.id || null;
      }
    }

    const created = await this.prisma.manager.create({
      data: {
        ownerId: writerId || (typeof ownerId === 'string' ? ownerId : undefined),
        name: String(data.name).trim(),
        gender: data.gender === 'male' ? 'male' : 'female',
        phone: data.phone || null,
        email: data.email || null,
        status: data.status || 'active',
        centerId,
        startDate: data.startDate ? new Date(data.startDate) : null,
        recipientCount: 0,
        monthlyVisits: 0,
      },
    });

    await this._setAssignedDongs(created.id, data.assignedDongs);
    return this.getManagerById(ownerId, created.id);
  }

  /** 매니저 수정 */
  /** 담당 대상자 일괄 재배정 (퇴직 인수인계) */
  async reassignRecipients(ownerId, fromManagerId, toManagerId) {
    const [from, to] = await Promise.all([
      this.prisma.manager.findFirst({ where: { id: fromManagerId, ownerId }, select: { id: true } }),
      this.prisma.manager.findFirst({ where: { id: toManagerId, ownerId }, select: { id: true } }),
    ]);
    if (!from || !to) throw new Error('실무자를 찾을 수 없거나 권한이 없습니다.');
    const result = await this.prisma.recipient.updateMany({
      where: { managerId: fromManagerId },
      data: { managerId: toManagerId },
    });
    await Promise.all([
      this.prisma.manager.update({ where: { id: fromManagerId }, data: { recipientCount: 0 } }).catch(() => null),
      this.prisma.manager.update({ where: { id: toManagerId }, data: { recipientCount: { increment: result.count } } }).catch(() => null),
    ]);
    return { success: true, moved: result.count };
  }

  async updateManager(ownerId, id, data = {}) {
    const existing = await this.prisma.manager.findFirst({ where: { id, ownerId } });
    if (!existing) return null;

    const patch = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.gender !== undefined) patch.gender = data.gender === 'male' ? 'male' : 'female';
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.email !== undefined) patch.email = data.email || null;
    if (data.status !== undefined) patch.status = data.status;
    if (data.startDate !== undefined) patch.startDate = data.startDate ? new Date(data.startDate) : null;
    if (data.center !== undefined || data.centerName !== undefined) {
      patch.centerId = await this._resolveCenterId(data.center || data.centerName);
    }

    await this.prisma.manager.update({ where: { id }, data: patch });
    if (data.assignedDongs !== undefined) {
      await this._setAssignedDongs(id, data.assignedDongs);
    }

    return this.getManagerById(ownerId, id);
  }

  /** 매니저 삭제 (담당 대상자는 담당자 해제, 일지/방문 cascade) */
  async deleteManager(ownerId, id) {
    const existing = await this.prisma.manager.findFirst({ where: { id, ownerId } });
    if (!existing) return { success: false, notFound: true };
    await this.prisma.manager.delete({ where: { id } });
    return { success: true };
  }
}

module.exports = { PrismaManagerRepo };
