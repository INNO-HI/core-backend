/**
 * PostgreSQL Manager Repository (Prisma)
 *
 * 인메모리 InMemoryManagerRepo를 대체합니다.
 */

class PrismaManagerRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * 매니저 목록 조회 (필터)
   */
  async getManagers(filters) {
    const where = {};

    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.search) {
      where.name = { contains: filters.search, mode: 'insensitive' };
    }

    if (filters.dong && filters.dong !== 'all') {
      where.assignedDongs = {
        some: { dong: { name: filters.dong } },
      };
    }

    if (filters.center && filters.center !== 'all') {
      where.center = { name: filters.center };
    }

    // 상태별 카운트 (전체 기준)
    const [allCount, activeCount, leaveCount, retiredCount] = await Promise.all([
      this.prisma.manager.count(),
      this.prisma.manager.count({ where: { status: 'active' } }),
      this.prisma.manager.count({ where: { status: 'leave' } }),
      this.prisma.manager.count({ where: { status: 'retired' } }),
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
        assignedDongs: {
          include: { dong: { select: { name: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });

    return {
      managers: managers.map((m) => ({
        id: m.id,
        name: m.name,
        gender: m.gender,
        centerName: m.center.name,
        phone: m.phone || '',
        assignedDongs: m.assignedDongs.map((md) => md.dong.name),
        recipientCount: m.recipientCount,
        monthlyVisits: m.monthlyVisits,
        status: m.status,
      })),
      totalCount: managers.length,
      statusCounts,
    };
  }

  /**
   * 매니저 KPI
   */
  async getKPIs() {
    const [total, active, leave, retired] = await Promise.all([
      this.prisma.manager.count(),
      this.prisma.manager.count({ where: { status: 'active' } }),
      this.prisma.manager.count({ where: { status: 'leave' } }),
      this.prisma.manager.count({ where: { status: 'retired' } }),
    ]);
    return { total, active, leave, retired };
  }

  /**
   * 매니저 상세 조회
   */
  async getManagerById(id) {
    const m = await this.prisma.manager.findUnique({
      where: { id },
      include: {
        center: { select: { name: true } },
        assignedDongs: {
          include: { dong: { select: { name: true } } },
        },
        recipients: {
          take: 20,
          include: {
            dong: { select: { name: true } },
          },
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

    // 보고서 통계
    const [approvedReports, pendingReports, rejectedReports, totalVisits] = await Promise.all([
      this.prisma.careLog.count({ where: { managerId: id, status: 'approved' } }),
      this.prisma.careLog.count({ where: { managerId: id, status: 'pending' } }),
      this.prisma.careLog.count({ where: { managerId: id, status: 'rejected' } }),
      this.prisma.visit.count({ where: { managerId: id } }),
    ]);

    const totalReports = approvedReports + pendingReports + rejectedReports;
    const approvalRate = totalReports > 0 ? Math.round((approvedReports / totalReports) * 100) : 0;

    return {
      id: m.id,
      name: m.name,
      gender: m.gender,
      centerName: m.center.name,
      phone: m.phone || '',
      email: m.email || '',
      assignedDongs: m.assignedDongs.map((md) => md.dong.name),
      recipientCount: m.recipientCount,
      monthlyVisits: m.monthlyVisits,
      status: m.status,
      startDate: m.startDate ? m.startDate.toISOString().split('T')[0] : null,
      stats: {
        monthlyVisits: m.monthlyVisits,
        monthlyReports: Math.floor(m.monthlyVisits * 0.9),
        approvalRate,
        totalRecipients: m.recipientCount,
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

  /**
   * 매니저별 보고서 목록 (전체)
   */
  async getManagerReports(managerId, filters = {}) {
    const where = { managerId };

    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.dateStart) {
      where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    }
    if (filters.dateEnd) {
      where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };
    }

    const [allCount, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      this.prisma.careLog.count({ where: { managerId } }),
      this.prisma.careLog.count({ where: { managerId, status: 'pending' } }),
      this.prisma.careLog.count({ where: { managerId, status: 'approved' } }),
      this.prisma.careLog.count({ where: { managerId, status: 'rejected' } }),
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

  /**
   * 매니저별 방문 기록 목록 (전체)
   */
  async getManagerVisits(managerId, filters = {}) {
    const where = { managerId };

    if (filters.visitType && filters.visitType !== 'all') {
      // DB에서 visit/call → 프론트 regular/emergency/call 매핑
      if (filters.visitType === 'regular') {
        where.visitType = 'visit';
      } else {
        where.visitType = filters.visitType;
      }
    }

    if (filters.search) {
      where.recipient = { name: { contains: filters.search, mode: 'insensitive' } };
    }

    if (filters.dateStart) {
      where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    }
    if (filters.dateEnd) {
      where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };
    }

    const allVisits = await this.prisma.visit.findMany({ where: { managerId } });
    const regularCount = allVisits.filter((v) => v.visitType === 'visit').length;
    const callCount = allVisits.filter((v) => v.visitType === 'call').length;
    const emergencyCount = 0; // emergency type은 careLog에만 있음

    const visits = await this.prisma.visit.findMany({
      where,
      include: { recipient: { select: { name: true } } },
      orderBy: { visitDate: 'desc' },
    });

    return {
      visits: visits.map((v) => ({
        id: v.id,
        recipientId: v.recipientId,
        recipientName: v.recipient.name,
        visitDate: v.visitDate.toISOString(),
        visitType: v.visitType === 'visit' ? 'regular' : v.visitType,
        result: v.summary || '방문 완료',
      })),
      totalCount: visits.length,
      typeCounts: { all: allVisits.length, regular: regularCount, emergency: emergencyCount, call: callCount },
    };
  }
}

module.exports = { PrismaManagerRepo };
