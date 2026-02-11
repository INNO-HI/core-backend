// Standalone entrypoint for core_backend_system
// Usage: node core_backend_system/server.js

const path = require('path');
const dotenv = require('dotenv');

// Load .env from core_backend_system/.env (local to this module)
dotenv.config({ path: path.join(__dirname, '.env') });

const { createCoreApp } = require('./app');

const PORT = Number(process.env.CORE_PORT || process.env.PORT || 4100);
const HOST = process.env.CORE_HOST || '0.0.0.0';

async function main() {
  const { app } = createCoreApp();

  app.listen(PORT, HOST, () => {
    console.log(`[core_backend_system] listening on http://${HOST}:${PORT}`);
    console.log(`[core_backend_system] health: http://${HOST}:${PORT}/core/health`);
    console.log(`[core_backend_system] api:    http://${HOST}:${PORT}/core/api`);
  });
}

main().catch((e) => {
  console.error('[core_backend_system] failed to start:', e);
  process.exit(1);
});
