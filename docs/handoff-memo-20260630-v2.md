# 인수인계 메모 (2026-06-30 작성, 2차 업데이트)

## 현재 코드 상태 (가장 중요)

- `main` 브랜치 기준
- 저위험 구조 리팩터 6개 커밋(groupStore 제거 ~ MemoCard 분리)은 전부 머지
  완료, 안정적으로 동작 중
- 사용자가 별도로 작업한 "메모 출처 필터" 기능(`feature/memo-provider-filter`,
  커밋 `3fa5bc3`/`08e9230`)도 main에 정상 머지됨
- **Gemini 버그 수정 시도는 머지 후 되돌려짐(revert).** main 히스토리에
  isMainFrame 가드 커밋(`6e46cf5`)과 그걸 되돌리는 revert 커밋이 모두 남아
  있고, 현재 코드 동작은 가드를 추가하기 이전과 동일함 (= Gemini 버그가
  여전히 존재하는 상태)
- `fix/gemini-subframe-navigation-bounce` 브랜치가 로컬/원격에 남아있을 수
  있음 — 정리 시 `git branch -a`로 확인 후 삭제할 것

## 다음 작업 우선순위 (사용자가 정한 순서)

**1순위 — Gemini 채팅 클릭/메시지 전송 시 홈 화면으로 튕기는 버그 (열려있음, 미해결)**

자세한 내용은 `docs/IN-PROGRESS.md`의 "[막힘, 최우선] Gemini 채팅 클릭/메시지
전송 시 홈 화면으로 튕기는 문제" 항목 참고. 핵심 요약:
- 1차 진단(`saveCurrentUrl`의 `isMainFrame` 미체크)은 **대조 실험으로
  기각됨** — 가드를 넣어도, 빼도 증상이 동일하게 재현됨
- 같은 접근(isMainFrame 가드) 재시도하지 말 것
- 다음에 시도할 것: ① Gemini 파티션 캐시 삭제 후 재로그인 테스트, ② Google
  webview 감지 불안정성 가능성(Perplexity/Grok OAuth 사례와 유사한 패턴)
  점검, ③ 증상 발생 순간 DevTools 콘솔/네트워크 탭 캡처, ④
  `refreshGeminiSlotTitle`의 부작용 여부 재검토
- "재시작하면 잠깐 정상으로 보일 수 있다"는 점을 염두에 두고, 1회 정상
  동작만으로 해결됐다고 단정하지 말 것

**2순위 — GUEST_VIEW_MANAGER_CALL 콘솔 노이즈 억제**

정제된 Codex 지시문이 이미 준비되어 있음 (`docs/IN-PROGRESS.md`의 "[준비됨,
미실행]" 항목 참고). 요약:
- `src/renderer/diagnostics/suppressExpectedConsoleNoise.ts`로 분리,
  `main.tsx`에는 side-effect import만
- `import.meta.env.DEV`에서만 적용
- 필터 조건: `GUEST_VIEW_MANAGER_CALL` AND (`ERR_ABORTED` OR `(-3)`)
- HMR 중복 설치 방지용 `globalThis` 플래그 포함
- 기능 버그가 아니므로 Gemini 건보다 우선순위 낮음, 효과 없으면 오래
  붙잡지 말 것

**3순위 — 웹슬롯 1단계 3차 시도**

- 2차 시도 때 만든 구조(`AiSlot`/`WebSlot` discriminated union,
  `WEB_SLOT_PARTITION`, `isAiSlot()` 분기, `saveCurrentUrl`의 `isMainFrame`
  가드)는 결함 없음으로 결론났던 상태 — 단, **이번에 그 `isMainFrame` 가드가
  Gemini 버그 해결에 도움 안 됐다는 게 새로 밝혀졌으므로, 웹슬롯 작업
  시작 전에 Gemini 버그가 진짜로 해결됐는지 먼저 확인하는 게 안전함**
  (웹슬롯도 Gemini와 비슷하게 같은 도메인 서브프레임을 가질 수 있는 일반
  웹페이지를 다루므로, 같은 종류의 네비게이션 문제를 다시 만날 수 있음)
- 작업 시작 전 포트 충돌 체크(`lsof -ti:5173`) 습관 유지

**4순위 — 폴더/저장소 구조 추가 정리**

- `main.tsx`가 여전히 큰 단일 파일(메모 페이지/모달, 워크스테이션 패널,
  브로드캐스트, 탭바, Stage/Dock 등은 아직 분리 안 됨)
- 이전 논의에서 합의한 위험도 순서: 워크스테이션/브로드캐스트/탭 분리 →
  (가장 나중) Stage/Dock 드래그앤드롭 분리
- Stage/Dock 분리할 때 `MemoDetailModal`의 `navigateToMemoSource` 분리도
  함께 처리 (위 "[보류] MemoPanel/MemoDetailModal 분리" 항목 참고)

## 검증 방식 재확인 (이번 세션에서 강화된 부분)

- Codex의 "되돌릴 게 없었다"/"diff가 이거뿐이다" 같은 **보고를 그대로
  믿지 않고, 매번 src.zip을 직접 풀어 코드 레벨로 검증**하는 패턴을 계속
  유지함
- 이번 세션에서 한 가지 추가 교훈: **브랜치를 삭제하고 새로 만들어도
  working directory의 커밋 안 된 수정사항은 그대로 따라온다.** 한 번
  "오염된 브랜치"로 오인해서 두 번 헛수고했는데, 알고 보니 사용자가
  별도로 진행 중이던 정당한 작업(메모 필터)이 main에 이미 머지되어 있었던
  것뿐이었음 — diff 비교 시 기준점(어느 시점의 main과 비교하는지)을 항상
  먼저 확인할 것
- "재시작하면 해결됨"이라는 신호를 100% 신뢰하지 말 것 (포트 충돌 사례와
  이번 Gemini 사례 둘 다 일시적으로 정상처럼 보였다가 재발함)

## 함께 첨부할 파일 (다음 채팅 시작 시)

- `docs/CHANGELOG-DEV.md`
- `docs/IN-PROGRESS.md`
- 이 핸드오프 메모
- Gemini 버그 재진단을 이어갈 경우, 최신 src.zip + 가능하면 증상 발생 순간의
  DevTools 콘솔 스크린샷
