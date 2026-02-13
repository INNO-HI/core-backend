/**
 * Prisma Seed Script (Minimal – 각 엔티티 3개)
 *
 * 실행: npx prisma db seed
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database (minimal 3 items each)...');

  // ============================================================
  // 1. 사용자 (Users) – 2명 (admin + manager, 로그인에 필요)
  // ============================================================
  const userAdmin = await prisma.user.create({
    data: {
      id: 'user-admin-1',
      email: 'admin@safehi.kr',
      password: 'Admin1234!',
      name: '김담당',
      phone: '010-9999-8888',
      role: 'admin',
      emailVerified: true,
    },
  });

  const userTest = await prisma.user.create({
    data: {
      id: 'user-test-1',
      email: 'test@safehi.kr',
      password: 'Test1234!',
      name: '김테스트',
      phone: '010-1234-5678',
      role: 'manager',
      emailVerified: true,
    },
  });
  console.log('  ✅ Users seeded (2)');

  // ============================================================
  // 2. 센터 (Centers) – 3개
  // ============================================================
  const centerNames = ['목동종합사회복지관', '신정사회복지관', '신월복지센터'];
  const centers = {};
  for (const name of centerNames) {
    centers[name] = await prisma.center.create({ data: { name } });
  }
  console.log('  ✅ Centers seeded (3)');

  // ============================================================
  // 3. 동 (Dongs) – 3개
  // ============================================================
  const dongNames = ['목동 1동', '신정동', '신월동'];
  const dongs = {};
  for (const name of dongNames) {
    dongs[name] = await prisma.dong.create({ data: { name } });
  }
  console.log('  ✅ Dongs seeded (3)');

  // ============================================================
  // 4. 매니저 (Managers) – 3명
  // ============================================================
  const mgrData = [
    { id: 'mgr-0001', name: '김민수', gender: 'male', status: 'active', phone: '010-1000-5000', email: 'kimminsu@safehi.kr', center: '목동종합사회복지관', dongAssign: ['목동 1동'] },
    { id: 'mgr-0002', name: '이영희', gender: 'female', status: 'active', phone: '010-1001-5001', email: 'leeyounghee@safehi.kr', center: '신정사회복지관', dongAssign: ['신정동'] },
    { id: 'mgr-0003', name: '박지민', gender: 'female', status: 'leave', phone: '010-1002-5002', email: 'parkjimin@safehi.kr', center: '신월복지센터', dongAssign: ['신월동'] },
  ];

  const managers = [];
  for (const m of mgrData) {
    const mgr = await prisma.manager.create({
      data: {
        id: m.id,
        name: m.name,
        gender: m.gender,
        phone: m.phone,
        email: m.email,
        status: m.status,
        startDate: new Date('2023-03-15'),
        centerId: centers[m.center].id,
        recipientCount: m.status === 'leave' ? 0 : 1,
        monthlyVisits: m.status === 'leave' ? 0 : 3,
      },
    });
    for (const dName of m.dongAssign) {
      await prisma.managerDong.create({
        data: { managerId: mgr.id, dongId: dongs[dName].id },
      });
    }
    managers.push(mgr);
  }
  console.log('  ✅ Managers seeded (3)');

  // ============================================================
  // 5. 대상자 (Recipients) – 3명
  // ============================================================
  const recipientData = [
    {
      id: 'rec-0001', name: '김복동 어르신', age: 78, gender: 'female',
      dongName: '목동 1동', address: '목동아파트 103동 502호',
      managerId: 'mgr-0001', status: 'normal',
      lastVisitDate: new Date('2026-01-12T09:00:00.000Z'), visitCount: 8,
      careStartDate: new Date('2024-05-15'), phone: '010-1234-5678',
      healthInfo: { diseases: ['고혈압', '당뇨'], medications: ['혈압약 (아침)', '당뇨약 (아침, 저녁)'], notes: '계단 이동 시 숨이 차다고 호소.' },
      emergencyContact: { name: '박철수', relationship: '아들', phone: '010-9876-5432' },
    },
    {
      id: 'rec-0002', name: '이순자 어르신', age: 82, gender: 'male',
      dongName: '신정동', address: '신정아파트 201동 1203호',
      managerId: 'mgr-0002', status: 'urgent',
      lastVisitDate: new Date('2026-01-12T10:30:00.000Z'), visitCount: 5,
      careStartDate: new Date('2024-03-01'), phone: '010-2345-6789',
      healthInfo: { diseases: ['관절염'], medications: ['진통제 (필요시)'], notes: '우울감 호소' },
      emergencyContact: { name: '이민수', relationship: '아들', phone: '010-8765-4321' },
    },
    {
      id: 'rec-0003', name: '박영희 어르신', age: 75, gender: 'female',
      dongName: '신월동', address: '목동빌라 B동 301호',
      managerId: 'mgr-0003', status: 'caution',
      lastVisitDate: new Date('2026-01-11T14:00:00.000Z'), visitCount: 3,
      careStartDate: new Date('2024-06-10'), phone: '010-3456-7890',
      healthInfo: { diseases: ['고혈압'], medications: ['혈압약 (아침)'], notes: '' },
      emergencyContact: { name: '박미영', relationship: '딸', phone: '010-7654-3210' },
    },
  ];

  for (const r of recipientData) {
    await prisma.recipient.create({
      data: {
        id: r.id, name: r.name, age: r.age, gender: r.gender,
        status: r.status, address: r.address,
        dongId: dongs[r.dongName]?.id || null,
        phone: r.phone, careStartDate: r.careStartDate,
        managerId: r.managerId,
        healthInfo: r.healthInfo, emergencyContact: r.emergencyContact,
        visitCount: r.visitCount, lastVisitDate: r.lastVisitDate,
      },
    });
  }
  console.log('  ✅ Recipients seeded (3)');

  // ============================================================
  // 6. 돌봄 일지 (Care Logs) – 3건 (urgent 1, pending 1, approved 1)
  // ============================================================
  await prisma.careLog.create({
    data: {
      id: 'cl-001', status: 'urgent',
      recipientId: 'rec-0001', managerId: 'mgr-0001',
      centerId: centers['목동종합사회복지관'].id,
      visitDate: new Date(Date.now() - 1000 * 60 * 60 * 2),
      visitType: 'visit',
      visitLocation: '서울시 양천구 목동서로 225, 목동아파트 103동 502호',
      careContent: {
        healthStatus: { status: 'good', label: '양호', description: '혈압 정상, 컨디션 좋음' },
        mealStatus: { status: 'normal', label: '보통', description: '식사량 평소의 80%' },
        emotionalStatus: { status: 'good', label: '양호', description: '밝은 표정, 대화 적극적' },
        livingEnvironment: { status: 'good', label: '양호', description: '청결 상태 양호' },
      },
      careContentBlocks: [
        { title: '건강 상태 확인', content: '혈압 측정 결과 145/92mmHg로 평소보다 다소 높게 측정되었습니다.' },
        { title: '생활 환경 점검', content: '거실 및 화장실 조명이 어두워 낙상 위험이 있어 보입니다.' },
      ],
      requiredActions: [
        { id: 'action-1', priority: 'urgent', content: '혈압 상승 - 병원 진료 권유 필요' },
        { id: 'action-2', priority: 'warning', content: '조명 교체 - 낙상 예방 조치 필요' },
      ],
      notes: '다음 방문 시 손자 결혼 이야기 들어드리기로 함.',
    },
  });

  await prisma.careLog.create({
    data: {
      id: 'cl-002', status: 'pending',
      recipientId: 'rec-0002', managerId: 'mgr-0002',
      centerId: centers['신정사회복지관'].id,
      visitDate: new Date(Date.now() - 1000 * 60 * 60 * 5),
      visitType: 'visit',
    },
  });

  await prisma.careLog.create({
    data: {
      id: 'cl-003', status: 'approved',
      recipientId: 'rec-0003', managerId: 'mgr-0003',
      centerId: centers['신월복지센터'].id,
      visitDate: new Date(Date.now() - 1000 * 60 * 60 * 24),
      visitType: 'call',
    },
  });
  console.log('  ✅ Care Logs seeded (3)');

  // ============================================================
  // 7. 피드백 (Feedback) – 1건
  // ============================================================
  await prisma.feedback.create({
    data: {
      id: 'fb-1',
      careLogId: 'cl-001',
      authorId: userAdmin.id,
      authorRole: '구청',
      content: '혈압 수치가 높네요. 병원 방문 여부를 추적 관찰해주세요.',
      createdAt: new Date('2026-01-03T14:30:00.000Z'),
    },
  });
  console.log('  ✅ Feedbacks seeded (1)');

  // ============================================================
  // 8. 방문 기록 (Visits) – 3건
  // ============================================================
  await prisma.visit.createMany({
    data: [
      {
        id: 'visit-001', recipientId: 'rec-0001', careLogId: 'cl-001',
        visitDate: new Date('2026-01-12T09:00:00.000Z'), visitType: 'visit',
        managerId: 'mgr-0001', summary: '건강 상태 양호, 식사량 보통',
      },
      {
        id: 'visit-002', recipientId: 'rec-0002', careLogId: 'cl-002',
        visitDate: new Date('2026-01-12T10:30:00.000Z'), visitType: 'visit',
        managerId: 'mgr-0002', summary: '정기 방문, 우울감 호소',
      },
      {
        id: 'visit-003', recipientId: 'rec-0003', careLogId: 'cl-003',
        visitDate: new Date('2026-01-11T14:00:00.000Z'), visitType: 'call',
        managerId: 'mgr-0003', summary: '안부 전화, 특이사항 없음',
      },
    ],
  });
  console.log('  ✅ Visits seeded (3)');

  // ============================================================
  // 9. 메모 (Memos) – 3건
  // ============================================================
  await prisma.memo.createMany({
    data: [
      {
        id: 'memo-001', recipientId: 'rec-0001', authorId: userTest.id,
        content: '최근 혈압이 다소 높아져 병원 방문을 권유했습니다.',
        createdAt: new Date('2026-01-08T14:30:00.000Z'),
      },
      {
        id: 'memo-002', recipientId: 'rec-0002', authorId: userTest.id,
        content: '어르신께서 우울감을 호소하셔서 정서 지원 프로그램 연계를 진행중입니다.',
        createdAt: new Date('2026-01-09T11:00:00.000Z'),
      },
      {
        id: 'memo-003', recipientId: 'rec-0003', authorId: userAdmin.id,
        content: '혼자 외출 시 낙상 위험 있음.',
        type: 'warning',
        createdAt: new Date('2024-12-15T00:00:00.000Z'),
      },
    ],
  });
  console.log('  ✅ Memos seeded (3)');

  // ============================================================
  // 10. 정책 (Policies) – 3개 + 대상자-정책 연결
  // ============================================================
  const policy1 = await prisma.policy.create({
    data: {
      id: 'policy-001',
      name: '노인장기요양보험 방문요양서비스',
      summary: '장기요양등급을 받은 어르신에게 요양보호사가 가정을 방문하여 지원합니다.',
      applicationMethod: '국민건강보험공단 지사 방문 또는 온라인 신청',
      details: {
        description: '노인장기요양보험 제도',
        eligibility: ['만 65세 이상'],
        benefits: ['신체활동 지원'],
        documents: ['장기요양인정신청서'],
        contactInfo: '1577-1000',
      },
    },
  });

  const policy2 = await prisma.policy.create({
    data: {
      id: 'policy-002',
      name: '기초연금',
      summary: '만 65세 이상 소득하위 70% 어르신에게 매월 연금 지급',
      applicationMethod: '주민센터 방문 또는 복지로 온라인',
      details: {
        description: '기초연금 제도',
        eligibility: ['만 65세 이상'],
        benefits: ['월 최대 334,810원'],
        documents: ['신분증'],
        contactInfo: '129',
      },
    },
  });

  const policy3 = await prisma.policy.create({
    data: {
      id: 'policy-003',
      name: '노인돌봄종합서비스',
      summary: '돌봄이 필요한 노인에게 가사·활동지원 서비스',
      applicationMethod: '주민센터 방문 신청',
      details: {
        description: '노인돌봄 서비스',
        eligibility: ['만 65세 이상'],
        benefits: ['가사 활동 지원'],
        documents: ['사회서비스 신청서'],
        contactInfo: '129',
      },
    },
  });

  await prisma.recipientPolicy.createMany({
    data: [
      { recipientId: 'rec-0001', policyId: policy1.id, matchScore: 95 },
      { recipientId: 'rec-0001', policyId: policy2.id, matchScore: 88 },
      { recipientId: 'rec-0002', policyId: policy1.id, matchScore: 90 },
      { recipientId: 'rec-0002', policyId: policy3.id, matchScore: 82 },
      { recipientId: 'rec-0003', policyId: policy2.id, matchScore: 78 },
      { recipientId: 'rec-0003', policyId: policy3.id, matchScore: 75 },
    ],
  });
  console.log('  ✅ Policies + RecipientPolicies seeded (3 + 6)');

  // ============================================================
  // 11. 대시보드 KPI – 실제 데이터 기반
  // ============================================================
  await prisma.dashboardKPI.create({
    data: {
      date: new Date(new Date().toISOString().split('T')[0]),
      todayVisits: 3,
      pendingReports: 1,
      approvedCount: 1,
      totalRecipients: 3,
    },
  });
  console.log('  ✅ Dashboard KPI seeded (1)');

  // ============================================================
  // 12. 알림 (Notifications) – 3건
  // ============================================================
  await prisma.notification.createMany({
    data: [
      {
        id: 'notif-001',
        title: '긴급 보고서 접수',
        content: '김복동 어르신 보고서가 긴급으로 접수되었습니다.',
        isUrgent: true,
        link: '/care-logs?status=urgent',
        icon: 'warning',
        createdAt: new Date(Date.now() - 1000 * 60 * 10),
      },
      {
        id: 'notif-002',
        title: '보고서 승인 요청',
        content: '1건의 새로운 보고서가 승인 대기 중입니다.',
        isUrgent: false,
        link: '/care-logs?status=pending',
        icon: 'report',
        createdAt: new Date(Date.now() - 1000 * 60 * 30),
      },
      {
        id: 'notif-003',
        title: '신규 대상자 등록',
        content: '신월동에 1명의 신규 대상자가 등록되었습니다.',
        isUrgent: false,
        link: '/recipients',
        icon: 'info',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      },
    ],
  });
  console.log('  ✅ Notifications seeded (3)');

  console.log('\n🎉 Database seeding completed! (minimal 3 items each)');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
