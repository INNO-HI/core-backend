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
}

module.exports = { PrismaVisitRepo };
