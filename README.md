# Core Backend — 도커 빠른 제어

이 문서는 이 저장소의 도커화된 서비스들을 멈추고, 시작하고, 재빌드하고, 상태를 확인하는 주요 명령을 간단히 정리합니다.

필수 준비
- `docker`와 `docker-compose`가 설치되어 있고 도커 데몬이 실행 중이어야 합니다.
- `core_backend_system/.env` 파일이 존재하고 설정되어 있어야 합니다 (DB, AI 엔드포인트 등).
- 이건 .env.example을 이용해서 관리하면 되고 .env 파일은 절대 외부유출(git push) 금지

자주 쓰는 명령

- 모든 서비스 중지:
```bash
cd /home/core-backend
sudo docker-compose down
```

- 백그라운드로 시작:
```bash
cd /home/core-backend
sudo docker-compose up -d
```

- 재시작(컨테이너 재생성 및 빌드 포함):
```bash
cd /home/core-backend
sudo docker-compose down
sudo docker-compose up -d --build
```

- `core` 이미지만 재빌드(코드 변경 후):
```bash
cd /home/core-backend
sudo docker-compose build --no-cache core
sudo docker-compose up -d core
```

헬스 체크 및 로그 확인

- 실행 중인 서비스 확인:
```bash
cd /home/core-backend
sudo docker-compose ps
```

- `core` 서비스 최근 로그(마지막 200줄):
```bash
cd /home/core-backend
sudo docker-compose logs --no-color core | tail -n 200
```

- 로그 실시간 팔로우:
```bash
cd /home/core-backend
sudo docker-compose logs -f
```

주의 사항
- 이 프로젝트의 `Dockerfile`은 루트의 `DB` 폴더를 이미지에 복사합니다. DB 연결 정보를 변경하면 `core_backend_system/.env` 또는 `/home/core-backend/DB/funcs/db_connection.js`를 함께 조정하세요.
- `sudo` 없이 실행하려면 현재 사용자를 `docker` 그룹에 추가하세요: `sudo usermod -aG docker $USER` 이후 재로그인 필요.

---
파일: README.md
