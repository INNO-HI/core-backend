/**
 * PostgreSQL Memo Repository (Prisma) — ownerId 격리
 */

class PrismaMemoRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async getMemosByRecipientId(ownerId, recipientId) {
    const memos = await this.prisma.memo.findMany({
      where: { ownerId, recipientId },
      include: { author: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return memos.map((m) => ({
      id: m.id,
      recipientId: m.recipientId,
      authorId: m.author.id,
      authorName: m.author.name,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
      type: m.type || 'normal',
    }));
  }

  async addMemo(ownerId, recipientId, content, authorId) {
    // 본인 소유 대상자 검증
    const recipient = await this.prisma.recipient.findFirst({
      where: { id: recipientId, ownerId },
    });
    if (!recipient) {
      throw new Error('해당 대상자를 찾을 수 없거나 권한이 없습니다.');
    }

    const memo = await this.prisma.memo.create({
      data: {
        recipientId,
        authorId: authorId || ownerId,
        ownerId,
        content,
      },
      include: { author: { select: { id: true, name: true } } },
    });

    return {
      id: memo.id,
      recipientId: memo.recipientId,
      authorId: memo.author.id,
      authorName: memo.author.name,
      content: memo.content,
      createdAt: memo.createdAt.toISOString(),
      type: memo.type || 'normal',
    };
  }
}

module.exports = { PrismaMemoRepo };
