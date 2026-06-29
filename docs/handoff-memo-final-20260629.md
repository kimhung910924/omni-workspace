# 인수인계 메모 (2026-06-29 작성, 최종 업데이트)

## 현재 코드 상태

- `main` 브랜치, 최신 커밋까지 push 완료
- `feature/strict-vite-dev-port` 브랜치 작업 완료 후 main에 머지/push됨,
  브랜치는 정리 대상 (아직 삭제 안 했으면 `git branch -d
  feature/strict-vite-dev-port`로 정리)
- 웹슬롯 관련 코드는 main에 없음 (1차, 2차 시도 전부 폐기됨, 커밋된 적 없음)

## 이번 세션에서 완료한 것

**1. Vite dev 서버 포트 고정 (strictPort) — 커밋 완료**
- `omni-windows/vite.config.ts`에 다음 추가:
  ```ts
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  ```
- 5173이 점유되어 있으면 Vite가 5174 등으로 우회하지 않고 즉시 실패하도록
  강제. `concurrently -k`로 묶인 다른 프로세스(`wait-on`, `electron`)도 같이
  종료되는 것까지 직접 검증됨. `wait-on`이 좀비 프로세스를 정상으로
  오인하는 문제도 없음을 확인함
- 커밋: `"Enforce strict Vite dev port"` (main에 머지됨)
- **배경**: 이전 세션에서 "워크스테이션 소실 + Claude 로그아웃"으로 보였던
  증상의 진짜 원인이 코드 버그가 아니라 dev 서버 좀비 프로세스로 인한 포트
  불일치였음을 추적해서 확정함. 자세한 내용은 `docs/IN-PROGRESS.md`의
  "[해결됨] 진짜 원인: dev 서버 포트 충돌" 항목 참고

**2. 문서/저장소 정리 — 커밋 완료**
- `omni-windows/.gitignore`에 `*.zip` 추가 — 앞으로 작업용 src.zip 파일들이
  git에 안 잡히도록 함
- 기존에 추적되던 `omni-windows/src.zip`을 git에서 제거(`git rm --cached`,
  디스크 파일은 이미 사용자가 직접 정리한 상태였음)
- `docs/CHANGELOG-DEV.md`, `docs/IN-PROGRESS.md` 업데이트, 핸드오프 메모
  2개(`handoff-memo-20260628.md`, `handoff-memo-20260629.md`) 추가
- 커밋: `"Stop tracking zip files, update docs"` (main에 머지됨)
- 참고: 앞으로 작업용 zip 파일(`src맥북.zip` 등 기기별 이름)은 git에 안
  잡히니 자유롭게 만들어서 써도 됨

## 다음에 할 수 있는 작업 두 가지 (택1로 시작 가능)

**A. 웹슬롯 1단계 3차 시도**
- 2차 시도 때 만든 구조(`AiSlot`/`WebSlot` discriminated union,
  `WEB_SLOT_PARTITION`, `isAiSlot()` 분기, `saveCurrentUrl`의 `isMainFrame`
  가드)는 코드 자체에 결함이 없었던 것으로 결론남 — 그대로 재구현하면 됨,
  새로 디버깅할 필요 없음
- 코드는 커밋 안 하고 폐기했으므로 실제로는 다시 타이핑/구현해야 함
- **작업 시작 전, 그리고 매번 재시작 테스트할 때마다 코드를 의심하기 전에
  먼저 터미널에 `Port 5173 is in use`류 메시지가 뜨는지 확인할 것** (이제
  strictPort 덕분에 이런 상황이면 Vite가 명확히 실패하므로 예전보다 훨씨
  빨리 알아챌 수 있음)

**B. 폴더/저장소 구조 정리**
- 지금 폴더 구조가 지저분해졌다고 판단, 한 번 정리하고 싶어함
- 새 채팅에서 시작 예정. GitHub 저장소가 public이면 zip 다운로드
  (`https://github.com/kimhung910924/omni-workspace/archive/refs/heads/main.zip`)
  또는 직접 zip 만들어서 첨부, 전체 폴더 구조를 보고 정리 방향을 같이 잡는
  작업
- 이 작업과 별개로, `main.tsx`가 3000줄 넘는 단일 파일 구조라는 점도
  이전 세션에서 언급됐었음 — 폴더 정리할 때 같이 논의할 만한 후보 (단, 웹슬롯
  3차 시도 전에 큰 구조 변경을 하면 디버깅이 더 어려워질 수 있으니 순서는
  신중히 정할 것)

## 함께 첨부할 파일 (다음 채팅 시작 시)

- `docs/CHANGELOG-DEV.md`
- `docs/IN-PROGRESS.md`
- 이 핸드오프 메모
- (A를 고르면) 코드 작업 시작 시점에 최신 src.zip
- (B를 고르면) GitHub 저장소 zip
