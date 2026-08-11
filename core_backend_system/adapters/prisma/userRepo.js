/**
 * PostgreSQL User Repository (Prisma) — 계정(관리자) 관리
 *
 * 관리자 전용. User 테이블 CRUD.
 * 주의: User 삭제 시 소유 데이터(대상자/매니저/일지/방문/메모/알림 등)가 cascade 삭제된다.
 */

const { hashPassword } = require('../../lib/auth');
const { resolveCapabilities, parseGrants, ALL_CAPABILITIES, ROLE_PRESETS } = require('../../lib/capabilities');

const VALID_ROLES = ['admin', 'user', 'manager', 'master', 'institution', 'caregiver'];

class PrismaUserRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  _serialize(u, counts) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      phone: u.phone || '',
      role: u.role,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
      updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : u.updatedAt || null,
      ...(counts ? { recipientCount: counts.recipients, managerCount: counts.managers } : {}),
    };
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
      include: { _count: { select: { recipients: true, managers: true } } },
    });
    return users.map((u) =>
      this._serialize(u, { recipients: u._count.recipients, managers: u._count.managers })
    );
  }

  async createUser({ email, name, password, role, phone } = {}) {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) throw new Error('이메일은 필수입니다.');
    if (!password || password.length < 8) throw new Error('비밀번호는 8자 이상이어야 합니다.');

    const existing = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (existing) throw new Error('이미 사용 중인 이메일입니다.');

    const hashed = await hashPassword(password);
    const created = await this.prisma.user.create({
      data: {
        email: normalized,
        name: (name && String(name).trim()) || normalized.split('@')[0],
        password: hashed,
        role: VALID_ROLES.includes(role) ? role : 'user',
        phone: phone || null,
        emailVerified: true,
      },
    });
    return this._serialize(created);
  }

  async updateUser(id, { name, role, phone } = {}) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) return null;

    const patch = {};
    if (name !== undefined) patch.name = String(name).trim();
    if (phone !== undefined) patch.phone = phone || null;
    if (role !== undefined && VALID_ROLES.includes(role)) {
      // 마지막 관리자를 강등하지 못하게 보호
      if ((existing.role === 'admin' || existing.role === 'master') && role !== 'admin' && role !== 'master') {
        const adminCount = await this.prisma.user.count({ where: { role: { in: ['admin', 'master'] } } });
        if (adminCount <= 1) {
          throw new Error('마지막 관리자 계정의 권한은 변경할 수 없습니다.');
        }
      }
      patch.role = role;
    }

    const updated = await this.prisma.user.update({ where: { id }, data: patch });
    return this._serialize(updated);
  }

  async resetPassword(id, newPassword) {
    if (!newPassword || newPassword.length < 8) {
      return { success: false, error: '비밀번호는 8자 이상이어야 합니다.' };
    }
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) return { success: false, notFound: true };

    const hashed = await hashPassword(newPassword);
    await this.prisma.user.update({ where: { id }, data: { password: hashed } });
    return { success: true };
  }

  /** 계정별 권한 조회 (PERMISSIONS.md — 실제 권한 = preset + grants − revokes) */
  async getCapabilities(id) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, capabilityGrants: true },
    });
    if (!user) return null;
    const { grants, revokes } = parseGrants(user.capabilityGrants);
    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      preset: ROLE_PRESETS[user.role] ?? [],
      grants,
      revokes,
      capabilities: resolveCapabilities(user),
      allCapabilities: ALL_CAPABILITIES,
    };
  }

  /** 계정별 권한 조정 저장 — 마스터가 계정마다 능력을 열고 닫는다 */
  async setCapabilities(id, { grants, revokes } = {}) {
    const existing = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return null;

    const clean = (arr) =>
      Array.isArray(arr) ? arr.filter((c) => ALL_CAPABILITIES.includes(c)) : [];
    await this.prisma.user.update({
      where: { id },
      data: { capabilityGrants: { grants: clean(grants), revokes: clean(revokes) } },
    });
    return this.getCapabilities(id);
  }

  async deleteUser(currentUserId, id) {
    if (id === currentUserId) {
      return { success: false, error: '현재 로그인한 계정은 삭제할 수 없습니다.' };
    }
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) return { success: false, notFound: true };

    if (existing.role === 'admin' || existing.role === 'master') {
      const adminCount = await this.prisma.user.count({ where: { role: { in: ['admin', 'master'] } } });
      if (adminCount <= 1) {
        return { success: false, error: '마지막 관리자 계정은 삭제할 수 없습니다.' };
      }
    }

    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}

module.exports = { PrismaUserRepo };
