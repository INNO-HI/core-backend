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
const { spawn } = require('child_process');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { summarizeCareRecord } = require('../services/careRecordSummary');
const { recommendPolicies } = require('../services/policyRecommendation');
const { requireAuth } = require('./authMiddleware');
const { resolveScope } = require('./scopeMiddleware');

/**
 * 어떤 오디오든 STT 서버가 받는 형식으로 바꾼다 — 16kHz 모노 16bit WAV.
 *
 * 앱이 항상 WAV 를 보낼 수 있으면 좋겠지만 그렇지 못하다. 웹 브라우저는
 * MediaRecorder 로만 녹음할 수 있어 webm/opus 로 나오고, 안드로이드 기본
 * 인코더는 m4a(aac) 다. STT 서버는 파일 이름이 .wav 로 끝나지 않으면
 * 400 을 돌려준다.
 *
 * 이미 맞는 WAV 면 ffmpeg 를 태워도 결과가 같지만, 헤더가 어긋난 WAV 도
 * 있어서 한 번 통과시키는 편이 안전하다.
 */
async function toWav16kMono(inputBuffer) {
  // 입력은 파이프가 아니라 임시 파일로 준다.
  //
  // 처음에는 `-i pipe:0` 으로 넣었다. 녹음이 디스크에 남지 않아 좋았지만,
  // m4a·mp4 는 색인(moov atom)이 파일 끝에 붙어서 ffmpeg 가 그걸 읽으려면
  // 되감기를 해야 한다. 파이프는 되감을 수 없어 "moov atom not found" 로
  // 통째로 거부됐다. WAV·webm 은 앞에서부터 읽혀 통과했기 때문에
  // 안드로이드·iOS 가 쓰는 m4a 에서만 터졌다.
  //
  // 대신 변환이 끝나면 곧바로 지운다 — 상담 녹음이 서버에 남지 않아야 한다.
  const tmpPath = path.join(
    os.tmpdir(),
    `care-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
  await fs.writeFile(tmpPath, inputBuffer);
  try {
    return await runFfmpeg(tmpPath);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

function runFfmpeg(inputPath) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-i', inputPath,
      '-ac', '1', // 모노 — 화자분리는 STT 쪽 pyannote 가 한다
      '-ar', '16000', // whisper 가 기대하는 표본율
      '-c:a', 'pcm_s16le',
      '-f', 'wav',
      'pipe:1',
    ]);

    const out = [];
    const err = [];
    ff.stdout.on('data', (c) => out.push(c));
    ff.stderr.on('data', (c) => err.push(c));
    ff.on('error', (e) => reject(new Error(`ffmpeg 실행 실패: ${e.message}`)));
    ff.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(`ffmpeg 변환 실패(code ${code}): ${Buffer.concat(err).toString().slice(0, 300)}`));
      }
      resolve(Buffer.concat(out));
    });

  });
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
  // 예전에는 WAV 만 받았다. 그런데 웹은 webm/opus, 안드로이드는 m4a 로만
  // 녹음돼서 실제 기기에서 올린 파일이 문 앞에서 전부 막혔다.
  // 형식은 서버가 ffmpeg 로 맞춘다 — 여기서는 오디오인지만 본다.
  fileFilter: (_req, file, cb) => {
    const okType = /^audio\//.test(file.mimetype)
      || file.mimetype === 'video/webm' // MediaRecorder 는 소리만 담아도 video/webm 을 쓴다
      || file.mimetype === 'application/octet-stream';
    const okExt = /\.(wav|webm|m4a|mp4|aac|ogg|opus|mp3|caf|3gp|amr|flac)$/i
      .test(file.originalname || '');
    if (okType || okExt) cb(null, true);
    else cb(new Error('오디오 파일만 업로드 가능합니다.'));
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

  // STT 는 보고서 생성과 다른 서버에 있다.
  //
  // 예전에는 둘 다 AI_HOST:AI_PORT(=ai_dummy) 로 보냈는데, ai_dummy 는
  // /health 와 /v1/infer 만 있는 껍데기라 /stt/analyze 가 404 였다.
  // 실제 엔진은 이 호스트의 10001 번(AI-backend `api/stt_server.py`,
  // faster-whisper + pyannote)에서 29일째 돌고 있었다.
  // 컨테이너에서는 도커 브리지 게이트웨이(172.17.0.1)로 호스트에 닿는다.
  const STT_HOST = config.sttHost || process.env.STT_HOST || '172.17.0.1';
  const STT_PORT = Number(config.sttPort || process.env.STT_PORT || 10001);
  // 업로드 필드 이름도 다르다 — 이 서버는 `audio` 가 아니라 `file` 로 받는다.
  const STT_PATH = config.sttPath || process.env.STT_PATH || '/api/stt-infer';
  const STT_FIELD = config.sttField || process.env.STT_FIELD || 'file';

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

      // 어떤 형식으로 올라왔든 16kHz 모노 WAV 로 맞춘다.
      let wavBuffer;
      try {
        wavBuffer = await toWav16kMono(req.file.buffer);
      } catch (convErr) {
        // 무엇이 올라왔는지 남긴다. 형식이 안 맞는지, 파일이 잘렸는지,
        // 아예 비었는지에 따라 고칠 곳이 다르다.
        const buf = req.file.buffer;
        const head = buf.subarray(0, 24).toString('hex');
        // mp4 계열은 앞쪽에 'ftyp' 박스가 온다. 그 뒤 브랜드까지 같이 본다.
        const ascii = buf.subarray(0, 32).toString('latin1').replace(/[^\x20-\x7e]/g, '.');
        console.error(
          `[pipeline/stt] 오디오 변환 실패: ${convErr.message}\n` +
          `  파일명=${req.file.originalname} mime=${req.file.mimetype} ` +
          `크기=${buf.length}B\n  머리=${head}\n  ascii=${ascii}`
        );
        return res.status(400).json({
          ok: false,
          error: { code: 'AUDIO_DECODE_FAILED', message: `녹음 파일을 읽지 못했습니다: ${convErr.message}` },
        });
      }
      if (!wavBuffer.length) {
        return res.status(400).json({
          ok: false,
          error: { code: 'EMPTY_AUDIO', message: '녹음이 비어 있습니다.' },
        });
      }

      // multipart boundary 재구성 — Flask 가 파일을 그대로 받도록 FormData 형식 전송
      const boundary = `----FormBoundary${Date.now()}`;
      const CRLF = '\r\n';
      // STT 서버는 확장자가 .wav 가 아니면 400 을 준다. 변환했으므로 .wav 로 보낸다.
      const filename = 'audio.wav';

      const partHeader = Buffer.from(
        `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="${STT_FIELD}"; filename="${filename}"${CRLF}` +
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

      const body = Buffer.concat([partHeader, wavBuffer, metaPart, tail]);

      let flaskResult;
      try {
        flaskResult = await forwardToFlask(
          { host: STT_HOST, port: STT_PORT, path: STT_PATH },
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
  // POST /core/pipeline/care-record/summarize
  // Body: { transcript, tags?: string[], workerGrade?: string }
  // 전사문을 상담기록 다섯 섹션으로 정리해 돌려준다.
  // ────────────────────────────────────────────────────────────
  router.post(
    '/care-record/summarize',
    express.json({ limit: '1mb' }),
    async (req, res, next) => {
      try {
        const { transcript, tags, workerGrade } = req.body || {};
        const result = await summarizeCareRecord({
          transcript: (transcript || '').toString(),
          tags: Array.isArray(tags) ? tags.map(String) : [],
          workerGrade: (workerGrade || '').toString(),
        });
        return res.json({ ok: true, data: result });
      } catch (err) {
        // 요약 실패는 서버 장애가 아니다 — 앱이 안내하고 손으로 적을 수 있게
        // 사유를 그대로 돌려준다.
        const known = ['EMPTY_TRANSCRIPT', 'NO_API_KEY', 'BAD_MODEL_OUTPUT', 'EMPTY_SUMMARY'];
        if (known.includes(err.code)) {
          return res.status(400).json({
            ok: false,
            error: { code: err.code, message: err.message },
          });
        }
        if (err.code === 'UPSTREAM_ERROR' || err.name === 'AbortError') {
          console.error('[pipeline/care-record] 요약 실패:', err.message);
          return res.status(502).json({
            ok: false,
            error: {
              code: 'SUMMARY_UNAVAILABLE',
              message: '상담기록을 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
            },
          });
        }
        return next(err);
      }
    }
  );

  // ────────────────────────────────────────────────────────────
  // POST /core/pipeline/care-record/recommend-policies
  // Body: { transcript, recipientId?, riskGrade?, profile? }
  // 상담 내용(정책하이 RAG) + 대상자 프로필(서버 조회)로 복지 정책을 추천한다.
  // ────────────────────────────────────────────────────────────
  router.post(
    '/care-record/recommend-policies',
    // 대상자 프로필을 읽으려면 누가 묻는지 알아야 한다. 대시보드 라우터와
    // 같은 인증·범위 미들웨어를 이 경로에만 건다 — STT·요약은 DB 를
    // 건드리지 않아 그대로 둔다.
    requireAuth,
    resolveScope,
    express.json({ limit: '1mb' }),
    async (req, res, next) => {
      try {
        const { transcript, recipientId, riskGrade, profile: given } = req.body || {};

        // 프로필은 서버가 알고 있는 값을 우선한다. 앱이 보낸 것은 서버에
        // 없을 때만 쓴다(오프라인 표본 등).
        let profile = { ...(given && typeof given === 'object' ? given : {}) };
        if (recipientId && config.container) {
          try {
            const repos = config.container.repos(req);
            const restrict =
              repos.callerRole === 'caregiver' ? (repos.callerManagerId || '__none__') : undefined;
            const r = await repos.recipientRepo.getRecipientById(repos.ownerId, recipientId, restrict);
            if (r) {
              profile = {
                age: r.age ?? profile.age,
                gender: r.gender ?? profile.gender,
                livingAlone: r.livingAlone ?? profile.livingAlone,
                diseases: r.healthInfo?.diseases ?? profile.diseases ?? [],
                region: r.basicInfo?.address ?? profile.region ?? '',
                riskGrade: riskGrade || r.status || profile.riskGrade,
              };
            }
          } catch (e) {
            // 프로필을 못 읽어도 상담 내용만으로 추천은 한다.
            console.warn('[pipeline/policies] 프로필 조회 실패:', e.message);
          }
        }
        if (riskGrade && !profile.riskGrade) profile.riskGrade = riskGrade;

        const result = await recommendPolicies({
          transcript: (transcript || '').toString(),
          profile,
        });
        return res.json({ ok: true, data: { ...result, profileUsed: profile } });
      } catch (err) {
        if (err.code === 'EMPTY_TRANSCRIPT') {
          return res.status(400).json({ ok: false, error: { code: err.code, message: err.message } });
        }
        console.error('[pipeline/policies] 추천 실패:', err.message);
        return res.status(502).json({
          ok: false,
          error: {
            code: 'RECOMMEND_UNAVAILABLE',
            message: '복지 정책 추천을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.',
          },
        });
      }
    }
  );

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
