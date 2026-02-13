/**
 * Prisma Client 싱글턴
 *
 * 앱 전체에서 하나의 PrismaClient 인스턴스만 사용하도록 합니다.
 * Hot-reload 시 커넥션 누수를 방지합니다.
 */

const { PrismaClient } = require('@prisma/client');

let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  // 개발 환경에서는 글로벌에 캐시하여 Hot-reload 시 재생성 방지
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ['warn', 'error'],
    });
  }
  prisma = global.__prisma;
}

module.exports = { prisma };
