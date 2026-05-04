const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const { createContainer } = require('./container');
const { createApiRouter } = require('./presentation/apiRouter');
const { createDashboardRouter } = require('./presentation/dashboardRouter');
const { renderDemoPage } = require('./presentation/demoPage');

function createCoreApp(options = {}) {
  const app = express();

  // ── 보안 헤더 (helmet) ──────────────────────────────────────
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  // ── CORS ────────────────────────────────────────────────────
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant'],
    })
  );

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ── Rate Limiting ────────────────────────────────────────────
  // 로그인/회원가입 엔드포인트: 15분에 최대 20회 (브루트포스 방어)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      error: { code: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 15분 후 다시 시도해주세요.' },
    },
  });

  // 일반 API: 1분에 최대 300회 (DoS 기본 방어)
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      ok: false,
      error: { code: 'TOO_MANY_REQUESTS', message: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
    },
  });

  const container = createContainer(options);

  // Auth 엔드포인트에 강한 rate limit 적용
  app.use('/core/dashboard/auth', authLimiter);

  // 나머지 API는 일반 rate limit
  app.use('/core', apiLimiter);

  app.use('/core/api', createApiRouter(container));
  app.use('/core/dashboard', createDashboardRouter(container));

  app.get('/core/health', (req, res) => {
    res.json({ ok: true, service: 'core_backend_system' });
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/demo', (req, res) => {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderDemoPage());
    });
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[core_backend_system] error:', err);
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: err?.message || 'internal error' },
    });
  });

  return { app, container };
}

module.exports = { createCoreApp };
