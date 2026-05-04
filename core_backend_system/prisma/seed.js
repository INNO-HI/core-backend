/**
 * Prisma Seed Script — Production
 *
 * 프로덕션 기준으로 최소한의 데이터만 삽입한다.
 *
 * ✅ 포함 (전역 reference data + 시스템 계정):
 *   - admin 계정 1개 (환경변수로 비밀번호 주입)
 *   - Center (돌봄 센터) 목록
 *   - Dong  (행정 구역) 목록
 *   - Policy (복지 정책) 카탈로그
 *
 * ❌ 제외 (비즈니스 데이터 — 계정별 소유):
 *   - Manager / Recipient / CareLog / Visit / Memo / Feedback
 *   - DashboardKPI / Notification
 *
 * → 신규 가입 계정은 비어있는 대시보드로 시작한다.
 */

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding production database...');

  // ============================================================
  // 1. 시스템 계정 — admin
  // ============================================================
  const adminEmail    = process.env.ADMIN_EMAIL    || 'admin@safehi.kr';
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ ADMIN_PASSWORD 환경변수가 설정되지 않았습니다. 프로덕션에서는 필수입니다.');
      process.exit(1);
    }
    console.warn('⚠️  ADMIN_PASSWORD 미설정 — 개발 전용 기본값을 사용합니다.');
  }

  const resolvedPassword = adminPassword || 'Admin1234!';
  const adminHash        = await bcrypt.hash(resolvedPassword, 10);

  await prisma.user.upsert({
    where:  { email: adminEmail },
    update: { password: adminHash },
    create: {
      email:         adminEmail,
      password:      adminHash,
      name:          '시스템 관리자',
      role:          'admin',
      emailVerified: true,
    },
  });
  console.log(`  ✅ Admin user seeded (${adminEmail}) — password length: ${resolvedPassword.length}`);

  // ============================================================
  // 2. 돌봄 센터 — 전역 reference data (모든 계정이 매니저 등록 시 참조)
  // ============================================================
  const centerNames = [
    '목동종합사회복지관',
    '신정사회복지관',
    '신월복지센터',
    '양천구청 노인복지과',
  ];
  for (const name of centerNames) {
    await prisma.center.upsert({
      where:  { name },
      update: {},
      create: { name },
    });
  }
  console.log(`  ✅ Centers seeded (${centerNames.length})`);

  // ============================================================
  // 3. 행정 구역 (동) — 전역 reference data
  // ============================================================
  const dongNames = [
    '목동 1동', '목동 2동', '목동 3동', '목동 4동',
    '목동 5동', '목동 6동', '목동 7동', '목동 8동',
    '신정동', '신정 1동', '신정 2동', '신정 3동',
    '신월동', '신월 1동', '신월 2동', '신월 3동',
  ];
  for (const name of dongNames) {
    await prisma.dong.upsert({
      where:  { name },
      update: {},
      create: { name },
    });
  }
  console.log(`  ✅ Dongs seeded (${dongNames.length})`);

  // ============================================================
  // 4. 복지 정책 카탈로그 — 전역 reference data
  // ============================================================
  const policies = [
    {
      id:                'policy-001',
      name:              '노인장기요양보험 방문요양서비스',
      summary:           '장기요양등급을 받은 어르신에게 요양보호사가 가정을 방문하여 신체·가사활동을 지원합니다.',
      applicationMethod: '국민건강보험공단 지사 방문 또는 온라인 신청',
      details: {
        description:  '노인장기요양보험 방문요양서비스',
        eligibility:  ['만 65세 이상', '장기요양인정등급 1~5등급'],
        benefits:     ['신체활동 지원', '가사활동 지원', '인지활동형 방문요양'],
        documents:    ['장기요양인정신청서', '의사소견서'],
        contactInfo:  '1577-1000',
      },
    },
    {
      id:                'policy-002',
      name:              '기초연금',
      summary:           '만 65세 이상 소득하위 70% 어르신에게 매월 연금을 지급합니다.',
      applicationMethod: '주민센터 방문 또는 복지로 온라인(www.bokjiro.go.kr) 신청',
      details: {
        description:  '기초연금',
        eligibility:  ['만 65세 이상', '소득인정액 선정기준액 이하'],
        benefits:     ['월 최대 334,810원 지급 (2025년 기준)'],
        documents:    ['신분증', '통장사본'],
        contactInfo:  '129',
      },
    },
    {
      id:                'policy-003',
      name:              '노인맞춤돌봄서비스',
      summary:           '일상생활 영위가 어려운 취약 노인에게 적절한 돌봄 서비스를 제공합니다.',
      applicationMethod: '주민센터 방문 신청',
      details: {
        description:  '노인맞춤돌봄서비스',
        eligibility:  ['만 65세 이상', '독거·고령부부·조손 가구 등 취약 노인'],
        benefits:     ['안전지원', '사회참여', '생활교육', '일상생활지원', '연계서비스'],
        documents:    ['사회서비스 이용 및 이용권 관리에 관한 법률 신청서'],
        contactInfo:  '129',
      },
    },
    {
      id:                'policy-004',
      name:              '의료급여',
      summary:           '생활이 어려운 저소득층에게 의료비를 지원합니다.',
      applicationMethod: '주민센터 방문 신청',
      details: {
        description:  '의료급여',
        eligibility:  ['기초생활수급자', '타 법에 의한 수급권자'],
        benefits:     ['입원·외래 진료비 지원', '약제비 지원'],
        documents:    ['의료급여 신청서', '가족관계증명서'],
        contactInfo:  '129',
      },
    },
    {
      id:                'policy-005',
      name:              '긴급복지지원',
      summary:           '갑작스러운 위기 상황에 처한 저소득층에게 신속하게 지원합니다.',
      applicationMethod: '주민센터·구청 방문 또는 복지로 신청',
      details: {
        description:  '긴급복지지원',
        eligibility:  ['갑작스러운 위기사유 발생 저소득층'],
        benefits:     ['생계지원', '의료지원', '주거지원', '사회복지시설 이용지원'],
        documents:    ['신분증', '위기상황 확인 서류'],
        contactInfo:  '129',
      },
    },
  ];

  for (const p of policies) {
    await prisma.policy.upsert({
      where:  { id: p.id },
      update: { name: p.name, summary: p.summary, applicationMethod: p.applicationMethod, details: p.details },
      create: p,
    });
  }
  console.log(`  ✅ Policies seeded (${policies.length})`);

  // ============================================================
  // 5. 복지 뉴스 — 전역 reference data
  // ============================================================
  const welfareNewsItems = [
    {
      id: 'welfare-001',
      title: '2026 상반기 복지 서비스 개편',
      description: '독거노인 방문 횟수 월 8회로 확대 적용',
      tag: '신규',
      date: '2026.03.15',
    },
    {
      id: 'welfare-002',
      title: '노인 맞춤 돌봄 교육 지원 확대',
      description: '치매 예방 프로그램 비용 지원 강화',
      tag: '업데이트',
      date: '2026.03.12',
    },
    {
      id: 'welfare-003',
      title: '기초생활수급자 의료급여 변경',
      description: '본인부담금 경감 적용 대상 확대',
      tag: '정책',
      date: '2026.03.08',
    },
  ];

  for (const item of welfareNewsItems) {
    await prisma.welfareNews.upsert({
      where: { id: item.id },
      update: { title: item.title, description: item.description, tag: item.tag, date: item.date },
      create: item,
    });
  }
  console.log(`  ✅ WelfareNews seeded (${welfareNewsItems.length})`);

  // ============================================================
  // 6. 공지사항 — 전역 reference data
  // ============================================================
  const noticeItems = [
    { id: 'notice-001', title: '4월 전체 매니저 회의 안내', date: '2026.03.15', isNew: true },
    { id: 'notice-002', title: '돌봄 기록 시스템 업데이트 안내', date: '2026.03.12', isNew: false },
    { id: 'notice-003', title: '2026 상반기 교육 일정 공지', date: '2026.03.08', isNew: false },
  ];

  for (const item of noticeItems) {
    await prisma.notice.upsert({
      where: { id: item.id },
      update: { title: item.title, date: item.date, isNew: item.isNew },
      create: item,
    });
  }
  console.log(`  ✅ Notices seeded (${noticeItems.length})`);

  console.log('\n🎉 Production seeding complete.');
  console.log('   • Center, Dong, Policy → 전역 reference data (모든 계정 공유)');
  console.log('   • 신규 가입 계정 → 빈 대시보드로 시작');
  console.log(`   • Admin 계정: ${adminEmail}`);
}

main()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
