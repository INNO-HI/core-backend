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
    req.user = { id: payload.userId, email: payload.email, role: payload.role };
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
 * req.user.role 이 'admin' 이 아니면 403.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({
      ok: false,
      error: { code: 'FORBIDDEN', message: '관리자 권한이 필요합니다.' },
    });
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
