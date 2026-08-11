/**
 * PostgreSQL Institution Repository (Prisma)
 * BACKEND_REQUEST §8 — 가입 시 4자리 기관 코드를 검증하는 대상.
 * 기관 등록·목록은 관리자(master/admin) 전용.
 */

class PrismaInstitutionRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  _serialize(i, userCount) {
    return {
      id: i.id,
      name: i.name,
      code: i.code,
      phone: i.phone || null,
      address: i.address || null,
      createdAt: i.createdAt.toISOString(),
      ...(userCount !== undefined ? { userCount } : {}),
    };
  }

  async list() {
    const items = await this.prisma.institution.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
    return items.map((i) => this._serialize(i, i._count.users));
  }

  async create({ name, code, phone, address } = {}) {
    if (!name || !String(name).trim()) throw new Error('기관 이름은 필수입니다.');
    const normalizedCode = String(code || '').trim();
    if (!/^\d{4}$/.test(normalizedCode)) throw new Error('기관 코드는 4자리 숫자여야 합니다.');

    const existing = await this.prisma.institution.findUnique({ where: { code: normalizedCode } });
    if (existing) throw new Error('이미 사용 중인 기관 코드입니다.');

    const created = await this.prisma.institution.create({
      data: {
        name: String(name).trim(),
        code: normalizedCode,
        phone: phone || null,
        address: address || null,
      },
    });
    return this._serialize(created);
  }

  async remove(id) {
    const existing = await this.prisma.institution.findUnique({ where: { id } });
    if (!existing) return { success: false, notFound: true };
    await this.prisma.institution.delete({ where: { id } });
    return { success: true };
  }

  // ── 센터 관리 (전역 참조 데이터 — 마스터 콘솔에서 등록·삭제) ──

  async listCenters() {
    const items = await this.prisma.center.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { managers: true } } },
    });
    return items.map((c) => ({ id: c.id, name: c.name, managerCount: c._count.managers }));
  }

  async createCenter({ name } = {}) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('센터 이름은 필수입니다.');
    const existing = await this.prisma.center.findUnique({ where: { name: trimmed } });
    if (existing) throw new Error('이미 등록된 센터 이름입니다.');
    const created = await this.prisma.center.create({ data: { name: trimmed } });
    return { id: created.id, name: created.name, managerCount: 0 };
  }

  async removeCenter(id) {
    const existing = await this.prisma.center.findUnique({
      where: { id },
      include: { _count: { select: { managers: true } } },
    });
    if (!existing) return { success: false, notFound: true };
    if (existing._count.managers > 0) {
      // Center 삭제는 Restrict — 소속 매니저를 먼저 옮겨야 한다
      return {
        success: false,
        error: `소속 매니저가 ${existing._count.managers}명 있어 삭제할 수 없습니다. 매니저의 센터를 먼저 변경해주세요.`,
      };
    }
    await this.prisma.center.delete({ where: { id } });
    return { success: true };
  }
}

module.exports = { PrismaInstitutionRepo };
