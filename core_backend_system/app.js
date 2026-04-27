const express = require('express');
const cors = require('cors');

const { createContainer } = require('./container');
const { createApiRouter } = require('./presentation/apiRouter');
const {
  createDashboardRouter,
  hasValidPrismaStudioSession,
} = require('./presentation/dashboardRouter');
const { renderDemoPage } = require('./presentation/demoPage');

function readCookieValue(cookieHeader, cookieName) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length === 0) {
    return null;
  }

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === cookieName) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

async function readRawRequestBody(req) {
  const chunks = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return chunks.length > 0 ? Buffer.concat(chunks) : undefined;
}

async function proxyPrismaStudioRequest(req, res, next) {
  try {
    const requestUrl = new URL(req.originalUrl, 'http://localhost');

    if (requestUrl.pathname === '/prisma-studio/launch') {
      const token = requestUrl.searchParams.get('token');
      if (!hasValidPrismaStudioSession(token)) {
        return res.status(401).send('Prisma Studio session is invalid or expired.');
      }

      res.setHeader(
        'Set-Cookie',
        `prisma_studio_session=${encodeURIComponent(token)}; Path=/prisma-studio; HttpOnly; SameSite=Lax; Secure; Max-Age=300`
      );
      return res.redirect('/prisma-studio/');
    }

    const sessionToken = readCookieValue(req.headers.cookie, 'prisma_studio_session');
    if (!hasValidPrismaStudioSession(sessionToken)) {
      return res.status(401).send('Prisma Studio session is invalid or expired.');
    }

    const upstreamPath = requestUrl.pathname.replace(/^\/prisma-studio/, '') || '/';
    const upstreamUrl = `http://127.0.0.1:5555${upstreamPath}${requestUrl.search}`;

    const requestHeaders = new Headers();
    Object.entries(req.headers).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }
      if (key === 'host' || key === 'cookie' || key === 'content-length') {
        return;
      }
      if (Array.isArray(value)) {
        requestHeaders.set(key, value.join(', '));
        return;
      }
      requestHeaders.set(key, value);
    });

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await readRawRequestBody(req);
    }

    const upstreamResponse = await fetch(upstreamUrl, {
      method: req.method,
      headers: requestHeaders,
      body,
    });

    const shouldRewriteDatabrowser = upstreamPath === '/http/databrowser.js';

    upstreamResponse.headers.forEach((value, key) => {
      if (key === 'transfer-encoding' || key === 'connection' || key === 'content-encoding') {
        return;
      }
      if (shouldRewriteDatabrowser && key === 'content-length') {
        return;
      }
      res.setHeader(key, value);
    });

    res.status(upstreamResponse.status);

    if (shouldRewriteDatabrowser) {
      const script = await upstreamResponse.text();
      return res.send(
        script.replace(
          'window.location.origin}/api',
          'window.location.origin}/prisma-studio/api'
        )
      );
    }

    const buffer = Buffer.from(await upstreamResponse.arrayBuffer());
    return res.send(buffer);
  } catch (err) {
    return next(err);
  }
}

function createCoreApp(options = {}) {
  const app = express();

  // CORS – 개발 시 프론트엔드(localhost:3000)에서 접근 허용
  const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Tenant', 'x-admin-system-password'],
    })
  );

  app.use('/prisma-studio', proxyPrismaStudioRequest);

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
