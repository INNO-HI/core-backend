/**
 * PostgreSQL Risk Queue Repository (Prisma) — ownerId 격리
 * BACKEND_DB_SPEC.md §3.8 위기 큐
 *
 * 경보(24h)·긴급(4h)만 들어온다. 시간이 지나도 자동으로 사라지지 않는다 —
 * acknowledged_at 이 차야 내려간다. 마감을 넘긴 건은 넘겼다고 표시하되 큐에 남는다.
 */

/** 등급별 SLA 시한(시간) */
const SLA_HOURS = { alert: 24, urgent: 4 };

class PrismaRiskRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async _serialize(item) {
    let acknowledgedByName = null;
    if (item.acknowledgedById) {
      const u = await this.prisma.user.findUnique({
        where: { id: item.acknowledgedById },
        select: { name: true },
      });
      acknowledgedByName = u?.name || null;
    }
    return {
      id: item.id,
      assessmentId: item.assessmentId,
      recipientId: item.recipientId,
      recipientName: item.recipient?.name || '',
      careLogId: item.assessment?.careLogId || null,
      grade: item.grade,
      raisedAt: item.raisedAt.toISOString(),
      dueAt: item.dueAt.toISOString(),
      acknowledgedAt: item.acknowledgedAt ? item.acknowledgedAt.toISOString() : null,
      acknowledgedBy: item.acknowledgedById || null,
      acknowledgedByName,
      ackNote: item.ackNote || null,
      createdAt: item.createdAt.toISOString(),
      // 앱 요청서(§10) 편의 별칭
      acknowledged: Boolean(item.acknowledgedAt),
      reason: item.assessment?.rationale || null,
    };
  }

  /** 위기 큐 전체 조회 (미확인 + 확인 완료 — 정렬은 클라이언트/호출부 몫) */
  async getQueue(ownerId, restrictManagerId) {
    const items = await this.prisma.riskQueue.findMany({
      where: restrictManagerId ? { ownerId, recipient: { managerId: restrictManagerId } } : { ownerId },
      orderBy: [{ acknowledgedAt: { sort: 'asc', nulls: 'first' } }, { dueAt: 'asc' }],
      include: {
        recipient: { select: { name: true } },
        assessment: { select: { careLogId: true, rationale: true } },
      },
      take: 500,
    });
    return Promise.all(items.map((i) => this._serialize(i)));
  }

  /**
   * 확인 처리 — 누가·언제·왜 확인했는지가 감사의 대상이다.
   * 처리 사유(note)는 필수.
   */
  async acknowledge(ownerId, id, note, userId) {
    const item = await this.prisma.riskQueue.findFirst({
      where: { id, ownerId },
    });
    if (!item) throw new Error('위기 큐 항목을 찾을 수 없거나 권한이 없습니다.');
    if (item.acknowledgedAt) throw new Error('이미 확인 처리된 항목입니다.');

    const updated = await this.prisma.riskQueue.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedById: userId,
        ackNote: note,
      },
      include: {
        recipient: { select: { name: true } },
        assessment: { select: { careLogId: true, rationale: true } },
      },
    });
    return this._serialize(updated);
  }
}

module.exports = { PrismaRiskRepo, SLA_HOURS };
