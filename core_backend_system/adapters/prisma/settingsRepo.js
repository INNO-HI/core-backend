/**
 * PostgreSQL Settings Repository (Prisma) — ownerId 격리
 *
 * 프로필(User 테이블)과 관할 구역(동/센터/매니저 집계)을 실 데이터에서 조회한다.
 * 알림/시스템 환경설정은 사용자 UI 선호값이라 클라이언트(localStorage)에서 관리하며
 * DB 대상이 아니다.
 *
 * organizationName / department 는 대응 DB 컬럼이 없어 dong 목록에서 유추한 라벨을 사용한다.
 */

const { hashPassword, comparePassword } = require('../../lib/auth');

const ROLE_LABELS = {
  admin: '구/군 관리자',
  manager: '매니저',
  user: '관리자',
};

class PrismaSettingsRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  _profileFromUser(user) {
    const name = user?.name || '';
    return {
      id: user?.id || '',
      name,
      email: user?.email || '',
      phone: user?.phone || '',
      role: user?.role === 'manager' ? 'manager' : 'district_admin',
      roleLabel: ROLE_LABELS[user?.role] || '관리자',
      createdAt: user?.createdAt instanceof Date ? user.createdAt.toISOString() : user?.createdAt || '',
      avatarInitials: name.slice(0, 2),
    };
  }

  /** dong 명칭으로 관할 지자체 라벨 유추 (전용 컬럼 부재) */
  _regionLabel(dongNames) {
    const joined = dongNames.join(' ');
    if (/목동|신정|신월/.test(joined)) return '서울특별시 양천구';
    if (/제주/.test(joined)) return '제주특별자치도 제주시';
    return '안심하이 통합 돌봄';
  }

  async getSettings(ownerId) {
    const [user, dongs, centerCount, managerCount] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: ownerId } }),
      this.prisma.dong.findMany({ orderBy: { name: 'asc' }, select: { name: true } }),
      this.prisma.center.count(),
      this.prisma.manager.count({ where: { ownerId } }),
    ]);

    const dongList = dongs.map((d) => d.name);

    return {
      profile: this._profileFromUser(user),
      jurisdiction: {
        organizationName: this._regionLabel(dongList),
        department: '어르신복지과 · 돌봄 서비스팀',
        dongCount: dongList.length,
        centerCount,
        managerCount,
        dongList,
      },
    };
  }

  async updateProfile(ownerId, data = {}) {
    const patch = {};
    if (typeof data.name === 'string' && data.name.trim()) patch.name = data.name.trim();
    if (typeof data.phone === 'string') patch.phone = data.phone.trim() || null;

    // 이메일 변경은 unique 제약 — 중복 시 예외 없이 무시
    if (typeof data.email === 'string' && data.email.trim()) {
      const normalized = data.email.trim().toLowerCase();
      const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
      if (!existing || existing.id === ownerId) patch.email = normalized;
    }

    const user = Object.keys(patch).length
      ? await this.prisma.user.update({ where: { id: ownerId }, data: patch })
      : await this.prisma.user.findUnique({ where: { id: ownerId } });

    return this._profileFromUser(user);
  }

  async changePassword(ownerId, { currentPassword, newPassword } = {}) {
    const user = await this.prisma.user.findUnique({ where: { id: ownerId } });
    if (!user) return { success: false, error: '사용자를 찾을 수 없습니다.' };

    const ok = await comparePassword(currentPassword || '', user.password);
    if (!ok) return { success: false, error: '현재 비밀번호가 올바르지 않습니다.' };

    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: '새 비밀번호는 8자 이상이어야 합니다.' };
    }

    const hashed = await hashPassword(newPassword);
    await this.prisma.user.update({ where: { id: user.id }, data: { password: hashed } });
    return { success: true };
  }
}

module.exports = { PrismaSettingsRepo };
