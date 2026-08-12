/**
 * Dashboard Service – 인증 (Auth)
 *
 * BACKEND_REQUEST.md(2026-08-11) 반영:
 *  - §2 인증코드: 무작위 6자리 + 해시 저장 + 5분 만료 + 5회 시도 제한.
 *    코드는 응답에 담지 않고 메일로만 보낸다.
 *  - §6 role: caregiver | institution 을 그대로 저장·반환. master 는 웹 전용.
 *  - §8 institutionCode: institutions 테이블에서 검증, user 에 소속 기관 포함.
 *  - §9 비밀번호 재설정: 일회용 토큰(메일 발송) 없이는 바꿀 수 없다.
 *  - PERMISSIONS.md: 로그인 응답에 능력(capabilities) 목록 포함.
 *
 * 잠금 카운터는 in-memory(서버 1대 환경 가정). 분산 환경에서는 Redis 등으로 교체.
 */

const crypto = require('crypto');
const { prisma } = require('../lib/prisma');
const { signToken, hashPassword, comparePassword } = require('../lib/auth');
const { resolveCapabilities } = require('../lib/capabilities');
const mailer = require('../lib/mailer');

const loginAttempts = {};

const VERIFICATION_TTL_MS = 5 * 60 * 1000; // 5분
const VERIFICATION_MAX_ATTEMPTS = 5;
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000; // 30분

/** 가입 시 받는 역할 — 이 둘 외 값은 거부한다 (master 는 가입으로 만들 수 없다) */
const REGISTERABLE_ROLES = ['caregiver', 'institution'];

function buildToken(user) {
  return signToken({ userId: user.id, email: user.email, role: user.role });
}

function safeUser(user, institution = null, managerId = null) {
  const { password: _omit, capabilityGrants: _grants, ...rest } = user;
  return {
    ...rest,
    createdAt: rest.createdAt instanceof Date ? rest.createdAt.toISOString() : rest.createdAt,
    updatedAt: rest.updatedAt instanceof Date ? rest.updatedAt.toISOString() : rest.updatedAt,
    institutionId: user.institutionId || null,
    institutionName: institution?.name || user.institution?.name || null,
    // 앱이 일정(/managers/:id/visits)을 부를 때 쓰는 기준점 — caregiver 연결 매니저
    managerId: managerId || null,
    capabilities: resolveCapabilities(user),
  };
}

/** 로그인 계정에 연결된 Manager.id (caregiver 가입 시 자동 생성된 레코드) */
async function linkedManagerId(userId) {
  const m = await prisma.manager.findUnique({ where: { userId }, select: { id: true } });
  return m?.id || null;
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

class DashboardService {
  async login({ email, password }) {
    const normalizedEmail = String(email || '').toLowerCase();

    const attempts = loginAttempts[normalizedEmail];
    if (attempts?.lockedUntil && new Date(attempts.lockedUntil) > new Date()) {
      return { success: false, error: '계정이 일시적으로 잠겼습니다. 잠시 후 다시 시도해주세요.' };
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: { institution: { select: { name: true } } },
    });
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
      data: {
        user: safeUser(user, null, await linkedManagerId(user.id)),
        token: buildToken(user),
      },
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
    if (password.length < 8) {
      return { success: false, error: '비밀번호는 8자 이상이어야 합니다.' };
    }

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return { success: false, error: '이미 사용 중인 이메일입니다.' };
    }

    // §6 — 보낸 역할을 그대로 저장한다. 미지정('none' 포함)이면 legacy 'user'
    let role = 'user';
    if (data.role !== undefined && data.role !== null && data.role !== '' && data.role !== 'none') {
      if (!REGISTERABLE_ROLES.includes(data.role)) {
        return {
          success: false,
          error: `role은 ${REGISTERABLE_ROLES.join(', ')} 중 하나여야 합니다.`,
        };
      }
      role = data.role;
    }

    // §8 — institutionCode 는 오면 반드시 검증한다. 아무 값이나 통과시키지 않는다
    let institution = null;
    if (data.institutionCode !== undefined && data.institutionCode !== null && data.institutionCode !== '') {
      institution = await prisma.institution.findUnique({
        where: { code: String(data.institutionCode).trim() },
      });
      if (!institution) {
        return { success: false, error: '기관 코드가 올바르지 않습니다. 소속 기관에 확인해 주세요.' };
      }
    }

    const hashed = await hashPassword(password);
    const created = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashed,
        name: data.name || normalizedEmail.split('@')[0],
        phone: data.phone || null,
        role,
        emailVerified: false,
        institutionId: institution?.id || null,
      },
    });

    // 실무자 가입이면 매니저 레코드를 만들어 계정과 연결한다 —
    // 담당 배정·일정·서버 스코핑(§5)의 기준점이 된다
    let managerId = null;
    if (role === 'caregiver') {
      const manager = await prisma.manager
        .create({
          data: {
            name: created.name,
            gender: data.gender === 'male' ? 'male' : 'female',
            phone: created.phone,
            email: created.email,
            userId: created.id,
            ownerId: created.id,
          },
        })
        .catch((err) => {
          console.error('[register] 매니저 자동 생성 실패:', err.message);
          return null;
        });
      managerId = manager?.id || null;
    }

    return {
      success: true,
      data: { user: safeUser(created, institution, managerId), token: buildToken(created) },
    };
  }

  /**
   * §9 — 재설정 토큰 발급. 이메일 존재 여부와 무관하게 성공을 반환한다
   * (계정 존재 탐지 방지). 토큰은 메일로만 나간다.
   */
  async forgotPassword(data) {
    const normalizedEmail = String((data && data.email) || '').toLowerCase();
    if (!normalizedEmail) return { success: true };

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (user) {
      const token = crypto.randomBytes(16).toString('hex'); // 32자리
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      await mailer.sendPasswordResetToken(normalizedEmail, token);
    }
    return { success: true };
  }

  /**
   * §9 — 토큰 없는 재설정은 받지 않는다.
   * "이메일만 알면 계정을 빼앗을 수 있다"던 구멍을 막는다.
   */
  async resetPassword(data) {
    const nextPassword = data.newPassword || data.password;
    if (!nextPassword || nextPassword.length < 8) {
      return { success: false, error: '비밀번호는 8자 이상이어야 합니다.' };
    }
    if (!data.token) {
      return {
        success: false,
        error: '메일로 받은 재설정 코드가 필요합니다. 비밀번호 찾기를 먼저 진행해 주세요.',
      };
    }

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256(String(data.token).trim()) },
    });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      return { success: false, error: '유효하지 않거나 만료된 재설정 코드입니다.' };
    }

    const hashed = await hashPassword(nextPassword);
    await prisma.$transaction([
      prisma.user.update({ where: { id: record.userId }, data: { password: hashed } }),
      prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
    ]);
    return { success: true };
  }

  /**
   * §2 — 인증코드는 무작위로 만들고 메일로만 보낸다. 응답에 담지 않는다.
   */
  async sendEmailVerification(email) {
    const normalizedEmail = String(email || '').toLowerCase();
    if (!normalizedEmail) {
      return { success: false, error: '이메일을 입력해 주세요.' };
    }
    // 계정 존재 여부를 응답으로 알려주지 않는다 (열거 방지) —
    // 이미 가입된 이메일이면 코드 대신 안내 메일만 보낸다
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      await mailer.sendMail({
        to: normalizedEmail,
        subject: '[안심하이] 가입 안내',
        text: '이 이메일은 이미 안심하이에 가입되어 있습니다.\n비밀번호를 잊으셨다면 비밀번호 찾기를 이용해 주세요.\n본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.',
      });
      return { success: true };
    }

    const code = String(crypto.randomInt(100000, 1000000)); // 6자리 무작위
    await prisma.emailVerification.create({
      data: {
        email: normalizedEmail,
        codeHash: sha256(code),
        expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
      },
    });

    const result = await mailer.sendVerificationCode(normalizedEmail, code);
    if (!result.sent && mailer.isConfigured) {
      return { success: false, error: '인증 메일 발송에 실패했습니다. 잠시 후 다시 시도해 주세요.' };
    }
    // SMTP 미설정 환경(개발)에서는 서버 로그로만 확인한다 — 응답에는 절대 담지 않는다
    if (!mailer.isConfigured) {
      console.warn(`[auth] SMTP 미설정 — 인증코드(개발 확인용): ${normalizedEmail} → ${code}`);
    }
    return { success: true };
  }

  async verifyEmailCode(email, code) {
    const normalizedEmail = String(email || '').toLowerCase();
    if (!normalizedEmail || !code) {
      return { success: false, error: '이메일과 인증 코드를 입력해 주세요.' };
    }

    const record = await prisma.emailVerification.findFirst({
      where: { email: normalizedEmail, verifiedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.expiresAt < new Date()) {
      return { success: false, error: '인증 코드가 만료되었습니다. 다시 요청해 주세요.' };
    }
    if (record.attempts >= VERIFICATION_MAX_ATTEMPTS) {
      return { success: false, error: '시도 횟수를 초과했습니다. 인증 코드를 다시 요청해 주세요.' };
    }

    if (record.codeHash !== sha256(String(code).trim())) {
      await prisma.emailVerification.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      return { success: false, error: '인증 코드가 올바르지 않습니다.' };
    }

    await prisma.emailVerification.update({
      where: { id: record.id },
      data: { verifiedAt: new Date() },
    });
    return { success: true };
  }

  async requestOrganizationVerification(_data) {
    return { success: true, data: { requestId: 'req-' + Date.now() } };
  }

  /**
   * 계정 삭제. 앱/웹은 본인 확인용 비밀번호를 함께 보낸다 —
   * 비밀번호가 오면 반드시 검증하고, 틀리면 지우지 않는다.
   */
  async deleteAccount({ userId, password }) {
    if (!userId) return { success: true };

    if (password !== undefined && password !== null && password !== '') {
      const user = await prisma.user.findUnique({ where: { id: userId } });
      if (!user) return { success: true }; // 이미 없는 계정 — 멱등 처리
      const ok = await comparePassword(password, user.password);
      if (!ok) {
        return { success: false, code: 'AUTH_FAILED', error: '비밀번호가 올바르지 않습니다.' };
      }
    }

    await prisma.user.delete({ where: { id: userId } }).catch(() => null);
    return { success: true };
  }
}

module.exports = { DashboardService };
