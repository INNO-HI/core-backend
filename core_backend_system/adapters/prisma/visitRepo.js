/**
 * PostgreSQL Visit Repository (Prisma)
 *
 * 인메모리 InMemoryVisitRepo를 대체합니다.
 */

class PrismaVisitRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * 대상자별 방문 기록 조회
   */
  async getVisitsByRecipientId(recipientId, filters = {}) {
    const where = { recipientId };

    if (filters.dateStart) {
      where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    }
    if (filters.dateEnd) {
      where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };
    }

    const visits = await this.prisma.visit.findMany({
      where,
      include: {
        manager: { select: { name: true } },
      },
      orderBy: { visitDate: 'desc' },
    });

    return visits.map((v) => ({
      id: v.id,
      recipientId: v.recipientId,
      careLogId: v.careLogId,
      visitDate: v.visitDate.toISOString(),
      visitType: v.visitType,
      managerName: v.manager.name,
      summary: v.summary || '',
    }));
  }

  /**
   * 매니저 일정(방문/전화) 생성
   */
  async createVisitForManager(managerId, data) {
    const visitDate = new Date(data.visitDate);
    if (Number.isNaN(visitDate.getTime())) {
      throw new Error('visitDate is invalid');
    }

    const visitType = data.visitType === 'call' ? 'call' : 'visit';

    const created = await this.prisma.visit.create({
      data: {
        managerId,
        recipientId: data.recipientId,
        visitDate,
        visitType,
        summary: data.summary || '일정 등록',
      },
      include: {
        manager: { select: { name: true } },
        recipient: { select: { name: true, phone: true, address: true, status: true } },
      },
    });

    return {
      id: created.id,
      recipientId: created.recipientId,
      recipientName: created.recipient.name,
      recipientPhone: created.recipient.phone || '',
      recipientAddress: created.recipient.address || '',
      recipientStatus: created.recipient.status || 'normal',
      managerId: created.managerId,
      managerName: created.manager.name,
      visitDate: created.visitDate.toISOString(),
      visitType: created.visitType === 'visit' ? 'regular' : created.visitType,
      result: created.summary || '일정 등록',
    };
  }
}

module.exports = { PrismaVisitRepo };
