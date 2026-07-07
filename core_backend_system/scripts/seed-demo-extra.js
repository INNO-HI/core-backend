/**
 * 시연용 추가 데이터 시드 (seed-demo.js 이후 실행)
 *
 * 대상: admin@safehi.kr (ownerId)
 * 목적: 통계/목록이 풍부하게 보이도록 매니저·대상자·돌봄일지·방문을 보강한다.
 *   - 방문(Visit)을 최근 6개월(현재월 포함)에 걸쳐 여러 동/매니저로 분산 → 방문 추이·동별 방문 차트
 *   - 돌봄일지(CareLog)를 여러 상태·여러 월로 분산 → 보고서 현황
 *
 * 멱등성: 고정 id + upsert. 반복 실행해도 중복되지 않는다.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// 결정적 유사난수 (Math.random 미사용 — 반복 실행 재현성)
function seeded(n) {
  let x = Math.sin(n) * 10000;
  return x - Math.floor(x);
}

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@safehi.kr';
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    console.error(`admin 계정(${adminEmail}) 없음. seed.js 먼저 실행 필요.`);
    process.exit(1);
  }
  const ownerId = admin.id;

  const centers = await prisma.center.findMany({ orderBy: { name: 'asc' } });
  const dongs = await prisma.dong.findMany({ orderBy: { name: 'asc' } });
  if (!centers.length || !dongs.length) {
    console.error('Center/Dong reference data 없음. seed.js 먼저 실행 필요.');
    process.exit(1);
  }
  const centerByName = Object.fromEntries(centers.map((c) => [c.name, c]));
  const dongByName = Object.fromEntries(dongs.map((d) => [d.name, d]));
  const pickCenter = (name) => centerByName[name] || centers[0];
  const pickDong = (name) => dongByName[name] || dongs[0];

  // ── 1. 매니저 보강 (기존 demo-mgr-001~003 + 신규 2명) ─────────
  const extraManagers = [
    {
      id: 'demo-mgr-004', name: '김서연', gender: 'female',
      phone: '010-2244-6688', email: 'seoyeon.kim@safehi.kr',
      status: 'active', centerId: pickCenter('신정사회복지관').id, ownerId,
      recipientCount: 5, monthlyVisits: 20, startDate: new Date('2023-09-01'),
      dongNames: ['신정 1동', '신정 2동'],
    },
    {
      id: 'demo-mgr-005', name: '정우성', gender: 'male',
      phone: '010-3355-7799', email: 'woosung.jung@safehi.kr',
      status: 'active', centerId: pickCenter('신월복지센터').id, ownerId,
      recipientCount: 4, monthlyVisits: 16, startDate: new Date('2024-02-15'),
      dongNames: ['신월 1동', '신월 2동'],
    },
  ];

  for (const def of extraManagers) {
    const { id, dongNames, ...data } = def;
    await prisma.manager.upsert({ where: { id }, update: { ...data }, create: { id, ...data } });
    await prisma.managerDong.deleteMany({ where: { managerId: id } });
    for (const dn of dongNames) {
      await prisma.managerDong.create({ data: { managerId: id, dongId: pickDong(dn).id } });
    }
  }

  const allManagers = await prisma.manager.findMany({ where: { ownerId }, orderBy: { name: 'asc' } });
  const mgrByName = Object.fromEntries(allManagers.map((m) => [m.name, m]));

  // ── 2. 대상자 보강 (신규 6명, 다양한 동/상태/매니저) ──────────
  const now = new Date();
  const day = 24 * 60 * 60 * 1000;
  const extraRecipients = [
    { id: 'demo-rcp-004', name: '한말순', age: 81, gender: 'female', status: 'normal',   dong: '목동 4동', mgr: '이민준', addr: '서울시 양천구 목동 4로 11' },
    { id: 'demo-rcp-005', name: '오정호', age: 79, gender: 'male',   status: 'caution',  dong: '신정 1동', mgr: '김서연', addr: '서울시 양천구 신정 1로 22' },
    { id: 'demo-rcp-006', name: '서복순', age: 85, gender: 'female', status: 'urgent',   dong: '신월 1동', mgr: '정우성', addr: '서울시 양천구 신월 1로 33' },
    { id: 'demo-rcp-007', name: '강태식', age: 77, gender: 'male',   status: 'normal',   dong: '목동 2동', mgr: '박지수', addr: '서울시 양천구 목동 2로 44' },
    { id: 'demo-rcp-008', name: '윤금자', age: 88, gender: 'female', status: 'caution',  dong: '신정 2동', mgr: '김서연', addr: '서울시 양천구 신정 2로 55' },
    { id: 'demo-rcp-009', name: '조병철', age: 73, gender: 'male',   status: 'unvisited', dong: '신월 2동', mgr: '정우성', addr: '서울시 양천구 신월 2로 66' },
  ];

  const recipientRecords = [];
  for (const def of extraRecipients) {
    const rec = await prisma.recipient.upsert({
      where: { id: def.id },
      update: {
        name: def.name, age: def.age, gender: def.gender, status: def.status,
        address: def.addr, dongId: pickDong(def.dong).id,
        managerId: mgrByName[def.mgr]?.id || null, ownerId,
      },
      create: {
        id: def.id, name: def.name, age: def.age, gender: def.gender, status: def.status,
        address: def.addr, phone: '010-0000-0000', dongId: pickDong(def.dong).id,
        managerId: mgrByName[def.mgr]?.id || null, ownerId,
        careStartDate: new Date('2024-05-01'), visitCount: 0,
        healthInfo: { diseases: ['고혈압'], medications: ['혈압약'], notes: '정기 관찰 대상' },
        emergencyContact: { name: '보호자', relationship: '자녀', phone: '010-0000-1111' },
      },
    });
    recipientRecords.push({ ...def, record: rec });
  }

  // 통계 대상 대상자 풀 (기존 3 + 신규 6)
  const baseRecipients = await prisma.recipient.findMany({ where: { ownerId }, include: { dong: true, manager: true } });

  // ── 3. 방문 기록: 최근 6개월에 걸쳐 분산 ─────────────────────
  // 각 대상자마다 월별 1~2건씩, 담당 매니저/동 기준
  let visitCount = 0;
  for (let ri = 0; ri < baseRecipients.length; ri++) {
    const r = baseRecipients[ri];
    if (!r.managerId) continue;
    for (let m = 5; m >= 0; m--) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - m, 1);
      const per = 1 + Math.floor(seeded(ri * 7 + m) * 2); // 1~2건
      for (let k = 0; k < per; k++) {
        const dayOffset = 2 + Math.floor(seeded(ri * 31 + m * 5 + k) * 24);
        const visitDate = new Date(monthDate.getFullYear(), monthDate.getMonth(), dayOffset, 10, 0, 0);
        if (visitDate > now) continue;
        const id = `demo-x-vis-${r.id}-${m}-${k}`;
        await prisma.visit.upsert({
          where: { id },
          update: { visitDate, managerId: r.managerId },
          create: {
            id, recipientId: r.id, managerId: r.managerId, ownerId,
            visitDate, visitType: seeded(ri + m + k) > 0.8 ? 'call' : 'visit',
            summary: '정기 방문 상담',
          },
        });
        visitCount++;
      }
    }
  }

  // ── 4. 돌봄일지 보강: 여러 상태/여러 월 ──────────────────────
  const statuses = ['approved', 'approved', 'pending', 'urgent', 'rejected'];
  let clCount = 0;
  for (let ri = 0; ri < baseRecipients.length; ri++) {
    const r = baseRecipients[ri];
    if (!r.managerId) continue;
    for (let m = 3; m >= 0; m--) {
      const created = new Date(now.getFullYear(), now.getMonth() - m, 5 + Math.floor(seeded(ri + m) * 20), 9, 0, 0);
      if (created > now) continue;
      const status = statuses[(ri + m) % statuses.length];
      const id = `demo-x-cl-${r.id}-${m}`;
      await prisma.careLog.upsert({
        where: { id },
        // createdAt 을 월별로 분산 (보고서 현황 차트가 과거 월에도 집계되도록)
        update: { status, createdAt: created },
        create: {
          id, status, recipientId: r.id, managerId: r.managerId,
          centerId: null, ownerId, visitDate: created, createdAt: created, visitType: 'visit',
          careContent: { healthStatus: '관찰', mealStatus: '양호', emotionalStatus: '안정', livingEnvironment: '양호' },
          notes: '정기 돌봄 기록',
        },
      });
      clCount++;
    }
  }

  // recipient.visitCount 재집계
  for (const r of baseRecipients) {
    const c = await prisma.visit.count({ where: { ownerId, recipientId: r.id } });
    const last = await prisma.visit.findFirst({ where: { ownerId, recipientId: r.id }, orderBy: { visitDate: 'desc' } });
    await prisma.recipient.update({
      where: { id: r.id },
      data: { visitCount: c, lastVisitDate: last?.visitDate || null },
    });
  }

  const totals = {
    managers: await prisma.manager.count({ where: { ownerId } }),
    recipients: await prisma.recipient.count({ where: { ownerId } }),
    visits: await prisma.visit.count({ where: { ownerId } }),
    careLogs: await prisma.careLog.count({ where: { ownerId } }),
  };
  console.log('[seed-demo-extra] 완료:', JSON.stringify(totals));
  console.log(`  방문 신규/갱신 ~${visitCount}, 돌봄일지 ~${clCount}`);
}

main()
  .catch((e) => { console.error('[seed-demo-extra] 오류:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
