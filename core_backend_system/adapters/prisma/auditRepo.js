/**
 * PostgreSQL Audit Log Repository (Prisma)
 * BACKEND_DB_SPEC.md §3.10 감사
 *
 * 최소한 이 셋은 반드시 남긴다 — 동의 등록·철회, 위기 큐 확인 처리, 기록 생성·승인.
 * 감사 기록 실패가 본 요청을 막지 않도록 호출부에서 log() 는 실패를 삼킨다.
 */

class PrismaAuditRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async log({ ownerId, actorId, action, targetType, targetId, payload, ip }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          ownerId: ownerId || null,
          actorId: actorId || null,
          action,
          targetType: targetType || null,
          targetId: targetId || null,
          payload: payload ?? undefined,
          ip: ip || null,
        },
      });
    } catch (err) {
      // 감사 기록 실패는 본 동작을 막지 않는다 — 로그만 남긴다
      console.error('[audit] 기록 실패:', err.message);
    }
  }
}

module.exports = { PrismaAuditRepo };
