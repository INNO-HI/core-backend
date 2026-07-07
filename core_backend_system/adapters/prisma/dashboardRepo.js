/**
 * PostgreSQL Dashboard Repository (Prisma)
 *
 * 모든 계정별 메서드에 ownerId 가 필수. 호출자(router)가 req.user.id 를 넘긴다.
 * WelfareNews/Notice 는 전역 reference data (ownerId 없음).
 */

class PrismaDashboardRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * 대시보드 KPI 조회 (계정별, 실시간 계산)
   */
  async getKPI(ownerId) {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      todayVisits,
      yesterdayVisits,
      pendingCount,
      newPendingToday,
      approvedTotal,
      approvedThisMonth,
      totalRecipients,
      newRecipientsThisMonth,
    ] = await Promise.all([
      this.prisma.visit.count({
        where: { ownerId, visitDate: { gte: todayStart, lt: tomorrowStart } },
      }),
      this.prisma.visit.count({
        where: { ownerId, visitDate: { gte: yesterdayStart, lt: todayStart } },
      }),
      this.prisma.careLog.count({
        where: { ownerId, status: { in: ['pending', 'urgent'] } },
      }),
      this.prisma.careLog.count({
        where: { ownerId, status: { in: ['pending', 'urgent'] }, createdAt: { gte: todayStart } },
      }),
      this.prisma.careLog.count({ where: { ownerId, status: 'approved' } }),
      this.prisma.careLog.count({
        where: { ownerId, status: 'approved', updatedAt: { gte: monthStart } },
      }),
      this.prisma.recipient.count({ where: { ownerId } }),
      this.prisma.recipient.count({ where: { ownerId, createdAt: { gte: monthStart } } }),
    ]);

    const visitDelta = todayVisits - yesterdayVisits;
    const total = approvedTotal + pendingCount;

    return {
      todayVisits: {
        title: '오늘 방문',
        value: todayVisits,
        change: Math.abs(visitDelta),
        changeDirection: visitDelta > 0 ? 'up' : visitDelta < 0 ? 'down' : 'none',
        progressColor: 'blue',
        progressPercent:
          yesterdayVisits > 0
            ? Math.min(Math.round((todayVisits / yesterdayVisits) * 100), 100)
            : todayVisits > 0
            ? 100
            : 0,
      },
      pendingReports: {
        title: '대기 중 보고서',
        value: pendingCount,
        change: newPendingToday,
        changeDirection: newPendingToday > 0 ? 'up' : 'none',
        progressColor: 'yellow',
        progressPercent: total > 0 ? Math.round((pendingCount / total) * 100) : 0,
      },
      approvedCount: {
        title: '승인 완료',
        value: approvedTotal,
        change: approvedThisMonth,
        changeDirection: approvedThisMonth > 0 ? 'up' : 'none',
        progressColor: 'green',
        progressPercent: total > 0 ? Math.round((approvedTotal / total) * 100) : 0,
      },
      totalRecipients: {
        title: '담당 대상자',
        value: totalRecipients,
        change: newRecipientsThisMonth,
        changeDirection: newRecipientsThisMonth > 0 ? 'up' : 'none',
        progressColor: 'purple',
        progressPercent: 100,
      },
    };
  }

  async getRecentReports(ownerId, limit = 5) {
    const logs = await this.prisma.careLog.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        recipient: { select: { name: true } },
        manager: { select: { name: true } },
      },
    });

    return logs.map((l) => ({
      id: l.id,
      recipientName: l.recipient.name,
      managerName: l.manager.name,
      registeredAt: l.createdAt.toISOString(),
      status: l.status,
      isUrgent: l.status === 'urgent',
    }));
  }

  async getNotifications(ownerId, limit = 4) {
    const notifs = await this.prisma.notification.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return notifs.map((n) => {
      const isReport =
        /report|보고서|리포트/i.test(`${n.title} ${n.content}`) ||
        String(n.link || '').includes('/care-logs');
      return {
        id: n.id,
        title: n.title,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
        isUrgent: n.isUrgent,
        link: n.link,
        icon: n.icon,
        category: isReport ? 'report' : 'care',
      };
    });
  }

  /**
   * 복지 뉴스 (전역 reference data — DB에서 조회)
   */
  async getWelfareNews(_ownerId, limit = 10) {
    const items = await this.prisma.welfareNews.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return items.map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      tag: item.tag || null,
      date: item.date,
    }));
  }

  async getTasks(ownerId, limit = 10) {
    const logs = await this.prisma.careLog.findMany({
      where: { ownerId, status: { in: ['urgent', 'pending'] } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: limit,
      include: {
        recipient: { select: { name: true } },
        manager: { select: { name: true } },
      },
    });

    return logs.map((log) => ({
      id: log.id,
      title: `${log.recipient.name} 대상자 돌봄 보고`,
      meta: `${log.manager.name} 매니저 · ${log.visitDate.toISOString().split('T')[0]}`,
      badge: log.status === 'urgent' ? '긴급' : '처리 중',
      badgeColor: log.status === 'urgent' ? '#EF4444' : '#D97706',
      badgeBg: log.status === 'urgent' ? '#FEE2E2' : '#FEF3C7',
    }));
  }

  /**
   * 공지사항 (전역 reference data — DB에서 조회)
   */
  async getNotices(_ownerId, limit = 10) {
    const items = await this.prisma.notice.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return items.map((item) => ({
      id: item.id,
      title: item.title,
      date: item.date,
      isNew: item.isNew,
    }));
  }

  /**
   * 필터 드롭다운 옵션 (실 데이터 기준)
   * 동/센터는 전역 reference, 매니저는 계정별.
   */
  async getFilterOptions(ownerId) {
    const [dongs, centers, managers] = await Promise.all([
      this.prisma.dong.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
      this.prisma.center.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
      this.prisma.manager.findMany({ where: { ownerId }, orderBy: { name: 'asc' }, select: { name: true } }),
    ]);

    return {
      dongs: dongs.map((d) => d.name),
      centers: centers.map((c) => c.name),
      managers: [...new Set(managers.map((m) => m.name))],
    };
  }
}

module.exports = { PrismaDashboardRepo };
