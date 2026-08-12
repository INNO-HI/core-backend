/**
 * 시스템 상태 리포지토리 — 설정 페이지의 DB 관리 패널이 쓴다.
 * 실제 PostgreSQL 통계 뷰(pg_stat_activity 등)를 조회한다.
 */

function prettyBytes(bytes) {
  if (bytes === null || bytes === undefined) return null;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const { comparePassword } = require('../../lib/auth');

class PrismaSystemRepo {
  constructor({ prisma }) {
    this.prisma = prisma;
  }

  /** DB 관리 패널 진입 시 본인(관리자) 비밀번호 재확인 */
  async verifyUserPassword(userId, password) {
    if (!userId || !password) return false;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) return false;
    return comparePassword(password, user.password);
  }

  async getPostgresStatus() {
    const startedAt = Date.now();

    const [meta] = await this.prisma.$queryRaw`
      SELECT current_database()                                        AS database,
             version()                                                 AS version,
             pg_database_size(current_database())                      AS size_bytes,
             current_setting('max_connections')::int                   AS max_connections,
             (SELECT count(*)::int FROM pg_stat_activity
               WHERE datname = current_database() AND state = 'active') AS active_connections,
             (SELECT count(*)::int FROM pg_stat_activity
               WHERE datname = current_database() AND state = 'idle')   AS idle_connections,
             (SELECT count(*)::int FROM pg_tables
               WHERE schemaname = 'public')                             AS table_count
    `;
    const latencyMs = Date.now() - startedAt;

    const sizeBytes = meta.size_bytes === null ? null : Number(meta.size_bytes);
    return {
      provider: 'postgresql',
      mode: 'postgres',
      status: 'connected',
      database: meta.database || null,
      version: meta.version ? String(meta.version).split(' on ')[0] : null,
      latencyMs,
      sizeBytes,
      sizePretty: prettyBytes(sizeBytes),
      tableCount: Number(meta.table_count) || 0,
      activeConnections: Number(meta.active_connections) || 0,
      idleConnections: Number(meta.idle_connections) || 0,
      maxConnections: meta.max_connections === null ? null : Number(meta.max_connections),
      checkedAt: new Date().toISOString(),
      message: 'PostgreSQL 연결이 정상입니다.',
    };
  }
}

module.exports = { PrismaSystemRepo };
