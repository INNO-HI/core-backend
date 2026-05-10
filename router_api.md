# Core Backend System — API 명세서

> **Base URL**: `http://localhost:4100`  
> **Content-Type**: `application/json` (파일 업로드 제외)  
> **인증**: 현재 토큰 인증 임시 비활성화 상태. 원래는 `Authorization: Bearer <JWT>` 헤더 필요.

---

## 공통 응답 구조

```json
// 성공
{ "ok": true, "data": { ... } }

// 실패
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "설명" } }
```

### 공통 에러 코드

| 코드 | HTTP | 설명 |
|---|---|---|
| `BAD_REQUEST` | 400 | 필수 파라미터 누락/형식 오류 |
| `UNAUTHORIZED` | 401 | 인증 필요 |
| `AUTH_FAILED` | 401 | 이메일/비밀번호 불일치 |
| `TOKEN_EXPIRED` | 401 | JWT 만료 |
| `INVALID_TOKEN` | 401 | JWT 서명 불일치 |
| `NOT_FOUND` | 404 | 리소스 없음 |
| `TOO_MANY_REQUESTS` | 429 | Rate limit 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |
| `FLASK_UNAVAILABLE` | 502 | AI 서버 연결 실패 |

---

## 1. 헬스체크

### `GET /core/health`

서비스 전체 헬스 확인.

**응답 예시**
```json
{ "ok": true, "service": "core_backend_system" }
```

---

### `GET /core/api/health`

Core API 헬스 + 현재 테넌트 확인.

**응답 예시**
```json
{ "ok": true, "tenant": "yangchun" }
```

---

## 2. 인증 (Auth)

**Prefix**: `/core/dashboard/auth`  
> 이 섹션의 모든 엔드포인트는 토큰 없이 공개 접근 가능.

---

### `POST /core/dashboard/auth/login`

로그인. 성공 시 JWT 토큰 반환.  
5회 연속 실패 시 5분간 계정 잠금.

**요청 Body**
```json
{
  "email": "admin@safehi.kr",   // string, 필수
  "password": "Admin1234!",     // string, 필수
  "rememberMe": false           // boolean, 선택
}
```

**응답 200**
```json
{
  "ok": true,
  "data": {
    "user": {
      "id": "cmoqsl1ep0000o43p...",
      "email": "admin@safehi.kr",
      "name": "시스템 관리자",
      "phone": null,
      "role": "admin",              // "admin" | "user"
      "emailVerified": true,
      "createdAt": "2026-05-04T06:01:57.601Z",
      "updatedAt": "2026-05-04T06:01:57.601Z"
    },
    "token": "eyJhbGci..."         // JWT (7일 만료)
  }
}
```

**응답 401** — 비밀번호 불일치 / 잠금
```json
{ "ok": false, "error": { "code": "AUTH_FAILED", "message": "이메일 또는 비밀번호가 올바르지 않습니다." } }
```

---

### `POST /core/dashboard/auth/register`

회원가입. 성공 시 JWT 토큰 반환.

**요청 Body**
```json
{
  "email": "user@example.com",  // string, 필수
  "password": "pass1234",       // string, 필수 (최소 6자)
  "name": "홍길동",             // string, 선택 (미입력 시 이메일 앞부분 사용)
  "phone": "010-1234-5678"      // string, 선택
}
```

**응답 200**
```json
{
  "ok": true,
  "data": {
    "user": { "id": "...", "email": "user@example.com", "name": "홍길동", "role": "user", ... },
    "token": "eyJhbGci..."
  }
}
```

**응답 400** — 이메일 중복, 비밀번호 6자 미만
```json
{ "ok": false, "error": { "code": "REGISTER_FAILED", "message": "이미 사용 중인 이메일입니다." } }
```

---

### `POST /core/dashboard/auth/logout`

로그아웃 (서버 측 무상태 — 항상 성공 반환).

**응답 200**
```json
{ "ok": true }
```

---

### `POST /core/dashboard/auth/forgot-password`

비밀번호 찾기 요청 (이메일 존재 여부 노출 없이 항상 성공).

**요청 Body**
```json
{ "email": "user@example.com" }
```

**응답 200**
```json
{ "ok": true }
```

---

### `POST /core/dashboard/auth/reset-password`

비밀번호 재설정.

**요청 Body** — 토큰 방식 또는 이메일 직접 방식 중 하나 사용
```json
// 토큰 방식 (이메일 링크)
{
  "token": "reset-token-string",    // string (10자 이상, 필수)
  "newPassword": "newpass123"       // string, 최소 6자
}

// 이메일 직접 방식
{
  "email": "user@example.com",
  "newPassword": "newpass123"
}
```

**응답 200**
```json
{ "ok": true }
```

---

### `POST /core/dashboard/auth/send-verification`

회원가입 전 이메일 인증 코드 발송.  
> 현재 데모 구현 — 코드 `123456` 고정 반환.

**요청 Body**
```json
{ "email": "user@example.com" }
```

**응답 200**
```json
{ "ok": true, "data": { "code": "123456" } }
```

**응답 400** — 이미 가입된 이메일
```json
{ "ok": false, "error": { "code": "VERIFY_FAILED", "message": "이미 사용 중인 이메일입니다." } }
```

---

### `POST /core/dashboard/auth/verify-code`

이메일 인증 코드 검증.

**요청 Body**
```json
{
  "email": "user@example.com",
  "code": "123456"
}
```

**응답 200**
```json
{ "ok": true }
```

**응답 400** — 코드 불일치
```json
{ "ok": false, "error": { "code": "VERIFY_FAILED", "message": "인증 코드가 올바르지 않습니다." } }
```

---

### `POST /core/dashboard/auth/organization-verify`

기관 인증 요청.

**요청 Body**
```json
{
  "organizationName": "양천구청",
  "registrationNumber": "123-45-67890"
}
```

**응답 200**
```json
{ "ok": true, "data": { "requestId": "req-1234567890" } }
```

---

### `DELETE /core/dashboard/auth/account`  
### `POST /core/dashboard/auth/delete-account`

계정 삭제. 두 엔드포인트 동일 동작.

**요청 Body**
```json
{ "reason": "탈퇴 사유 (선택)" }
```

**응답 200**
```json
{ "ok": true }
```

---

## 3. 대시보드 KPI

**Prefix**: `/core/dashboard`  
> 아래 모든 엔드포인트는 인증 필요 (현재 임시 비활성화).

---

### `GET /core/dashboard/kpi`

대시보드 메인 KPI 4종 (실시간 계산).

**응답 200**
```json
{
  "ok": true,
  "data": {
    "todayVisits": {
      "title": "오늘 방문",
      "value": 12,
      "change": 3,
      "changeDirection": "up",        // "up" | "down" | "none"
      "progressColor": "blue",
      "progressPercent": 80
    },
    "pendingReports": {
      "title": "대기 중 보고서",
      "value": 5,
      "change": 2,
      "changeDirection": "up",
      "progressColor": "yellow",
      "progressPercent": 45
    },
    "approvedCount": {
      "title": "승인 완료",
      "value": 34,
      "change": 8,
      "changeDirection": "up",
      "progressColor": "green",
      "progressPercent": 75
    },
    "totalRecipients": {
      "title": "담당 대상자",
      "value": 120,
      "change": 5,
      "changeDirection": "up",
      "progressColor": "purple",
      "progressPercent": 100
    }
  }
}
```

---

### `GET /core/dashboard/recent-reports?limit=5`

최근 돌봄 보고서 목록.

| 쿼리 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `limit` | number | `5` | 최대 반환 개수 |

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "clx...",
      "recipientName": "김순자",
      "managerName": "이민준",
      "registeredAt": "2026-05-10T09:00:00.000Z",
      "status": "pending",       // "pending" | "urgent" | "approved" | "rejected"
      "isUrgent": false
    }
  ]
}
```

---

### `GET /core/dashboard/notifications?limit=4`

최신 알림 목록.

| 쿼리 파라미터 | 타입 | 기본값 |
|---|---|---|
| `limit` | number | `4` |

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "notif-001",
      "title": "긴급 방문 요청",
      "content": "김순자 대상자 긴급 상황 발생",
      "createdAt": "2026-05-10T08:30:00.000Z",
      "isUrgent": true,
      "link": "/care-logs/abc123",
      "icon": "alert",
      "category": "report"       // "report" | "care"
    }
  ]
}
```

---

### `GET /core/dashboard/welfare-news?limit=10`

복지 뉴스 목록 (전역 reference data).

| 쿼리 파라미터 | 타입 | 기본값 |
|---|---|---|
| `limit` | number | `10` |

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "welfare-001",
      "title": "2026 상반기 복지 서비스 개편",
      "description": "독거노인 방문 횟수 월 8회로 확대 적용",
      "tag": "신규",             // string | null
      "date": "2026.03.15"
    }
  ]
}
```

---

### `GET /core/dashboard/tasks?limit=10`

처리 대기/긴급 업무 목록.

| 쿼리 파라미터 | 타입 | 기본값 |
|---|---|---|
| `limit` | number | `10` |

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "clx...",
      "title": "김순자 대상자 돌봄 보고",
      "meta": "이민준 매니저 · 2026-05-10",
      "badge": "긴급",
      "badgeColor": "#EF4444",
      "badgeBg": "#FEE2E2"
    }
  ]
}
```

---

### `GET /core/dashboard/notices?limit=10`

공지사항 목록 (전역 reference data).

| 쿼리 파라미터 | 타입 | 기본값 |
|---|---|---|
| `limit` | number | `10` |

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "notice-001",
      "title": "4월 전체 매니저 회의 안내",
      "date": "2026.03.15",
      "isNew": true
    }
  ]
}
```

---

## 4. 돌봄 일지 (Care Logs)

**Prefix**: `/core/dashboard/care-logs`

---

### `GET /core/dashboard/care-logs`

돌봄 일지 목록 (페이지네이션 + 필터).

| 쿼리 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `status` | string | `all` | `all` \| `pending` \| `urgent` \| `approved` \| `rejected` |
| `search` | string | `""` | 대상자명 / 매니저명 / 센터명 검색 |
| `dateStart` | string | - | ISO 날짜 (예: `2026-05-01`) |
| `dateEnd` | string | - | ISO 날짜 (예: `2026-05-31`) |
| `dong` | string | `all` | 행정동 이름 |
| `page` | number | `1` | 페이지 번호 |
| `pageSize` | number | `10` | 페이지 크기 (최대 100) |

**응답 200**
```json
{
  "ok": true,
  "data": {
    "logs": [
      {
        "id": "clx...",
        "recipientName": "김순자",
        "managerName": "이민준",
        "centerName": "목동종합사회복지관",
        "visitDate": "2026-05-10T00:00:00.000Z",
        "visitType": "visit",     // "visit" | "call"
        "registeredAt": "2026-05-10T09:00:00.000Z",
        "status": "pending"       // "pending" | "urgent" | "approved" | "rejected"
      }
    ],
    "totalCount": 42,
    "statusCounts": {
      "all": 42,
      "pending": 10,
      "urgent": 3,
      "approved": 25,
      "rejected": 4
    }
  }
}
```

---

### `GET /core/dashboard/care-logs/:id`

돌봄 일지 상세 조회.

**경로 파라미터**: `id` — 케어로그 ID (CUID)

**응답 200**
```json
{
  "ok": true,
  "data": {
    "id": "clx...",
    "recipientId": "clx...",
    "recipientName": "김순자",
    "status": "pending",
    "createdAt": "2026-05-10T09:00:00.000Z",
    "visitInfo": {
      "visitDate": "2026-05-10T00:00:00.000Z",
      "visitType": "visit",
      "managerName": "이민준",
      "centerName": "목동종합사회복지관"
    },
    "visitLocation": "서울시 양천구 목동 123",
    "careContent": "정기 방문 진행. 건강 상태 양호.",
    "careContentBlocks": [],       // 구조화 블록 배열 (자유 형식)
    "requiredActions": ["병원 동행 예약 필요"],
    "recommendedPolicies": ["기초생활수급 의료급여"],
    "notes": "가족과 연락 필요",
    "photos": [],                  // 사진 URL 배열
    "rejectionReason": null,       // 반려 시 사유 string
    "feedbacks": [
      {
        "id": "fb-clx...",
        "authorId": "clx...",
        "authorName": "관리자",
        "authorRole": "담당자",
        "content": "보완 요청",
        "createdAt": "2026-05-10T10:00:00.000Z"
      }
    ]
  }
}
```

**응답 404**
```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "돌봄 일지를 찾을 수 없습니다" } }
```

---

### `PATCH /core/dashboard/care-logs/bulk-status`

돌봄 일지 상태 일괄 변경.

**요청 Body**
```json
{
  "ids": ["clx...", "cly..."],           // string[], 필수
  "status": "approved"                   // "pending" | "urgent" | "approved" | "rejected", 필수
}
```

**응답 200**
```json
{ "ok": true, "data": { "count": 2 } }
```

---

### `PATCH /core/dashboard/care-logs/:id/status`

돌봄 일지 상태 단건 변경.

**경로 파라미터**: `id` — 케어로그 ID

**요청 Body**
```json
{
  "status": "approved",                  // "pending" | "urgent" | "approved" | "rejected", 필수
  "reason": "보완 사항 없음"             // string, 선택 (rejected 시 반려 사유)
}
```

**응답 200**
```json
{
  "ok": true,
  "data": {
    "id": "clx...",
    "status": "approved",
    "rejectionReason": null
  }
}
```

---

### `POST /core/dashboard/care-logs/:id/feedback`

돌봄 일지에 피드백 추가.

**경로 파라미터**: `id` — 케어로그 ID

**요청 Body**
```json
{
  "content": "추가 방문 필요합니다.",   // string, 필수
  "authorRole": "슈퍼바이저"            // string, 선택 (기본값: "담당자")
}
```

**응답 200**
```json
{
  "ok": true,
  "data": {
    "id": "fb-clx...",
    "careLogId": "clx...",
    "authorId": "clx...",
    "authorName": "관리자",
    "authorRole": "슈퍼바이저",
    "content": "추가 방문 필요합니다.",
    "createdAt": "2026-05-10T10:00:00.000Z"
  }
}
```

---

## 5. 매니저 (Managers)

**Prefix**: `/core/dashboard/managers`

---

### `GET /core/dashboard/managers`

매니저 목록 + 상태별 카운트.

| 쿼리 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `status` | string | `all` | `all` \| `active` \| `leave` \| `retired` |
| `search` | string | `""` | 이름 검색 |
| `dong` | string | `all` | 행정동 이름 |
| `center` | string | `all` | 센터 이름 |

**응답 200**
```json
{
  "ok": true,
  "data": {
    "managers": [
      {
        "id": "clx...",
        "name": "이민준",
        "gender": "male",           // "male" | "female"
        "centerName": "목동종합사회복지관",
        "phone": "010-1234-5678",
        "assignedDongs": ["목동 1동", "목동 2동"],
        "recipientCount": 15,
        "monthlyVisits": 42,
        "status": "active"          // "active" | "leave" | "retired"
      }
    ],
    "totalCount": 8,
    "statusCounts": {
      "all": 8,
      "active": 6,
      "leave": 1,
      "retired": 1
    }
  }
}
```

---

### `GET /core/dashboard/managers/kpi`

매니저 KPI 요약.

**응답 200**
```json
{
  "ok": true,
  "data": {
    "total": 8,
    "active": 6,
    "leave": 1,
    "retired": 1
  }
}
```

---

### `GET /core/dashboard/managers/:id`

매니저 상세 정보.

**경로 파라미터**: `id` — 매니저 ID

**응답 200**
```json
{
  "ok": true,
  "data": {
    "id": "clx...",
    "name": "이민준",
    "gender": "male",
    "centerName": "목동종합사회복지관",
    "phone": "010-1234-5678",
    "email": "manager@safehi.kr",
    "assignedDongs": ["목동 1동"],
    "recipientCount": 15,
    "monthlyVisits": 42,
    "status": "active",
    "startDate": "2024-03-01",
    "stats": {
      "monthlyVisits": 42,
      "monthlyReports": 18,
      "approvalRate": 88,
      "totalRecipients": 15
    },
    "recentReports": [
      {
        "id": "clx...",
        "recipientId": "clx...",
        "recipientName": "김순자",
        "visitDate": "2026-05-10T00:00:00.000Z",
        "registeredAt": "2026-05-10T09:00:00.000Z",
        "status": "pending"
      }
    ],
    "recentVisits": [
      {
        "id": "clx...",
        "recipientId": "clx...",
        "recipientName": "김순자",
        "visitDate": "2026-05-10T00:00:00.000Z",
        "visitType": "regular",    // "regular" | "call"
        "result": "방문 완료"
      }
    ],
    "totalVisits": 120,
    "reportCounts": { "approved": 95, "pending": 5, "rejected": 3 },
    "assignedRecipients": [
      {
        "id": "clx...",
        "name": "김순자",
        "gender": "female",
        "dong": "목동 1동",
        "careStartDate": "2024-01-15",
        "lastVisitDate": "2026-05-08T00:00:00.000Z",
        "isUrgent": false
      }
    ],
    "monthlyActivities": []
  }
}
```

**응답 404**
```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "매니저를 찾을 수 없습니다" } }
```

---

### `GET /core/dashboard/managers/:id/reports`

특정 매니저의 보고서 목록.

| 쿼리 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `status` | string | `all` | `all` \| `pending` \| `approved` \| `rejected` |
| `dateStart` | string | - | ISO 날짜 |
| `dateEnd` | string | - | ISO 날짜 |

**응답 200**
```json
{
  "ok": true,
  "data": {
    "reports": [
      {
        "id": "clx...",
        "recipientId": "clx...",
        "recipientName": "김순자",
        "visitDate": "2026-05-10T00:00:00.000Z",
        "registeredAt": "2026-05-10T09:00:00.000Z",
        "status": "pending"
      }
    ],
    "totalCount": 20,
    "statusCounts": { "all": 20, "pending": 5, "approved": 13, "rejected": 2 }
  }
}
```

---

### `GET /core/dashboard/managers/:id/visits`

특정 매니저의 방문 기록.

| 쿼리 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `visitType` | string | `all` | `all` \| `regular` \| `call` |
| `search` | string | `""` | 대상자명 검색 |
| `dateStart` | string | - | ISO 날짜 |
| `dateEnd` | string | - | ISO 날짜 |

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "clx...",
      "recipientId": "clx...",
      "recipientName": "김순자",
      "visitDate": "2026-05-10T00:00:00.000Z",
      "visitType": "regular",
      "result": "방문 완료"
    }
  ]
}
```

---

### `POST /core/dashboard/managers/:id/visits`

특정 매니저의 방문 일정 등록.

**경로 파라미터**: `id` — 매니저 ID

**요청 Body**
```json
{
  "recipientId": "clx...",           // string, 필수
  "visitDate": "2026-05-15T10:00:00.000Z",  // ISO 날짜, 필수
  "visitType": "visit",             // "visit" | "call", 선택 (기본: "visit")
  "summary": "정기 방문"            // string, 선택
}
```

**응답 200**
```json
{
  "ok": true,
  "data": {
    "id": "clx...",
    "recipientId": "clx...",
    "recipientName": "김순자",
    "recipientPhone": "010-9876-5432",
    "recipientAddress": "서울시 양천구 목동 123",
    "recipientStatus": "normal",
    "managerId": "clx...",
    "managerName": "이민준",
    "visitDate": "2026-05-15T10:00:00.000Z",
    "visitType": "regular",
    "result": "정기 방문"
  }
}
```

---

## 6. 대상자 (Recipients)

**Prefix**: `/core/dashboard/recipients`

---

### `GET /core/dashboard/recipients`

대상자 목록 + 상태별 카운트.

| 쿼리 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `status` | string | `all` | `all` \| `normal` \| `caution` \| `urgent` \| `unvisited` |
| `search` | string | `""` | 이름 / 주소 / 동 검색 |
| `dong` | string | `all` | 행정동 이름 |
| `manager` | string | `all` | 매니저 이름 |

**응답 200**
```json
{
  "ok": true,
  "data": {
    "recipients": [
      {
        "id": "clx...",
        "name": "김순자",
        "age": 78,
        "gender": "female",
        "dong": "목동 1동",
        "address": "서울시 양천구 목동 123",
        "managerName": "이민준",
        "lastVisitDate": "2026-05-08T00:00:00.000Z",
        "visitCount": 45,
        "status": "normal"      // "normal" | "caution" | "urgent" | "unvisited"
      }
    ],
    "totalCount": 120,
    "statusCounts": {
      "all": 120,
      "normal": 80,
      "caution": 25,
      "urgent": 10,
      "unvisited": 5
    }
  }
}
```

---

### `GET /core/dashboard/recipients/kpi`

대상자 KPI 요약.

**응답 200**
```json
{
  "ok": true,
  "data": {
    "total": 120,
    "normal": 80,
    "caution": 25,
    "urgent": 10,
    "unvisited": 5
  }
}
```

---

### `GET /core/dashboard/recipients/:id`

대상자 상세 정보 (방문 기록, 메모, 정책 추천 포함).

**경로 파라미터**: `id` — 대상자 ID

**응답 200**
```json
{
  "ok": true,
  "data": {
    "id": "clx...",
    "name": "김순자",
    "age": 78,
    "gender": "female",
    "status": "normal",
    "basicInfo": {
      "address": "서울시 양천구 목동 123",
      "dong": "목동 1동",
      "phone": "010-1111-2222",
      "emergencyContact": "010-3333-4444"
    },
    "manager": {
      "id": "clx...",
      "name": "이민준",
      "phone": "010-5555-6666",
      "centerName": "목동종합사회복지관"
    },
    "healthInfo": null,            // 건강 정보 object (자유 형식) | null
    "recentVisits": [
      {
        "id": "clx...",
        "careLogId": "clx...",
        "visitDate": "2026-05-08T00:00:00.000Z",
        "visitType": "visit",
        "managerName": "이민준",
        "summary": "정기 방문 완료"
      }
    ],
    "careStartDate": "2024-01-15",
    "kpi": {
      "monthlyVisits": 4,
      "totalVisits": 45,
      "totalReports": 40,
      "urgentHistory": 2
    },
    "memos": [
      {
        "id": "clx...",
        "recipientId": "clx...",
        "authorId": "clx...",
        "authorName": "이민준",
        "content": "가족 연락 필요",
        "createdAt": "2026-05-09T08:00:00.000Z",
        "type": "normal"
      }
    ],
    "monthlyVisits": [
      { "month": "12월", "count": 4 },
      { "month": "1월", "count": 3 },
      { "month": "2월", "count": 5 },
      { "month": "3월", "count": 4 },
      { "month": "4월", "count": 4 },
      { "month": "5월", "count": 2 }
    ],
    "policyRecommendations": [
      {
        "id": "policy-001",
        "name": "기초생활수급 의료급여",
        "description": "본인부담금 경감 적용",
        "matchScore": 95,
        "icon": "health",
        "badge": "적합"            // "적합" (score>=90) | "추천"
      }
    ]
  }
}
```

**응답 404**
```json
{ "ok": false, "error": { "code": "NOT_FOUND", "message": "대상자를 찾을 수 없습니다" } }
```

---

### `GET /core/dashboard/recipients/:id/care-logs`

특정 대상자의 돌봄 일지 목록.

| 쿼리 파라미터 | 타입 | 기본값 | 설명 |
|---|---|---|---|
| `status` | string | `all` | `all` \| `pending` \| `urgent` \| `approved` \| `rejected` |
| `dateStart` | string | - | ISO 날짜 |
| `dateEnd` | string | - | ISO 날짜 |
| `page` | number | `1` | 페이지 번호 |
| `pageSize` | number | `20` | 페이지 크기 (최대 100) |

**응답 200**
```json
{
  "ok": true,
  "data": {
    "logs": [
      {
        "id": "clx...",
        "recipientId": "clx...",
        "recipientName": "김순자",
        "managerId": "clx...",
        "managerName": "이민준",
        "centerName": "목동종합사회복지관",
        "visitDate": "2026-05-10T00:00:00.000Z",
        "visitType": "visit",
        "status": "pending",
        "registeredAt": "2026-05-10T09:00:00.000Z",
        "rejectionReason": null
      }
    ],
    "totalCount": 40
  }
}
```

---

### `GET /core/dashboard/recipients/:id/visits`

특정 대상자의 방문 기록.

| 쿼리 파라미터 | 타입 | 기본값 |
|---|---|---|
| `dateStart` | string | - |
| `dateEnd` | string | - |

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "clx...",
      "recipientId": "clx...",
      "careLogId": "clx...",
      "visitDate": "2026-05-10T00:00:00.000Z",
      "visitType": "visit",      // "visit" | "call"
      "managerName": "이민준",
      "summary": "정기 방문 완료"
    }
  ]
}
```

---

### `GET /core/dashboard/recipients/:id/memos`

특정 대상자의 메모 목록.

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "clx...",
      "recipientId": "clx...",
      "authorId": "clx...",
      "authorName": "이민준",
      "content": "가족 연락 필요",
      "createdAt": "2026-05-09T08:00:00.000Z",
      "type": "normal"
    }
  ]
}
```

---

### `POST /core/dashboard/recipients/:id/memos`

특정 대상자에 메모 추가.

**요청 Body**
```json
{
  "content": "다음 주 병원 동행 필요"   // string, 필수
}
```

**응답 200**
```json
{
  "ok": true,
  "data": {
    "id": "clx...",
    "recipientId": "clx...",
    "authorId": "clx...",
    "authorName": "이민준",
    "content": "다음 주 병원 동행 필요",
    "createdAt": "2026-05-11T09:00:00.000Z",
    "type": "normal"
  }
}
```

---

### `GET /core/dashboard/recipients/:id/policies`

특정 대상자의 AI 복지 정책 추천 목록.

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "policy-001",
      "name": "기초생활수급 의료급여",
      "summary": "본인부담금 경감 적용 대상 확대",
      "matchScore": 95,          // 0~100
      "applicationMethod": "읍면동 주민센터 방문 신청",
      "details": {}              // 정책 상세 정보 object (자유 형식)
    }
  ]
}
```

---

### `POST /core/dashboard/recipients/:id/policies/refresh`

특정 대상자의 정책 추천 점수 갱신.

**응답 200**
```json
{
  "ok": true,
  "data": [
    {
      "id": "policy-001",
      "name": "기초생활수급 의료급여",
      "summary": "본인부담금 경감 적용 대상 확대",
      "matchScore": 92,
      "applicationMethod": "읍면동 주민센터 방문 신청",
      "details": {}
    }
  ]
}
```

---

## 7. Core API — AI 분석

**Prefix**: `/core/api`

---

### `GET /core/api/reports/:reportid/summary?email=...`

방문 보고서 AI 요약 조회 (폴링 방식).  
> MySQL STT DB 필요. 결과가 없으면 202 PENDING 반환, 완료 시 200 반환.

| 경로 파라미터 | 타입 | 설명 |
|---|---|---|
| `reportid` | number | STT 보고서 ID |

| 쿼리 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `email` | string | 필수 | 요청 계정 이메일 |

**응답 202** — 처리 중
```json
{ "ok": true, "status": "PENDING" }
```

**응답 200** — 완료
```json
{
  "ok": true,
  "status": "DONE",
  "items": [
    {
      "abstract": "요약 제목",
      "detail": "상세 내용"
    }
  ]
}
```

**응답 500** — AI 처리 실패
```json
{ "ok": false, "error": { "code": "AI_ERROR", "message": "설명" } }
```

---

### `GET /core/api/reports/:reportid/policies?email=...`

방문 보고서 복지 정책 추천 조회 (폴링 방식).

| 경로 파라미터 | 타입 | 설명 |
|---|---|---|
| `reportid` | number | STT 보고서 ID |

| 쿼리 파라미터 | 타입 | 필수 |
|---|---|---|
| `email` | string | 선택 |

**응답 202** — 처리 중
```json
{ "ok": true, "status": "PENDING" }
```

**응답 200** — 완료
```json
{
  "ok": true,
  "status": "DONE",
  "policies": [
    {
      "name": "기초생활수급 의료급여",
      "summary": "본인부담금 경감",
      "matchScore": 90
    }
  ]
}
```

---

### `POST /core/api/ai/run`

AI 모듈 직접 실행 (DB 없이 텍스트 입력).

**요청 Body**
```json
{
  "transcript": "오늘 방문한 김순자 대상자는...",  // string, 필수
  "mode": "summary"                                 // "summary" | "policies", 선택 (기본: "summary")
}
```

**응답 200** — mode=summary
```json
{
  "ok": true,
  "mode": "summary",
  "items": [
    { "abstract": "요약 제목", "detail": "상세 내용" }
  ]
}
```

**응답 200** — mode=policies
```json
{
  "ok": true,
  "mode": "policies",
  "policies": [
    { "name": "기초생활수급 의료급여", "summary": "...", "matchScore": 90 }
  ]
}
```

---

## 8. AI 파이프라인 (Pipeline)

**Prefix**: `/core/pipeline`

> AI Flask 서버(`AI_HOST:AI_PORT`)에 요청을 프록시. Flask가 없으면 502 반환.

---

### `POST /core/pipeline/stt/upload`

WAV 음성 파일을 STT Flask 서버로 전달.

**Content-Type**: `multipart/form-data`

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `audio` | file (WAV) | 필수 | 최대 50MB, `.wav` 확장자 또는 audio/wav MIME |
| `visitId` | string | 선택 | 방문 ID |
| `managerId` | string | 선택 | 매니저 ID |

**응답 200** — Flask 서버 응답 그대로 반환
```json
{
  "ok": true,
  "data": {
    "transcript": "오늘 방문한 김순자 대상자는...",
    "confidence": 0.95
  }
}
```

**응답 400** — 파일 없음
```json
{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "audio 필드에 WAV 파일을 첨부해 주세요." } }
```

**응답 502** — Flask 서버 연결 실패
```json
{ "ok": false, "error": { "code": "FLASK_UNAVAILABLE", "message": "STT 서버에 연결할 수 없습니다: ..." } }
```

---

### `POST /core/pipeline/report/generate`

보고서 자동 생성 요청을 Flask 서버로 전달.

**요청 Body**
```json
{
  "reportType": "standard",        // string, 필수
  "recipientId": "clx...",         // string, 선택
  "visitId": "clx...",             // string, 선택
  "fields": {                      // object, 선택 (자유 형식)
    "transcript": "방문 내용...",
    "date": "2026-05-10"
  }
}
```

**응답 200** — Flask 서버 응답 그대로 반환
```json
{
  "ok": true,
  "data": {
    "reportHtml": "<html>...</html>",
    "summary": "..."
  }
}
```

**응답 400** — reportType 누락
```json
{ "ok": false, "error": { "code": "BAD_REQUEST", "message": "reportType 은 필수입니다." } }
```

**응답 502** — Flask 서버 연결 실패
```json
{ "ok": false, "error": { "code": "FLASK_UNAVAILABLE", "message": "보고서 생성 서버에 연결할 수 없습니다: ..." } }
```

---

## 부록 A — Rate Limit

| 경로 | 제한 | 윈도우 |
|---|---|---|
| `/core/dashboard/auth/*` | 20회 | 15분 |
| `/core/*` (전체) | 300회 | 1분 |

---

## 부록 B — 상태값 열거

### 케어로그 status
| 값 | 설명 |
|---|---|
| `pending` | 검토 대기 |
| `urgent` | 긴급 처리 필요 |
| `approved` | 승인 완료 |
| `rejected` | 반려 |

### 매니저 status
| 값 | 설명 |
|---|---|
| `active` | 재직 중 |
| `leave` | 휴직 |
| `retired` | 퇴직 |

### 대상자 status
| 값 | 설명 |
|---|---|
| `normal` | 정상 |
| `caution` | 주의 |
| `urgent` | 긴급 |
| `unvisited` | 미방문 |

### visitType
| 값 | 설명 |
|---|---|
| `visit` / `regular` | 직접 방문 |
| `call` | 전화 방문 |

---

## 부록 C — curl 빠른 테스트 예시

```bash
BASE="http://localhost:4100"

# 헬스 확인
curl "$BASE/core/health"

# 로그인
curl -X POST "$BASE/core/dashboard/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@safehi.kr","password":"Admin1234!"}'

# 대시보드 KPI (토큰 인증 임시 비활성화 상태)
curl "$BASE/core/dashboard/kpi"

# 매니저 목록
curl "$BASE/core/dashboard/managers"

# 대상자 목록 (긴급만)
curl "$BASE/core/dashboard/recipients?status=urgent"

# 돌봄 일지 상태 변경
curl -X PATCH "$BASE/core/dashboard/care-logs/{id}/status" \
  -H "Content-Type: application/json" \
  -d '{"status":"approved"}'

# STT WAV 업로드
curl -X POST "$BASE/core/pipeline/stt/upload" \
  -F "audio=@/path/to/audio.wav" \
  -F "visitId=clx..."

# AI 직접 실행
curl -X POST "$BASE/core/api/ai/run" \
  -H "Content-Type: application/json" \
  -d '{"transcript":"김순자 대상자 방문 내용...","mode":"summary"}'
```
