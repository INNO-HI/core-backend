/**
 * PostgreSQL Statistics Repository (Prisma) — ownerId 격리
 *
 * 통계/리포트 페이지의 모든 지표를 실 데이터에서 집계한다.
 * 방문(Visit) · 돌봄일지(CareLog) · 대상자(Recipient) · 매니저(Manager) 테이블 기준.
 */

class PrismaStatisticsRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /** 'YYYY-MM' 문자열을 [해당 월 시작, 다음 월 시작) 범위로 변환. 값이 없으면 이번 달. */
  _monthRange(month) {
    const [y, m] = String(month || '').split('-').map(Number);
    let start;
    if (y && m) {
      start = new Date(y, m - 1, 1);
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    return { start, end };
  }

  /** 월별 KPI (선택 월 기준) */
  async getKPI(ownerId, month) {
    const { start, end } = this._monthRange(month);

    const [totalRecipients, monthlyVisits, processedReports, emergencyCases, activeManagers] =
      await Promise.all([
        this.prisma.recipient.count({ where: { ownerId, createdAt: { lt: end } } }),
        this.prisma.visit.count({ where: { ownerId, visitDate: { gte: start, lt: end } } }),
        this.prisma.careLog.count({
          where: { ownerId, status: { in: ['approved', 'rejected'] }, updatedAt: { gte: start, lt: end } },
        }),
        this.prisma.careLog.count({
          where: { ownerId, status: 'urgent', createdAt: { gte: start, lt: end } },
        }),
        this.prisma.manager.count({ where: { ownerId, status: 'active' } }),
      ]);

    return { totalRecipients, monthlyVisits, processedReports, emergencyCases, activeManagers };
  }

  /** 최근 N개월 방문 추이 (오늘 기준 역순으로 채움) */
  async getVisitTrend(ownerId, period = 6) {
    const months = period === 12 ? 12 : 6;
    const now = new Date();
    const base = new Date(now.getFullYear(), now.getMonth(), 1);

    const buckets = [];
    for (let i = months - 1; i >= 0; i--) {
      const s = new Date(base.getFullYear(), base.getMonth() - i, 1);
      const e = new Date(s.getFullYear(), s.getMonth() + 1, 1);
      buckets.push({
        start: s,
        end: e,
        month: `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}`,
        label: `${s.getMonth() + 1}월`,
      });
    }

    const counts = await Promise.all(
      buckets.map((b) =>
        this.prisma.visit.count({ where: { ownerId, visitDate: { gte: b.start, lt: b.end } } })
      )
    );

    return buckets.map((b, i) => ({ month: b.month, label: b.label, visits: counts[i] }));
  }

  /** 보고서(돌봄일지) 처리 현황 — 선택 월에 생성된 일지 기준 상태 분포 */
  async getReportStatus(ownerId, month) {
    const { start, end } = this._monthRange(month);
    const base = { ownerId, createdAt: { gte: start, lt: end } };

    const [approved, pending, urgent, rejected] = await Promise.all([
      this.prisma.careLog.count({ where: { ...base, status: 'approved' } }),
      this.prisma.careLog.count({ where: { ...base, status: 'pending' } }),
      this.prisma.careLog.count({ where: { ...base, status: 'urgent' } }),
      this.prisma.careLog.count({ where: { ...base, status: 'rejected' } }),
    ]);

    return { approved, pending, urgent, rejected, total: approved + pending + urgent + rejected };
  }

  /** 동별 방문 현황 (전체 기간 누적, 방문 수 내림차순 상위 N) */
  async getDistrictVisits(ownerId, limit = 10) {
    const visits = await this.prisma.visit.findMany({
      where: { ownerId },
      select: { recipient: { select: { dong: { select: { name: true } } } } },
    });

    const counts = new Map();
    for (const v of visits) {
      const name = v.recipient?.dong?.name;
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([district, count], i) => ({ district, visits: count, rank: i + 1 }));
  }

  /** 매니저 활동 순위 (방문 수 기준, 상위 N) */
  async getManagerRanking(ownerId, limit = 10) {
    const managers = await this.prisma.manager.findMany({
      where: { ownerId },
      select: { id: true, name: true },
    });

    const rows = await Promise.all(
      managers.map(async (m) => {
        const [visits, approved, totalReports] = await Promise.all([
          this.prisma.visit.count({ where: { ownerId, managerId: m.id } }),
          this.prisma.careLog.count({ where: { ownerId, managerId: m.id, status: 'approved' } }),
          this.prisma.careLog.count({ where: { ownerId, managerId: m.id } }),
        ]);
        return {
          id: m.id,
          name: m.name,
          visits,
          reports: totalReports,
          approvalRate: totalReports > 0 ? Math.round((approved / totalReports) * 100) : 0,
        };
      })
    );

    rows.sort((a, b) => b.visits - a.visits || b.reports - a.reports);

    const palette = ['#448CFF', '#5B9BD5', '#6BA3D6', '#94A3B8'];
    return rows.slice(0, limit).map((r, i) => ({
      id: r.id,
      rank: i + 1,
      name: r.name,
      initials: r.name.slice(0, 2),
      avatarColor: palette[Math.min(i, palette.length - 1)],
      visits: r.visits,
      reports: r.reports,
      approvalRate: r.approvalRate,
    }));
  }

  /** 대상자 상태 분포 (현재 스냅샷). 상태 이력 테이블이 없어 trends 는 0. */
  async getRecipientStatus(ownerId) {
    const [normal, caution, urgent, unvisited] = await Promise.all([
      this.prisma.recipient.count({ where: { ownerId, status: 'normal' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'caution' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'urgent' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'unvisited' } }),
    ]);

    return {
      normal,
      caution,
      urgent,
      unvisited,
      total: normal + caution + urgent + unvisited,
      trends: { normalChange: 0, cautionChange: 0, urgentChange: 0, unvisitedChange: 0 },
    };
  }

  /** 통계 페이지 전체 개요 (한 번에 집계) */
  async getOverview(ownerId, month) {
    const [kpi, visitTrend, reportStatus, districtVisits, managerRanking, recipientStatus] =
      await Promise.all([
        this.getKPI(ownerId, month),
        this.getVisitTrend(ownerId, 6),
        this.getReportStatus(ownerId, month),
        this.getDistrictVisits(ownerId, 10),
        this.getManagerRanking(ownerId, 10),
        this.getRecipientStatus(ownerId),
      ]);

    return { kpi, visitTrend, reportStatus, districtVisits, managerRanking, recipientStatus };
  }
}

module.exports = { PrismaStatisticsRepo };
