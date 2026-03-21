const express = require('express');
const multer = require('multer');

const app = express();
const PORT = 10001;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

// 더미 STT 추론 엔드포인트
app.post('/api/stt-infer', upload.single('file'), (req, res) => {
  const fileSize = req.file ? (req.file.size / 1024).toFixed(1) : 0;
  console.log(`[Dummy STT] 수신: ${fileSize}KB WAV`);

  // [STT AI 처리 코드]
  // input : .wav
  // output : text (STT 결과)

  // 더미 응답 데이터
  const dummyResponse = {
    status: true,
    text: '안녕하세요. 이것은 더미 STT 서버의 테스트 응답입니다.',
  };

  console.log('[Dummy STT] 더미 응답 전송 완료');
  return res.json(dummyResponse);
});

// 헬스체크
app.get('/health', (req, res) => {
  res.json({ status: 'ok', server: 'dummy-stt', port: PORT });
});

app.listen(PORT, () => {
  console.log(`\n  🤖 Dummy STT 서버 실행 중`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  → POST /api/stt-infer 로 WAV 파일 전송\n`);
});
