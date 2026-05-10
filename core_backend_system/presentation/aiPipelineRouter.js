/**
 * AI Pipeline Router
 *
 * 1. POST /core/pipeline/stt/upload   — WAV 파일을 Flask STT 서버로 전달
 * 2. POST /core/pipeline/report/generate — 보고서 형식을 자동 보고서 생성 모듈로 전달
 *
 * 현재는 테스트용: AI_HOST:AI_PORT 의 Flask 서버가 실제로 없으면
 * 연결 오류를 그대로 반환한다.
 */

const express = require('express');
const multer = require('multer');
const http = require('http');
const https = require('https');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/wav', 'audio/wave', 'audio/x-wav', 'application/octet-stream'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.wav')) {
      cb(null, true);
    } else {
      cb(new Error('WAV 파일만 업로드 가능합니다.'));
    }
  },
});

function forwardToFlask(options, bodyBuffer, contentType) {
  return new Promise((resolve, reject) => {
    const lib = options.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: options.host,
        port: options.port,
        path: options.path,
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Content-Length': bodyBuffer.length,
        },
        timeout: 120_000,
      },
      (res) => {
        const chunks = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            resolve({ status: res.statusCode, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode, body: { raw } });
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Flask 서버 응답 시간 초과 (120s)'));
    });
    req.write(bodyBuffer);
    req.end();
  });
}

function createAiPipelineRouter(config = {}) {
  const router = express.Router();

  const AI_HOST = config.aiHost || process.env.AI_HOST || '127.0.0.1';
  const AI_PORT = Number(config.aiPort || process.env.AI_PORT || 5000);

  // ────────────────────────────────────────────────────────────
  // POST /core/pipeline/stt/upload
  // Content-Type: multipart/form-data
  // Field: audio (WAV 파일)
  // Optional fields: visitId, managerId (string)
  // ────────────────────────────────────────────────────────────
  router.post('/stt/upload', upload.single('audio'), async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'audio 필드에 WAV 파일을 첨부해 주세요.' },
        });
      }

      const { visitId, managerId } = req.body || {};

      // multipart boundary 재구성 — Flask 가 파일을 그대로 받도록 FormData 형식 전송
      const boundary = `----FormBoundary${Date.now()}`;
      const CRLF = '\r\n';
      const filename = req.file.originalname || 'audio.wav';

      const partHeader = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="audio"; filename="${filename}"${CRLF}` +
        `Content-Type: audio/wav${CRLF}${CRLF}`
      );
      const metaPart = visitId || managerId
        ? Buffer.from(
            `${CRLF}--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="meta"${CRLF}${CRLF}` +
            JSON.stringify({ visitId, managerId })
          )
        : Buffer.alloc(0);
      const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);

      const body = Buffer.concat([partHeader, req.file.buffer, metaPart, tail]);

      let flaskResult;
      try {
        flaskResult = await forwardToFlask(
          { host: AI_HOST, port: AI_PORT, path: '/stt/analyze' },
          body,
          `multipart/form-data; boundary=${boundary}`
        );
      } catch (connErr) {
        console.error('[pipeline/stt] Flask 연결 실패:', connErr.message);
        return res.status(502).json({
          ok: false,
          error: { code: 'FLASK_UNAVAILABLE', message: `STT 서버에 연결할 수 없습니다: ${connErr.message}` },
        });
      }

      return res.status(flaskResult.status === 200 ? 200 : flaskResult.status).json({
        ok: flaskResult.status === 200,
        data: flaskResult.body,
      });
    } catch (err) {
      next(err);
    }
  });

  // ────────────────────────────────────────────────────────────
  // POST /core/pipeline/report/generate
  // Content-Type: application/json
  // Body: { reportType, recipientId?, visitId?, fields: {...} }
  // ────────────────────────────────────────────────────────────
  router.post('/report/generate', express.json({ limit: '5mb' }), async (req, res, next) => {
    try {
      const { reportType, recipientId, visitId, fields } = req.body || {};

      if (!reportType) {
        return res.status(400).json({
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'reportType 은 필수입니다.' },
        });
      }

      const payload = JSON.stringify({ reportType, recipientId, visitId, fields });
      const bodyBuf = Buffer.from(payload, 'utf8');

      let flaskResult;
      try {
        flaskResult = await forwardToFlask(
          { host: AI_HOST, port: AI_PORT, path: '/report/generate' },
          bodyBuf,
          'application/json'
        );
      } catch (connErr) {
        console.error('[pipeline/report] Flask 연결 실패:', connErr.message);
        return res.status(502).json({
          ok: false,
          error: { code: 'FLASK_UNAVAILABLE', message: `보고서 생성 서버에 연결할 수 없습니다: ${connErr.message}` },
        });
      }

      return res.status(flaskResult.status === 200 ? 200 : flaskResult.status).json({
        ok: flaskResult.status === 200,
        data: flaskResult.body,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAiPipelineRouter };
