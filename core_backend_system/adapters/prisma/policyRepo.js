/**
 * PostgreSQL Policy Repository (Prisma)
 *
 * 인메모리 InMemoryPolicyRepo를 대체합니다.
 */

class PrismaPolicyRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /**
   * 대상자 맞춤 정책 추천 조회
   */
  async getPoliciesForRecipient(recipientId) {
    const rps = await this.prisma.recipientPolicy.findMany({
      where: { recipientId },
      include: { policy: true },
      orderBy: { matchScore: 'desc' },
    });

    if (rps.length > 0) {
      return rps.map((rp) => ({
        id: rp.policy.id,
        name: rp.policy.name,
        summary: rp.policy.summary || '',
        matchScore: rp.matchScore,
        applicationMethod: rp.policy.applicationMethod || '',
        details: rp.policy.details || {},
      }));
    }

    // 연결된 정책이 없으면 모든 정책을 점수 0으로 반환
    const allPolicies = await this.prisma.policy.findMany();
    return allPolicies.map((p) => ({
      id: p.id,
      name: p.name,
      summary: p.summary || '',
      matchScore: 0,
      applicationMethod: p.applicationMethod || '',
      details: p.details || {},
    }));
  }

  /**
   * 정책 추천 새로고침 (점수 재계산)
   */
  async refreshPolicies(recipientId) {
    // 기존 연결의 점수를 약간 랜덤으로 조정
    const existing = await this.prisma.recipientPolicy.findMany({
      where: { recipientId },
      include: { policy: true },
    });

    for (const rp of existing) {
      const newScore = Math.max(50, Math.min(100, rp.matchScore + Math.floor(Math.random() * 11) - 5));
      await this.prisma.recipientPolicy.update({
        where: {
          recipientId_policyId: {
            recipientId: rp.recipientId,
            policyId: rp.policyId,
          },
        },
        data: { matchScore: newScore },
      });
    }

    return this.getPoliciesForRecipient(recipientId);
  }
}

module.exports = { PrismaPolicyRepo };
