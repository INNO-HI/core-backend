/**
 * PostgreSQL Visit Repository (Prisma) — ownerId 격리
 */

class PrismaVisitRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async getVisitsByRecipientId(ownerId, recipientId, filters = {}) {
    const where = { ownerId, recipientId };

    if (filters.dateStart) where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    if (filters.dateEnd) where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };

    const visits = await this.prisma.visit.findMany({
      where,
      include: { manager: { select: { name: true } } },
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

  async createVisitForManager(ownerId, managerId, data) {
    const visitDate = new Date(data.visitDate);
    if (Number.isNaN(visitDate.getTime())) {
      throw new Error('visitDate is invalid');
    }

    // 본인 소유 매니저/대상자만 허용
    const manager = await this.prisma.manager.findFirst({
      where: { id: managerId, ownerId },
    });
    if (!manager) {
      throw new Error('해당 매니저를 찾을 수 없거나 권한이 없습니다.');
    }
    const recipient = await this.prisma.recipient.findFirst({
      where: { id: data.recipientId, ownerId },
    });
    if (!recipient) {
      throw new Error('해당 대상자를 찾을 수 없거나 권한이 없습니다.');
    }

    const visitType = data.visitType === 'call' ? 'call' : 'visit';

    const created = await this.prisma.visit.create({
      data: {
        managerId,
        recipientId: data.recipientId,
        ownerId,
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
