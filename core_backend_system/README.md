# BackEnd Server Setting 
```
npm install
```

# core_backend_system

기존 루트 `MainServer.js`(HTTPS/URIProcess)와 **완전히 분리된**, 단독 실행 가능한 이노하이의 새로운 Core REST API 모듈입니다.

이 모듈의 목적은 **서비스에서 자주 바뀌는 지점(AI/DB/지자체 확장)** 을 한곳에 몰지 않고, 영향 범위를 최소화하는 것입니다.

이로써 자유롭게 영업된 고객들 (Tenant)의 구체적인 요구사항들만을 구현하여 블록 조립하듯 소프트웨어 서비스 개발이 가능합니다.

1) **Presentation**: HTTP(라우팅/검증/응답 포맷)
2) **Tenancy**: Tenent 차이 해소 (resolve) => 도메인 구분해줘서 맞는 Adapter로(UseCase는 절대 변하지않음) 블록 조립
3) **Service/UseCase**: 업무 흐름(오케스트레이션) — “요약 확보”, “정책 추천 확보”
4) **Adapters**: 외부 연동 *구현체* (MySQL repo, Flask AI client, FileStorage 등)
5) **Infra**: 외부 시스템/리소스 자체 (MySQL 서버, Flask 서버, 파일시스템, 네트워크)

---

## 설계 요약(한 장)
```
Client
	|
	| HTTP
	v
Presentation (Express Router)
	|
	| calls (Auth && Json Parsing)
	| resolves tenant (X-Tenant / ?tenant / DEFAULT_TENANT)
	v
Tenancy (Tenant Resolver)
	|
	| selects adapters per tenant
	v
Service / UseCase (Orchestration)
	|
	| uses
	+---------------------+
	|                     |
	v                     v
Adapters (MySQL Repo)   Adapters (Flask AI Client)
	|                     |
	v                     v
Infra: MySQL            Infra: Flask AI (model preload)
	|                     |
	| (query)             | (flask api)
TABLE                   AI model (STT, LLM)
```

---

## 빠른 실행 가이드 (언제든지 복붙용)

### 0) Core 환경파일 준비

`core_backend_system/.env.example`을 참고해서 `core_backend_system/.env`를 생성하세요.

더미 AI 서버를 쓰는 경우, core `.env`에 아래를 넣으면 됩니다.

```bash
AI_BASE_URL=http://127.0.0.1:5000
```

### 1) Dummy AI 서버 실행 (Python/Flask)

```bash
cd core_backend_system/ai_dummy_server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py
```

- Health: `http://127.0.0.1:5000/health`
- Inference: `http://127.0.0.1:5000/v1/infer/*`

### 2) Core 서버 실행 (Node)

```bash
cd /home/jun/jun/BackEnd
node core_backend_system/server.js
```

- Health: `http://127.0.0.1:4100/core/health`
- API Base: `http://127.0.0.1:4100/core/api`

---

## 예시 요청 (curl)

### A) DB 없이 AI만 바로 실행 (추천: 연결 테스트용)

summary:

```bash
curl -sS -X POST http://127.0.0.1:4100/core/api/ai/run \
	-H 'Content-Type: application/json' \
	-d '{"mode":"summary","transcript":"안녕하세요. 더미 테스트입니다."}'
```

policies:

```bash
curl -sS -X POST http://127.0.0.1:4100/core/api/ai/run \
	-H 'Content-Type: application/json' \
	-d '{"mode":"policies","transcript":"복지 정책 추천이 필요합니다."}'
```

### B) Dummy AI 서버 직접 호출

```bash
curl -sS -X POST http://127.0.0.1:5000/v1/infer/visit_summary \
	-H 'Content-Type: application/json' \
	-d '{"transcript":"hello"}'
```

### C) (DB 연동) 요약/정책 폴링 API

> 실제 DB에 report/email/STT 경로가 존재해야 `FAILED(NO_STT)`가 나지 않습니다.

```bash
curl -sS "http://127.0.0.1:4100/core/api/reports/1/summary?email=test@example.com"
curl -sS "http://127.0.0.1:4100/core/api/reports/1/policies?email=test@example.com"
```

---

## 디렉터리 구조(핵심)

```text
core_backend_system/
	presentation/          # REST API 라우터(입출력)
	usecases/              # 업무 흐름(오케스트레이션)
	adapters/              # 외부 연동 구현체(코드)
		ai/                  # Flask AI Client
		mysql/               # MySQL Repository 구현
	tenancy/               # tenant 결정 로직(지자체 확장)
	app.js                 # core app factory (Express)
	container.js           # DI/조립(tenant별 repo 교체)
	server.js              # 단독 실행 엔트리포인트
    ai_server/             # (1.17) dummy server
```

---
### (1.17) Only AI generated

## Service vs UseCase (왜 분리하나?)

이 프로젝트에서 두 용어는 이렇게 쓰는 것을 권장합니다.

### UseCase (단일 API)

**UseCase는 “하나의 API 요청(또는 사용자 시나리오)”을 끝내는 오케스트레이션 단위**입니다.

예:

- `GET /core/api/reports/:id/summary?email=...`
	- DB에서 요약이 있는지 확인
	- 없으면 STT 경로를 조회
	- Flask AI를 호출해 JSON 결과를 받음
	- Node가 DB에 저장
	- `READY / PENDING / FAILED`로 응답 결정

즉, UseCase는 **여러 어댑터(MySQL/AI)를 어떤 순서로 묶어서 “업무 흐름”을 완성하는지**가 핵심입니다.

### Service (여러 UseCase)

**Service는 여러 UseCase에서 재사용될 수 있는 “기능/규칙” 단위**입니다.

예:

- AI 응답 -> 정규화(필드명/빈값 처리) -> DB save
- `PENDING` 정책(재호출 간격, 상태 기록 방식)

즉, Service는 “흐름”이라기보다 **‘규칙/기능’을 한 곳에 모으는 역할**입니다.


### 1) Tenant(테넌트)

**Tenant = 같은 코어 서버를 공유하지만, 지자체/기관별로 DB 스키마·테이블·규칙이 달라질 수 있는 “운영 단위”**입니다.

- 요청에서 `X-Tenant` 헤더 또는 `?tenant=` 쿼리로 테넌트를 지정할 수 있고,
- 지정이 없으면 `DEFAULT_TENANT`를 사용합니다.

테넌트 확장 시의 원칙:

- `usecases/`는 되도록 그대로 유지
- 바뀌는 부분은 `container.js`의 **tenant → Repository 구현체 매핑**으로 흡수

### 2) 왜 usecase와 adapters를 분리하나?

이 서비스는 다음이 자주 바뀝니다.

- AI 모델/입출력 스키마(Flask API)
- 지자체 확장(테이블/컬럼/쿼리 차이)

따라서 “업무 흐름”을 `usecases/`에 고정하고,
“구현 상세(MySQL, HTTP 호출)”를 `adapters/`로 분리해 변경 범위를 최소화합니다.

---

## 데이터 흐름(폴링/비동기 재호출)

이 모듈은 **"없으면 생성 트리거 → 다음 호출에서 결과 조회"** 패턴을 사용합니다.

### Summary(요약) 흐름

```text
GET /core/api/reports/:id/summary?email=...
	|
	|-- VisitCategory에 결과 존재 -> READY(200)
	|
	`-- 결과 없음 -> STT 경로 조회 -> Flask AI 호출(JSON) -> Node가 DB 저장
										 |
										 `-> PENDING(202) 반환 (클라이언트 재호출)
```

### Policy(정책 추천) 흐름

```text
GET /core/api/reports/:id/policies
	|
	|-- WelfarePolicies에 결과 존재 -> READY(200)
	|
	`-- 결과 없음 -> STT 경로 조회 -> Flask AI 호출(JSON) -> Node가 DB 저장
										 |
										 `-> PENDING(202) 반환 (클라이언트 재호출)
```

응답 상태:

- `READY`: 결과 포함
- `PENDING`: 생성/저장 처리 직후, 재호출 유도
- `FAILED`: 입력 부족(STT 없음 등) 또는 외부 호출 실패

---

## 요약/정책 플로우차트 (Core API 실행 흐름)

### Summary Flow (요약) — `GET /core/api/reports/:reportid/summary?email=...`

```text
Client
	|
	| GET /core/api/reports/:reportid/summary?email=...
	v
[Presentation] presentation/apiRouter.js
	- reportid/email 검증
	- container.repos(req) 호출
	|
	v
[DI/Tenancy] container.js
	- tenantResolver.js 로 tenant 결정
		(X-Tenant / ?tenant= / DEFAULT_TENANT)
	- tenant에 맞는 Repo 구현체 생성
		- adapters/mysql/yangchunSttRepository.js
		- adapters/mysql/visitCategoryRepository.js
	|
	v
[Usecase] usecases/ensureSummaryUsecase.js
	|
	| (A) visitCategoryRepo.findByReportIdAndEmail(reportid, email)
	|      ├─ 결과 있음  -> READY(200)
	|      └─ 결과 없음  -> (B) 진행
	|
	| (B) sttRepo.getTranscriptPath(reportid, email)
	|      ├─ 없음 -> FAILED(NO_STT) -> 500
	|      └─ 있음 -> AI 호출
	|
	| aiClient.summarizeVisit({reportid, email, transcriptPath})
	v
[AI Adapter] adapters/ai/flaskAiClient.js
	- POST /v1/infer/visit_summary
	- 응답에 items[] 필수 (없으면 throw)
	|
	v
[DB Adapter] adapters/mysql/visitCategoryRepository.js
	- visitCategoryRepo.replaceAll(reportid, email, aiItems)
	- (보통 DELETE -> INSERT 트랜잭션)
	|
	v
PENDING(202) 반환  -> 클라이언트 재호출 필요
	|
	v
재호출 시 (A) 분기에서 READY(200)
```

#### Summary 관찰 포인트(디버깅)

- **첫 호출 202(PENDING)**: “DB에 없었고 → AI 호출 + DB 저장 트리거까지 갔다”
- **재호출 200(READY)**: “저장된 DB 결과를 읽어왔다”
- **500 + NO_STT**: “transcript_path가 없어서 AI 호출 전에 종료”

---

### Policy Flow (정책 추천) — `GET /core/api/reports/:reportid/policies?email=...`

```text
Client
	|
	| GET /core/api/reports/:reportid/policies?email=...
	v
[Presentation] presentation/apiRouter.js
	- reportid 검증 (email optional)
	- container.repos(req) 호출
	|
	v
[DI/Tenancy] container.js
	- tenantResolver.js 로 tenant 결정
	- tenant에 맞는 Repo 구현체 생성
		- adapters/mysql/yangchunSttRepository.js
		- adapters/mysql/welfarePolicyRepository.js
	|
	v
[Usecase] usecases/ensurePolicyRecommendationsUsecase.js
	|
	| (A) welfarePolicyRepo.findByReportId(reportid)
	|      ├─ 결과 있음  -> READY(200)
	|      └─ 결과 없음  -> (B) 진행
	|
	| (B) transcriptPath 조회
	|      - email 있으면 sttRepo.getTranscriptPath(reportid, email)
	|      - email 없으면 sttRepo.getTranscriptPathByReportId(reportid)
	|      ├─ 없음 -> FAILED(NO_STT) -> 500
	|      └─ 있음 -> AI 호출
	|
	| aiClient.recommendPolicies({reportid, transcriptPath, topK:3})
	v
[AI Adapter] adapters/ai/flaskAiClient.js
	- POST /v1/infer/policy_recommendations
	- 응답에 policies[] 필수 (없으면 throw)
	|
	v
[DB Adapter] adapters/mysql/welfarePolicyRepository.js
	- welfarePolicyRepo.replaceForReportId(reportid, policies)
	|
	v
PENDING(202) 반환  -> 클라이언트 재호출 필요
	|
	v
재호출 시 (A) 분기에서 READY(200)
```

#### Policy 관찰 포인트(디버깅)

- **첫 호출 202(PENDING)**: “DB에 없었고 → AI 호출 + DB 저장 트리거까지 갔다”
- **재호출 200(READY)**: “저장된 DB 결과를 읽어왔다”
- **500 + NO_STT**: “transcript_path가 없어서 AI 호출 전에 종료”

---

## API 계약(예시)

### 1) 요약 조회/생성

- `GET /core/api/reports/:reportid/summary?email=...`

### 2) 정책 추천 조회/생성

- `GET /core/api/reports/:reportid/policies?email=...`

> 구체적인 JSON 스키마는 현재 `presentation/apiRouter.js`의 응답 형태를 기준으로 합니다.

---

## Flask AI 계약(서버가 결과를 받아 DB write 하는 모델)

이 모듈은 AI 서버가 **JSON 결과를 반환**한다고 가정합니다.

- `POST /v1/infer/visit_summary` → `{ items: [...] }`
- `POST /v1/infer/policy_recommendations` → `{ policies: [...] }`

이 JSON을 Node가 받아서 DB에 저장합니다.

---

## 실행(단독)

1) 환경파일 준비

- `core_backend_system/.env.example`을 참고해서 `core_backend_system/.env`를 생성

2) 실행

```bash
node core_backend_system/server.js
```

기본 주소:

- Health: `http://localhost:4100/core/health`
- API Base: `http://localhost:4100/core/api`

---

**Docker**: 빠른 실행 (core + ai dummy + mysql)

- 준비: `core_backend_system/.env`를 생성하세요.

빌드 및 실행:

```bash
docker compose build
docker compose up -d
```

- Health: `http://localhost:4100/core/health`
- Dummy AI: `http://localhost:5000/health`

포트나 비밀번호를 변경하려면 `docker-compose.yml`의 환경변수를 수정하세요.

---
