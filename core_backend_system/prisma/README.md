# DB  – PostgreSQL + Prisma ORM

### 아키텍처 구조
```
Frontend (Next.js)
    ↓ HTTP API
dashboardRouter.js (Presentation – 변경 없음)
    ↓ 메서드 호출
adapters/prisma/*.js (7개 Repo – NEW)
    ↓ Prisma Client
PostgreSQL (safehi_dashboard DB)
```
핵심: dashboardRouter.js는 한 줄도 수정하지 않았습니다. 
DI 패턴 덕분에 container.js에서 리포지토리만 교체하면 됩니다.

## 생성/수정된 파일
### 새로 생성된 파일
| 파일 | 역할 |
|------|------|
| prisma/schema.prisma | 12개 모델 정의 (User, Center, Dong, Manager, Recipient, CareLog, Feedback, Visit, Memo, Policy, DashboardKPI, Notification) |
| prisma/seed.js | 기존 인메모리 더미 데이터를 전부 DB에 삽입하는 시드 스크립트 |
| lib/prisma.js | PrismaClient 싱글턴 (커넥션 풀 관리) |
| adapters/prisma/index.js | 배럴 export |
| adapters/prisma/dashboardRepo.js | KPI, 최근 보고서, 알림 조회 |
| adapters/prisma/careLogRepo.js | 돌봄 일지 CRUD + 피드백 |
| adapters/prisma/managerRepo.js | 매니저 목록/상세/KPI |
| adapters/prisma/recipientRepo.js | 대상자 목록/상세/KPI + 월별 통계 |
| adapters/prisma/visitRepo.js | 방문 기록 조회 |
| adapters/prisma/memoRepo.js | 메모 CRUD |
| adapters/prisma/policyRepo.js | 정책 추천 조회/갱신 |


사용 명령어
```
# DB 마이그레이션 (스키마 변경 시)
npm run db:migrate

# 시드 데이터 초기화
npm run db:seed

# DB 완전 리셋 (마이그레이션 + 시드)
npm run db:reset

# Prisma Studio (브라우저에서 DB 열람)
npm run db:studio
```