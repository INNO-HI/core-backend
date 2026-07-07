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
  async createManager(ownerId, data = {}) {
    if (!data.name || !String(data.name).trim()) {
      throw new Error('이름은 필수입니다.');
    }

    const centerId = await this._resolveCenterId(data.center || data.centerName);
    if (!centerId) {
      throw new Error('등록된 센터가 없어 매니저를 생성할 수 없습니다.');
    }

    const created = await this.prisma.manager.create({
      data: {
        ownerId,
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
