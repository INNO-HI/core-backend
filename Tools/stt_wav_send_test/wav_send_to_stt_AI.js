const express = require('express');
const multer = require('multer');
const fetch = require('node-fetch');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');
const https = require('https');

const app = express();
const PORT = 3001;
const STT_URL = 'http://localhost:10001/api/stt-infer';

// SSL 인증서 로드
const sslOptions = {
  key: fs.readFileSync(path.join(__dirname, 'ssl', 'server.key')),
  cert: fs.readFileSync(path.join(__dirname, 'ssl', 'server.crt')),
};

// multer: 메모리에 WAV 파일 저장
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// 정적 파일 서빙 (index.html)
app.use(express.static(path.join(__dirname, 'public')));

// POST /api/stt — 브라우저에서 받은 WAV를 STT AI 서버로 프록시
app.post('/api/stt', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'WAV 파일이 없습니다.' });
  }

  const wavBuffer = req.file.buffer;
  console.log(`[STT] 수신: ${(wavBuffer.length / 1024).toFixed(1)}KB WAV`);

  try {
    // STT AI 서버로 전송
    const form = new FormData();
    form.append('file', wavBuffer, {
      filename: 'recording.wav',
      contentType: 'audio/wav',
    });

    const sttRes = await fetch(STT_URL, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });

    if (!sttRes.ok) {
      const errText = await sttRes.text();
      console.error(`[STT] AI 서버 오류: ${sttRes.status}`, errText);
      return res.status(sttRes.status).json({
        error: `STT AI 서버 오류 (${sttRes.status})`,
        detail: errText,
      });
    }

    const json = await sttRes.json();
    console.log('[STT] 결과:', JSON.stringify(json).substring(0, 200));
    return res.json(json);
  } catch (err) {
    console.error('[STT] 전송 실패:', err.message);
    return res.status(502).json({
      error: 'STT AI 서버 연결 실패',
      detail: err.message,
    });
  }
});

https.createServer(sslOptions, app).listen(PORT, () => {
  console.log(`\n  🎤 STT 테스트 서버 실행 중 (HTTPS)`);
  console.log(`  → https://localhost:${PORT}`);
  console.log(`  → STT AI 서버: ${STT_URL}\n`);
});
