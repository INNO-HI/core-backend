/**
 * PostgreSQL Task Repository (Prisma) — ownerId 격리
 * BACKEND_DB_SPEC.md §3.3 방문·전화 일정
 */

class PrismaTaskRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  _serialize(t) {
    return {
      id: t.id,
      type: t.type,
      startAt: t.startAt.toISOString(),
      durationMin: t.durationMin,
      status: t.status,
      recipientId: t.recipientId,
      recipientName: t.recipient?.name || '',
      assigneeId: t.managerId,
      assigneeName: t.manager?.name || '',
      careLogId: t.careLogId || null,
      createdAt: t.createdAt.toISOString(),
      // 구 앱 호환 표기 (title/meta/badge 문자열만 읽는 화면용)
      title: `${t.recipient?.name || ''} ${t.type === 'call' ? '전화' : '방문'}`,
      meta: `${t.startAt.toISOString()} · ${t.durationMin}분`,
      badge: t.type === 'call' ? '전화' : '방문',
    };
  }

  /**
   * 일정 조회 — date(YYYY-MM-DD)와 assigneeId(managerId)로 거른다.
   * 앱은 "담당자의 특정 날짜 일정"만 묻는다 (?date= 필수 지원).
   */
  async listTasks(ownerId, { date, assigneeId, recipientId, status } = {}) {
    const where = { ownerId };

    if (date) {
      const dayStart = new Date(`${date}T00:00:00+09:00`);
      if (!isNaN(dayStart.getTime())) {
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        where.startAt = { gte: dayStart, lt: dayEnd };
      }
    }
    if (assigneeId) where.managerId = assigneeId;
    if (recipientId) where.recipientId = recipientId;
    if (status && status !== 'all') where.status = status;

    const tasks = await this.prisma.task.findMany({
      where,
      orderBy: { startAt: 'asc' },
      include: {
        recipient: { select: { name: true } },
        manager: { select: { name: true } },
      },
    });

    return tasks.map((t) => this._serialize(t));
  }

  /** 일정 배포 (대시보드 §4 — tasks 는 대시보드가 만든다) */
  async createTask(ownerId, { recipientId, assigneeId, type, startAt, durationMin }) {
    const recipient = await this.prisma.recipient.findFirst({
      where: { id: recipientId, ownerId },
      select: { id: true, managerId: true },
    });
    if (!recipient) throw new Error('대상자를 찾을 수 없거나 권한이 없습니다.');

    const managerId = assigneeId || recipient.managerId;
    if (!managerId) throw new Error('담당자가 지정되지 않았습니다. 대상자에 담당자를 먼저 배정해주세요.');

    const created = await this.prisma.task.create({
      data: {
        ownerId,
        recipientId,
        managerId,
        type: type === 'call' ? 'call' : 'visit',
        startAt: new Date(startAt),
        durationMin: Number(durationMin) || 60,
      },
      include: {
        recipient: { select: { name: true } },
        manager: { select: { name: true } },
      },
    });

    return this._serialize(created);
  }

  /** 상태 변경 (scheduled | done | canceled) + 기록 연결 */
  async updateTask(ownerId, id, { status, careLogId } = {}) {
    const data = {};
    if (status) data.status = status;
    if (careLogId !== undefined) data.careLogId = careLogId;

    const result = await this.prisma.task.updateMany({
      where: { id, ownerId },
      data,
    });
    if (result.count === 0) throw new Error('해당 일정을 찾을 수 없거나 권한이 없습니다.');

    const updated = await this.prisma.task.findUnique({
      where: { id },
      include: {
        recipient: { select: { name: true } },
        manager: { select: { name: true } },
      },
    });
    return this._serialize(updated);
  }
}

module.exports = { PrismaTaskRepo };
