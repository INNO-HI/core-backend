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

    // 기관 = 센터 — 기관을 만들면 동명 센터를 자동으로 만들어 연결한다.
    // (센터는 매니저 FK 때문에 내부적으로 유지하되, 화면 개념으로는 기관 하나만 쓴다)
    await this.prisma.center
      .upsert({
        where: { name: created.name },
        update: { institutionId: created.id },
        create: { name: created.name, institutionId: created.id },
      })
      .catch(() => null);

    return this._serialize(created);
  }

  async update(id, { name, code, address, phone } = {}) {
    const existing = await this.prisma.institution.findUnique({ where: { id } });
    if (!existing) return null;
    const patch = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) throw new Error('기관 이름은 필수입니다.');
      patch.name = trimmed;
    }
    if (code !== undefined) {
      const normalizedCode = String(code).trim();
      if (!/^\d{4}$/.test(normalizedCode)) throw new Error('기관 코드는 4자리 숫자여야 합니다.');
      const dup = await this.prisma.institution.findUnique({ where: { code: normalizedCode } });
      if (dup && dup.id !== id) throw new Error('이미 사용 중인 기관 코드입니다.');
      patch.code = normalizedCode;
    }
    if (address !== undefined) patch.address = address || null;
    if (phone !== undefined) patch.phone = phone || null;
    const updated = await this.prisma.institution.update({ where: { id }, data: patch });
    return this._serialize(updated);
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
      include: {
        _count: { select: { managers: true } },
        institution: { select: { id: true, name: true } },
      },
    });
    return items.map((c) => ({
      id: c.id,
      name: c.name,
      managerCount: c._count.managers,
      institutionId: c.institution?.id || null,
      institutionName: c.institution?.name || null, // null = 무소속 (옛 시드 잔재)
    }));
  }

  async createCenter({ name, institutionId } = {}) {
    const trimmed = String(name || '').trim();
    if (!trimmed) throw new Error('센터 이름은 필수입니다.');
    const existing = await this.prisma.center.findUnique({ where: { name: trimmed } });
    if (existing) throw new Error('이미 등록된 센터 이름입니다.');

    // 소속 기관 검증 (센터는 기관에 속한다)
    let inst = null;
    if (institutionId) {
      inst = await this.prisma.institution.findUnique({ where: { id: institutionId } });
      if (!inst) throw new Error('소속 기관을 찾을 수 없습니다.');
    }

    const created = await this.prisma.center.create({
      data: { name: trimmed, institutionId: inst?.id || null },
    });
    return {
      id: created.id,
      name: created.name,
      managerCount: 0,
      institutionId: inst?.id || null,
      institutionName: inst?.name || null,
    };
  }

  async updateCenter(id, { name, institutionId } = {}) {
    const existing = await this.prisma.center.findUnique({ where: { id } });
    if (!existing) return null;
    const patch = {};
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) throw new Error('센터 이름은 필수입니다.');
      const dup = await this.prisma.center.findUnique({ where: { name: trimmed } });
      if (dup && dup.id !== id) throw new Error('이미 등록된 센터 이름입니다.');
      patch.name = trimmed;
    }
    if (institutionId !== undefined) {
      if (institutionId) {
        const inst = await this.prisma.institution.findUnique({ where: { id: institutionId } });
        if (!inst) throw new Error('소속 기관을 찾을 수 없습니다.');
        patch.institutionId = inst.id;
      } else {
        patch.institutionId = null;
      }
    }
    await this.prisma.center.update({ where: { id }, data: patch });
    const rows = await this.listCenters();
    return rows.find((c) => c.id === id) || null;
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
