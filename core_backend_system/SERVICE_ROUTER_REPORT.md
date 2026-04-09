# SafeHi Core Backend Router Report

이 문서는 `core_backend_system`의 모든 서비스/라우터를 기능별로 정리한 보고서입니다.

## 개요

- 서버 엔트리: `server.js`
- 앱 조립: `app.js`
- 라우터 그룹:
  - `presentation/apiRouter.js`
  - `presentation/dashboardRouter.js`
  - `GET /demo`
- DI/저장소 연결: `container.js`

## 런타임 저장소 경로

### InMemory 모드

- 활성화 조건: `.env`의 `USE_INMEMORY=true`
- Dashboard 계열:
  - `adapters/inmemory/dashboardRepositories.js`
- Core API 계열:
  - `adapters/inmemory/coreRepositories.js`

### DB 모드

- Dashboard 계열:
  - Prisma repositories in `adapters/prisma/*`
- Core API 계열:
  - MySQL repositories in `adapters/mysql/*`

## 공통/운영 라우터

### `GET /core/health`

- 설명: 백엔드 프로세스 상태 확인
- 응답: `{ ok: true, service: "core_backend_system" }`
- 구현 위치: `app.js`

### `GET /demo`

- 설명: 브라우저에서 전 라우터를 직접 호출할 수 있는 테스트 페이지
- 특징:
  - Base URL 변경 가능
  - 대표 라우트 일괄 테스트 버튼 제공
  - 인증/대시보드/대상자/매니저/돌봄일지/Core API 전체 버튼 제공
- 구현 위치:
  - 라우트: `app.js`
  - 페이지 렌더링: `presentation/demoPage.js`

## Dashboard Auth Service

서비스 구현: `services/dashboardService.js`

### `POST /core/dashboard/auth/login`

- 설명: 로그인
- 요청 body:
  - `email`
  - `password`
  - `rememberMe?`
- 성공 응답:
  - `data.user`
  - `data.token`

### `POST /core/dashboard/auth/register`

- 설명: 회원가입
- 요청 body:
  - `email`
  - `password`
  - `name`
  - `phone`
  - 추가 필드는 허용되지만 현재 mock 서비스는 핵심 필드만 사용

### `POST /core/dashboard/auth/logout`

- 설명: 로그아웃
- 응답: `{ ok: true }`

### `POST /core/dashboard/auth/forgot-password`

- 설명: 비밀번호 재설정 요청
- 요청 body:
  - `email`

### `POST /core/dashboard/auth/reset-password`

- 설명: 비밀번호 재설정
- 요청 body:
  - `email` 또는 `token`
  - `password` 또는 `newPassword`

### `POST /core/dashboard/auth/send-verification`

- 설명: 이메일 인증 코드 발송
- 요청 body:
  - `email`

### `POST /core/dashboard/auth/verify-code`

- 설명: 이메일 인증 코드 검증
- 요청 body:
  - `email`
  - `code`

### `POST /core/dashboard/auth/organization-verify`

- 설명: 기관 인증 요청
- 요청 body: 자유 형식
- 응답:
  - `data.requestId`

## Dashboard Summary Service

저장소:

- `dashboardRepo`
- InMemory: `InMemoryDashboardRepo`
- DB: `PrismaDashboardRepo`

### `GET /core/dashboard/kpi`

- 설명: 대시보드 KPI 카드 데이터

### `GET /core/dashboard/recent-reports?limit=5`

- 설명: 최근 리포트 목록

### `GET /core/dashboard/notifications?limit=4`

- 설명: 알림 목록

### `GET /core/dashboard/welfare-news?limit=10`

- 설명: 복지 뉴스 목록

### `GET /core/dashboard/tasks?limit=10`

- 설명: 업무 요청 목록

### `GET /core/dashboard/notices?limit=10`

- 설명: 공지사항 목록

## Care Log Service

저장소:

- `careLogRepo`
- InMemory: `InMemoryCareLogRepo`
- DB: `PrismaCareLogRepo`

### `GET /core/dashboard/care-logs`

- 설명: 돌봄일지 목록
- 쿼리:
  - `status`
  - `search`
  - `dateStart`
  - `dateEnd`
  - `dong`
  - `page`
  - `pageSize`

### `GET /core/dashboard/care-logs/:id`

- 설명: 돌봄일지 상세

### `PATCH /core/dashboard/care-logs/bulk-status`

- 설명: 다중 상태 변경
- 요청 body:
  - `ids: string[]`
  - `status`

### `PATCH /core/dashboard/care-logs/:id/status`

- 설명: 단건 상태 변경
- 요청 body:
  - `status`
  - `reason?`

### `POST /core/dashboard/care-logs/:id/feedback`

- 설명: 피드백 추가
- 요청 body:
  - `content`

## Manager Service

저장소:

- `managerRepo`
- InMemory: `InMemoryManagerRepo`
- DB: `PrismaManagerRepo`

### `GET /core/dashboard/managers`

- 설명: 매니저 목록
- 쿼리:
  - `status`
  - `search`
  - `dong`
  - `center`

### `GET /core/dashboard/managers/kpi`

- 설명: 매니저 KPI

### `GET /core/dashboard/managers/:id`

- 설명: 매니저 상세

### `GET /core/dashboard/managers/:id/reports`

- 설명: 매니저별 리포트 목록
- 쿼리:
  - `status`
  - `dateStart`
  - `dateEnd`
- InMemory/Prisma 모두 구현됨

### `GET /core/dashboard/managers/:id/visits`

- 설명: 매니저별 방문 기록
- 쿼리:
  - `visitType`
  - `search`
  - `dateStart`
  - `dateEnd`
- InMemory/Prisma 모두 구현됨

### `POST /core/dashboard/managers/:id/visits`

- 설명: 매니저 일정/방문 생성
- 저장소:
  - `visitRepo`
- 요청 body:
  - `recipientId`
  - `visitDate`
  - `visitType?`
  - `summary?`

## Recipient Service

저장소:

- `recipientRepo`
- `visitRepo`
- `memoRepo`
- `policyRepo`

### `GET /core/dashboard/recipients`

- 설명: 대상자 목록
- 쿼리:
  - `status`
  - `search`
  - `dong`
  - `manager`

### `GET /core/dashboard/recipients/kpi`

- 설명: 대상자 KPI

### `GET /core/dashboard/recipients/:id`

- 설명: 대상자 상세

### `GET /core/dashboard/recipients/:id/care-logs`

- 설명: 대상자별 돌봄일지
- 쿼리:
  - `status`
  - `page`
  - `pageSize`
  - `dateStart`
  - `dateEnd`

### `GET /core/dashboard/recipients/:id/visits`

- 설명: 대상자별 방문 기록

### `GET /core/dashboard/recipients/:id/memos`

- 설명: 메모 목록

### `POST /core/dashboard/recipients/:id/memos`

- 설명: 메모 추가
- 요청 body:
  - `content`
  - `authorId?`
  - `authorName?`

### `GET /core/dashboard/recipients/:id/policies`

- 설명: 대상자 맞춤 정책 조회

### `POST /core/dashboard/recipients/:id/policies/refresh`

- 설명: 정책 추천 재생성/갱신

## Core API Service

주요 usecase:

- `usecases/ensureSummaryUsecase.js`
- `usecases/ensurePolicyRecommendationsUsecase.js`

AI client:

- `adapters/ai/flaskAiClient.js`

InMemory core repos:

- `adapters/inmemory/coreRepositories.js`

MySQL core repos:

- `adapters/mysql/yangchunSttRepository.js`
- `adapters/mysql/visitCategoryRepository.js`
- `adapters/mysql/welfarePolicyRepository.js`

### `GET /core/api/health`

- 설명: Core API 서브영역 상태
- 구현 위치: `presentation/apiRouter.js`

### `GET /core/api/reports/:reportid/summary?email=...`

- 설명: 리포트 요약 폴링
- 동작:
  1. 저장된 summary 존재 시 `READY`
  2. transcript path 조회
  3. AI 요약 생성
  4. 저장 후 첫 응답은 `PENDING`

### `GET /core/api/reports/:reportid/policies?email=...`

- 설명: 정책 추천 폴링
- 동작:
  1. 저장된 policy 존재 시 `READY`
  2. transcript path 조회
  3. AI 정책 추천 생성
  4. 저장 후 첫 응답은 `PENDING`

### `POST /core/api/ai/run`

- 설명: DB를 거치지 않는 AI 직접 실행
- 요청 body:
  - `transcript`
  - `mode: "summary" | "policies"`
- 내부 사용 메서드:
  - `aiClient.inferVisitSummary`
  - `aiClient.inferPolicyRecommendations`

## 검증 포인트

- `USE_INMEMORY=true` 환경에서 Dashboard 및 Core API 전 라우트를 로컬에서 테스트 가능
- `/demo` 페이지에서 전 라우트 직접 호출 가능
- AI 직접 실행 및 Core API 폴링은 AI 더미 서버(`127.0.0.1:5000`)가 실행 중이어야 함

