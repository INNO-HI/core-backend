const express = require('express');

const { createContainer } = require('./container');
const { createApiRouter } = require('./presentation/apiRouter');

function createCoreApp(options = {}) {
  const app = express();

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  const container = createContainer(options);

  app.use('/core/api', createApiRouter(container));

  app.get('/core/health', (req, res) => {
    res.json({ ok: true, service: 'core_backend_system' });
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
