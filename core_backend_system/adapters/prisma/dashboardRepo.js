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

    return notifs.map((n) => {
      const isReport = /report|보고서|리포트/i.test(`${n.title} ${n.content}`) || String(n.link || '').includes('/care-logs');
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
   * 복지 뉴스 (임시: 백엔드 제공형 정적 피드)
   */
  async getWelfareNews(limit = 10) {
    const items = [
      {
        id: 'welfare-001',
        title: '2026 상반기 복지 서비스 개편',
        description: '독거노인 방문 횟수 월 8회로 확대',
        tag: '신규',
        date: '2026.03.15',
      },
      {
        id: 'welfare-002',
        title: '노인 맞춤 돌봄 교육 지원 확대',
        description: '치매 예방 프로그램 비용 지원 강화',
        tag: '업데이트',
        date: '2026.03.12',
      },
      {
        id: 'welfare-003',
        title: '기초생활수급자 의료급여 변경',
        description: '본인부담금 경감 적용 대상 확대',
        tag: '정책',
        date: '2026.03.08',
      },
    ];
    return items.slice(0, limit);
  }

  /**
   * 업무 요청 (긴급/대기 상태의 최근 돌봄 일지 기반)
   */
  async getTasks(limit = 10) {
    const logs = await this.prisma.careLog.findMany({
      where: { status: { in: ['urgent', 'pending'] } },
      orderBy: { createdAt: 'desc' },
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
   * 공지사항 (임시: 백엔드 제공형 정적 피드)
   */
  async getNotices(limit = 10) {
    const items = [
      { id: 'notice-001', title: '4월 전체 매니저 회의 안내', date: '2026.03.15', isNew: true },
      { id: 'notice-002', title: '돌봄 기록 시스템 업데이트 안내', date: '2026.03.12', isNew: false },
      { id: 'notice-003', title: '2026 상반기 교육 일정 공지', date: '2026.03.08', isNew: false },
    ];
    return items.slice(0, limit);
  }
}

module.exports = { PrismaDashboardRepo };
