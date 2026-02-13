/**
 * PostgreSQL Dashboard Repository (Prisma)
 *
 * 인메모리 InMemoryDashboardRepo를 대체합니다.
 * 동일한 메서드 시그니처를 유지하므로 Router 변경 없이 교체 가능.
 */

class PrismaDashboardRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * 대시보드 KPI 조회
   * 오늘 날짜 스냅샷이 없으면 실시간 집계 fallback
   */
  async getKPI() {
    const today = new Date(new Date().toISOString().split('T')[0]);

    // 오늘의 KPI 스냅샷 조회
    let kpi = await this.prisma.dashboardKPI.findUnique({
      where: { date: today },
    });

    if (!kpi) {
      // 스냅샷이 없으면 실시간 집계
      const todayStart = new Date(today);
      const todayEnd = new Date(today);
      todayEnd.setDate(todayEnd.getDate() + 1);

      const [todayVisits, pendingReports, approvedCount, totalRecipients] = await Promise.all([
        this.prisma.visit.count({
          where: { visitDate: { gte: todayStart, lt: todayEnd } },
        }),
        this.prisma.careLog.count({
          where: { status: 'pending' },
        }),
        this.prisma.careLog.count({
          where: { status: 'approved' },
        }),
        this.prisma.recipient.count(),
      ]);

      kpi = { todayVisits, pendingReports, approvedCount, totalRecipients };
    }

    return {
      todayVisits: {
        title: '오늘 방문',
        value: kpi.todayVisits,
        change: 3,
        changeDirection: 'up',
        progressColor: 'blue',
        progressPercent: 75,
      },
      pendingReports: {
        title: '대기 중 보고서',
        value: kpi.pendingReports,
        change: -2,
        changeDirection: 'down',
        progressColor: 'yellow',
        progressPercent: 30,
      },
      approvedCount: {
        title: '승인 완료',
        value: kpi.approvedCount,
        change: 8,
        changeDirection: 'up',
        progressColor: 'green',
        progressPercent: 90,
      },
      totalRecipients: {
        title: '담당 대상자',
        value: kpi.totalRecipients,
        change: 0,
        changeDirection: 'none',
        progressColor: 'purple',
        progressPercent: 100,
      },
    };
  }

  /**
   * 최근 보고서 목록
   */
  async getRecentReports(limit = 5) {
    const logs = await this.prisma.careLog.findMany({
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

  /**
   * 알림 목록
   */
  async getNotifications(limit = 4) {
    const notifs = await this.prisma.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return notifs.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      createdAt: n.createdAt.toISOString(),
      isUrgent: n.isUrgent,
      link: n.link,
      icon: n.icon,
    }));
  }
}

module.exports = { PrismaDashboardRepo };
