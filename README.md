# Coin Autopilot

BTC 흐름 기반 현물·선물 암호화폐 자동매매 플랫폼.

## 구성

| 모듈 | 설명 | 기술 |
|------|------|------|
| `server/` | 모니터링 서버 | Node.js, Hono, Supabase, Socket.IO |
| `web/` | 대시보드 프론트엔드 | React 19, Vite, shadcn/ui, TailwindCSS |
| `proto/` | gRPC 프로토콜 정의 | Protocol Buffers 3 |

## 거래소

- **업비트**: 현물 매매 (KRW 마켓)
- **OKX**: 선물 매매 (USDT 무기한)

## 주요 기능

- 5종 매매 전략 (BTC 레짐 필터 + 알트 평균회귀, 도미넌스 로테이션, 변동성 타이밍, 펀딩비 차익, 김프 모니터링)
- 백테스팅 (히스토리컬 데이터 + 스트레스 테스트)
- 가상매매 (다중 전략 동시 실행 + 비교)
- 실시간 모니터링 대시보드
- 투자 성향 프로필 (안전 / 중립 / 공격)

## 개발 환경

### Server
```bash
cd server
npm install
npm run dev
```

### Web
```bash
cd web
npm install
npm run dev
```

## 라이선스

Private — All Rights Reserved
