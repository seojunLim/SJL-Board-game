# 🎲 SJL 보드게임

온라인 실시간 멀티플레이어 보드게임 사이트. 방 코드만 공유하면 바로 같이 플레이할 수 있습니다.
체스·바둑·오델로·루핑 루이는 Three.js **실제 3D 판/말**로, 드래그로 회전하고 휠로 확대할 수 있습니다.
검색엔진에는 노출되지 않도록 설정되어 있습니다(배포 전용, 비공개 링크 공유).

## 지원 게임

| 게임 | 인원 | 구현된 규칙 |
|---|---|---|
| ♞ 체스 | 2인 | 캐슬링, 앙파상, 승격, 체크메이트/스테일메이트, 50수 규칙, 3회 동형 반복, 기물 부족 무승부, SAN 기보. `perft` 1~4수 검증 완료(20/400/8902/197281) |
| ⚫ 바둑 | 2인 | 9·13·19로, 따냄, 자살수 금지, 패(위치 초구) 금지, 두 번 패스 후 사석 표시 → 중국식 집계가(덤 6.5) |
| ⚪ 오델로 | 2인 | 8×8 정식 리버시, 8방향 뒤집기, 강제 패스, 최종 집계 |
| 🔢 다빈치 코드 | 2~4인 | 검정/흰색 0~11 + 조커, 오름차순 정렬(동수는 검정 우선), 적중 시 계속 추측/턴 종료 선택, 실패 시 뽑은 타일 공개, 더미 소진 시 자기 타일 공개 |
| ✈️ 루핑 루이 | 2~4인 | 실시간. 서버 33ms 틱 권위 판정, 레버 타이밍(230ms)·재장전(520ms), 격추 시 반대 방향 + 가속, 닭 3마리 |
| 🔔 할리갈리 | 2~6인 | 56장 정식 덱(과일 4종 × 1·2·3·4·5), 순서대로 뒤집기 + 실시간 종, 같은 과일 정확히 5개일 때만 정답, 오답 시 1장씩 지불 |

## 실행

```bash
npm install
npm start          # http://localhost:3000
```

## 테스트

```bash
npm test           # 규칙 엔진 단위 테스트 + 소켓 E2E
npm run test:browser   # 실제 Chromium 2개 창으로 6게임 전부 플레이
```

`test:browser`는 Playwright를 사용합니다. 시스템에 설치된 크로미움 경로를 쓰려면
`CHROMIUM_PATH=/path/to/chrome npm run test:browser`.

## 구조

```
server.js            Express + Socket.IO. 방/좌석/관전/재접속/채팅, 서버 권위 상태
games/<id>.js        순수 규칙 엔진. create() / view(state, seat) / move(state, seat, action) / tick()
public/js/app.js     로비 + 방 셸
public/js/three3d/   3D 씬 헬퍼(Stage) + 절차적 체스 기물
public/js/games/     게임별 렌더러 (같은 render(state, seat) 인터페이스, 3D/2D 혼용)
public/vendor/       three.module.js (r160, 로컬 번들)
test/                엔진 · 소켓 · 브라우저 테스트
```

핵심 설계: **모든 규칙 판정은 서버에서만** 합니다. 클라이언트는 `view(state, seat)`가 돌려준
좌석별 화면만 그리므로, 다빈치 코드의 상대 타일이나 할리갈리의 뒷면 카드는 애초에 전송되지 않습니다.

## 배포

`Dockerfile`, `Procfile`, `render.yaml`, `fly.toml`이 포함되어 있어 Render / Fly.io / Railway /
Heroku 어디든 바로 올릴 수 있습니다. WebSocket을 쓰므로 웹소켓을 지원하는 호스팅이 필요합니다.
헬스체크 경로는 `/healthz`.

### 검색 노출 차단

- `robots.txt` → 전체 `Disallow: /`
- 모든 응답에 `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`
- HTML `<meta name="robots" content="noindex, nofollow">`

## 조작

- 체스·오델로·바둑: 클릭. 바둑은 두 번 패스하면 계가 모드에서 죽은 돌을 클릭해 표시.
- 다빈치 코드: 상대 타일 클릭 → 색·숫자 선택 → 추측.
- 할리갈리: `F` 카드 뒤집기, `Space` 종 치기.
- 루핑 루이: `Space` 또는 레버(자기 자리) 클릭으로 레버 치기.

3D 화면(체스·바둑·오델로·루핑 루이)은 **드래그로 시점 회전, 마우스 휠로 확대/축소**할 수 있습니다.
WebGL을 지원하는 브라우저면 별도 설치 없이 동작합니다.
