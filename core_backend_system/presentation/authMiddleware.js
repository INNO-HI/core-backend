/**
 * 인증 미들웨어
 *
 * Authorization: Bearer <jwt> 헤더에서 토큰을 꺼내 검증하고
 * req.user = { id, email, role } 를 주입한다.
 *
 * 로그인/회원가입 등 AUTH 라우트는 이 미들웨어를 거치지 않는다.
 * 토큰 만료(TOKEN_EXPIRED) 와 서명 불일치(INVALID_TOKEN) 를 구분해 반환한다.
 */

const { verifyToken } = require('../lib/auth');
const { prisma } = require('../lib/prisma');
const { hasCapability } = require('../lib/capabilities');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다. 다시 로그인해 주세요.' },
    });
  }

  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.userId, email: payload.email, role: payload.role, sv: payload.sv };
    return next();
  } catch (err) {
    const isExpired = err && err.name === 'TokenExpiredError';
    console.warn('[auth] token rejected:', isExpired ? 'expired' : err?.name, '| path:', req.path);
    return res.status(401).json({
      ok: false,
      error: {
        code: isExpired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        message: isExpired
          ? '토큰이 만료되었습니다. 다시 로그인해 주세요.'
          : '유효하지 않은 토큰입니다. 다시 로그인해 주세요.',
      },
    });
  }
}

/**
 * 관리자 전용 미들웨어 — requireAuth 이후에 사용.
 * legacy 'admin' 과 신설 'master' 를 관리자로 본다.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'master') {
    return res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: '관리자 권한이 필요합니다.' },
    });
  }
  return next();
}

/**
 * 능력(capability) 가드 — requireAuth 이후에 사용 (PERMISSIONS.md).
 * 계정별 grant/revoke 가 즉시 반영되도록 토큰이 아니라 DB에서 계산한다.
 * 실제 권한 = rolePreset(role) + grants − revokes
 */
function requireCapability(capability) {
  return async function capabilityGuard(req, res, next) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, role: true, capabilityGrants: true },
      });
      if (!user) {
        return res.status(401).json({
          ok: false,
          error: { code: 'UNAUTHORIZED', message: '계정을 찾을 수 없습니다. 다시 로그인해 주세요.' },
        });
      }
      if (!hasCapability(user, capability)) {
        return res.status(403).json({
          ok: false,
          error: { code: 'FORBIDDEN', message: '이 작업을 할 권한이 없습니다.' },
        });
      }
      req.user.role = user.role; // 최신 역할로 갱신
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireAuth, requireAdmin, requireCapability };
