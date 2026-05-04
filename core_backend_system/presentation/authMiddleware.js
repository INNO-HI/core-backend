/**
 * 인증 미들웨어
 *
 * Authorization: Bearer <jwt> 헤더에서 토큰을 꺼내 검증하고
 * req.user = { id, email, role } 를 주입한다.
 */

const { verifyToken } = require('../lib/auth');

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: '인증이 필요합니다.' },
    });
  }
  const token = header.slice('Bearer '.length).trim();
  try {
    const payload = verifyToken(token);
    req.user = { id: payload.userId, email: payload.email, role: payload.role };
    return next();
  } catch (_err) {
    return res.status(401).json({
      ok: false,
      error: { code: 'INVALID_TOKEN', message: '유효하지 않거나 만료된 토큰입니다.' },
    });
  }
}

module.exports = { requireAuth };
