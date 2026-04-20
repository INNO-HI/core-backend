/**
 * Dashboard Service
 * 인증 및 비즈니스 로직 담당 (Service 레이어)
 *
 * 현재는 인메모리 mock 데이터로 동작.
 * DB 연동 시 이 서비스의 메서드를 MySQL 어댑터로 교체하면 됨.
 */

// Mock 사용자 DB
const users = [
  {
    id: '1',
    email: 'test@safehi.kr',
    password: 'Test1234!',
    name: '김테스트',
    phone: '010-1234-5678',
    role: 'manager',
    emailVerified: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    id: '2',
    email: 'admin@safehi.kr',
    password: 'Admin1234!',
    name: '김담당',
    phone: '010-9999-8888',
    role: 'admin',
    emailVerified: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];

const loginAttempts = {};

class DashboardService {
  async login({ email, password, rememberMe }) {
    const normalizedEmail = email.toLowerCase();

    // 계정 잠금 확인
    const attempts = loginAttempts[normalizedEmail];
    if (attempts?.lockedUntil && new Date(attempts.lockedUntil) > new Date()) {
      return { success: false, error: '계정이 일시적으로 잠겼습니다. 잠시 후 다시 시도해주세요.' };
    }

    const user = users.find((u) => u.email === normalizedEmail);
    if (user && user.password === password) {
      delete loginAttempts[normalizedEmail];
      const { password: _, ...safeUser } = user;
      return {
        success: true,
        data: {
          user: safeUser,
          token: 'jwt-token-' + Date.now(),
        },
      };
    }

    // 실패 카운트
    if (!loginAttempts[normalizedEmail]) {
      loginAttempts[normalizedEmail] = { count: 0 };
    }
    loginAttempts[normalizedEmail].count++;

    if (loginAttempts[normalizedEmail].count >= 5) {
      loginAttempts[normalizedEmail].lockedUntil = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      return { success: false, error: '로그인 시도가 5회 초과되어 계정이 5분간 잠겼습니다.' };
    }

    return { success: false, error: '이메일 또는 비밀번호가 올바르지 않습니다.' };
  }

  async register(data) {
    const normalizedEmail = (data.email || '').toLowerCase();

    if (users.some((u) => u.email === normalizedEmail)) {
      return { success: false, error: '이미 사용 중인 이메일입니다.' };
    }

    const newUser = {
      id: String(users.length + 1),
      email: normalizedEmail,
      password: data.password,
      name: data.name,
      phone: data.phone,
      role: 'user',
      emailVerified: false,
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    const { password: _, ...safeUser } = newUser;
    return { success: true, data: { user: safeUser } };
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

    // 토큰 방식 재설정
    if (data.token) {
      if (data.token.length < 10) {
        return { success: false, error: '유효하지 않거나 만료된 링크입니다.' };
      }
      return { success: true };
    }

    // 이메일 기반 재설정(모바일 앱 단순 플로우)
    const normalizedEmail = (data.email || '').toLowerCase();
    if (!normalizedEmail) {
      return { success: false, error: '이메일 정보가 필요합니다.' };
    }

    const user = users.find((u) => u.email === normalizedEmail);
    if (!user) {
      return { success: false, error: '가입된 계정을 찾을 수 없습니다.' };
    }

    user.password = nextPassword;
    return { success: true };
  }

  async sendEmailVerification(email) {
    const normalizedEmail = (email || '').toLowerCase();
    if (users.some((u) => u.email === normalizedEmail)) {
      return { success: false, error: '이미 사용 중인 이메일입니다.' };
    }
    return { success: true, data: { code: '123456' } };
  }

  async verifyEmailCode(_email, code) {
    if (code === '123456') {
      return { success: true };
    }
    return { success: false, error: '인증 코드가 올바르지 않습니다.' };
  }

  async requestOrganizationVerification(_data) {
    return { success: true, data: { requestId: 'req-' + Date.now() } };
  }

  async deleteAccount({ userId, reason }) {
    const idx = users.findIndex((u) => u.id === userId);
    if (idx !== -1) users.splice(idx, 1);
    return { success: true };
  }
}

module.exports = { DashboardService };
