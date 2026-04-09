function renderDemoPage() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SafeHi Core Backend Demo</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f4f7fb;
      --panel: #ffffff;
      --text: #1b2430;
      --muted: #677489;
      --line: #d8e0ea;
      --accent: #246bff;
      --accent-soft: #eaf1ff;
      --danger: #c43d3d;
      --success: #217a48;
      --code: #0f172a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: linear-gradient(180deg, #eef4ff 0%, var(--bg) 30%, #f8fafc 100%);
      color: var(--text);
    }
    .wrap {
      max-width: 1320px;
      margin: 0 auto;
      padding: 28px 20px 60px;
    }
    h1, h2, h3, p { margin: 0; }
    .hero {
      display: grid;
      gap: 16px;
      grid-template-columns: 2fr 1fr;
      margin-bottom: 20px;
    }
    .card {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 18px;
      box-shadow: 0 10px 30px rgba(36, 107, 255, 0.06);
    }
    .hero-main {
      padding: 22px;
    }
    .hero-side {
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .eyebrow {
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
      color: var(--accent);
      text-transform: uppercase;
    }
    .hero h1 {
      margin-top: 10px;
      font-size: 32px;
      line-height: 1.1;
    }
    .hero p {
      margin-top: 10px;
      color: var(--muted);
      line-height: 1.6;
    }
    .grid {
      display: grid;
      gap: 16px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      align-items: start;
    }
    .panel {
      padding: 18px;
    }
    .panel h2 {
      font-size: 18px;
      margin-bottom: 12px;
    }
    .controls {
      display: grid;
      gap: 10px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 12px;
      font-weight: 700;
      color: var(--muted);
      margin-bottom: 6px;
    }
    input, select, textarea {
      width: 100%;
      padding: 10px 12px;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: #fff;
      color: var(--text);
      font: inherit;
    }
    textarea {
      min-height: 84px;
      resize: vertical;
    }
    .route-list {
      display: grid;
      gap: 8px;
    }
    .route {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 14px;
      background: #fbfdff;
    }
    .method {
      min-width: 58px;
      text-align: center;
      padding: 5px 8px;
      border-radius: 999px;
      background: var(--accent-soft);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
    .path {
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      color: var(--code);
      word-break: break-all;
    }
    .desc {
      font-size: 12px;
      color: var(--muted);
      margin-top: 4px;
    }
    button {
      border: 0;
      border-radius: 12px;
      padding: 10px 14px;
      background: var(--accent);
      color: white;
      font-weight: 700;
      cursor: pointer;
    }
    button.secondary {
      background: #0f172a;
    }
    button.ghost {
      background: transparent;
      color: var(--accent);
      border: 1px solid var(--line);
    }
    .status {
      padding: 8px 10px;
      border-radius: 12px;
      background: #f8fafc;
      border: 1px solid var(--line);
      font-size: 13px;
      color: var(--muted);
    }
    .status.ok { color: var(--success); }
    .status.fail { color: var(--danger); }
    pre {
      margin: 0;
      padding: 14px;
      border-radius: 14px;
      background: #0b1220;
      color: #dbeafe;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      font-size: 12px;
      line-height: 1.5;
      overflow: auto;
      min-height: 420px;
    }
    .toolbar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    @media (max-width: 980px) {
      .hero, .grid, .controls {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="hero">
      <div class="card hero-main">
        <div class="eyebrow">Core Backend Demo</div>
        <h1>SafeHi 라우터 통합 테스트 페이지</h1>
        <p>인증, 대시보드, 대상자, 매니저, 돌봄일지, Core API까지 브라우저에서 바로 호출할 수 있습니다. InMemory 모드와 AI 더미 서버 상태를 함께 확인하는 데모 페이지입니다.</p>
      </div>
      <div class="card hero-side">
        <div class="status" id="health-status">health 확인 전</div>
        <button id="health-btn">헬스 체크</button>
        <button id="run-all-btn" class="secondary">대표 라우트 일괄 테스트</button>
      </div>
    </section>

    <section class="grid">
      <div class="card panel">
        <h2>테스트 설정</h2>
        <div class="controls">
          <div>
            <label for="base-url">Base URL</label>
            <input id="base-url" value="" />
          </div>
          <div>
            <label for="report-id">Report ID</label>
            <input id="report-id" value="1" />
          </div>
          <div>
            <label for="email">Email</label>
            <input id="email" value="test@safehi.kr" />
          </div>
          <div>
            <label for="manager-id">Manager ID</label>
            <input id="manager-id" value="mgr-0001" />
          </div>
          <div>
            <label for="recipient-id">Recipient ID</label>
            <input id="recipient-id" value="rec-0001" />
          </div>
          <div>
            <label for="care-log-id">CareLog ID</label>
            <input id="care-log-id" value="cl-001" />
          </div>
          <div style="grid-column: 1 / -1;">
            <label for="transcript">Transcript</label>
            <textarea id="transcript">어르신이 최근 식사량이 줄고 어지러움을 호소합니다. 외출 빈도도 감소했습니다.</textarea>
          </div>
        </div>
        <div class="toolbar">
          <button class="ghost" data-action="auth-login">로그인</button>
          <button class="ghost" data-action="dashboard-kpi">대시보드 KPI</button>
          <button class="ghost" data-action="recipient-detail">대상자 상세</button>
          <button class="ghost" data-action="manager-visits">매니저 방문</button>
          <button class="ghost" data-action="carelog-detail">돌봄일지 상세</button>
          <button class="ghost" data-action="core-summary">Core 요약</button>
          <button class="ghost" data-action="core-ai-run">AI 직접 실행</button>
        </div>

        <div class="route-list" id="route-list"></div>
      </div>

      <div class="card panel">
        <h2>응답 결과</h2>
        <div class="toolbar">
          <button id="clear-output" class="ghost">출력 지우기</button>
        </div>
        <pre id="output">버튼을 눌러 라우터를 테스트하세요.</pre>
      </div>
    </section>
  </div>

  <script>
    const routeDefinitions = [
      { key: 'auth-login', method: 'POST', path: '/core/dashboard/auth/login', description: '로그인', body: () => ({ email: get('email'), password: 'Test1234!', rememberMe: false }) },
      { key: 'auth-register', method: 'POST', path: '/core/dashboard/auth/register', description: '회원가입', body: () => ({ email: 'demo-user@example.com', password: 'Test1234!', name: '데모유저', phone: '010-1234-5678' }) },
      { key: 'auth-send-verification', method: 'POST', path: '/core/dashboard/auth/send-verification', description: '이메일 인증 발송', body: () => ({ email: 'demo-user@example.com' }) },
      { key: 'auth-verify-code', method: 'POST', path: '/core/dashboard/auth/verify-code', description: '이메일 인증 확인', body: () => ({ email: 'demo-user@example.com', code: '123456' }) },
      { key: 'auth-forgot', method: 'POST', path: '/core/dashboard/auth/forgot-password', description: '비밀번호 재설정 메일 요청', body: () => ({ email: get('email') }) },
      { key: 'auth-reset', method: 'POST', path: '/core/dashboard/auth/reset-password', description: '비밀번호 재설정', body: () => ({ email: get('email'), password: 'Test1234!' }) },
      { key: 'auth-org-verify', method: 'POST', path: '/core/dashboard/auth/organization-verify', description: '기관 인증 요청', body: () => ({ organizationCode: 'INST-001', name: '데모유저', email: 'demo-user@example.com' }) },
      { key: 'dashboard-kpi', method: 'GET', path: '/core/dashboard/kpi', description: '대시보드 KPI' },
      { key: 'dashboard-reports', method: 'GET', path: '/core/dashboard/recent-reports?limit=3', description: '최근 리포트' },
      { key: 'dashboard-notifications', method: 'GET', path: '/core/dashboard/notifications?limit=3', description: '알림 목록' },
      { key: 'dashboard-welfare-news', method: 'GET', path: '/core/dashboard/welfare-news?limit=3', description: '복지 뉴스' },
      { key: 'dashboard-tasks', method: 'GET', path: '/core/dashboard/tasks?limit=3', description: '업무 요청' },
      { key: 'dashboard-notices', method: 'GET', path: '/core/dashboard/notices?limit=3', description: '공지사항' },
      { key: 'recipient-list', method: 'GET', path: '/core/dashboard/recipients?status=all&search=&dong=all&manager=all', description: '대상자 목록' },
      { key: 'recipient-detail', method: 'GET', path: () => '/core/dashboard/recipients/' + get('recipient-id'), description: '대상자 상세' },
      { key: 'recipient-visits', method: 'GET', path: () => '/core/dashboard/recipients/' + get('recipient-id') + '/visits', description: '대상자 방문 기록' },
      { key: 'recipient-memos', method: 'GET', path: () => '/core/dashboard/recipients/' + get('recipient-id') + '/memos', description: '대상자 메모 목록' },
      { key: 'recipient-add-memo', method: 'POST', path: () => '/core/dashboard/recipients/' + get('recipient-id') + '/memos', description: '대상자 메모 추가', body: () => ({ content: 'demo page 메모', authorId: 'demo', authorName: 'Demo Page' }) },
      { key: 'recipient-policies', method: 'GET', path: () => '/core/dashboard/recipients/' + get('recipient-id') + '/policies', description: '대상자 정책 조회' },
      { key: 'recipient-refresh-policies', method: 'POST', path: () => '/core/dashboard/recipients/' + get('recipient-id') + '/policies/refresh', description: '대상자 정책 갱신' },
      { key: 'manager-list', method: 'GET', path: '/core/dashboard/managers?status=all&search=&dong=all&center=all', description: '매니저 목록' },
      { key: 'manager-kpi', method: 'GET', path: '/core/dashboard/managers/kpi', description: '매니저 KPI' },
      { key: 'manager-detail', method: 'GET', path: () => '/core/dashboard/managers/' + get('manager-id'), description: '매니저 상세' },
      { key: 'manager-reports', method: 'GET', path: () => '/core/dashboard/managers/' + get('manager-id') + '/reports?status=all&dateStart=&dateEnd=', description: '매니저 리포트' },
      { key: 'manager-visits', method: 'GET', path: () => '/core/dashboard/managers/' + get('manager-id') + '/visits?visitType=all&search=&dateStart=&dateEnd=', description: '매니저 방문 기록' },
      { key: 'manager-create-visit', method: 'POST', path: () => '/core/dashboard/managers/' + get('manager-id') + '/visits', description: '매니저 방문 일정 생성', body: () => ({ recipientId: get('recipient-id'), visitDate: new Date().toISOString(), visitType: 'visit', summary: 'demo 일정 생성' }) },
      { key: 'carelog-list', method: 'GET', path: '/core/dashboard/care-logs?status=all&search=&page=1&pageSize=5', description: '돌봄일지 목록' },
      { key: 'carelog-detail', method: 'GET', path: () => '/core/dashboard/care-logs/' + get('care-log-id'), description: '돌봄일지 상세' },
      { key: 'carelog-status', method: 'PATCH', path: () => '/core/dashboard/care-logs/' + get('care-log-id') + '/status', description: '돌봄일지 상태 변경', body: () => ({ status: 'approved', reason: 'demo 승인' }) },
      { key: 'carelog-feedback', method: 'POST', path: () => '/core/dashboard/care-logs/' + get('care-log-id') + '/feedback', description: '돌봄일지 피드백', body: () => ({ content: 'demo 피드백' }) },
      { key: 'core-summary', method: 'GET', path: () => '/core/api/reports/' + get('report-id') + '/summary?email=' + encodeURIComponent(get('email')), description: 'Core 요약 폴링' },
      { key: 'core-policies', method: 'GET', path: () => '/core/api/reports/' + get('report-id') + '/policies?email=' + encodeURIComponent(get('email')), description: 'Core 정책 폴링' },
      { key: 'core-ai-run', method: 'POST', path: '/core/api/ai/run', description: 'AI 직접 실행', body: () => ({ transcript: get('transcript'), mode: 'summary' }) },
      { key: 'core-health', method: 'GET', path: '/core/health', description: '백엔드 헬스 체크' }
    ];

    function get(id) {
      return document.getElementById(id).value;
    }

    function resolveBaseUrl() {
      const input = document.getElementById('base-url');
      if (!input.value) {
        input.value = window.location.origin;
      }
      return input.value.replace(/\\/$/, '');
    }

    function renderRoutes() {
      const list = document.getElementById('route-list');
      list.innerHTML = '';
      for (const route of routeDefinitions) {
        const row = document.createElement('div');
        row.className = 'route';
        row.innerHTML = '<div class="method">' + route.method + '</div>' +
          '<div><div class="path">' + (typeof route.path === 'function' ? route.path() : route.path) + '</div><div class="desc">' + route.description + '</div></div>' +
          '<button data-run="' + route.key + '">실행</button>';
        list.appendChild(row);
      }
    }

    async function callRoute(route) {
      const baseUrl = resolveBaseUrl();
      const path = typeof route.path === 'function' ? route.path() : route.path;
      const url = baseUrl + path;
      const init = { method: route.method, headers: {} };
      if (route.body) {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(route.body());
      }

      const startedAt = new Date().toISOString();
      try {
        const response = await fetch(url, init);
        const text = await response.text();
        let parsed;
        try {
          parsed = JSON.parse(text);
        } catch {
          parsed = text;
        }
        writeOutput({
          startedAt,
          method: route.method,
          url,
          status: response.status,
          ok: response.ok,
          body: parsed
        });
        return response.ok;
      } catch (error) {
        writeOutput({
          startedAt,
          method: route.method,
          url,
          ok: false,
          error: String(error)
        });
        return false;
      }
    }

    function writeOutput(payload) {
      document.getElementById('output').textContent = JSON.stringify(payload, null, 2);
    }

    async function runHealth() {
      const healthRoute = routeDefinitions.find((route) => route.key === 'core-health');
      const ok = await callRoute(healthRoute);
      const status = document.getElementById('health-status');
      status.textContent = ok ? 'health 정상' : 'health 실패';
      status.className = 'status ' + (ok ? 'ok' : 'fail');
    }

    async function runAll() {
      const keys = [
        'core-health',
        'auth-login',
        'dashboard-kpi',
        'recipient-detail',
        'manager-detail',
        'manager-reports',
        'manager-visits',
        'carelog-detail',
        'core-summary',
        'core-policies',
        'core-ai-run'
      ];
      const results = [];
      for (const key of keys) {
        const route = routeDefinitions.find((item) => item.key === key);
        const ok = await callRoute(route);
        results.push({ key, ok });
      }
      writeOutput({ summary: results });
    }

    document.getElementById('health-btn').addEventListener('click', runHealth);
    document.getElementById('run-all-btn').addEventListener('click', runAll);
    document.getElementById('clear-output').addEventListener('click', () => {
      document.getElementById('output').textContent = '출력이 지워졌습니다.';
    });
    document.getElementById('route-list').addEventListener('click', (event) => {
      const key = event.target.getAttribute('data-run');
      if (!key) return;
      const route = routeDefinitions.find((item) => item.key === key);
      if (route) {
        callRoute(route);
      }
    });

    document.querySelectorAll('[data-action]').forEach((button) => {
      button.addEventListener('click', () => {
        const route = routeDefinitions.find((item) => item.key === button.getAttribute('data-action'));
        if (route) {
          callRoute(route);
        }
      });
    });

    resolveBaseUrl();
    renderRoutes();
  </script>
</body>
</html>`;
}

module.exports = { renderDemoPage };
