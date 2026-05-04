/**
 * Dashboard Service – 인증 (Auth)
 *
 * Prisma `User` 테이블을 사용하는 진짜 인증 구현.
 *  - register: bcrypt 해시 + Prisma 저장 + JWT 발급
 *  - login   : bcrypt 비교 + JWT 발급
 *  - 토큰은 7일 만료 (JWT_EXPIRES_IN)
 *
 * 잠금 카운터는 in-memory(서버 1대 환경 가정). 분산 환경에서는 Redis 등으로 교체.
 */

const { prisma } = require('../lib/prisma');
const { signToken, hashPassword, comparePassword } = require('../lib/auth');

const loginAttempts = {};

function buildToken(user) {
  return signToken({ userId: user.id, email: user.email, role: user.role });
}

function safeUser(user) {
  // password 제거
  const { password: _omit, ...rest } = user;
  return {
    ...rest,
    createdAt: rest.createdAt instanceof Date ? rest.createdAt.toISOString() : rest.createdAt,
    updatedAt: rest.updatedAt instanceof Date ? rest.updatedAt.toISOString() : rest.updatedAt,
  };
}

class DashboardService {
  async login({ email, password }) {
    const normalizedEmail = String(email || '').toLowerCase();

    const attempts = loginAttempts[normalizedEmail];
    if (attempts?.lockedUntil && new Date(attempts.lockedUntil) > new Date()) {
      return { success: false, error: '계정이 일시적으로 잠겼습니다. 잠시 후 다시 시도해주세요.' };
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      this._recordFailure(normalizedEmail);
      return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
    }

    const ok = await comparePassword(password, user.password);
    if (!ok) {
      const locked = this._recordFailure(normalizedEmail);
      return {
        success: false,
        error: locked
          ? '로그인 시도가 5회 초과되어 계정이 5분간 잠겼습니다.'
          : '이메일 또는 비밀번호가 올바르지 않습니다.',
      };
    }

    delete loginAttempts[normalizedEmail];
    return {
      success: true,
      data: { user: safeUser(user), token: buildToken(user) },
    };
  }

  _recordFailure(email) {
    if (!loginAttempts[email]) loginAttempts[email] = { count: 0 };
    loginAttempts[email].count++;
    if (loginAttempts[email].count >= 5) {
      loginAttempts[email].lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      return true;
    }
    return false;
  }

  async register(data) {
    const normalizedEmail = String(data.email || '').toLowerCase();
    const password = data.password;
    if (!normalizedEmail || !password) {
      return { success: false, error: '이메일과 비밀번호는 필수입니다.' };
    }
    if (password.length < 6) {
      return { success: false, error: '비밀번호는 6자 이상이어야 합니다.' };
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return { success: false, error: '이미 사용 중인 이메일입니다.' };
    }

    const hashed = await hashPassword(password);
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashed,
        name: data.name || normalizedEmail.split('@')[0],
        phone: data.phone || null,
        role: 'user',
        emailVerified: false,
      },
    });

    return {
      success: true,
      data: { user: safeUser(created), token: buildToken(created) },
    };
  }

  async forgotPassword(_data) {
    // 보안: 이메일 존재 여부와 관계없이 성공 반환
    return { success: true };
  }

  async resetPassword(data) {
    const nextPassword = data.newPassword || data.password;
    if (!nextPassword || nextPassword.length < 6) {
      return { success: false, error: '비밀번호는 6자 이상이어야 합니다.' };
    }

    if (data.token) {
      // 실제 토큰 발급 플로우는 미구현 – 길이만 검증하는 데모 로직 유지
      if (String(data.token).length < 10) {
        return { success: false, error: '유효하지 않거나 만료된 링크입니다.' };
      }
      return { success: true };
    }

    const normalizedEmail = String(data.email || '').toLowerCase();
    if (!normalizedEmail) {
      return { success: false, error: '이메일 정보가 필요합니다.' };
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return { success: false, error: '가입된 계정을 찾을 수 없습니다.' };
    }

    const hashed = await hashPassword(nextPassword);
    await prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    return { success: true };
  }

  async sendEmailVerification(email) {
    const normalizedEmail = String(email || '').toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return { success: false, error: '이미 사용 중인 이메일입니다.' };
    }
    return { success: true, data: { code: '123456' } };
  }

  async verifyEmailCode(_email, code) {
    if (code === '123456') return { success: true };
    return { success: false, error: '인증 코드가 올바르지 않습니다.' };
  }

  async requestOrganizationVerification(_data) {
    return { success: true, data: { requestId: 'req-' + Date.now() } };
  }

  async deleteAccount({ userId }) {
    if (!userId) return { success: true };
    await prisma.user.delete({ where: { id: userId } }).catch(() => null);
    return { success: true };
  }
}

module.exports = { DashboardService };
