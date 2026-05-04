/**
 * PostgreSQL Manager Repository (Prisma) — ownerId 격리
 */

class PrismaManagerRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
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

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [approvedReports, pendingReports, rejectedReports, totalVisits, monthlyReportsCount] = await Promise.all([
      this.prisma.careLog.count({ where: { ownerId, managerId: id, status: 'approved' } }),
      this.prisma.careLog.count({ where: { ownerId, managerId: id, status: 'pending' } }),
      this.prisma.careLog.count({ where: { ownerId, managerId: id, status: 'rejected' } }),
      this.prisma.visit.count({ where: { ownerId, managerId: id } }),
      this.prisma.careLog.count({ where: { ownerId, managerId: id, createdAt: { gte: monthStart } } }),
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
        monthlyReports: monthlyReportsCount,
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

  async getManagerReports(ownerId, managerId, filters = {}) {
    const where = { ownerId, managerId };

    if (filters.status && filters.status !== 'all') where.status = filters.status;
    if (filters.dateStart) where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    if (filters.dateEnd) where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };

    const [allCount, pendingCount, approvedCount, rejectedCount] = await Promise.all([
      this.prisma.careLog.count({ where: { ownerId, managerId } }),
      this.prisma.careLog.count({ where: { ownerId, managerId, status: 'pending' } }),
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
}

module.exports = { PrismaManagerRepo };
