# 진행 중 / 시행착오 기록

> 완료된 작업은 `docs/CHANGELOG-DEV.md`로 옮기고 여기서는 지운다.
> 여기는 "현재 막혀있는 것" + "과거에 시도했다가 버린 접근법"만 남겨둔다.
> 목적: 같은 방법을 또 시도하지 않게 막는 것 + 새 채팅에서 바로 이어갈 항목 확인.

---
## [부분 해결, 4개 레이어 버그 진단/수정 완료 + 잔여 1건] Gemini 채팅 클릭/전환/재오픈 시 홈으로 튕기는 문제

**이전 상태 (1차 진단 기각, 위 구버전 기록)**
- `isMainFrame` 가드 시도는 대조 실험으로 효과 없음이 확정되어 기각됨
- main은 가드 추가 이전 상태로 복귀, 버그는 그대로 남아있었음

**2026-06-30 세션에서 진행한 전체 흐름**

증상이 하나가 아니라 **레이어가 다른 네 가지 문제가 겹쳐 있었다**는 게 핵심
결론. 디버깅 도중 새 패치가 새 증상을 만들고, 그 증상을 또 진단하는 식으로
총 4단계를 거쳤음. 순서대로 기록.

---

### 1단계 — webview src 피드백 루프 (확정, 수정 완료)

**진단**
`<webview src={slot.currentUrl}>` 구조에서 `did-navigate-in-page`가
`currentUrl` state를 갱신할 때마다 React가 `src`를 재할당 → 살아있는 webview가
강제 full reload됨. Gemini 딥링크는 fresh reload 시 홈/젬 목록으로 튕기고,
Claude/ChatGPT는 같은 메커니즘이 "깜빡임"으로만 보였음(딥링크가 fresh load에
강해서 강제 reload돼도 같은 화면이 다시 뜸).

**검증 방법**
대조 실험: `saveCurrentUrl`에서 `providerId === 'gemini'`인 경우에만
`currentUrl` state 갱신을 임시로 차단(`diagnose/gemini-src-feedback-loop`
브랜치, 커밋 안 함) → Gemini만 안 튕기고 Grok/Perplexity는 여전히 깜빡임 →
변수 하나만 바꾼 깨끗한 대조로 원인 확정.

**수정**
슬롯별 초기 src를 `initialWebviewSrcBySlotIdRef`(ref)에 마운트 시 1회만
고정(`??=`), 이후 `currentUrl` state 변경이 살아있는 webview의 `src`에
되먹임되지 않게 함. `currentUrl` state 자체는 저장/복원용으로 계속 추적. ref
정리는 `!webview` null 분기, `cleanupTabSlotState`, `closeSlot` 3곳에서.

**검증**
diff로 7줄 추가 + 1줄 교체(`src={slot.currentUrl}` → `src={initialWebviewSrc}`)
임을 코드 레벨로 확인, 스코프 크리프 없음. 클릭 즉시 튕김 해결, 깜빡임 해결.
부수 효과로 콘솔의 `GUEST_VIEW_MANAGER_CALL ERR_ABORTED (-3)` 노이즈도 크게
감소(강제 reload로 인한 navigation abort 흔적이었던 것으로 추정).

---

### 2단계 — 탭 전환 시 URL 갱신이 엉뚱한 탭에 적용됨 (확정, 수정 완료)

**증상**
1단계 패치 후에도, 워크스페이스 안에서 Gemini 대화로 이동한 뒤 **탭을
전환했다가 돌아오면** Gemini가 홈으로 돌아감. closeTab 시 워크스페이스 저장
타이밍을 의심해서 먼저 고쳤으나(탭 닫는 순간 `workspaceRepository.update`를
한 번 더 호출하도록) 효과 없었음 — "탭 전환만 해도 똑같이 깨진다"는 추가
증상이 나와서 저장 타이밍 문제가 아님이 드러남.

**진단**
`setGroup`(및 `setGroupRef`)이 `activeTabId`를 클로저로 캡처해서 항상
"현재 active한 탭"만 patch함. Gemini에서 navigate가 발생한 직후 사용자가
다른 탭으로 전환하면, 그 navigate 이벤트가 처리되는 시점엔 이미
`activeTabId`가 바뀌어 있어 엉뚱한(또는 존재하지 않는) 슬롯을 patch 시도 →
원래 탭의 Gemini URL이 영원히 갱신 안 됨.

**수정**
`attachNavigationTracker`가 `slot`과 함께 `ownerTabId`(그 슬롯이 실제로
속한 탭 id)를 캡처하도록 시그니처 확장. `saveCurrentUrl`/`updateSlotTitle`이
`setGroupRef`(activeTabId 의존) 대신 `ownerTabId`를 직접 대상으로 하는
`setTabs` 호출로 전환.

---

### 3단계 — ref callback 무한 재생성 루프 (2단계 패치의 자체 회귀, 발견 즉시 수정)

**증상**
2단계 패치 적용 직후, Gemini 클릭 즉시 튕김이 부활하고 Claude/ChatGPT/Grok
깜빡임 + `GUEST_VIEW_MANAGER_CALL ERR_ABORTED` 콘솔 노이즈가 대량으로
폭증함(1단계 이전보다 더 심함). 1단계에서 고친 게 다시 깨진 것처럼 보였으나,
실제로는 2단계가 새로 만든 별개의 회귀였음.

**진단**
2단계의 ownerTabId 패치 도입 과정에서, `attachNavigationTracker`의
`!webview` 정리 분기가 `webviewRefCallbacks`/
`webviewRefCallbackOwnerTabIdsRef`까지 같이 지우도록 구현됨. React가 ref를
`null`로 호출(표준 cleanup)할 때마다 이 캐시가 지워지고, 다음 렌더에서 owner
비교(`webviewRefCallbackOwnerTabIdsRef.current[slot.id] !== ownerTabId`)가
`undefined !== ownerTabId`로 항상 참이 되어 콜백이 매번 새로 생성됨 → React가
새 ref 함수 레퍼런스를 받을 때마다 이전 콜백 `null` 호출 + 새 콜백 호출을
반복 → 무한 루프.

**검증 방법**
임시 진단 로그(`[GeminiMountDebug]`, 커밋 안 함)로 `webview null callback
fired`와 `webview attached`가 거의 매 렌더마다 반복 발생하는 걸 직접 확인.
`ownerMatched: true`인데도 반복된다는 게 캐시 무효화 버그의 직접 증거였음.

**수정**
`!webview` 분기에서는 `webviewRefs`/`webviewReadyRef`/
`initialWebviewSrcBySlotIdRef`만 정리하고, `webviewRefCallbacks`/
`webviewRefCallbackOwnerTabIdsRef` 정리는 `cleanupTabSlotState`/`closeSlot`
(슬롯이 진짜로 사라질 때)에만 맡김. 진단 로그는 전부 제거.

**검증**
콘솔 에러가 claude.ai 2줄 수준으로 확 줄어듦 확인, Gemini 클릭 즉시 튕김도
재해결 확인.

---

### 4단계 — 탭 전환 시 webview unmount/remount (확정, 수정 완료)

**증상**
3단계까지 적용해도 "탭 전환 후 돌아오면 Gemini가 홈으로" 증상이 여전히
재현됨(2~3초 안에 빠르게 전환해도 동일).

**진단**
`slots`가 `activeTab.group.slots`에서만 오는 구조라, 탭 전환 시 비활성
탭의 webview가 전부 unmount되고 재진입 시 새로 mount됨(메모리의 "webview
never unmount" 원칙이 탭 단위로는 깨져 있었던 셈). Gemini 딥링크가 fresh
load될 때마다 같은 튕김 재발.

**수정**
렌더링을 `activeTab.group.slots`가 아니라 `tabs.flatMap(ownerTab =>
ownerTab.group.slots...)`로 변경해 **열린 모든 탭의 webview를 항상 mount
유지**, `display:none`으로만 숨김(activeTabId와 ownerTab.id 일치 + Stage
포함 여부로 가시성 결정). `key`는 `${ownerTab.id}:${slot.id}`로 충돌 방지.
`getSlotWebviewRef(slot, ownerTab.id)`로 owner 일관성 유지.

⚠️ **2026-06-25 새벽에 시도했던 webview retention(`recentTabIdsRef`/
`retainedSlots` 방식, 아래 "[폐기된 접근법] Stage 3" 항목 참고)과는 구조가
다름.** 그때는 슬롯을 다른 탭으로 동적 재할당하려다 partition 충돌과 탭 간
슬롯 누출 회귀로 전체 revert됨. 이번 방식은 각 탭이 자신의 `group.slots`를
영구 소유한 채 단순히 계속 렌더만 하는 거라 슬롯 소유권 이동이 전혀 없음.
"다시 시도하지 말 것"이라는 위 폐기 기록은 **슬롯을 다른 탭으로 옮기는 방식**
한정이고, 이번 keep-mounted 방식까지 막는 건 아님 — 구분해서 이해할 것.

**검증**
탭 전환 10회 반복, Gemini 유지 확인. Claude/ChatGPT/Grok/Perplexity도 탭
전환 시 불필요한 깜빡임 감소 확인.

---

### 시도했으나 실패하고 되돌린 것 — webview를 about:blank로 시작 후 dom-ready 시 loadURL

**남은 문제 발견**
4단계까지 적용해도, **워크스테이션을 X로 닫았다가 사이드바에서 다시 여는**
경우(=webview가 진짜 새로 생성되는 경우)에는 Gemini Gem/프로젝트 채팅이
약 10번 중 2번만 자동으로 바로 뜨고 나머지는 빈 기본 화면("살펴보고자 하는
새로운 아이디어가 있나요?")을 보여줌.

**진단 과정 (실측 데이터로 저장/복원 자체는 무죄 확정)**
- `localStorage.getItem('omni-workspaces')`로 저장된 `slot.currentUrl`을
  직접 확인 → 매번 정확한 Gem 딥링크였음(`gem/{id1}/{id2}` 형태)
- `document.querySelectorAll('webview')`로 live DOM의 `attrSrc`/`getURL()`을
  직접 확인 → 저장값과 항상 정확히 일치, 강제 reload 흔적도 없음
- "성공했을 때"와 "실패했을 때"를 같은 진단 스크립트로 나란히 비교 →
  **`slotCurrentUrl`/`attrSrc`/`liveUrl`이 완전히 동일**, 유일하게 다른 건
  `title`(성공: 실제 대화 제목 `'Flash'`, 실패: 플레이스홀더
  `'Gemini와의 대화'`)
- **결론: URL 전달은 한 번도 안 틀렸다.** 문제는 "어떤 URL을 주느냐"가
  아니라, **그 URL을 처음 fresh load할 때 Gemini SPA가 그 시점에 Gem
  컨텍스트를 못 채우고 기본 화면을 그리는 타이밍 레이스**였음
- 실측으로 reload 시도 → 사용자가 직접 새로고침 버튼을 눌러서 정상 화면("rep
  radio 전력가")으로 전환되는 것 확인. 단, **1회로 되는 경우도 있고 4~5회
  필요한 경우도 있음** — 레이스 해소 시점이 고정적이지 않음

**근본 수정 시도 (실패)**
의심: webview가 마운트될 때 `src` 속성이 JSX attribute로 즉시 박히면,
Electron이 게스트 프로세스(guest WebContents)를 완전히 연결하기 전에
네비게이션 요청이 먼저 발사되는 레이스가 있을 수 있다고 추정. 이게 세션
내내 봤던 `GUEST_VIEW_MANAGER_CALL ERR_ABORTED (-3)` 노이즈의 진짜 원인일
가능성으로 보고, "무해한 노이즈"로 치워뒀던 걸 재고.

수정 시도: `<webview>`에서 `src` 속성을 완전히 제거하고, `dom-ready` 이벤트
이후 1회성으로 `webview.loadURL(initialSrc)`를 명령형 호출하는 방식으로
변경 — 네비게이션을 게스트 프로세스가 확실히 준비된 뒤로 미루려는 의도.

**결과: 더 심각한 회귀**
모든 provider(Gemini뿐 아니라 ChatGPT/Claude/Grok 전부)가 완전히 빈 화면에서
멈춤, 콘솔 에러조차 안 뜸. 에러조차 없다는 건 `loadURL`이 한 번도 호출 안
됐다는 뜻 → `dom-ready` 자체가 안 떴다는 뜻. **Electron의 `<webview>`는
`src` 속성이 아예 없으면 게스트 프로세스를 안 만들고 `dom-ready`도 안 띄우는
것으로 추정됨.**

`src="about:blank"`로 명시해서 재시도 → 화면은 다시 뜨지만, **이번엔 10번 다
실패하고 수동 새로고침조차 안 먹힘** — about:blank는 실제 네트워크 요청이
없어서 `dom-ready`가 거의 즉시(트리비얼하게) 발생하고, 그 직후 곧바로
`loadURL(실제 URL)`을 쏘면서 **원래보다 레이스가 더 빨리, 더 일관되게
악화**된 것으로 추정.

**최종 판단: 이 방향 폐기, 원복.** `src={initialWebviewSrc}` 직접 바인딩 +
단순 `dom-ready` 리스너(추가 loadURL 없음)로 되돌림. 되돌리기 후 v4(4단계
완료 시점) 베이스라인과 전체 diff를 떠서 about:blank/hasPerformedInitialLoad
잔재가 전혀 없고, 1~4단계 수정사항은 모두 그대로 살아있음을 코드 레벨로
확인. 이 상태로 커밋됨.

⚠️ **이 방향(src 속성을 비우거나 늦게 부여하는 방식)으로 다시 시도하지 말 것.**
Electron webview의 src-attribute 부재 시 게스트 프로세스 미생성 추정과
about:blank의 트리비얼한 dom-ready 둘 다 확인된 함정.

**또한 검토했으나 적용 안 한 것 — 자동 재시도(reload loop)**
고정 횟수(예: 5회, 900ms 간격)로 무조건 재로드를 반복하는 방식도 지시문까지
작성했으나, 사용자가 "막 정상 렌더링되던 것도 강제로 끊어버릴 수 있다"는
구조적 결함을 지적해 적용하지 않음. 성공/실패를 판단할 신호가 없는 채로
맹목적으로 도는 방식이라, 운 좋게 화면이 막 채워지던 순간을 오히려 또
끊어버릴 위험이 있음. **시도 자체를 안 했으므로 "효과 없었다"가 아니라
"채택하지 않았다"임 — 구분해서 기록.**

---

**현재 상태 (main 기준, 코드 레벨로 확인됨)**

`grep -n "initialWebviewSrcBySlotIdRef" omni-windows/src/renderer/main.tsx`로
1~4단계 수정사항이 main에 전부 살아있음을 확인함(2026-06-30 세션 종료
시점). 단, 커밋 메시지(`Document Gemini bug investigation (inconclusive,
reverted) and queue next steps`)가 마치 전체가 reverted된 것처럼 읽혀 혼동
소지가 있음 — **실제로는 되돌려진 건 about:blank 시도뿐**이고, 1~4단계
수정사항은 정상적으로 main에 포함되어 있음. 다음 세션 시작 시 이 grep으로
재확인 권장.

**해결된 것**
- 클릭 즉시 튕김 (1단계)
- 탭 전환 시 튕김 (2단계, 4단계)
- 콘솔 GUEST_VIEW_MANAGER_CALL 노이즈 (1단계 부수 효과로 크게 감소)

**남은 문제**
워크스테이션을 닫았다가 다시 여는 경우(진짜 새 webview 생성), Gemini Gem/
프로젝트 채팅(`/gem/.../...`)이 약 10번 중 2번만 자동으로 바로 뜨고
나머지는 빈 화면. 일반 대화(`/app/{id}`)와 탭 전환은 영향 없음(100% 정상).

**다음에 시도해볼 만한 방향 (미검증)**
- Gemini 인증/세션 쿠키가 이미 partition에 영속돼 있다는 점을 고려하면,
  진짜 레이스는 "세션 미준비"가 아니라 Gemini 클라이언트 자체의 부트스트랩
  순서(예: 인증 상태 확인이 비동기로 늦게 끝나는데 그 사이 렌더링된 첫
  화면이 재반영 안 되는 SPA 내부 동작)일 가능성. 우리 쪽에서 통제 불가능한
  영역일 수 있음
- DOM 콘텐츠를 직접 검사해서 "진짜 로드 성공"을 판정하는 방식은 프로젝트
  원칙(완료 감지를 위한 DOM 스크래핑 금지, 아래 "확정" 관련 메모 참고)과
  충돌하므로 지양. 단, `webview.getTitle()` 같은 Electron 네이티브 API로
  "타이틀이 플레이스홀더('Gemini와의 대화')인지"를 확인하는 정도는 검토
  여지 있음 — 이미 `refreshGeminiSlotTitle`이 유사한 일을 하고 있어 완전히
  새로운 패턴은 아님
- 영향 범위가 작다(Gem 채팅 + 재오픈 조합에만 한정, 탭 전환/일반 대화는
  무관)는 점을 고려해, "알려진 한계"로 문서화하고 우선순위를 낮추는 것도
  합리적 선택지
- 재시도(reload loop) 방식을 다시 검토한다면, 최소한 "이미 화면이 정상
  렌더링된 것 같으면 남은 재시도를 취소"하는 최소한의 신호 판단(예:
  `webview.getTitle()`이 플레이스홀더가 아니게 바뀌면 중단)을 같이
  넣을 것 — 순수 맹목 반복은 다시 시도하지 않기로 함

**재개 조건**
탭 전환/클릭 즉시 튕김이라는 핵심 증상은 이미 해결됐으므로, 이 잔여 이슈는
더 이상 "최우선"이 아님. 웹슬롯 1단계 3차 시도 등 다음 작업으로 넘어가도
무방. 재개 시 위 "다음에 시도해볼 만한 방향"부터 검토.

**진단 패턴 (다음에 비슷한 복원 버그를 만나면 재사용)**
localStorage(`omni-workspaces`)와 live webview DOM(`document.
querySelectorAll('webview')`의 `getURL()`/`src` attribute)을 동시에 찍는
진단 스크립트가 "저장 문제"와 "복원 타이밍 문제"를 빠르게 구분하는 데 매우
유용했음. "성공했을 때"와 "실패했을 때"를 같은 스크립트로 나란히 비교하는
것도 핵심이었음(이번엔 URL이 완전히 동일하고 title만 다르다는 게 결정적
단서가 됨).

---

## [준비됨, 미실행] GUEST_VIEW_MANAGER_CALL ERR_ABORTED 콘솔 노이즈 억제 — 정제된 지시문 확보

- 이전 시도(`feature/suppress-err-aborted-noise`, `canGoBack`/`canGoForward`
  try/catch 방식)는 효과 없어서 폐기됨. 원인은 이 에러가 우리 JS
  코드(catch 블록)가 아니라 Electron/Chromium 내부가 webview guest-view IPC
  브릿지 실패 시 자체적으로 찍는 콘솔 로그이기 때문으로 추정됨 (grep으로
  "Unexpected error while loading URL" 문자열이 코드 어디에도 없음을 확인함)
- 다음 각도로 전역 `console.error`를 가로채는 방식의 지시문을 정제 완료,
  아직 미실행:
  - `main.tsx`에 직접 패치하지 않고 `src/renderer/diagnostics/
    suppressExpectedConsoleNoise.ts`로 분리, `main.tsx`에서 side-effect
    import로 한 번만 로드
  - `import.meta.env.DEV`에서만 적용 (프로덕션 빌드에는 영향 없음)
  - 필터 조건: `'GUEST_VIEW_MANAGER_CALL'` AND (`'ERR_ABORTED'` OR
    `'(-3)'`) — 스크린샷에 `ERR_ABORTED` 문자열이 없이 `(-3)`만 찍히는
    줄도 있었기 때문에 OR 조건 추가
  - Vite HMR로 모듈이 재평가돼도 `console.error`가 중복으로 감싸지지 않게
    `globalThis` 플래그로 중복 설치 방지
- 100% 효과 보장은 안 됨 (Electron 내부 로그가 실제 JS `console.error`
  경로를 타는 경우만 잡힘). 그래도 시도할 가치는 있음 — 남은 현실적
  접근이 이것뿐
- 우선순위: 기능 버그가 아니라 DevTools 노이즈라서 Gemini 버그, 웹슬롯보다
  낮음. 안 되면 오래 붙잡지 말고 보류

---

## [보류] MemoPanel / MemoDetailModal 분리

- 2026-06-30, 저위험 구조 리팩터(커밋 0~4b)에서 memo 관련 순수 헬퍼
  (`memoUtils.ts`)와 반복 렌더링 단위(`MemoCard.tsx`)는 `features/memos`로
  분리 완료. 메모 페이지 레이아웃 전체와 상세 모달은 의도적으로 main.tsx에
  남겨둠 (실패가 아니라 의식적 보류)
- 보류 사유: 상세 모달 안의 `navigateToMemoSource` 핸들러가 메모 도메인이
  아니라 Stage/Dock/webview 도메인 상태에 직접 의존함:
  ```ts
  const sourceSlot = slots.find((slot) => slot.providerId === memo.provider);
  webviewRefs.current[sourceSlot.id]?.loadURL?.(memo.sourceUrl);
  ```
  `slots`, `dockIds`, `moveSlotToStage`, `webviewRefs`를 props로 내려서
  분리할 수는 있지만, 그러면 "순수 memo 모달"이 아니라 "memo + 워크스페이스
  네비게이션 모달"이 되어 Stage/Dock 쪽 의존성이 features/memos로 새어
  들어감. 나중에 Stage/Dock을 분리할 때 다시 뜯어야 하는 구조라 지금 하는
  건 좋은 리팩터가 아니라 파일만 옮기는 것에 가까움
- 재개 조건: Stage/Dock 또는 webview navigation 계층을 정리하는 라운드에서
  함께 처리할 것. 그때 `navigateToMemoSource`는 main.tsx에 남기고 모달에는
  콜백 prop으로만 내려주는 방식(슬롯 상태 자체는 안 건드림)을 우선 검토

---

## [재시도 가능] 웹슬롯 1단계 — 2차 시도 실패했었지만, 진짜 원인은 포트 충돌로 밝혀짐

**시도 1 (2026-06-27, 실패 → 폐기)**
- 구현: Slot에 `kind: 'ai' | 'web'` 도입, `persist:webslot` partition 공유,
  UA 처리, URL 검증, 저장/복원 포함
- 증상: 구현 후 앱 재시작 시 기존 워크스테이션이 사이드바에서 통째로 사라짐
  (콘솔 에러 없이 조용히 사라짐), Claude 슬롯이 "New chat" 기본 화면(로그아웃
  상태)으로 보임
- 원인 진단(당시): `workspaceStore.ts`의 `isValidWorkspaceRecord`/
  `normalizeSlot`이 필드 하나라도 없으면 전체를 버리는 strict 검증 구조였음
- 조치: `git checkout -- .`로 변경사항 전체 폐기, main 복귀 확인
- **2026-06-29 정정: 이 진단이 정확했는지는 불확실해짐 (아래 "진짜 원인" 항목
  참고). 워크스테이션 소실/Claude 로그아웃 증상 자체가 코드 문제가 아니라
  dev 서버 포트 충돌이었을 가능성이 매우 높음**

**시도 2 (2026-06-28, 실패 → 폐기, 브랜치 `feature/web-slot-foundation` 삭제됨)**
- 1차 실패 반영해서 `workspaceStore.ts`를 lenient migration
  (`normalizeSlot`/`normalizeWorkspaceRecord`, 필드 없으면 기본값 채움)으로
  재작성, `Slot = AiSlot | WebSlot` discriminated union, `WEB_SLOT_PARTITION`,
  `isAiSlot()` 분기까지 구현. typecheck/build 통과
- **증상 A (확인 후 해결됨, 여전히 유효한 해법)**: 웹슬롯(Google Docs)에서
  hovercard 등 내부 subframe으로 navigate 시 그 URL이 슬롯의 `currentUrl`을
  덮어써서 빈 화면이 되는 문제
  - 원인: `main.tsx`의 `attachNavigationTracker` 안 `saveCurrentUrl`이
    `did-navigate`/`did-navigate-in-page`에서 `event.isMainFrame`을 체크하지
    않고 무조건 `currentUrl`을 갱신
  - 해결: `saveCurrentUrl` 최상단에 `if (event.isMainFrame === false) { ...; return; }`
    가드 추가. **코드로 직접 검증 완료 + 사용자 실사용 확인 완료. 맞는 해법이었음.
    다음 시도 때 1순위로 재적용할 것** (다시 디버깅할 필요 없음)
- **증상 B (당시엔 끝내 미해결로 결론났으나, 2026-06-29에 진짜 원인 확정됨)**:
  앱 재시작 후 기존 워크스테이션이 사이드바에서 다시 사라지고 Claude가
  로그아웃된 것처럼 보임 — 1차 때와 동일 증상 재발
  - 당시 가설: `groupStore.ts`의 `isValidSlot`이 `kind` 없는 슬롯을 검증만
    통과시키고 실제로 `kind: 'ai'`를 채워 반환하지 않아서, `isAiSlot()`이
    `false`로 판정 → `persist:webslot` partition으로 잘못 뜸
  - 이 가설대로 `groupStore.ts`를 normalize 패턴으로 고치고 코드 검증까지
    마쳤으나(실제로 새 객체에 `kind: 'ai'`를 채워 반환하도록 정확히 수정됨),
    그 직후에도 워크스테이션 소실이 재발해서 당시엔 "원인 미확정"으로 결론
  - 이때 발견한 사실은 여전히 유효함: **`groupStore.ts`의 `loadGroup()`은
    `main.tsx`에서 단 한 곳도 호출되지 않는 죽은 코드**(6/26에 워크스테이션
    기능 도입하면서 호출 제거됨, 앱은 항상 `createBlankGroup()`으로 시작).
    `workspaceStore.ts`의 `normalizeSlot`은 처음부터 정상이었음 (코드로
    재확인함)
  - **2026-06-29 진짜 원인 확정: 이 증상은 웹슬롯 코드와 무관했음.** 자세한
    내용은 바로 아래 "[해결됨] 진짜 원인: dev 서버 포트 충돌" 항목 참고
- 조치(당시): 워크스테이션 또 사라짐 확인 직후, `feature/web-slot-foundation`
  브랜치 통째로 폐기 및 **브랜치 삭제**. 커밋 없었음
- **2026-06-29 재평가**: 브랜치 폐기 결정 자체는 그 시점엔 합리적이었지만
  (재발 원인을 못 찾은 상태였으므로), 실제로는 이 브랜치 코드에 결함이
  없었을 가능성이 높음. 증상 A 해법(`isMainFrame` 가드)과 핵심 타입 구조
  (`AiSlot`/`WebSlot` discriminated union, `WEB_SLOT_PARTITION`,
  `isAiSlot()` 분기)는 3차 시도 때 그대로 재구현하면 됨, 새로 디버깅할
  필요 없음

**다음 시도 (3차) 시 방향**
- `isMainFrame` 가드(증상 A 해법)는 검증 끝났으니 그대로 재적용
- 타입 구조(`AiSlot`/`WebSlot`, `WEB_SLOT_PARTITION`, `isAiSlot()`)도 2차
  시도 때 만든 그대로 다시 짜면 됨 — 결함이 있었던 게 아니므로 처음부터
  새로 설계할 필요 없음
- `groupStore.ts`는 죽은 코드이므로 계속 의심 후순위. 혹시 이번에 손댈 일이
  생기면 먼저 `grep`으로 호출 여부 재확인
- **작업 시작 전, 그리고 "재시작 후 사라짐" 같은 증상을 보게 되면 코드를
  의심하기 전에 먼저 `lsof -ti:5173`으로 포트 점유 확인** (아래 "[해결됨]
  진짜 원인" 항목 참고) — 이걸 안 하면 1차/2차와 같은 헛삽질이 반복될 수 있음

---

## [해결됨, 2026-06-29] 진짜 원인: dev 서버 포트 충돌 (코드 문제 아니었음)

**증상**
- 앱을 켤 때마다 기존 워크스테이션이 사이드바에서 사라지고
  (`localStorage.getItem('omni-workspaces')`가 `null`), Claude 슬롯이 로그인
  안 된 것처럼 빈 화면으로 보임
- devtools 콘솔에 `GUEST_VIEW_MANAGER_CALL ... ERR_ABORTED (-3) loading
  'https://claude.ai/'` 등 5개 provider 전부에서 로딩 실패 에러 다수 발생
- 워크스테이션을 새로 만들면 `localStorage`에 정상적으로 저장되는 것까지는
  확인됨(저장 직후 `getItem`이 정상 JSON 출력) — 즉 저장 로직 자체는 문제
  없었음. 문제는 "재시작 후"에만 발생

**원인 추적 과정 (시행착오, 참고용)**
- 1차: `workspaceStore.ts`의 strict 검증 의심 → 코드 직접 수정/검증했으나
  무관함이 드러남
- 2차: `groupStore.ts`의 kind 미반영 의심 → 코드 직접 수정/검증했으나, 이
  파일이 실행 경로에서 호출조차 안 되는 죽은 코드임을 확인하며 무관함이
  드러남
- 맥북/한의원 PC 두 기기의 src.zip을 직접 diff 비교 → 줄바꿈(CRLF/LF) 차이만
  있고 코드 내용은 100% 동일함을 확인 → "코드가 다르다"는 가능성도 배제됨
- `npm run dev`의 터미널 출력을 직접 확인하면서 발견:
  ```
  Port 5173 is in use, trying another one...
  ➜  Local:   http://127.0.0.1:5174/
  ```

**진짜 원인**
- `package.json`의 dev 스크립트가 Electron에 넘기는 dev server URL을
  **`http://127.0.0.1:5173`으로 하드코딩**하고 있음:
  ```
  cross-env VITE_DEV_SERVER_URL=http://127.0.0.1:5173 electron .
  ```
- 이전 `npm run dev` 실행이 완전히 종료되지 않고 5173 포트를 점유한 채 좀비
  프로세스로 남아있으면, 다음 실행 시 Vite가 5173을 못 잡고 5174(또는 그 다음
  사용 가능한 포트)로 자동 이동함
- Electron은 환경변수에 박힌 5173을 그대로 로드 시도 → 그 포트에는 실제
  Vite 서버가 없거나 옛 프로세스가 응답 → 메인 윈도우(렌더러)가 제대로
  로드되지 않음 → `localStorage`도 그 깨진 렌더러 컨텍스트 기준이라 워크
  스테이션 데이터를 못 읽는 것처럼 보임, webview들도 덩달아 `ERR_ABORTED`
- 즉 1차/2차 시도에서 의심했던 `workspaceStore.ts`, `groupStore.ts`,
  `getProviderConfig` 폴백 등은 전부 **무죄**. 매번 "껏다 켰다"고 생각했던
  테스트가, 실은 좀비 프로세스 때문에 포트가 어긋난 상태에서 진행된 것

**해결**
```bash
lsof -ti:5173 | xargs kill -9
npm run dev
```
좀비 프로세스를 죽이고 다시 켜면, Vite가 정상적으로 5173에 뜨고 Electron이
정확히 그 포트를 로드 — 워크스테이션/Claude 정상 복구 확인됨

**다음에 같은 증상 만나면**
- 코드(`workspaceStore.ts`, `groupStore.ts` 등)를 의심하기 **전에** 먼저
  `lsof -ti:5173`으로 포트 점유 상태 확인, 필요하면 kill 후 재시작해서
  증상이 그대로인지부터 확인할 것
- 터미널에 `Port 5173 is in use, trying another one...`이 뜨는지 항상
  먼저 볼 것 — 이게 뜨면 그 세션의 모든 증상(워크스테이션 소실, Claude
  로그아웃, webview ERR_ABORTED 다수)은 포트 불일치 때문일 가능성이 매우 높음

**근본 조치 (아직 미적용, 다음 작업 후보)**
- dev 스크립트가 포트를 하드코딩하지 말고, Vite가 실제로 뜬 포트를 동적으로
  읽어서 Electron에 넘기도록 수정 — 안 그러면 5173이 막힐 때마다 동일 문제
  재발함

---

## [폐기된 접근법] Stage 3 — 탭 전환 시 webview 유지(retention)

- 2026-06-25 새벽, 탭 전환할 때 이전 탭의 webview를 살려두려는 시도
  (`recentTabIdsRef`, `retainedSlots`)
- 연쇄 버그: 비활성 탭 URL 갱신 안 됨 → partition 충돌 → 중복 제거하니
  retention 자체가 무의미해짐 → 최종적으로 Tab B의 슬롯이 Tab A에도
  나타나는 심각한 회귀 발생
- `updateSlotInOwningTab`으로 수정 시도했으나 결국 main(`bf57c91`)으로
  전체 revert
- **다시 시도하지 말 것**: "탭마다 webview를 유지해서 전환 시 깜빡임 없게"
  하려는 접근 자체. 지금 구조(탭은 트리거, Stage/Dock은 전역 싱글톤)가
  의도적으로 이 문제를 피한 설계임

---

## [폐기된 접근법] devtools 콘솔의 ERR_ABORTED 노이즈 제거 시도

- 2026-06-26 밤, `GUEST_VIEW_MANAGER_CALL ERR_ABORTED(-3)` 콘솔 노이즈를
  없애려고 `canGoBack()`/`canGoForward()`를 try/catch로 감싸는
  `feature/suppress-err-aborted-noise` 브랜치 시도
- 효과 없음 → 커밋 안 하고 버림
- 실제 기능에는 무해, 프로덕션 빌드에는 안 보임 → 이후 의도적으로 방치
  결정 (다시 손대지 않기로 함)

**2026-06-29 추가 메모 — 다시 시도한다면 다른 각도로**
- entitlement 리팩터 작업 중 같은 노이즈(`GUEST_VIEW_MANAGER_CALL ERR_ABORTED
  (-3)`, claude.ai/gemini.google.com/chatgpt.com 등 전 provider에서 반복)를
  다시 봄. 이번에도 기능에는 무해, entitlement 작업과는 무관함을 확인
- 폐기된 `feature/suppress-err-aborted-noise`는 렌더러 쪽 코드
  (`canGoBack()`/`canGoForward()`)를 try/catch로 감싸는 접근이었는데, 이
  에러는 Electron의 webview 내부 IPC 브릿지(guest view ↔ 메인 프로세스)
  레벨에서 navigate/reload 도중 끊기며 발생하는 것으로 추정됨 — 즉 렌더러
  코드를 감싸는 방식 자체가 발생 지점을 안 건드렸을 가능성이 높음. 같은
  접근으로 재시도하면 같은 이유로 또 실패할 듯
- 다음에 다시 도전한다면 아직 안 시도해본 다른 각도: webview의
  `did-fail-load` 이벤트에서 `errorCode === -3`(ABORTED)인 경우를 필터링해서
  콘솔에 안 찍히게 하는 방식 (메인 프로세스/electron 레벨 핸들러 쪽 접근,
  렌더러 쪽이 아님)
- 우선순위 낮음, 별도 세션에서. 지금 진행 중인 저위험 리팩터(entitlement,
  repository, memo UI 이동)와는 분리해서 진행할 것 — 같이 묶으면 회귀
  원인 추적이 헷갈림

---

## [경과 불명, 확인 필요] 6/23 오전 — "메모보드 스크롤" 커밋 머지 여부

- 2026-06-23 오전 세션 종료 시점에 "Make memo board scrollable" 커밋이
  실제로 main에 머지됐는지 불확실한 상태로 끝남
- 이후 세션에서 별도로 재확인했다는 기록 없음 — 현재 메모 패널이 정상
  스크롤되는지 한 번 가볍게 확인해볼 가치 있음 (낮은 우선순위)
