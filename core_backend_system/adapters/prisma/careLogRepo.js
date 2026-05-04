/**
 * PostgreSQL Care Log Repository (Prisma) — ownerId 격리
 */

class PrismaCareLogRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async getCareLogs(ownerId, filters, page = 1, pageSize = 10) {
    const where = { ownerId };

    if (filters.status && filters.status !== 'all') where.status = filters.status;

    if (filters.search) {
      const s = filters.search;
      where.OR = [
        { recipient: { name: { contains: s, mode: 'insensitive' } } },
        { manager: { name: { contains: s, mode: 'insensitive' } } },
        { center: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (filters.dateStart) where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    if (filters.dateEnd) where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };

    if (filters.dong && filters.dong !== 'all') {
      where.recipient = { ...(where.recipient || {}), dong: { name: filters.dong } };
    }

    const [allCount, pendingCount, urgentCount, approvedCount, rejectedCount] = await Promise.all([
      this.prisma.careLog.count({ where: { ownerId } }),
      this.prisma.careLog.count({ where: { ownerId, status: 'pending' } }),
      this.prisma.careLog.count({ where: { ownerId, status: 'urgent' } }),
      this.prisma.careLog.count({ where: { ownerId, status: 'approved' } }),
      this.prisma.careLog.count({ where: { ownerId, status: 'rejected' } }),
    ]);

    const statusCounts = {
      all: allCount,
      pending: pendingCount,
      urgent: urgentCount,
      approved: approvedCount,
      rejected: rejectedCount,
    };

    const totalCount = await this.prisma.careLog.count({ where });
    const logs = await this.prisma.careLog.findMany({
      where,
      orderBy: { visitDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        recipient: { select: { name: true } },
        manager: { select: { name: true } },
        center: { select: { name: true } },
      },
    });

    return {
      logs: logs.map((l) => ({
        id: l.id,
        recipientName: l.recipient.name,
        managerName: l.manager.name,
        centerName: l.center?.name || '',
        visitDate: l.visitDate.toISOString(),
        visitType: l.visitType || 'visit',
        registeredAt: l.createdAt.toISOString(),
        status: l.status,
      })),
      totalCount,
      statusCounts,
    };
  }

  async getCareLogsByRecipientId(ownerId, recipientId, filters = {}, page = 1, pageSize = 20) {
    const where = { ownerId, recipientId };

    if (filters.status && filters.status !== 'all') where.status = filters.status;
    if (filters.dateStart) where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    if (filters.dateEnd) where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };

    const totalCount = await this.prisma.careLog.count({ where });
    const logs = await this.prisma.careLog.findMany({
      where,
      orderBy: { visitDate: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        recipient: { select: { id: true, name: true } },
        manager: { select: { id: true, name: true } },
        center: { select: { name: true } },
      },
    });

    return {
      logs: logs.map((l) => ({
        id: l.id,
        recipientId: l.recipient.id,
        recipientName: l.recipient.name,
        managerId: l.manager.id,
        managerName: l.manager.name,
        centerName: l.center?.name || '',
        visitDate: l.visitDate.toISOString(),
        visitType: l.visitType || 'visit',
        status: l.status,
        registeredAt: l.createdAt.toISOString(),
        rejectionReason: l.rejectionReason || null,
      })),
      totalCount,
    };
  }

  async getCareLogById(ownerId, id) {
    const log = await this.prisma.careLog.findFirst({
      where: { id, ownerId },
      include: {
        recipient: { select: { id: true, name: true } },
        manager: { select: { name: true } },
        center: { select: { name: true } },
        feedbacks: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!log) return null;

    return {
      id: log.id,
      recipientId: log.recipient.id,
      recipientName: log.recipient.name,
      status: log.status,
      createdAt: log.createdAt.toISOString(),
      visitInfo: {
        visitDate: log.visitDate.toISOString(),
        visitType: log.visitType || 'visit',
        managerName: log.manager.name,
        centerName: log.center?.name || '',
      },
      visitLocation: log.visitLocation || '',
      careContent: log.careContent || null,
      careContentBlocks: log.careContentBlocks || [],
      requiredActions: log.requiredActions || [],
      recommendedPolicies: log.recommendedPolicies || [],
      notes: log.notes || '',
      photos: log.photos || [],
      rejectionReason: log.rejectionReason || null,
      feedbacks: log.feedbacks.map((f) => ({
        id: f.id,
        careLogId: f.careLogId,
        authorId: f.author.id,
        authorName: f.author.name,
        authorRole: f.authorRole || '',
        content: f.content,
        createdAt: f.createdAt.toISOString(),
      })),
    };
  }

  async updateBulkStatus(ownerId, ids, status) {
    const result = await this.prisma.careLog.updateMany({
      where: { id: { in: ids }, ownerId },
      data: { status },
    });
    return { success: true, count: result.count };
  }

  async updateStatus(ownerId, id, status, reason) {
    const data = { status };
    if (reason) data.rejectionReason = reason;

    const result = await this.prisma.careLog.updateMany({
      where: { id, ownerId },
      data,
    });

    if (result.count === 0) {
      throw new Error('해당 돌봄 일지를 찾을 수 없거나 권한이 없습니다.');
    }

    return { success: true, id, newStatus: status };
  }

  async addFeedback(ownerId, careLogId, content, authorId, authorRole) {
    // 본인 소유 careLog 인지 확인
    const careLog = await this.prisma.careLog.findFirst({
      where: { id: careLogId, ownerId },
    });
    if (!careLog) {
      throw new Error('해당 돌봄 일지를 찾을 수 없거나 권한이 없습니다.');
    }

    const fb = await this.prisma.feedback.create({
      data: {
        careLogId,
        authorId,
        authorRole: authorRole || '담당자',
        content,
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    return {
      id: fb.id,
      careLogId: fb.careLogId,
      authorId: fb.author.id,
      authorName: fb.author.name,
      authorRole: fb.authorRole,
      content: fb.content,
      createdAt: fb.createdAt.toISOString(),
    };
  }
}

module.exports = { PrismaCareLogRepo };
