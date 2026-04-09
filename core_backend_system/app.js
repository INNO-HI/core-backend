const express = require('express');
const cors = require('cors');

const { createContainer } = require('./container');
const { createApiRouter } = require('./presentation/apiRouter');
const { createDashboardRouter } = require('./presentation/dashboardRouter');
const { renderDemoPage } = require('./presentation/demoPage');

function createCoreApp(options = {}) {
  const app = express();

  // CORS – 개발 시 프론트엔드(localhost:3000)에서 접근 허용
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

  const container = createContainer(options);

  // 기존 core API
  app.use('/core/api', createApiRouter(container));

  // dashboard 전용 API
  app.use('/core/dashboard', createDashboardRouter(container));

  app.get('/core/health', (req, res) => {
    res.json({ ok: true, service: 'core_backend_system' });
  });

  app.get('/demo', (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderDemoPage());
  });

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
