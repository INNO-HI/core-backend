/**
 * PostgreSQL Care Log Repository (Prisma)
 *
 * 인메모리 InMemoryCareLogRepo를 대체합니다.
 */

class PrismaCareLogRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * 돌봄 일지 목록 조회 (필터 + 페이징)
   */
  async getCareLogs(filters, page = 1, pageSize = 10) {
    const where = {};

    if (filters.status && filters.status !== 'all') {
      where.status = filters.status;
    }

    if (filters.search) {
      const s = filters.search;
      where.OR = [
        { recipient: { name: { contains: s, mode: 'insensitive' } } },
        { manager: { name: { contains: s, mode: 'insensitive' } } },
        { center: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (filters.dateStart) {
      where.visitDate = { ...(where.visitDate || {}), gte: new Date(filters.dateStart) };
    }
    if (filters.dateEnd) {
      where.visitDate = { ...(where.visitDate || {}), lte: new Date(filters.dateEnd) };
    }

    if (filters.dong && filters.dong !== 'all') {
      where.recipient = {
        ...(where.recipient || {}),
        dong: { name: filters.dong },
      };
    }

    // 상태별 카운트 (전체 데이터 기준)
    const [allCount, pendingCount, urgentCount, approvedCount, rejectedCount] = await Promise.all([
      this.prisma.careLog.count(),
      this.prisma.careLog.count({ where: { status: 'pending' } }),
      this.prisma.careLog.count({ where: { status: 'urgent' } }),
      this.prisma.careLog.count({ where: { status: 'approved' } }),
      this.prisma.careLog.count({ where: { status: 'rejected' } }),
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
        registeredAt: l.createdAt.toISOString(),
        status: l.status,
      })),
      totalCount,
      statusCounts,
    };
  }

  /**
   * 돌봄 일지 상세 조회
   */
  async getCareLogById(id) {
    const log = await this.prisma.careLog.findUnique({
      where: { id },
      include: {
        recipient: { select: { id: true, name: true } },
        manager: { select: { name: true } },
        center: { select: { name: true } },
        feedbacks: {
          include: {
            author: { select: { id: true, name: true } },
          },
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

  /**
   * 일괄 상태 변경
   */
  async updateBulkStatus(ids, status) {
    const result = await this.prisma.careLog.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    return { success: true, count: result.count };
  }

  /**
   * 개별 상태 변경
   */
  async updateStatus(id, status, reason) {
    const data = { status };
    if (reason) data.rejectionReason = reason;

    await this.prisma.careLog.update({
      where: { id },
      data,
    });

    return { success: true, id, newStatus: status };
  }

  /**
   * 피드백 추가
   */
  async addFeedback(careLogId, content) {
    // 기본 작성자 (admin) 조회
    const author = await this.prisma.user.findFirst({
      where: { role: 'admin' },
    });

    if (!author) {
      throw new Error('피드백을 작성할 관리자 계정이 존재하지 않습니다. 시드 데이터를 확인해 주세요.');
    }

    const fb = await this.prisma.feedback.create({
      data: {
        careLogId,
        authorId: author.id,
        authorRole: '구청',
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
