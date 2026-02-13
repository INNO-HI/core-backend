/**
 * PostgreSQL Recipient Repository (Prisma)
 *
 * 인메모리 InMemoryRecipientRepo를 대체합니다.
 */

class PrismaRecipientRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * 대상자 목록 조회 (필터)
   */
  async getRecipients(filters) {
    const where = {};

    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.search) {
      const s = filters.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { address: { contains: s, mode: 'insensitive' } },
        { dong: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (filters.dong && filters.dong !== 'all') {
      where.dong = { name: filters.dong };
    }

    if (filters.manager && filters.manager !== 'all') {
      where.manager = { name: filters.manager };
    }

    // 상태별 카운트 (전체 기준)
    const [allCount, normalCount, cautionCount, urgentCount, unvisitedCount] = await Promise.all([
      this.prisma.recipient.count(),
      this.prisma.recipient.count({ where: { status: 'normal' } }),
      this.prisma.recipient.count({ where: { status: 'caution' } }),
      this.prisma.recipient.count({ where: { status: 'urgent' } }),
      this.prisma.recipient.count({ where: { status: 'unvisited' } }),
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

  /**
   * 대상자 KPI
   */
  async getKPIs() {
    const [total, normal, caution, urgent, unvisited] = await Promise.all([
      this.prisma.recipient.count(),
      this.prisma.recipient.count({ where: { status: 'normal' } }),
      this.prisma.recipient.count({ where: { status: 'caution' } }),
      this.prisma.recipient.count({ where: { status: 'urgent' } }),
      this.prisma.recipient.count({ where: { status: 'unvisited' } }),
    ]);
    return { total, normal, caution, urgent, unvisited };
  }

  /**
   * 대상자 상세 조회
   */
  async getRecipientById(id) {
    const r = await this.prisma.recipient.findUnique({
      where: { id },
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

    // 월별 방문 통계 (최근 6개월)
    const monthlyVisits = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const count = await this.prisma.visit.count({
        where: {
          recipientId: id,
          visitDate: { gte: monthDate, lt: nextMonth },
        },
      });
      const monthName = `${monthDate.getMonth() + 1}월`;
      monthlyVisits.push({ month: monthName, count });
    }

    // 긴급 이력 횟수
    const urgentHistory = await this.prisma.careLog.count({
      where: { recipientId: id, status: 'urgent' },
    });

    // 총 보고서 수
    const totalReports = await this.prisma.careLog.count({
      where: { recipientId: id },
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
}

module.exports = { PrismaRecipientRepo };
