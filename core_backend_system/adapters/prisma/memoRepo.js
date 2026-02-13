/**
 * PostgreSQL Memo Repository (Prisma)
 *
 * 인메모리 InMemoryMemoRepo를 대체합니다.
 */

class PrismaMemoRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * 대상자별 메모 조회
   */
  async getMemosByRecipientId(recipientId) {
    const memos = await this.prisma.memo.findMany({
      where: { recipientId },
      include: {
        author: { select: { id: true, name: true } },
      },
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

  /**
   * 메모 추가
   */
  async addMemo(recipientId, content, authorId, authorName) {
    // authorId가 없으면 기본 admin 사용
    let resolvedAuthorId = authorId;
    if (!resolvedAuthorId) {
      const admin = await this.prisma.user.findFirst({ where: { role: 'admin' } });
      resolvedAuthorId = admin?.id || 'system';
    }

    const memo = await this.prisma.memo.create({
      data: {
        recipientId,
        authorId: resolvedAuthorId,
        content,
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    return {
      id: memo.id,
      recipientId: memo.recipientId,
      authorId: memo.author.id,
      authorName: memo.author.name,
      content: memo.content,
      createdAt: memo.createdAt.toISOString(),
    };
  }
}

module.exports = { PrismaMemoRepo };
