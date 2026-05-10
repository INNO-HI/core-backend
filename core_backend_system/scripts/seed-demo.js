/**
 * 시연용 더미 데이터 시드 스크립트
 *
 * 대상: admin@safehi.kr 계정 (ownerId = admin user ID)
 *
 * 삽입 데이터:
 *   - Managers 3명 (active 2, leave 1)
 *   - Recipients 3명 (normal, caution, urgent)
 *   - CareLog 3건 (approved, pending, urgent)
 *   - Visit 3건 (CareLog 연결)
 *   - Memo 3건 (대상자별 1건)
 *   - Notification 3건
 *   - RecipientPolicy 추천 (각 대상자 × 2 정책)
 *
 * 멱등성: 이미 존재하면 upsert로 덮어쓴다.
 */

const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('🎬 [seed-demo] 시연용 더미 데이터 삽입 시작...');

  // ── 0. admin 사용자 조회 ─────────────────────────────────────
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@safehi.kr';
  const admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    console.error(`❌ admin 계정(${adminEmail})이 없습니다. 먼저 seed.js를 실행하세요.`);
    process.exit(1);
  }
  const ownerId = admin.id;
  console.log(`  ✔ owner: ${adminEmail} (${ownerId})`);

  // ── 1. 센터/동 조회 ─────────────────────────────────────────
  const centers = await prisma.center.findMany({ take: 4 });
  const dongs   = await prisma.dong.findMany({ take: 8 });
  if (centers.length === 0 || dongs.length === 0) {
    console.error('❌ Center/Dong reference data가 없습니다. 먼저 seed.js를 실행하세요.');
    process.exit(1);
  }
  const [c1, c2, c3]         = centers;
  const [d1, d2, d3, d4, d5] = dongs;

  // ── 2. 매니저 3명 ───────────────────────────────────────────
  const managerDefs = [
    {
      id: 'demo-mgr-001',
      name: '이민준', gender: 'male',
      phone: '010-3310-2241', email: 'minjun.lee@safehi.kr',
      status: 'active', centerId: c1.id, ownerId,
      recipientCount: 8, monthlyVisits: 32,
      startDate: new Date('2023-03-01'),
    },
    {
      id: 'demo-mgr-002',
      name: '박지수', gender: 'female',
      phone: '010-5527-8834', email: 'jisoo.park@safehi.kr',
      status: 'active', centerId: c2.id, ownerId,
      recipientCount: 6, monthlyVisits: 24,
      startDate: new Date('2022-07-15'),
    },
    {
      id: 'demo-mgr-003',
      name: '최현우', gender: 'male',
      phone: '010-7788-4491', email: 'hyunwoo.choi@safehi.kr',
      status: 'leave', centerId: c3.id, ownerId,
      recipientCount: 0, monthlyVisits: 0,
      startDate: new Date('2021-11-01'),
    },
  ];

  const managers = [];
  for (const def of managerDefs) {
    const { id, ...data } = def;
    const m = await prisma.manager.upsert({
      where: { id },
      update: { ...data },
      create: { id, ...data },
    });
    managers.push(m);
  }

  // 매니저 담당 동 연결
  const mgDongPairs = [
    { managerId: managers[0].id, dongId: d1.id },
    { managerId: managers[0].id, dongId: d2.id },
    { managerId: managers[1].id, dongId: d3.id },
    { managerId: managers[1].id, dongId: d4.id },
    { managerId: managers[2].id, dongId: d5.id },
  ];
  for (const pair of mgDongPairs) {
    await prisma.managerDong.upsert({
      where: { managerId_dongId: pair },
      update: {},
      create: pair,
    });
  }
  console.log(`  ✔ Managers seeded (${managers.length})`);

  // ── 3. 대상자 3명 ───────────────────────────────────────────
  const now = new Date();
  const recipientDefs = [
    {
      id: 'demo-rcp-001',
      name: '김순자', age: 78, gender: 'female',
      status: 'normal', address: '서울시 양천구 목동 1로 23',
      dongId: d1.id, phone: '010-9921-3344',
      managerId: managers[0].id, ownerId,
      careStartDate: new Date('2024-01-15'),
      visitCount: 45,
      lastVisitDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      healthInfo: {
        diseases: ['고혈압', '당뇨'],
        medications: ['아스피린 100mg', '메트포르민 500mg'],
        notes: '매주 화요일 병원 방문',
      },
      emergencyContact: { name: '김철수', relationship: '아들', phone: '010-1234-5678' },
    },
    {
      id: 'demo-rcp-002',
      name: '박영철', age: 83, gender: 'male',
      status: 'caution', address: '서울시 양천구 신정동 45-6',
      dongId: d3.id, phone: '010-8877-6655',
      managerId: managers[1].id, ownerId,
      careStartDate: new Date('2023-06-10'),
      visitCount: 62,
      lastVisitDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      healthInfo: {
        diseases: ['치매 초기', '관절염'],
        medications: ['도네페질 5mg'],
        notes: '혼자 거주 중. 주 2회 방문 필요.',
      },
      emergencyContact: { name: '박미영', relationship: '딸', phone: '010-9988-7766' },
    },
    {
      id: 'demo-rcp-003',
      name: '이정숙', age: 75, gender: 'female',
      status: 'urgent', address: '서울시 양천구 신월동 88-12',
      dongId: d2.id, phone: '010-4455-3322',
      managerId: managers[0].id, ownerId,
      careStartDate: new Date('2024-03-20'),
      visitCount: 18,
      lastVisitDate: new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000),
      healthInfo: {
        diseases: ['심부전', '우울증'],
        medications: ['푸로세마이드 40mg', '에스시탈로프람 10mg'],
        notes: '최근 낙상 이력 있음. 긴급 모니터링 필요.',
      },
      emergencyContact: { name: '이성호', relationship: '조카', phone: '010-6677-5544' },
    },
  ];

  const recipients = [];
  for (const def of recipientDefs) {
    const { id, ...data } = def;
    const r = await prisma.recipient.upsert({
      where: { id },
      update: { ...data },
      create: { id, ...data },
    });
    recipients.push(r);
  }
  console.log(`  ✔ Recipients seeded (${recipients.length})`);

  // ── 4. 돌봄 일지 + 방문 기록 3건 ──────────────────────────
  const careLogDefs = [
    {
      id: 'demo-cl-001',
      status: 'approved',
      recipientId: recipients[0].id,
      managerId: managers[0].id,
      centerId: c1.id, ownerId,
      visitDate: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      visitType: 'visit',
      visitLocation: '서울시 양천구 목동 1로 23 자택',
      careContent: {
        healthStatus: '혈압 138/86, 혈당 126mg/dL — 안정적',
        mealStatus: '세 끼 정상 식사',
        emotionalStatus: '밝은 편, 수다스러움',
        livingEnvironment: '청결 상태 양호',
      },
      careContentBlocks: [
        { title: '건강 상태', content: '혈압 138/86, 혈당 126mg/dL — 안정적' },
        { title: '식사', content: '세 끼 정상 식사. 반찬 다양하게 드심.' },
        { title: '정서', content: '밝은 편. 최근 동네 모임 참여 중.' },
      ],
      requiredActions: [
        { id: 'a1', priority: 'low', content: '다음 주 화요일 내과 방문 동행' },
      ],
      recommendedPolicies: [
        { id: 'policy-001', name: '노인장기요양보험 방문요양서비스', organization: '국민건강보험공단' },
      ],
      notes: '아들과 연락 원활. 현재 상태 안정적.',
      rejectionReason: null,
    },
    {
      id: 'demo-cl-002',
      status: 'pending',
      recipientId: recipients[1].id,
      managerId: managers[1].id,
      centerId: c2.id, ownerId,
      visitDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      visitType: 'visit',
      visitLocation: '서울시 양천구 신정동 45-6 자택',
      careContent: {
        healthStatus: '어지럼증 호소. 낙상 위험 있음.',
        mealStatus: '점심 식사 거름',
        emotionalStatus: '불안감 표현',
        livingEnvironment: '주방 및 화장실 정리 필요',
      },
      careContentBlocks: [
        { title: '건강 상태', content: '어지럼증 호소. 혈압 약 복용 확인 필요.' },
        { title: '식사', content: '점심 식사 거름. 식욕 저하 상태.' },
        { title: '환경', content: '화장실 바닥 습기 있음. 미끄럼 방지 매트 설치 건의.' },
      ],
      requiredActions: [
        { id: 'b1', priority: 'high', content: '낙상 방지 환경 점검 요청' },
        { id: 'b2', priority: 'medium', content: '보호자 딸에게 상태 통보' },
      ],
      recommendedPolicies: [
        { id: 'policy-003', name: '노인맞춤돌봄서비스', organization: '주민센터' },
      ],
      notes: '다음 방문 시 신체활동 보조 필요 여부 재확인 예정.',
      rejectionReason: null,
    },
    {
      id: 'demo-cl-003',
      status: 'urgent',
      recipientId: recipients[2].id,
      managerId: managers[0].id,
      centerId: c1.id, ownerId,
      visitDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      visitType: 'visit',
      visitLocation: '서울시 양천구 신월동 88-12 자택',
      careContent: {
        healthStatus: '발목 부종 심화. 호흡 약간 가쁨.',
        mealStatus: '식사 거의 못함',
        emotionalStatus: '무기력, 대화 기피',
        livingEnvironment: '도움 필요 상태',
      },
      careContentBlocks: [
        { title: '건강 상태', content: '발목 부종 심화. 숨참 증상 있음. 즉시 진료 권유.' },
        { title: '식사', content: '오전·오후 식사 모두 거름. 영양 상태 주의.' },
        { title: '정서', content: '매우 무기력. 외출 거부.' },
      ],
      requiredActions: [
        { id: 'c1', priority: 'urgent', content: '즉시 내과 응급 진료 연계 필요' },
        { id: 'c2', priority: 'high', content: '보호자 긴급 연락 및 병원 동행 준비' },
      ],
      recommendedPolicies: [
        { id: 'policy-004', name: '의료급여', organization: '주민센터' },
        { id: 'policy-005', name: '긴급복지지원', organization: '구청' },
      ],
      notes: '긴급 상황. 담당 팀장 보고 완료.',
      rejectionReason: null,
    },
  ];

  const careLogs = [];
  for (const def of careLogDefs) {
    const { id, ...data } = def;
    const cl = await prisma.careLog.upsert({
      where: { id },
      update: { ...data },
      create: { id, ...data },
    });
    careLogs.push(cl);
  }
  console.log(`  ✔ CareLogs seeded (${careLogs.length})`);

  // 방문 기록 (CareLog 1:1 연결)
  const visitDefs = [
    {
      id: 'demo-vis-001',
      recipientId: recipients[0].id,
      managerId: managers[0].id,
      ownerId, careLogId: careLogs[0].id,
      visitDate: careLogs[0].visitDate,
      visitType: 'visit', summary: '정기 방문 — 상태 안정적',
    },
    {
      id: 'demo-vis-002',
      recipientId: recipients[1].id,
      managerId: managers[1].id,
      ownerId, careLogId: careLogs[1].id,
      visitDate: careLogs[1].visitDate,
      visitType: 'visit', summary: '방문 — 낙상 위험 환경 점검',
    },
    {
      id: 'demo-vis-003',
      recipientId: recipients[2].id,
      managerId: managers[0].id,
      ownerId, careLogId: careLogs[2].id,
      visitDate: careLogs[2].visitDate,
      visitType: 'visit', summary: '긴급 방문 — 건강 위기 상황',
    },
  ];

  for (const def of visitDefs) {
    const { id, ...data } = def;
    await prisma.visit.upsert({
      where: { id },
      update: { recipientId: data.recipientId, managerId: data.managerId, visitDate: data.visitDate, visitType: data.visitType, summary: data.summary },
      create: { id, ...data },
    });
  }
  console.log(`  ✔ Visits seeded (${visitDefs.length})`);

  // ── 5. 메모 3건 ─────────────────────────────────────────────
  const memoDefs = [
    {
      id: 'demo-memo-001',
      recipientId: recipients[0].id,
      authorId: admin.id, ownerId,
      content: '아들(김철수)이 매주 일요일 방문. 가족 지지 양호. 다음 달 건강검진 예약 확인 필요.',
      type: 'normal',
    },
    {
      id: 'demo-memo-002',
      recipientId: recipients[1].id,
      authorId: admin.id, ownerId,
      content: '딸(박미영)에게 치매 진행 상황 통보 완료. 장기요양 등급 신청 검토 중. 주 2회 → 3회 방문 상향 고려.',
      type: 'caution',
    },
    {
      id: 'demo-memo-003',
      recipientId: recipients[2].id,
      authorId: admin.id, ownerId,
      content: '긴급 상황 발생. 오늘 내과 응급 진료 연계 완료. 조카(이성호) 동행. 입원 여부 내일 재확인 요망.',
      type: 'urgent',
    },
  ];

  for (const def of memoDefs) {
    const { id, ...data } = def;
    await prisma.memo.upsert({
      where: { id },
      update: { content: data.content },
      create: { id, ...data },
    });
  }
  console.log(`  ✔ Memos seeded (${memoDefs.length})`);

  // ── 6. 알림 3건 ─────────────────────────────────────────────
  const notifDefs = [
    {
      id: 'demo-notif-001',
      ownerId,
      title: '긴급 대상자 상태 악화',
      content: '이정숙 대상자 발목 부종 심화 — 즉각 조치 필요',
      isUrgent: true,
      link: '/care-logs/demo-cl-003',
      icon: 'alert',
    },
    {
      id: 'demo-notif-002',
      ownerId,
      title: '보고서 검토 요청',
      content: '박영철 대상자 돌봄 일지가 검토 대기 중입니다',
      isUrgent: false,
      link: '/care-logs/demo-cl-002',
      icon: 'document',
    },
    {
      id: 'demo-notif-003',
      ownerId,
      title: '방문 일정 승인 완료',
      content: '김순자 대상자 5월 8일 방문 보고서가 승인되었습니다',
      isUrgent: false,
      link: '/care-logs/demo-cl-001',
      icon: 'check',
    },
  ];

  for (const def of notifDefs) {
    const { id, ...data } = def;
    await prisma.notification.upsert({
      where: { id },
      update: { title: data.title, content: data.content, isUrgent: data.isUrgent },
      create: { id, ...data },
    });
  }
  console.log(`  ✔ Notifications seeded (${notifDefs.length})`);

  // ── 7. 정책 추천 (RecipientPolicy) ──────────────────────────
  const rpDefs = [
    { recipientId: recipients[0].id, policyId: 'policy-001', matchScore: 94 },
    { recipientId: recipients[0].id, policyId: 'policy-002', matchScore: 88 },
    { recipientId: recipients[1].id, policyId: 'policy-003', matchScore: 97 },
    { recipientId: recipients[1].id, policyId: 'policy-001', matchScore: 85 },
    { recipientId: recipients[2].id, policyId: 'policy-004', matchScore: 99 },
    { recipientId: recipients[2].id, policyId: 'policy-005', matchScore: 95 },
  ];

  for (const def of rpDefs) {
    await prisma.recipientPolicy.upsert({
      where: { recipientId_policyId: { recipientId: def.recipientId, policyId: def.policyId } },
      update: { matchScore: def.matchScore },
      create: def,
    });
  }
  console.log(`  ✔ RecipientPolicies seeded (${rpDefs.length})`);

  // ── 8. 피드백 1건 (승인된 일지에) ──────────────────────────
  await prisma.feedback.upsert({
    where: { id: 'demo-fb-001' },
    update: { content: '방문 내용 확인 완료. 다음 방문 시 혈압 추이 계속 모니터링 요망.' },
    create: {
      id: 'demo-fb-001',
      careLogId: careLogs[0].id,
      authorId: admin.id,
      authorRole: '슈퍼바이저',
      content: '방문 내용 확인 완료. 다음 방문 시 혈압 추이 계속 모니터링 요망.',
    },
  });
  console.log('  ✔ Feedback seeded (1)');

  console.log('\n🎉 [seed-demo] 시연용 더미 데이터 삽입 완료!');
  console.log(`   📋 매니저: 이민준(active), 박지수(active), 최현우(leave)`);
  console.log(`   👴 대상자: 김순자(normal), 박영철(caution), 이정숙(urgent)`);
  console.log(`   📄 돌봄일지: approved(1), pending(1), urgent(1)`);
  console.log(`   🔔 알림: 3건 / 메모: 3건 / 정책추천: 6건`);
}

main()
  .catch((e) => {
    console.error('❌ seed-demo 오류:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
