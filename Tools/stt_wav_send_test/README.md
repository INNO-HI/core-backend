# STT WAV 전송 테스트 도구

브라우저에서 마이크 녹음 → WAV 변환 → STT AI 서버로 전송하는 통신 테스트 도구입니다.

## 구성

| 파일 | 설명 |
|---|---|
| `wav_send_to_stt_AI.js` | HTTPS 웹 서버 (포트 3001). 녹음 페이지 + STT 프록시 |
| `dummy_stt_server.js` | 더미 STT 서버 (포트 10001). AI 모델 대신 더미 응답 반환 |
| `public/index.html` | 브라우저 녹음 UI (WAV 16kHz/16bit/Mono) |
| `ecosystem.config.js` | PM2 설정 파일 |
| `ssl/` | 자체 서명 SSL 인증서 (git 제외, 로컬 생성 필요) |

## 동작 흐름

```
[브라우저 녹음] → WAV POST → [웹서버 :3001] → 프록시 → [STT 서버 :10001] → JSON 응답
```

## 설치 및 실행

```bash
cd Tools/stt_wav_send_test

# 의존성 설치
npm install

# SSL 인증서 생성 (최초 1회)
mkdir -p ssl
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout ssl/server.key \
  -out ssl/server.crt \
  -subj "/C=KR/ST=Seoul/L=Seoul/O=InnoHi/CN=<서버IP>" \
  -addext "subjectAltName=IP:<서버IP>,IP:127.0.0.1,DNS:localhost"

# PM2로 실행
pm2 start ecosystem.config.js
pm2 save
```

## 접속

- **테스트 페이지**: `https://<서버IP>:3001`
- **더미 STT API**: `http://<서버IP>:10001/api/stt-infer` (POST, multipart/form-data)
- **헬스체크**: `http://<서버IP>:10001/health`

> HTTPS 자체 서명 인증서 사용으로 브라우저 경고가 뜹니다. "고급 → 안전하지 않음으로 이동"을 클릭하세요.

## 방화벽

```bash
sudo ufw allow 3001/tcp
sudo ufw allow 10001/tcp
```

## 더미 서버 응답 예시

```json
{
  "success": true,
  "text": "안녕하세요. 이것은 더미 STT 서버의 테스트 응답입니다.",
  "confidence": 0.95,
  "language": "ko",
  "duration": 3.2,
  "segments": [
    { "start": 0.0, "end": 1.5, "text": "안녕하세요." },
    { "start": 1.5, "end": 3.2, "text": "이것은 더미 STT 서버의 테스트 응답입니다." }
  ]
}
```

> AI 모델 개발 완료 후 `wav_send_to_stt_AI.js`의 `STT_URL`을 실제 서버 주소로 변경하면 됩니다.
