/**
 * PostgreSQL Consent Repository (Prisma) — ownerId 격리
 * BACKEND_DB_SPEC.md §3.2 음성 수집 동의
 *
 * 덮어쓰지 않고 이력으로 쌓는다. 앱에는 현재 유효한 값 하나(voiceConsent)만 내려간다.
 * 동의 값을 앱이 만들 수 있는 경로는 열지 않는다 — 등록·철회는 대시보드 전용.
 */

class PrismaConsentRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async _serialize(c) {
    let grantedByName = null;
    if (c.grantedById) {
      const u = await this.prisma.user.findUnique({
        where: { id: c.grantedById },
        select: { name: true },
      });
      grantedByName = u?.name || null;
    }
    return {
      id: c.id,
      recipientId: c.recipientId,
      voiceConsent: c.voiceConsent,
      grantedAt: c.grantedAt.toISOString(),
      grantedBy: c.grantedById,
      grantedByName,
      revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
      documentUrl: c.documentUrl || null,
      note: c.note || null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  async _assertRecipient(ownerId, recipientId) {
    const r = await this.prisma.recipient.findFirst({
      where: { id: recipientId, ownerId },
      select: { id: true },
    });
    if (!r) throw new Error('대상자를 찾을 수 없거나 권한이 없습니다.');
  }

  /** 동의 이력 조회 (최신순) */
  async listConsents(ownerId, recipientId) {
    await this._assertRecipient(ownerId, recipientId);
    const consents = await this.prisma.consent.findMany({
      where: { ownerId, recipientId },
      orderBy: { grantedAt: 'desc' },
    });
    return Promise.all(consents.map((c) => this._serialize(c)));
  }

  /** 현재 유효한 동의 값 — recipients 응답의 voiceConsent 필드용 */
  async getActiveVoiceConsent(ownerId, recipientId) {
    const active = await this.prisma.consent.findFirst({
      where: { ownerId, recipientId, voiceConsent: true, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
      select: { id: true },
    });
    return Boolean(active);
  }

  /** 동의 등록 — 이력에 새 행이 쌓인다 */
  async grantConsent(ownerId, recipientId, { voiceConsent, note, documentUrl }, grantedById) {
    await this._assertRecipient(ownerId, recipientId);
    const created = await this.prisma.consent.create({
      data: {
        ownerId: grantedById, // 소유 계정은 처리자 본인 — 기관 공유 스코프로 함께 조회된다
        recipientId,
        voiceConsent: voiceConsent !== false,
        grantedById,
        note: note || null,
        documentUrl: documentUrl || null,
      },
    });
    return this._serialize(created);
  }

  /** 동의 철회 — 행을 지우지 않고 revokedAt 을 찍는다 */
  async revokeConsent(ownerId, recipientId, consentId, note) {
    await this._assertRecipient(ownerId, recipientId);
    const consent = await this.prisma.consent.findFirst({
      where: { id: consentId, ownerId, recipientId },
    });
    if (!consent) throw new Error('동의 이력을 찾을 수 없거나 권한이 없습니다.');
    if (consent.revokedAt) throw new Error('이미 철회된 동의입니다.');

    const updated = await this.prisma.consent.update({
      where: { id: consentId },
      data: {
        revokedAt: new Date(),
        note: note ? (consent.note ? `${consent.note}\n[철회] ${note}` : `[철회] ${note}`) : consent.note,
      },
    });
    return this._serialize(updated);
  }
}

module.exports = { PrismaConsentRepo };
