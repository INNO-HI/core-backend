/**
 * 데이터 스코프 리졸버 — requireAuth 이후에 사용.
 *
 * 격리 축을 "계정(ownerId)"에서 "기관(institutionId)"으로 넓힌다.
 * 같은 기관 코드로 가입한 관리자와 실무자는 하나의 워크스페이스를 공유해야
 * "앱이 기록을 만들고 판단은 기관이 한다"가 성립한다.
 *
 *  - req.ownerScope     : Prisma where 필터 값 — 기관 소속이면 { in: [구성원 id…] }, 아니면 본인 id
 *  - req.user.role      : DB 기준 최신 역할 (토큰의 낡은 역할을 덮는다)
 *  - req.callerManagerId: caregiver 계정과 연결된 매니저 id (담당분 스코핑 기준)
 */

const { prisma } = require('../lib/prisma');

async function resolveScope(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, role: true, institutionId: true },
    });
    if (!user) {
      return res.status(401).json({
        ok: false,
        error: { code: 'UNAUTHORIZED', message: '계정을 찾을 수 없습니다. 다시 로그인해 주세요.' },
      });
    }

    req.user.role = user.role;
    req.user.institutionId = user.institutionId;

    if (user.institutionId) {
      const members = await prisma.user.findMany({
        where: { institutionId: user.institutionId },
        select: { id: true },
      });
      req.ownerScope = { in: members.map((m) => m.id) };
    } else {
      // 기관 미소속(legacy·심사 계정): 기존처럼 본인 데이터만
      req.ownerScope = user.id;
    }

    if (user.role === 'caregiver') {
      const mgr = await prisma.manager.findUnique({
        where: { userId: user.id },
        select: { id: true },
      });
      req.callerManagerId = mgr?.id || null;
    } else {
      req.callerManagerId = null;
    }

    return next();
  } catch (err) {
    return next(err);
  }
}

module.exports = { resolveScope };
