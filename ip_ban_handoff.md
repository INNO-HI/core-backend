# fail2ban 운영 가이드

## 설치 계기

서버 SSH(포트 22)가 외부에 오픈되어 있는 상태에서, 중국·유럽·동남아 등 해외 IP들이 자동화 봇으로
24시간 내 **3,680회** 이상 무차별 대입(brute force) 공격을 시도하고 있는 것이 확인됨.
이를 자동으로 탐지·차단하기 위해 2026-04-20 fail2ban을 설치함.

---

## 설정 방법

설정 파일 위치: `/etc/fail2ban/jail.local`

```ini
[DEFAULT]
bantime  = 1h       # 기본 차단 시간
findtime = 10m      # 이 시간 내에 maxretry 초과 시 차단
maxretry = 5        # 최대 실패 허용 횟수
ignoreip = 127.0.0.1/8  # 차단 제외 IP (로컬호스트)

[sshd]
enabled  = true
port     = ssh
logpath  = %(sshd_log)s
backend  = %(sshd_backend)s
maxretry = 5
bantime  = 24h      # SSH는 24시간 차단
```

설정 변경 후 재시작:

```bash
sudo systemctl restart fail2ban
```

---

## 공격 현황 확인

```bash
# SSH jail 전체 현황 (현재 차단 수, 총 실패 수 등)
sudo fail2ban-client status sshd

# 실시간 로그 스트리밍
sudo tail -f /var/log/fail2ban.log

# 오늘 차단된 IP 목록만 빠르게 확인
sudo grep "Ban " /var/log/fail2ban.log | grep "$(date +%Y-%m-%d)"
```

---

## 차단 처리 사례 확인

```bash
# 전체 차단 이력 조회
sudo grep "Ban\|Unban" /var/log/fail2ban.log

# 특정 IP가 차단됐는지 확인
sudo grep "Ban 1.2.3.4" /var/log/fail2ban.log

# 현재 차단 중인 IP 목록
sudo fail2ban-client status sshd | grep "Banned IP"

# iptables에서 실제 차단 규칙 확인
sudo iptables -L f2b-sshd -n --line-numbers
```

---

## 수동 차단 / 차단 해제

```bash
# 특정 IP 수동 차단
sudo fail2ban-client set sshd banip <IP>

# 특정 IP 차단 해제 (실수로 내 IP가 막혔을 때 등)
sudo fail2ban-client set sshd unbanip <IP>
```

---

## 서비스 유지보수

```bash
# 서비스 상태 확인
sudo systemctl status fail2ban

# 서비스 재시작 (설정 변경 후)
sudo systemctl restart fail2ban

# 부팅 자동 시작 여부 확인
sudo systemctl is-enabled fail2ban

# fail2ban 전체 jail 목록 확인
sudo fail2ban-client status

# 설정 문법 오류 사전 검사
sudo fail2ban-client --test

# 로그 파일 위치
# /var/log/fail2ban.log
```
