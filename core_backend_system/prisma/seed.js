/**
 * Prisma Seed Script
 *
 * 기존 인메모리 dashboardRepositories.js의 모든 더미 데이터를
 * PostgreSQL에 삽입합니다.
 *
 * 실행: npx prisma db seed
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ============================================================
  // 1. 사용자 (Users)
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

  console.log('  ✅ Users seeded');

  // ============================================================
  // 2. 센터 (Centers)
  // ============================================================
  const centerNames = [
    '목동종합사회복지관',
    '신정사회복지관',
    '신월복지센터',
    '양천구노인복지관',
    '양천구종합사회복지관',
  ];
  const centers = {};
  for (const name of centerNames) {
    centers[name] = await prisma.center.create({
      data: { name },
    });
  }
  console.log('  ✅ Centers seeded');

  // ============================================================
  // 3. 동 (Dongs)
  // ============================================================
  const dongNames = ['목동 1동', '목동 2동', '목동 3동', '목동 4동', '목동 5동', '신정동', '신월동'];
  const dongs = {};
  for (const name of dongNames) {
    dongs[name] = await prisma.dong.create({
      data: { name },
    });
  }
  console.log('  ✅ Dongs seeded');

  // ============================================================
  // 4. 매니저 (Managers) – 23명
  // ============================================================
  const mgrInfos = [
    { name: '김민수', gender: 'male' },
    { name: '이영희', gender: 'female' },
    { name: '박지민', gender: 'female' },
    { name: '최서윤', gender: 'female' },
    { name: '정수진', gender: 'female' },
    { name: '강동훈', gender: 'male' },
    { name: '조미영', gender: 'female' },
    { name: '윤성호', gender: 'male' },
    { name: '장현주', gender: 'female' },
    { name: '임재현', gender: 'male' },
  ];
  const statuses = ['active', 'active', 'active', 'leave', 'retired'];
  const managers = [];

  for (let i = 0; i < 23; i++) {
    const info = mgrInfos[i % mgrInfos.length];
    const status = statuses[i % statuses.length];
    const centerName = centerNames[i % centerNames.length];

    const mgr = await prisma.manager.create({
      data: {
        id: `mgr-${String(i + 1).padStart(4, '0')}`,
        name: info.name,
        gender: info.gender,
        phone: `010-${String(1000 + i).slice(-4)}-${String(5000 + i).slice(-4)}`,
        email: `${info.name.replace(/\s/g, '')}${i}@safehi.kr`,
        status,
        startDate: new Date('2023-03-15'),
        centerId: centers[centerName].id,
        recipientCount: status === 'retired' ? 0 : 5 + (i * 3) % 20,
        monthlyVisits: status === 'retired' ? 0 : 10 + (i * 7) % 50,
      },
    });

    // 담당 동 할당
    const assignedDongNames = dongNames.slice(0, 1 + (i % 3));
    for (const dName of assignedDongNames) {
      await prisma.managerDong.create({
        data: {
          managerId: mgr.id,
          dongId: dongs[dName].id,
        },
      });
    }

    managers.push(mgr);
  }
  console.log('  ✅ Managers seeded (23)');

  // ============================================================
  // 5. 대상자 (Recipients) – 50명
  // ============================================================
  const managerNamesList = ['이영희', '박지민', '김민수', '최서윤'];
  const recipientNamesList = ['김복동', '이순자', '박영희', '최철수', '정만복', '강순희', '조말순', '윤점순', '장복녀', '임영자'];
  const recipientStatuses = ['normal', 'caution', 'urgent', 'unvisited'];

  // 고정 대상자 5명
  const fixedRecipients = [
    {
      id: 'rec-0001', name: '김복동 어르신', age: 78, gender: 'female',
      dongName: '목동 5동', address: '목동아파트 103동 502호',
      managerIdx: 0, // 김민수
      lastVisitDate: new Date('2026-01-12T09:00:00.000Z'),
      visitCount: 64, status: 'normal',
      careStartDate: new Date('2024-05-15'),
      phone: '010-1234-5678',
      healthInfo: { diseases: ['고혈압', '당뇨'], medications: ['혈압약 (아침)', '당뇨약 (아침, 저녁)'], notes: '계단 이동 시 숨이 차다고 호소.' },
      emergencyContact: { name: '박철수', relationship: '아들', phone: '010-9876-5432' },
    },
    {
      id: 'rec-0002', name: '이순자 어르신', age: 82, gender: 'male',
      dongName: '신정동', address: '신정아파트 201동 1203호',
      managerIdx: 1, // 이영희
      lastVisitDate: new Date('2026-01-12T10:30:00.000Z'),
      visitCount: 64, status: 'urgent',
      careStartDate: new Date('2024-03-01'),
      phone: '010-2345-6789',
      healthInfo: { diseases: ['관절염'], medications: ['진통제 (필요시)'], notes: '우울감 호소' },
      emergencyContact: { name: '이민수', relationship: '아들', phone: '010-8765-4321' },
    },
    {
      id: 'rec-0003', name: '박영희 어르신', age: 75, gender: 'female',
      dongName: '목동 3동', address: '목동빌라 B동 301호',
      managerIdx: 2, // 박지민
      lastVisitDate: new Date('2026-01-11T14:00:00.000Z'),
      visitCount: 42, status: 'normal',
      careStartDate: new Date('2024-06-10'),
      phone: '010-3456-7890',
      healthInfo: { diseases: ['고혈압'], medications: ['혈압약 (아침)'], notes: '' },
      emergencyContact: { name: '박미영', relationship: '딸', phone: '010-7654-3210' },
    },
    {
      id: 'rec-0004', name: '최철수 어르신', age: 80, gender: 'male',
      dongName: '신월동', address: '신월아파트 105동 801호',
      managerIdx: 0, // 김민수
      lastVisitDate: new Date('2026-01-10T15:00:00.000Z'),
      visitCount: 38, status: 'caution',
      careStartDate: new Date('2024-07-20'),
      phone: '010-4567-8901',
      healthInfo: { diseases: ['당뇨', '백내장'], medications: ['당뇨약 (아침, 저녁)'], notes: '시력 저하로 이동 불편' },
      emergencyContact: { name: '최영수', relationship: '아들', phone: '010-6543-2109' },
    },
    {
      id: 'rec-0005', name: '정만복 어르신', age: 72, gender: 'female',
      dongName: '목동 5동', address: '현대아파트 501동 403호',
      managerIdx: 1, // 이영희
      lastVisitDate: null,
      visitCount: 0, status: 'unvisited',
      careStartDate: new Date('2025-01-01'),
      phone: '010-5678-9012',
      healthInfo: null,
      emergencyContact: null,
    },
  ];

  // Manager lookup: name → first manager id with that name
  function findManagerByName(name) {
    return managers.find((m) => m.name === name);
  }

  const recipients = [];
  for (const fr of fixedRecipients) {
    const mgrName = managerNamesList[fr.managerIdx] || '김민수';
    const mgr = findManagerByName(mgrName);
    const dong = dongs[fr.dongName];

    const rec = await prisma.recipient.create({
      data: {
        id: fr.id,
        name: fr.name,
        age: fr.age,
        gender: fr.gender,
        status: fr.status,
        address: fr.address,
        dongId: dong?.id || null,
        phone: fr.phone,
        careStartDate: fr.careStartDate,
        managerId: mgr?.id || null,
        healthInfo: fr.healthInfo,
        emergencyContact: fr.emergencyContact,
        visitCount: fr.visitCount,
        lastVisitDate: fr.lastVisitDate,
      },
    });
    recipients.push(rec);
  }

  // 나머지 45명
  for (let i = 6; i <= 50; i++) {
    const st = recipientStatuses[i % 4];
    const dongName = dongNames[i % dongNames.length];
    const mgrName = managerNamesList[i % managerNamesList.length];
    const mgr = findManagerByName(mgrName);
    const dong = dongs[dongName];

    const rec = await prisma.recipient.create({
      data: {
        id: `rec-${String(i).padStart(4, '0')}`,
        name: `${recipientNamesList[i % recipientNamesList.length]} 어르신`,
        age: 65 + (i % 30),
        gender: i % 3 === 0 ? 'male' : 'female',
        status: st,
        address: `테스트 주소 ${i}`,
        dongId: dong?.id || null,
        managerId: mgr?.id || null,
        visitCount: st === 'unvisited' ? 0 : 1 + (i % 30),
        lastVisitDate: st === 'unvisited' ? null : new Date(Date.now() - 1000 * 60 * 60 * 24 * (i % 14)),
      },
    });
    recipients.push(rec);
  }
  console.log('  ✅ Recipients seeded (50)');

  // ============================================================
  // 6. 돌봄 일지 (Care Logs) – 42건
  // ============================================================
  const allCareLogs = [];

  // 긴급 3건
  const urgentRecipientNames = ['이복동 어르신', '박순자 어르신', '김만복 어르신'];
  for (let i = 0; i < 3; i++) {
    const mgrName = managerNamesList[i % 4];
    const mgr = findManagerByName(mgrName);
    const centerName = centerNames[i % 3];

    const cl = await prisma.careLog.create({
      data: {
        id: `cl-${String(i + 1).padStart(3, '0')}`,
        status: 'urgent',
        recipientId: recipients[i % recipients.length].id,
        managerId: mgr.id,
        centerId: centers[centerName].id,
        visitDate: new Date(Date.now() - 1000 * 60 * 60 * (i + 2)),
        visitType: 'visit',
      },
    });
    allCareLogs.push(cl);
  }

  // cl-001 상세 데이터 업데이트
  await prisma.careLog.update({
    where: { id: 'cl-001' },
    data: {
      visitLocation: '서울시 양천구 목동서로 225, 목동아파트 103동 1502호',
      careContent: {
        healthStatus: { status: 'good', label: '양호', description: '혈압 정상, 컨디션 좋음' },
        mealStatus: { status: 'normal', label: '보통', description: '식사량 평소의 80%' },
        emotionalStatus: { status: 'good', label: '양호', description: '밝은 표정, 대화 적극적' },
        livingEnvironment: { status: 'good', label: '양호', description: '청결 상태 양호' },
      },
      careContentBlocks: [
        { title: '건강 상태 확인', content: '어르신께서 최근 며칠간 식사량이 줄었다고 하셨습니다. 혈압 측정 결과 145/92mmHg로 평소보다 다소 높게 측정되었습니다.' },
        { title: '생활 환경 점검', content: '거실 및 화장실 조명이 어두워 낙상 위험이 있어 보입니다.' },
        { title: '정서 상태', content: '최근 외출을 거의 하지 않으시고 무기력한 모습을 보이셨습니다.' },
      ],
      requiredActions: [
        { id: 'action-1', priority: 'urgent', content: '혈압 상승 및 어지러움 증상 - 병원 진료 권유 필요' },
        { id: 'action-2', priority: 'warning', content: '거실/화장실 조명 교체 - 낙상 예방 조치 필요' },
        { id: 'action-3', priority: 'normal', content: '사회적 고립감 해소를 위한 프로그램 연계 검토' },
      ],
      recommendedPolicies: [
        { id: 'policy-1', name: '노인 무료 건강검진', organization: '양천구 보건소 주관', schedule: '매월 둘째, 넷째 주 화요일' },
        { id: 'policy-2', name: '어르신 행복나눔 프로그램', organization: '목동종합사회복지관', schedule: '매주 수요일, 금요일 오후 2시' },
      ],
      notes: '다음 방문 시 손자 결혼 이야기 들어드리기로 함.',
      photos: ['/mock-images/care-log-1-1.jpg'],
    },
  });

  // cl-001 피드백
  await prisma.feedback.create({
    data: {
      id: 'fb-1',
      careLogId: 'cl-001',
      authorId: userAdmin.id,
      authorRole: '구청',
      content: '혈압 수치가 높네요. 병원 방문 여부를 추적 관찰해주세요.',
      createdAt: new Date('2025-01-03T14:30:00.000Z'),
    },
  });

  // 대기 12건
  const pendingRecipientNames = ['김철수', '박영희', '정순희', '한명숙', '오정자', '윤봉수', '송복례', '강순덕', '임말순', '조옥분', '황점순', '배순임'];
  for (let i = 0; i < 12; i++) {
    const mgrName = managerNamesList[i % 4];
    const mgr = findManagerByName(mgrName);
    const centerName = centerNames[i % 3];

    const cl = await prisma.careLog.create({
      data: {
        id: `cl-${String(i + 4).padStart(3, '0')}`,
        status: 'pending',
        recipientId: recipients[i % recipients.length].id,
        managerId: mgr.id,
        centerId: centers[centerName].id,
        visitDate: new Date(Date.now() - 1000 * 60 * 60 * (3 + i * 2)),
        visitType: 'visit',
      },
    });
    allCareLogs.push(cl);
  }

  // 승인 20건
  const approvedLastNames = ['최', '정', '김', '박', '이', '한', '오', '신', '강', '임', '조', '황', '배', '서', '권', '양', '손', '노', '하', '전'];
  const approvedFirstNames = ['순자', '만복', '영자', '복순', '춘자', '금순', '말자', '복남', '영옥', '순옥', '복자', '말순', '영순', '점순', '순자', '복순', '영희', '순덕', '복례', '말자'];
  for (let i = 0; i < 20; i++) {
    const mgrName = managerNamesList[i % 4];
    const mgr = findManagerByName(mgrName);
    const centerName = centerNames[i % 3];

    const cl = await prisma.careLog.create({
      data: {
        id: `cl-${String(i + 16).padStart(3, '0')}`,
        status: 'approved',
        recipientId: recipients[i % recipients.length].id,
        managerId: mgr.id,
        centerId: centers[centerName].id,
        visitDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * (i + 1)),
        visitType: 'visit',
      },
    });
    allCareLogs.push(cl);
  }

  // 반려 7건
  const rejectedLastNames = ['문', '장', '유', '안', '홍', '고', '류'];
  const rejectedFirstNames = ['순자', '복자', '말순', '점순', '복녀', '순희', '영자'];
  for (let i = 0; i < 7; i++) {
    const mgrName = managerNamesList[i % 4];
    const mgr = findManagerByName(mgrName);
    const centerName = centerNames[i % 3];

    const cl = await prisma.careLog.create({
      data: {
        id: `cl-${String(i + 36).padStart(3, '0')}`,
        status: 'rejected',
        recipientId: recipients[i % recipients.length].id,
        managerId: mgr.id,
        centerId: centers[centerName].id,
        visitDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * (i + 5)),
        visitType: 'visit',
      },
    });
    allCareLogs.push(cl);
  }
  console.log('  ✅ Care Logs seeded (42)');

  // ============================================================
  // 7. 방문 기록 (Visits)
  // ============================================================
  const mgrKimMinsu = findManagerByName('김민수');
  const mgrLeeYounghee = findManagerByName('이영희');

  await prisma.visit.createMany({
    data: [
      {
        id: 'visit-001',
        recipientId: 'rec-0001',
        careLogId: 'cl-001',
        visitDate: new Date('2026-01-12T09:00:00.000Z'),
        visitType: 'visit',
        managerId: mgrKimMinsu.id,
        summary: '건강 상태 양호, 식사량 보통',
      },
      {
        id: 'visit-002',
        recipientId: 'rec-0001',
        careLogId: 'cl-005',
        visitDate: new Date('2026-01-10T10:00:00.000Z'),
        visitType: 'call',
        managerId: mgrKimMinsu.id,
        summary: '안부 전화, 특이사항 없음',
      },
      {
        id: 'visit-003',
        recipientId: 'rec-0001',
        careLogId: 'cl-008',
        visitDate: new Date('2026-01-08T09:30:00.000Z'),
        visitType: 'visit',
        managerId: mgrKimMinsu.id,
        summary: '정기 방문, 혈압 측정 완료',
      },
      {
        id: 'visit-006',
        recipientId: 'rec-0002',
        careLogId: 'cl-002',
        visitDate: new Date('2026-01-12T10:30:00.000Z'),
        visitType: 'visit',
        managerId: mgrLeeYounghee.id,
        summary: '긴급: 건강 악화, 병원 동행 필요',
      },
      {
        id: 'visit-013',
        recipientId: 'rec-0004',
        careLogId: 'cl-004',
        visitDate: new Date('2026-01-10T15:00:00.000Z'),
        visitType: 'visit',
        managerId: mgrKimMinsu.id,
        summary: '정기 방문, 청소 필요 확인',
      },
    ],
  });
  console.log('  ✅ Visits seeded');

  // ============================================================
  // 8. 메모 (Memos)
  // ============================================================
  await prisma.memo.createMany({
    data: [
      {
        id: 'memo-001',
        recipientId: 'rec-0001',
        authorId: userTest.id,
        content: '최근 혈압이 다소 높아져 병원 방문을 권유했습니다.',
        createdAt: new Date('2026-01-08T14:30:00.000Z'),
      },
      {
        id: 'memo-002',
        recipientId: 'rec-0001',
        authorId: userTest.id,
        content: '보호자와 통화 완료.',
        createdAt: new Date('2026-01-05T10:15:00.000Z'),
      },
      {
        id: 'memo-003',
        recipientId: 'rec-0001',
        authorId: userAdmin.id,
        content: '혼자 외출 시 낙상 위험 있음.',
        type: 'warning',
        createdAt: new Date('2024-12-15T00:00:00.000Z'),
      },
      {
        id: 'memo-004',
        recipientId: 'rec-0002',
        authorId: userTest.id,
        content: '어르신께서 우울감을 호소하셔서 정서 지원 프로그램 연계를 진행중입니다.',
        createdAt: new Date('2026-01-09T11:00:00.000Z'),
      },
    ],
  });
  console.log('  ✅ Memos seeded');

  // ============================================================
  // 9. 정책 (Policies) + 대상자-정책 연결
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

  // 대상자별 정책 추천 연결
  await prisma.recipientPolicy.createMany({
    data: [
      { recipientId: 'rec-0001', policyId: policy1.id, matchScore: 95 },
      { recipientId: 'rec-0001', policyId: policy2.id, matchScore: 88 },
      { recipientId: 'rec-0001', policyId: policy3.id, matchScore: 82 },
      { recipientId: 'rec-0002', policyId: policy1.id, matchScore: 90 },
      { recipientId: 'rec-0002', policyId: policy2.id, matchScore: 85 },
      { recipientId: 'rec-0003', policyId: policy2.id, matchScore: 78 },
      { recipientId: 'rec-0003', policyId: policy3.id, matchScore: 75 },
      { recipientId: 'rec-0004', policyId: policy1.id, matchScore: 92 },
      { recipientId: 'rec-0004', policyId: policy3.id, matchScore: 80 },
    ],
  });
  console.log('  ✅ Policies + RecipientPolicies seeded');

  // ============================================================
  // 10. 대시보드 KPI
  // ============================================================
  await prisma.dashboardKPI.create({
    data: {
      date: new Date(new Date().toISOString().split('T')[0]),
      todayVisits: 24,
      pendingReports: 12,
      approvedCount: 156,
      totalRecipients: 892,
    },
  });
  console.log('  ✅ Dashboard KPI seeded');

  // ============================================================
  // 11. 알림 (Notifications)
  // ============================================================
  await prisma.notification.createMany({
    data: [
      {
        id: 'notif-001',
        title: '긴급 보고서 접수',
        content: '이복동 어르신 보고서가 긴급으로 접수되었습니다.',
        isUrgent: true,
        link: '/care-logs?status=urgent',
        icon: 'warning',
        createdAt: new Date(Date.now() - 1000 * 60 * 10),
      },
      {
        id: 'notif-002',
        title: '보고서 승인 요청',
        content: '3건의 새로운 보고서가 승인 대기 중입니다.',
        isUrgent: false,
        link: '/care-logs?status=pending',
        icon: 'report',
        createdAt: new Date(Date.now() - 1000 * 60 * 30),
      },
      {
        id: 'notif-003',
        title: '신규 대상자 등록',
        content: '목동 3동에 2명의 신규 대상자가 등록되었습니다.',
        isUrgent: false,
        link: '/recipients',
        icon: 'info',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2),
      },
      {
        id: 'notif-004',
        title: '월간 보고서 완료',
        content: '12월 월간 보고서가 정상적으로 생성되었습니다.',
        isUrgent: false,
        icon: 'success',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24),
      },
    ],
  });
  console.log('  ✅ Notifications seeded');

  console.log('\n🎉 Database seeding completed!');
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
