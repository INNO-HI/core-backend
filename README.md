# Core Backend

지자체 돌봄 매니저를 위한 SafeHi 백엔드 서버입니다.  
Node.js (Express) + Prisma (PostgreSQL) 기반, Docker Compose로 단일 명령 배포.

---

## 업데이트 이력

### v1.0.0 — 2026-05-04

**계정별 데이터 격리 및 프로덕션 보안 강화**

- **DB 스키마 전면 재설계**: 모든 비즈니스 테이블(Manager, Recipient, CareLog, Visit, Memo, DashboardKPI, Notification)에 `ownerId` FK 추가. 계정 간 데이터 완전 격리.
- **실 JWT 인증 도입**: `jsonwebtoken` 기반 토큰 발급/검증. 128자 hex secret. 7일 만료. 모든 데이터 엔드포인트에 `requireAuth` 미들웨어 적용.
- **bcrypt 비밀번호 해싱**: `bcryptjs` 10 라운드. 평문 저장 방식 제거.
- **Rate Limiting**: auth 엔드포인트 15분/20회, 일반 API 1분/300회 제한.
- **보안 헤더**: `helmet` 미들웨어 적용 (XSS, MIME sniffing, clickjacking 방어).
- **프로덕션 시드 정책**: 신규 가입 계정은 완전히 빈 대시보드로 시작. 시드는 전역 reference data(Center/Dong/Policy)와 admin 계정만 생성.
- **Docker 시크릿 분리**: 모든 민감 정보를 gitignored `.env`로 이동. `docker-compose.yml`에 하드코딩된 자격증명 제거.
- **단일 클린 마이그레이션**: 기존 복수 마이그레이션을 `20260504000000_init_with_owner_scoping` 하나로 통합.

---

## 빠른 시작

### 사전 요구사항
- Docker & Docker Compose
- `core-backend/.env` 파일 설정 (`.env.example` 참고)

### `.env` 필수 항목

```env
POSTGRES_USER=safehi
POSTGRES_PASSWORD=<강력한_랜덤_비밀번호>
POSTGRES_DB=safehi_dashboard
JWT_SECRET=<128자_hex_시크릿>   # openssl rand -hex 64
JWT_EXPIRES_IN=7d
ADMIN_EMAIL=admin@safehi.kr
ADMIN_PASSWORD=<강력한_비밀번호>
CORS_ORIGINS=https://your-domain.com,http://localhost:3000
```

> ⚠️ `.env` 파일은 절대 git에 커밋하지 마세요.

### 서비스 시작

```bash
cd core-backend

# 최초 실행 (볼륨 초기화 포함)
docker compose up -d

# 코드 변경 후 재빌드
docker compose build --no-cache core
docker compose up -d core
```

서버 기동 순서: PostgreSQL → migrate deploy → seed(최초 1회) → Node.js 서버

### 자주 쓰는 명령

```bash
# 상태 확인
docker compose ps

# 헬스 체크
curl http://localhost:4100/core/health

# 로그 확인
docker compose logs --tail=200 core

# 실시간 로그
docker compose logs -f

# 완전 초기화 (볼륨 삭제 포함 — DB 데이터 전부 삭제)
docker compose down -v
docker compose up -d
```

---

## 서비스 구성

| 서비스 | 포트 | 설명 |
|--------|------|------|
| `postgres` | 5432 | PostgreSQL 16 |
| `core` | 4100 | Express API 서버 |
| `ai_dummy` | 5000 | AI 더미 서버 (STT/요약) |

---

## API 구조

```
/core/health              — 헬스 체크 (인증 불필요)
/core/dashboard/auth/*    — 인증 엔드포인트 (rate limit 강화)
/core/dashboard/*         — 대시보드 데이터 API (JWT 필수)
/core/api/*               — 외부 연동 API
```

---

## 주의사항

- `ADMIN_PASSWORD` 환경변수 미설정 시 `NODE_ENV=production`에서 서버 기동 불가 (의도된 보안 가드).
- Docker `pg_data` 볼륨이 이미 존재하면 `POSTGRES_PASSWORD` 변경이 반영되지 않음. 비밀번호 변경 시 `docker compose down -v` 후 재시작 필요.
- `sudo` 없이 docker 실행하려면 `sudo usermod -aG docker $USER` 후 재로그인.
