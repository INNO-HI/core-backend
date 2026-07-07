/**
 * PostgreSQL Recipient Repository (Prisma) — ownerId 격리
 */

class PrismaRecipientRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async getRecipients(ownerId, filters) {
    const where = { ownerId };

    if (filters.status && filters.status !== 'all') where.status = filters.status;

    if (filters.search) {
      const s = filters.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { address: { contains: s, mode: 'insensitive' } },
        { dong: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (filters.dong && filters.dong !== 'all') where.dong = { name: filters.dong };
    if (filters.manager && filters.manager !== 'all') where.manager = { name: filters.manager };

    const [allCount, normalCount, cautionCount, urgentCount, unvisitedCount] = await Promise.all([
      this.prisma.recipient.count({ where: { ownerId } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'normal' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'caution' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'urgent' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'unvisited' } }),
    ]);

    const statusCounts = {
      all: allCount,
      normal: normalCount,
      caution: cautionCount,
      urgent: urgentCount,
      unvisited: unvisitedCount,
    };

    const recipients = await this.prisma.recipient.findMany({
      where,
      include: {
        dong: { select: { name: true } },
        manager: { select: { name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      recipients: recipients.map((r) => ({
        id: r.id,
        name: r.name,
        age: r.age,
        gender: r.gender,
        dong: r.dong?.name || '',
        address: r.address || '',
        managerName: r.manager?.name || '',
        lastVisitDate: r.lastVisitDate ? r.lastVisitDate.toISOString() : null,
        visitCount: r.visitCount,
        status: r.status,
      })),
      totalCount: recipients.length,
      statusCounts,
    };
  }

  async getKPIs(ownerId) {
    const [total, normal, caution, urgent, unvisited] = await Promise.all([
      this.prisma.recipient.count({ where: { ownerId } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'normal' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'caution' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'urgent' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'unvisited' } }),
    ]);
    return { total, normal, caution, urgent, unvisited };
  }

  async getRecipientById(ownerId, id) {
    const r = await this.prisma.recipient.findFirst({
      where: { id, ownerId },
      include: {
        dong: { select: { name: true } },
        manager: { select: { id: true, name: true, phone: true, center: { select: { name: true } } } },
        memos: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        visits: {
          orderBy: { visitDate: 'desc' },
          take: 10,
          include: { manager: { select: { name: true } } },
        },
        policyRecommendations: {
          include: { policy: true },
          orderBy: { matchScore: 'desc' },
        },
      },
    });

    if (!r) return null;

    const now = new Date();
    const monthPromises = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthName = `${monthDate.getMonth() + 1}월`;
      monthPromises.push(
        this.prisma.visit
          .count({
            where: {
              ownerId,
              recipientId: id,
              visitDate: { gte: monthDate, lt: nextMonth },
            },
          })
          .then((count) => ({ month: monthName, count }))
      );
    }
    const monthlyVisits = await Promise.all(monthPromises);

    const urgentHistory = await this.prisma.careLog.count({
      where: { ownerId, recipientId: id, status: 'urgent' },
    });

    const totalReports = await this.prisma.careLog.count({
      where: { ownerId, recipientId: id },
    });

    return {
      id: r.id,
      name: r.name,
      age: r.age,
      gender: r.gender,
      status: r.status,
      basicInfo: {
        address: r.address || '',
        dong: r.dong?.name || '',
        phone: r.phone || '',
        emergencyContact: r.emergencyContact || null,
      },
      manager: r.manager
        ? {
            id: r.manager.id,
            name: r.manager.name,
            phone: r.manager.phone || '',
            centerName: r.manager.center?.name || '',
          }
        : null,
      healthInfo: r.healthInfo || null,
      recentVisits: r.visits.map((v) => ({
        id: v.id,
        careLogId: v.careLogId || '',
        visitDate: v.visitDate.toISOString(),
        visitType: v.visitType,
        managerName: v.manager.name,
        summary: v.summary || '',
      })),
      careStartDate: r.careStartDate ? r.careStartDate.toISOString().split('T')[0] : null,
      kpi: {
        monthlyVisits: monthlyVisits.length > 0 ? monthlyVisits[monthlyVisits.length - 1].count : 0,
        totalVisits: r.visitCount,
        totalReports,
        urgentHistory,
      },
      memos: r.memos.map((m) => ({
        id: m.id,
        recipientId: m.recipientId,
        authorId: m.author.id,
        authorName: m.author.name,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        type: m.type || 'normal',
      })),
      monthlyVisits,
      policyRecommendations: r.policyRecommendations.map((rp) => ({
        id: rp.policy.id,
        name: rp.policy.name,
        description: rp.policy.summary || '',
        matchScore: rp.matchScore,
        icon: 'health',
        badge: rp.matchScore >= 90 ? '적합' : '추천',
      })),
    };
  }

  /** 동 이름 → id (전역 reference) */
  async _resolveDongId(name) {
    if (!name || name === 'all') return null;
    const d = await this.prisma.dong.findFirst({ where: { name } });
    return d?.id || null;
  }

  /** 매니저 이름 → id (계정별) */
  async _resolveManagerId(ownerId, name) {
    if (!name || name === 'all') return null;
    const m = await this.prisma.manager.findFirst({ where: { ownerId, name } });
    return m?.id || null;
  }

  /** 대상자 생성 */
  async createRecipient(ownerId, data = {}) {
    if (!data.name || !String(data.name).trim()) {
      throw new Error('이름은 필수입니다.');
    }

    const [dongId, managerId] = await Promise.all([
      this._resolveDongId(data.dong),
      this._resolveManagerId(ownerId, data.managerName || data.manager),
    ]);

    const created = await this.prisma.recipient.create({
      data: {
        ownerId,
        name: String(data.name).trim(),
        age: Number(data.age) || 0,
        gender: data.gender === 'male' ? 'male' : 'female',
        status: data.status || 'normal',
        address: data.address || null,
        phone: data.phone || null,
        dongId,
        managerId,
        careStartDate: data.careStartDate ? new Date(data.careStartDate) : null,
        healthInfo: data.healthInfo ?? null,
        emergencyContact: data.emergencyContact ?? null,
      },
    });

    return this.getRecipientById(ownerId, created.id);
  }

  /** 대상자 수정 */
  async updateRecipient(ownerId, id, data = {}) {
    const existing = await this.prisma.recipient.findFirst({ where: { id, ownerId } });
    if (!existing) return null;

    const patch = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.age !== undefined) patch.age = Number(data.age) || 0;
    if (data.gender !== undefined) patch.gender = data.gender === 'male' ? 'male' : 'female';
    if (data.status !== undefined) patch.status = data.status;
    if (data.address !== undefined) patch.address = data.address || null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.careStartDate !== undefined) {
      patch.careStartDate = data.careStartDate ? new Date(data.careStartDate) : null;
    }
    if (data.healthInfo !== undefined) patch.healthInfo = data.healthInfo;
    if (data.emergencyContact !== undefined) patch.emergencyContact = data.emergencyContact;
    if (data.dong !== undefined) patch.dongId = await this._resolveDongId(data.dong);
    if (data.managerName !== undefined || data.manager !== undefined) {
      patch.managerId = await this._resolveManagerId(ownerId, data.managerName || data.manager);
    }

    await this.prisma.recipient.update({ where: { id }, data: patch });
    return this.getRecipientById(ownerId, id);
  }

  /** 대상자 삭제 (연결된 일지/방문/메모/정책추천 cascade) */
  async deleteRecipient(ownerId, id) {
    const existing = await this.prisma.recipient.findFirst({ where: { id, ownerId } });
    if (!existing) return { success: false, notFound: true };
    await this.prisma.recipient.delete({ where: { id } });
    return { success: true };
  }
}

module.exports = { PrismaRecipientRepo };
