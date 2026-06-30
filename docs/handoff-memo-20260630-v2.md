# 인수인계 메모 (2026-06-30, 3차 업데이트 — Gemini 튕김 버그 세션)

## 현재 코드 상태

- `main` 브랜치, `fix/webview-src-feedback-loop` 머지 완료, push 완료
- 이번 세션에서 4개의 서로 다른 레이어 버그를 진단/수정함 (자세한 진단 내용은
  `docs/CHANGELOG-DEV.md`의 "2026-06-30 — Gemini 튕김 버그 근본 수정" 참고)
- 마지막 시도(about:blank + dom-ready 지연 로드)는 더 심각한 회귀를 일으켜
  되돌렸음 — 코드에 그 흔적 없음, 커밋도 안 됨

## 다음 작업 우선순위

**1순위 — 웹슬롯 1단계 3차 시도**
이전 핸드오프에서 보류했던 항목. Gemini 버그의 핵심(클릭 즉시 튕김, 탭 전환
튕김)이 해결됐으므로 이제 안전하게 진입 가능. 단, 웹슬롯도 Gemini와 비슷하게
같은 도메인 서브프레임을 가질 수 있는 일반 웹페이지를 다루므로, 이번에 배운
"webview src는 절대 state로 직접 바인딩하지 말 것" 원칙을 처음부터 적용할 것.

**2순위 — Gemini 워크스페이스 재오픈 잔여 이슈 (낮은 우선순위로 격하)**
`docs/IN-PROGRESS.md`의 해당 항목 참고. 영향 범위가 좁고(Gem 채팅 + 재오픈
조합), 근본 원인이 우리 코드 밖(Gemini 클라이언트 부트스트랩)일 가능성이
있어 더 깊이 파기보다 일단 보류. 재시도하게 되면 "맹목적 재시도"가 아닌
다른 접근(아래 IN-PROGRESS 참고)부터 검토할 것.

**3순위 — 폴더/저장소 구조 추가 정리** (이전 핸드오프에서 이어옴)
- `main.tsx`가 여전히 큰 단일 파일
- 워크스테이션/브로드캐스트/탭바 분리 → Stage/Dock 드래그앤드롭 분리 순서

## 이번 세션에서 새로 얻은 핵심 원칙 (메모리에 반영 권장)

- **webview의 `src`를 React state(`slot.currentUrl`)에 직접 바인딩하면 안 됨.**
  navigate 이벤트가 state를 갱신할 때마다 React가 src를 재할당해 강제 full
  reload를 유발한다. 초기 마운트 시 1회만 ref에 고정(`??=`)하고, state는
  저장/복원용으로만 분리 추적할 것.
- **`setGroup`/`setGroupRef`처럼 activeTabId를 클로저로 캡처하는 패턴은 탭이
  여러 개 열려있을 때 레이스를 만든다.** 슬롯이 실제로 속한 탭(ownerTabId)을
  명시적으로 캡처해서 그 탭만 정확히 patch하는 방식이 안전하다.
- **ref callback의 cleanup(`!webview` null 분기)에서는 "표준 React unmount
  정리"만 하고, 캐시(콜백 레퍼런스 자체)는 지우지 말 것.** 캐시까지 지우면
  다음 렌더에서 캐시 미스로 콜백이 매번 재생성되고, React가 ref를 계속
  null→재attach 반복하는 무한루프에 빠질 수 있다.
- **"탭 전환 시 webview를 항상 mount 유지"는 안전하게 구현 가능하지만, 조건이
  있다**: 슬롯을 다른 탭으로 동적 재할당하지 말고, 각 탭이 자신의
  `group.slots`를 영구 소유한 채 `tabs` 전체를 순회해서 렌더 + `display:none`
  으로만 숨길 것. (2026-06-25 새벽의 retention 시도가 실패한 이유는 슬롯을
  탭 간에 옮기려 했기 때문 — 이번 방식은 그 문제를 피해갔다.)
- **`<webview>`에 `src` 속성을 아예 안 주면 게스트 프로세스가 생성되지 않고
  `dom-ready`도 안 뜨는 것으로 보인다.** 빈 화면 + 콘솔 에러 없음이 그 신호.
  src 자체를 지연시키고 싶으면 최소한 `"about:blank"`라도 명시해야 하는데,
  그조차도 dom-ready가 너무 빨리 떠서 의도한 지연 효과를 못 낼 수 있다.
- **재현 자동화의 한계**: macOS 접근권한 문제로 Codex가 Electron 창을 직접
  클릭할 수 없다. 모든 수동 클릭 테스트는 사람이 직접 해야 하고, Codex의
  "검증 완료" 보고에 클릭 테스트가 빠져있으면 그건 항상 사람이 메워야 하는
  부분이다.
- **localStorage와 live webview DOM을 동시에 찍는 진단 스크립트가 매우
  유용했다.** `JSON.parse(localStorage.getItem('omni-workspaces'))`와
  `document.querySelectorAll('webview')`의 `getURL()`/`src` attribute를 함께
  비교하면, "저장 문제"와 "복원 타이밍 문제"를 빠르게 구분할 수 있다. 다음에
  비슷한 복원 버그가 생기면 이 패턴을 먼저 써볼 것.

## 함께 첨부할 파일 (다음 채팅 시작 시)

- `docs/CHANGELOG-DEV.md`
- `docs/IN-PROGRESS.md`
- 이 핸드오프 메모
- (선택) 잔여 Gemini 재오픈 이슈를 다시 파게 되면, 최신 src.zip + 진단 스크립트
  결과 캡처


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
