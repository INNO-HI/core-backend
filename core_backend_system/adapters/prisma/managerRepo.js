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
          select: { id: true, name: true, status: true },
          take: 20,
        },
        careLogs: {
          select: { id: true, status: true, visitDate: true, recipientId: true },
          orderBy: { visitDate: 'desc' },
          take: 10,
          include: { recipient: { select: { name: true } } },
        },
        visits: {
          select: { id: true, visitDate: true, visitType: true, summary: true, recipientId: true },
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
        recipientName: cl.recipient.name,
        visitDate: cl.visitDate.toISOString(),
        status: cl.status,
      })),
      recentVisits: m.visits.map((v) => ({
        id: v.id,
        recipientName: v.recipient.name,
        visitDate: v.visitDate.toISOString(),
        visitType: v.visitType,
        summary: v.summary || '',
      })),
      totalVisits,
      reportCounts: { approved: approvedReports, pending: pendingReports, rejected: rejectedReports },
      assignedRecipients: m.recipients.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
      })),
      monthlyActivities: [],
    };
  }
}

module.exports = { PrismaManagerRepo };
