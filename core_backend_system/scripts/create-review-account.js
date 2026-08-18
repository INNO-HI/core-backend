/**
 * App Store 심사용 계정 만들기 / 되살리기
 *
 * 심사 메모는 심사관에게 "계정 삭제를 눌러 보라"고 안내한다(Guideline
 * 5.1.1(v)). 심사관이 실제로 누르면 이 계정이 사라지고, 반려 후 재제출하면
 * 다음 심사관은 로그인부터 막힌다 — 2026-08-18 제출 준비 때 실제로 계정이
 * 없어 `AUTH_FAILED` 였다. 한 줄로 되살릴 수 있게 남긴다.
 *
 *   node scripts/create-review-account.js
 *   REVIEW_PW='다른비번' node scripts/create-review-account.js
 *
 * 도커로 도는 서버라면 — 반드시 /app/scripts 안에 두고 실행한다.
 * /tmp 에 두면 `require('../lib/auth')` 가 `/lib/auth` 를 찾아 실패한다.
 *   docker cp scripts/create-review-account.js core-backend-core-1:/app/scripts/
 *   docker exec core-backend-core-1 node /app/scripts/create-review-account.js
 *
 * 설계 두 가지
 *  1. 삭제해도 시연 데이터가 남아야 한다.
 *     managers·recipients 의 ownerId 는 users 를 향한 cascade 다. 그래서
 *     매니저 레코드의 ownerId 를 기관 계정으로 두고, 대상자는 배정만 바꾸고
 *     ownerId 는 건드리지 않는다. 계정을 지워도 매니저·대상자·일지는 남는다.
 *  2. 심사관 기기의 시간대를 모른다.
 *     한국 시간으로만 일정을 넣으면 쿠퍼티노(PDT) 기기에서는 전부 '어제'가
 *     되어 홈의 "오늘 뵐 분들"이 빈다. UTC 하루를 3시간 간격으로 덮어
 *     어느 시간대에서 열어도 그날 일정이 남게 한다.
 */
const path = require('path');
process.chdir(path.join(__dirname, '..'));

const { PrismaClient } = require('@prisma/client');
const { hashPassword } = require('../lib/auth');

const prisma = new PrismaClient();

const EMAIL = process.env.REVIEW_EMAIL || 'admin@test.com';
const PASSWORD = process.env.REVIEW_PW || 'Test1234';
/** 기관(institution) 계정 — 매니저 레코드의 소유자로 쓴다 */
const INSTITUTION_EMAIL = process.env.REVIEW_INSTITUTION || 'kms4024@gmail.com';
const MANAGER_ID = 'review-mgr-appstore';
/** 심사관이 볼 담당 대상자. 이름으로 찾는다 — 없으면 있는 것만 배정한다. */
const ASSIGN = (process.env.REVIEW_RECIPIENTS || '이말순,한상철,오정자').split(',');

const HOURS_UTC = [0, 3, 6, 9, 12, 15, 18, 21];
const DAY_OFFSETS = [-1, 0, 1];

async function main() {
  const inst = await prisma.user.findUnique({ where: { email: INSTITUTION_EMAIL } });
  if (!inst) throw new Error(`기관 계정(${INSTITUTION_EMAIL})을 찾을 수 없습니다`);

  const center = await prisma.center.findFirst({ where: { name: '양천구청 노인복지과' } });
  const password = await hashPassword(PASSWORD);

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      password,
      role: 'caregiver',
      isActive: true,
      emailVerified: true,
      institutionId: inst.institutionId,
      // 이전 토큰을 끊는다 — 지워졌다 되살아난 계정이라 남은 세션이 있으면 안 된다
      sessionVersion: { increment: 1 },
    },
    create: {
      email: EMAIL,
      password,
      name: '심사용 계정',
      phone: '010-0000-0000',
      role: 'caregiver',
      emailVerified: true,
      isActive: true,
      institutionId: inst.institutionId,
    },
  });

  const manager = await prisma.manager.upsert({
    where: { id: MANAGER_ID },
    update: { userId: user.id, ownerId: inst.id, status: 'active', centerId: center?.id ?? null },
    create: {
      id: MANAGER_ID,
      name: '심사용 계정',
      gender: 'male',
      phone: '010-0000-0000',
      email: EMAIL,
      status: 'active',
      startDate: new Date('2025-01-02'),
      centerId: center?.id ?? null,
      userId: user.id,
      ownerId: inst.id,
    },
  });

  const targets = await prisma.recipient.findMany({ where: { name: { in: ASSIGN } } });
  if (targets.length === 0) {
    throw new Error(`배정할 대상자를 찾지 못했습니다: ${ASSIGN.join(', ')}`);
  }
  await prisma.recipient.updateMany({
    where: { id: { in: targets.map((r) => r.id) } },
    data: { managerId: manager.id },
  });

  await prisma.task.deleteMany({ where: { id: { startsWith: 'review-tk-' } } });
  await prisma.visit.deleteMany({ where: { id: { startsWith: 'review-v-' } } });

  const midnightUtc = new Date();
  midnightUtc.setUTCHours(0, 0, 0, 0);

  let made = 0;
  for (const offset of DAY_OFFSETS) {
    for (let i = 0; i < HOURS_UTC.length; i++) {
      const recipient = targets[(i + offset + targets.length) % targets.length];
      const at = new Date(midnightUtc);
      at.setUTCDate(at.getUTCDate() + offset);
      at.setUTCHours(HOURS_UTC[i]);

      made += 1;
      const isCall = i % 3 === 1;
      const done = at < new Date();
      const common = {
        recipientId: recipient.id,
        managerId: manager.id,
        ownerId: recipient.ownerId,
      };

      await prisma.task.create({
        data: {
          id: `review-tk-${made}`,
          type: isCall ? 'call' : 'visit',
          startAt: at,
          durationMin: isCall ? 30 : 60,
          status: done ? 'done' : 'scheduled',
          ...common,
        },
      });
      await prisma.visit.create({
        data: {
          id: `review-v-${made}`,
          visitDate: at,
          visitType: isCall ? 'call' : 'visit',
          summary: isCall ? '안부 전화' : '정기 방문',
          ...common,
        },
      });
    }
  }

  await prisma.manager.update({
    where: { id: manager.id },
    data: { recipientCount: targets.length, monthlyVisits: made },
  });

  // 심사관이 녹음 경로까지 확인하려면 담당 대상자에게 음성 동의가 있어야 한다
  const consented = await prisma.consent.count({
    where: { recipientId: { in: targets.map((r) => r.id) }, voiceConsent: true, revokedAt: null },
  });

  console.log(`계정      : ${user.email} / ${PASSWORD} (role=${user.role})`);
  console.log(`매니저    : ${manager.id} — 소유자는 기관 계정이라 계정 삭제와 함께 사라지지 않는다`);
  console.log(`담당 대상자: ${targets.map((r) => r.name).join(', ')}`);
  console.log(`음성 동의 : ${consented}/${targets.length}명 (0이면 녹음 경로를 확인할 수 없다)`);
  console.log(`일정      : ${made}건 — 어제~내일, UTC 3시간 간격 (시간대 무관)`);
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
