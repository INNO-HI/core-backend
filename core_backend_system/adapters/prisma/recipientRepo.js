/**
 * PostgreSQL Recipient Repository (Prisma) — ownerId 격리
 */

/** birthDate 로 만 나이 계산 (BACKEND_REQUEST §7 — age 0 방지). 못 구하면 저장값 사용 */
function computeAge(birthDate, storedAge) {
  if (!birthDate) return storedAge ?? 0;
  const birth = new Date(birthDate);
  if (isNaN(birth.getTime())) return storedAge ?? 0;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age--;
  return Math.max(age, 0);
}

class PrismaRecipientRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  async getRecipients(ownerId, filters, restrictManagerId) {
    const where = { ownerId };
    if (restrictManagerId) where.managerId = restrictManagerId; // caregiver 담당분만

    if (filters.status && filters.status !== 'all') where.status = filters.status;

    if (filters.search) {
      const s = filters.search;
      where.OR = [
        { name: { contains: s, mode: 'insensitive' } },
        { address: { contains: s, mode: 'insensitive' } },
        { dong: { name: { contains: s, mode: 'insensitive' } } },
      ];
    }

    if (filters.dong && filters.dong !== 'all') where.dong = { name: filters.dong };
    if (filters.manager && filters.manager !== 'all') where.manager = { name: filters.manager };

    const [allCount, normalCount, cautionCount, urgentCount, unvisitedCount] = await Promise.all([
      this.prisma.recipient.count({ where: { ownerId } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'normal' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'caution' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'urgent' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'unvisited' } }),
    ]);

    const statusCounts = {
      all: allCount,
      normal: normalCount,
      caution: cautionCount,
      urgent: urgentCount,
      unvisited: unvisitedCount,
    };

    const recipients = await this.prisma.recipient.findMany({
      where,
      include: {
        dong: { select: { name: true } },
        manager: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });

    return {
      recipients: recipients.map((r) => ({
        id: r.id,
        name: r.name,
        age: computeAge(r.birthDate, r.age),
        birthDate: r.birthDate ? r.birthDate.toISOString().split('T')[0] : null,
        gender: r.gender,
        dong: r.dong?.name || '',
        address: r.address || '',
        // §5 — 목록·상세 같은 이름: manager 객체({id, name})로 통일. managerName 은 호환 유지
        manager: r.manager ? { id: r.manager.id, name: r.manager.name } : null,
        managerName: r.manager?.name || '',
        lastVisitDate: r.lastVisitDate ? r.lastVisitDate.toISOString() : null,
        visitCount: r.visitCount,
        status: r.status,
      })),
      totalCount: recipients.length,
      statusCounts,
    };
  }

  async getKPIs(ownerId) {
    const [total, normal, caution, urgent, unvisited] = await Promise.all([
      this.prisma.recipient.count({ where: { ownerId } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'normal' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'caution' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'urgent' } }),
      this.prisma.recipient.count({ where: { ownerId, status: 'unvisited' } }),
    ]);
    return { total, normal, caution, urgent, unvisited };
  }

  async getRecipientById(ownerId, id, restrictManagerId) {
    const r = await this.prisma.recipient.findFirst({
      where: restrictManagerId ? { id, ownerId, managerId: restrictManagerId } : { id, ownerId },
      include: {
        dong: { select: { name: true } },
        manager: { select: { id: true, name: true, phone: true, center: { select: { name: true } } } },
        memos: {
          include: { author: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        visits: {
          orderBy: { visitDate: 'desc' },
          take: 10,
          include: { manager: { select: { name: true } } },
        },
        policyRecommendations: {
          include: { policy: true },
          orderBy: { matchScore: 'desc' },
        },
      },
    });

    if (!r) return null;

    // 현재 유효한 음성 수집 동의 (스펙 확정 필드명: voiceConsent — §3.2)
    const activeConsent = await this.prisma.consent.findFirst({
      where: { ownerId, recipientId: id, voiceConsent: true, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
      select: { id: true },
    });

    const now = new Date();
    const monthPromises = [];
    for (let i = 5; i >= 0; i--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const nextMonth = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      const monthName = `${monthDate.getMonth() + 1}월`;
      monthPromises.push(
        this.prisma.visit
          .count({
            where: {
              ownerId,
              recipientId: id,
              visitDate: { gte: monthDate, lt: nextMonth },
            },
          })
          .then((count) => ({ month: monthName, count }))
      );
    }
    const monthlyVisits = await Promise.all(monthPromises);

    const urgentHistory = await this.prisma.careLog.count({
      where: { ownerId, recipientId: id, status: 'urgent' },
    });

    const totalReports = await this.prisma.careLog.count({
      where: { ownerId, recipientId: id },
    });

    return {
      id: r.id,
      name: r.name,
      age: computeAge(r.birthDate, r.age),
      gender: r.gender,
      status: r.status,
      // BACKEND_DB_SPEC.md §3.1~3.2 확장 필드
      voiceConsent: Boolean(activeConsent),
      birthDate: r.birthDate ? r.birthDate.toISOString().split('T')[0] : null,
      livingAlone: r.livingAlone ?? null,
      guardianName: r.guardianName || null,
      guardianPhone: r.guardianPhone || null,
      addressDetail: r.addressDetail || null,
      basicInfo: {
        address: r.address || '',
        dong: r.dong?.name || '',
        phone: r.phone || '',
        emergencyContact: r.emergencyContact || null,
      },
      manager: r.manager
        ? {
            id: r.manager.id,
            name: r.manager.name,
            phone: r.manager.phone || '',
            centerName: r.manager.center?.name || '',
          }
        : null,
      healthInfo: r.healthInfo || null,
      recentVisits: r.visits.map((v) => ({
        id: v.id,
        careLogId: v.careLogId || '',
        visitDate: v.visitDate.toISOString(),
        visitType: v.visitType,
        managerName: v.manager.name,
        summary: v.summary || '',
      })),
      careStartDate: r.careStartDate ? r.careStartDate.toISOString().split('T')[0] : null,
      kpi: {
        monthlyVisits: monthlyVisits.length > 0 ? monthlyVisits[monthlyVisits.length - 1].count : 0,
        totalVisits: r.visitCount,
        totalReports,
        urgentHistory,
      },
      memos: r.memos.map((m) => ({
        id: m.id,
        recipientId: m.recipientId,
        authorId: m.author.id,
        authorName: m.author.name,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
        type: m.type || 'normal',
      })),
      monthlyVisits,
      policyRecommendations: r.policyRecommendations.map((rp) => ({
        id: rp.policy.id,
        name: rp.policy.name,
        description: rp.policy.summary || '',
        matchScore: rp.matchScore,
        icon: 'health',
        badge: rp.matchScore >= 90 ? '적합' : '추천',
      })),
    };
  }

  /** 동 이름 → id (전역 reference) */
  async _resolveDongId(name) {
    if (!name || name === 'all') return null;
    const d = await this.prisma.dong.findFirst({ where: { name } });
    return d?.id || null;
  }

  /** 매니저 이름 → id (계정별) */
  async _resolveManagerId(ownerId, name) {
    if (!name || name === 'all') return null;
    const m = await this.prisma.manager.findFirst({ where: { ownerId, name } });
    return m?.id || null;
  }

  /**
   * 담당자 지정 해석 (BACKEND_REQUEST §1)
   * managerId(권장)를 우선 받고, 이름(managerName/manager)도 하위호환으로 받는다.
   * 잘못된 id·이름이면 조용히 null 로 넘기지 않고 에러를 던진다 —
   * "200을 주면서 반영하지 않는" 것이 §1이 지적한 문제다.
   */
  async _resolveManagerAssignment(ownerId, data) {
    if (data.managerId !== undefined) {
      if (data.managerId === null || data.managerId === '') return null; // 배정 해제
      const m = await this.prisma.manager.findFirst({
        where: { id: String(data.managerId), ownerId },
        select: { id: true },
      });
      if (!m) throw new Error('managerId에 해당하는 담당자를 찾을 수 없습니다.');
      return m.id;
    }
    const name = data.managerName ?? data.manager;
    if (name === undefined) return undefined; // 변경 요청 없음
    if (name === null || name === '') return null;
    // 이름 대신 id 를 이 필드로 보낸 경우도 받아준다 (앱팀이 실제로 그렇게 시도했다)
    const byId = await this.prisma.manager.findFirst({
      where: { id: String(name), ownerId },
      select: { id: true },
    });
    if (byId) return byId.id;
    const byName = await this.prisma.manager.findFirst({
      where: { ownerId, name: String(name) },
      select: { id: true },
    });
    if (!byName) throw new Error('해당 이름·id의 담당자를 찾을 수 없습니다.');
    return byName.id;
  }

  /** 대상자 생성 — writerId: 소유로 기록될 계정(본인). 조회·검증은 ownerId(기관 스코프) */
  async createRecipient(ownerId, data = {}, writerId) {
    if (!data.name || !String(data.name).trim()) {
      throw new Error('이름은 필수입니다.');
    }

    const dongId = await this._resolveDongId(data.dong);
    const resolvedManagerId = await this._resolveManagerAssignment(ownerId, data);
    const managerId = resolvedManagerId === undefined ? null : resolvedManagerId;

    const created = await this.prisma.recipient.create({
      data: {
        ownerId: writerId || (typeof ownerId === 'string' ? ownerId : undefined),
        name: String(data.name).trim(),
        age: Number(data.age) || 0,
        gender: data.gender === 'male' ? 'male' : 'female',
        status: data.status || 'normal',
        address: data.address || null,
        phone: data.phone || null,
        dongId,
        managerId,
        careStartDate: data.careStartDate ? new Date(data.careStartDate) : null,
        healthInfo: data.healthInfo ?? null,
        emergencyContact: data.emergencyContact ?? null,
        birthDate: data.birthDate ? new Date(data.birthDate) : null,
        livingAlone: data.livingAlone ?? null,
        guardianName: data.guardianName || null,
        guardianPhone: data.guardianPhone || null,
        addressDetail: data.addressDetail || null,
      },
    });

    return this.getRecipientById(ownerId, created.id);
  }

  /** 대상자 수정 */
  async updateRecipient(ownerId, id, data = {}) {
    const existing = await this.prisma.recipient.findFirst({ where: { id, ownerId } });
    if (!existing) return null;

    const patch = {};
    if (data.name !== undefined) patch.name = String(data.name).trim();
    if (data.age !== undefined) patch.age = Number(data.age) || 0;
    if (data.gender !== undefined) patch.gender = data.gender === 'male' ? 'male' : 'female';
    if (data.status !== undefined) patch.status = data.status;
    if (data.address !== undefined) patch.address = data.address || null;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.careStartDate !== undefined) {
      patch.careStartDate = data.careStartDate ? new Date(data.careStartDate) : null;
    }
    if (data.healthInfo !== undefined) patch.healthInfo = data.healthInfo;
    if (data.emergencyContact !== undefined) patch.emergencyContact = data.emergencyContact;
    if (data.birthDate !== undefined) patch.birthDate = data.birthDate ? new Date(data.birthDate) : null;
    if (data.livingAlone !== undefined) patch.livingAlone = data.livingAlone;
    if (data.guardianName !== undefined) patch.guardianName = data.guardianName || null;
    if (data.guardianPhone !== undefined) patch.guardianPhone = data.guardianPhone || null;
    if (data.addressDetail !== undefined) patch.addressDetail = data.addressDetail || null;
    if (data.dong !== undefined) patch.dongId = await this._resolveDongId(data.dong);
    const resolvedManagerId = await this._resolveManagerAssignment(ownerId, data);
    if (resolvedManagerId !== undefined) patch.managerId = resolvedManagerId;

    await this.prisma.recipient.update({ where: { id }, data: patch });
    return this.getRecipientById(ownerId, id);
  }

  /** 대상자 삭제 (연결된 일지/방문/메모/정책추천 cascade) */
  async deleteRecipient(ownerId, id) {
    const existing = await this.prisma.recipient.findFirst({ where: { id, ownerId } });
    if (!existing) return { success: false, notFound: true };
    await this.prisma.recipient.delete({ where: { id } });
    return { success: true };
  }
}

module.exports = { PrismaRecipientRepo };
