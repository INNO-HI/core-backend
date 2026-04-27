# Nginx 배포 가이드 (`safe-hi.xyz`)

기존 `safehi.world`와 충돌 없이, 별도 `server_name`으로 `safe-hi.xyz`와 `api.safe-hi.xyz`를 추가합니다.

## 1) DNS
- `safe-hi.xyz` A/AAAA -> Ubuntu 서버 IP
- `www.safe-hi.xyz` CNAME -> `safe-hi.xyz`
- `api.safe-hi.xyz` A/AAAA -> Ubuntu 서버 IP

## 2) Nginx 설정 배치
```bash
sudo cp deploy/nginx/safe-hi.xyz.conf /etc/nginx/sites-available/safe-hi.xyz.conf
sudo ln -s /etc/nginx/sites-available/safe-hi.xyz.conf /etc/nginx/sites-enabled/safe-hi.xyz.conf
```

## 3) 문법 검사 및 리로드
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## 4) SSL 발급 (certbot)
```bash
sudo certbot --nginx -d safe-hi.xyz -d www.safe-hi.xyz -d api.safe-hi.xyz
```

## 5) 백엔드 CORS 반영
`core_backend_system/.env`에 아래처럼 반영:
```env
CORS_ORIGINS=https://safe-hi.xyz,https://www.safe-hi.xyz
```

Core 컨테이너 재시작:
```bash
docker compose up -d --build core
```

## 참고
- API는 `https://api.safe-hi.xyz/core/api/...` 경로로 접근됩니다.
- 기존 `safehi.world`는 `server_name`이 다르면 그대로 공존합니다.
