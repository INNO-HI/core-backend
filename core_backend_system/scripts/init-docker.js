/**
 * Docker 컨테이너 초기화 스크립트
 *
 * `npx prisma migrate deploy` 직후에 실행된다.
 * - Admin 계정이 없으면 시드를 실행해 초기 데이터를 삽입.
 * - 이미 존재하면 reference data(Center/Dong/Policy) 누락분만 보충.
 *   (upsert 기반이라 기존 데이터 안전)
 *
 * 오류가 나도 서버 기동을 막지 않는다.
 */

const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Checking database state...');

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@safehi.kr';
  const adminExists = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } });

  if (!adminExists) {
    console.log('📦 Database empty — running seed...');
    execSync('node prisma/seed.js', { stdio: 'inherit' });
    console.log('✅ Seed complete.');
    return;
  }

  console.log(`ℹ️  Admin (${adminEmail}) already exists — checking reference data...`);

  const [centerCount, dongCount, policyCount] = await Promise.all([
    prisma.center.count(),
    prisma.dong.count(),
    prisma.policy.count(),
  ]);

  if (centerCount === 0 || dongCount === 0 || policyCount === 0) {
    console.log('⚠️  Reference data missing — re-running seed to replenish...');
    execSync('node prisma/seed.js', { stdio: 'inherit' });
    console.log('✅ Reference data restored.');
  } else {
    console.log(`✅ DB ready. Centers: ${centerCount}, Dongs: ${dongCount}, Policies: ${policyCount}`);
  }
}

main()
  .catch((e) => {
    console.error('❌ Init check failed:', e.message);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
