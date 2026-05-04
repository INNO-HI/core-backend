/**
 * PostgreSQL Policy Repository (Prisma)
 *
 * Policy 카탈로그 자체는 전역(reference data)이지만,
 * RecipientPolicy 는 Recipient 의 ownerId 를 통해 격리된다.
 */

class PrismaPolicyRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async _assertRecipientOwnership(ownerId, recipientId) {
    const r = await this.prisma.recipient.findFirst({
      where: { id: recipientId, ownerId },
      select: { id: true },
    });
    if (!r) throw new Error('해당 대상자를 찾을 수 없거나 권한이 없습니다.');
  }

  async getPoliciesForRecipient(ownerId, recipientId) {
    await this._assertRecipientOwnership(ownerId, recipientId);

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

  async refreshPolicies(ownerId, recipientId) {
    await this._assertRecipientOwnership(ownerId, recipientId);

    const existing = await this.prisma.recipientPolicy.findMany({
      where: { recipientId },
      include: { policy: true },
    });

    for (const rp of existing) {
      const newScore = Math.max(50, Math.min(100, rp.matchScore + Math.floor(Math.random() * 11) - 5));
      await this.prisma.recipientPolicy.update({
        where: {
          recipientId_policyId: { recipientId: rp.recipientId, policyId: rp.policyId },
        },
        data: { matchScore: newScore },
      });
    }

    return this.getPoliciesForRecipient(ownerId, recipientId);
  }
}

module.exports = { PrismaPolicyRepo };
