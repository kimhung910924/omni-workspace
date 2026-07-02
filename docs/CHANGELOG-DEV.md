# Omni Workspace 개발 히스토리

> 날짜 / 작업 / 문제 / 해결 형식으로 정리. 최신이 위로 오게 배치(최신순).
> 같은 문제를 다시 만났을 때 검색해서 찾아보는 용도.

---
## 2026-07-02 — 웹슬롯 즐겨찾기 3단계(B1/B2), 즐겨찾기바, 웹슬롯 모바일뷰/줌

**작업 — 즐겨찾기 3단계-B1 (사이드바 관리자 UI)**

* 사이드바 "즐겨찾기" 탭을 클릭-오픈형에서 순수 관리 화면으로 전환 — 카드
  클릭해도 더 이상 웹슬롯 안 열림, 대신 카드에 폴더 이동 `<select>` 추가
* 좌측 폴더 목록(1단 구조, 전체/미분류/폴더별 개수 표시) + 우측 그리드
  2컬럼 레이아웃(`favorites-manager`, `favorites-folder-list`,
  `favorites-grid-area` 신규 class)
* "새 폴더"/"이름수정"이 `window.prompt()` 대신 진짜 모달로 교체됨 —
  기존에 "새 폴더 버튼이 안 눌린다"고 보였던 증상은 사실 `window.prompt()`가
  Electron 렌더러에서 불안정했던 것으로 추정, 모달 교체로 자연히 해결

**문제 — 네이버 등 웹슬롯에서 내부 링크 클릭 시 별도 네이티브 팝업 창으로
튐**

* 원인: `electron/main.ts`의 `setWindowOpenHandler`가 모든 webview의
  `window.open()`/`target="_blank"`를 무조건 새 `BrowserWindow` 팝업으로
  띄우던 구조. 원래 Gemini 등 AI provider의 Google OAuth 팝업 로그인을 위해
  만든 동작인데, 웹슬롯(포털 사이트류)에는 안 맞음
* 해결: `contents.session === session.fromPartition(WEBSLOT_PARTITION)`으로
  웹슬롯 여부 판별 → 웹슬롯이면 팝업 대신 같은 webview에서 `loadURL`로
  이동(`action: 'deny'`), AI provider는 기존 팝업 동작 그대로 유지
* 회귀 테스트: Gemini 로그아웃 후 재로그인 팝업 정상 작동 확인

**작업 — 즐겨찾기 3단계-B2 (별표 팝오버, 케밥 메뉴)**

* SlotHeader 별표 버튼을 "클릭 시 즉시 저장, 피드백 없음" 방식에서 크롬
  스타일 팝오버(제목 입력 + 폴더 선택 + 완료/삭제)로 교체
* SlotHeader에 케밥(⋯) 메뉴 신규 추가(웹슬롯 전용) — "즐겨찾기에서 열기"
  항목으로 저장된 즐겨찾기 목록을 보여주고, 클릭 시 **현재 슬롯이 그 URL로
  이동**(새 슬롯 생성 아님)

**결정사항 — 즐겨찾기바 설계, 중간에 전역 → 슬롯별로 방향 전환**

* 최초 설계: Stage 상단에 전역으로 한 번 렌더링, 클릭 시 "활성 슬롯이
  웹슬롯이면 그 슬롯 이동, 아니면 새 슬롯 생성" 폴백 방식으로 구현 지시함
* 흥기님 피드백으로 재설계: 즐겨찾기바는 전역이 아니라 **웹슬롯 하나하나의
  SlotHeader 바로 아래 붙는 것**이 맞는 개념이었음(AI 슬롯엔 아예 없음).
  이러면 "어느 슬롯이 이동할지" 모호함 자체가 사라짐 — 그 바가 속한 슬롯
  자신만 이동
* 최종 구현: `features/favorites/BookmarkBar.tsx` 독립 컴포넌트로 분리
  (슬롯마다 별도 인스턴스로 자기 너비를 각자 측정해야 하므로). 미분류
  즐겨찾기는 개별 pill, 폴더는 폴더 pill(클릭 시 드롭다운). 컨테이너 너비
  넘치면 크롬처럼 "더보기(»)" 드롭다운(ResizeObserver + 항목 offsetWidth
  누적 측정 방식, 스크롤 방식은 폐기)
* 케밥 메뉴에 즐겨찾기바 표시/숨기기 토글 추가, `localStorage` 영속
  (`omni-bookmark-bar-visible`), 기본값 true
* Dock "+"의 즐겨찾기 선택 흐름(`handleOpenFavorite`, 새 슬롯 생성)은
  건드리지 않음 — 그건 여전히 유효한 별개 동작

**작업 — 웹슬롯 모바일뷰 / 줌 조절 (케밥 메뉴), 3단계 시행착오**

* 데스크탑 모드에서 줌 +/- 조절(`webview.setZoomFactor`)은 1차 시도로 바로
  성공
* 모바일뷰 전환은 세 번의 시행착오 끝에 해결:
  1. `enableDeviceEmulation`(뷰포트 크기만 속임)만으로 시도 → 실패, 케밥
     텍스트는 토글되는데 페이지가 전혀 반응 안 함
  2. `fitToView: true` 파라미터 추가 → 여전히 실패
  3. **진짜 원인 확정**: 뷰포트 문제가 아니라 User-Agent 문제였음 — 네이버 등
     사이트는 화면 크기가 아니라 UA로 모바일 여부를 판별해서 서버가 계속
     데스크탑 HTML을 내려주고 있었음. `<webview>.setUserAgent()`로 그
     슬롯만 콕 집어 모바일 UA로 전환하는 방식으로 해결 (세션/파티션 분리
     없이 webview 인스턴스 메서드만으로 가능했음 — B안(파티션 분리)까지
     안 가도 됐음)
* 추가 버그: 모바일 UA로 전환하면 네이버가 서버 단에서 `m.naver.com`으로
  리다이렉트시키는데, 데스크탑으로 복귀할 때 단순 `reload()`만 하면 이미
  옮겨간 모바일 도메인을 다시 불러올 뿐이라 원래 주소로 안 돌아오던 문제
  발견 → 모바일 전환 직전 URL을 `desktopUrlBeforeMobileRef`에 캐싱해뒀다가,
  데스크탑 복귀 시 `reload()` 대신 그 URL로 `loadURL()` 하는 방식으로 해결
* **알려진 한계로 확정, 더 이상 시도 안 함**: Google Docs는 모바일 UA로
  접속하면 로그인 세션이 유효해도 `workspace.google.com` 마케팅
  페이지나 "앱 다운로드" 유도 화면으로 강제 전환됨. 이건 Google이 모바일
  웹 문서 편집 자체를 의도적으로 막고 앱 사용을 유도하는 정책이라, UA/쿠키/
  세션 조작으로 우회 불가. 실제 안드로이드 Dex 모드에서도 동일 현상 확인
  (흥기님 실사용 경험). 사이트별 대응이 필요한 영역이라 별도 예외처리(예:
  docs.google.com일 때 모바일뷰 버튼 숨김) 여부는 보류

**브랜치**: `feature/favorites-manager-ui`(B1 + 팝업버그) → main 머지 완료,
`feature/favorites-star-kebab`(B2) → main 머지 완료,
`feature/favorites-bookmark-bar` → `feature/bookmark-bar-per-slot`으로
재설계 후 진행, `feature/webview-zoom-mobile-view` → main 머지 예정

## 2026-07-01 — Gemini 워크스테이션 재오픈 복원 실패, 원인을 Google 자체 버그로 최종 확정 (우리 쪽 작업 종료)

**작업**

- 지난 세션(2026-06-30)에서 4단계까지 수정하고도 남아있던 잔여 이슈
  ("워크스테이션을 닫았다 다시 열면 Gemini Gem 대화가 약 10번 중 2번만
  자동 복원되고 나머지는 '삭제된 잼으로 생성된 대화입니다' 후 그 젬의
  채팅 목록으로 튕김")를 이어서 진단
- selector 기반 "대화 렌더링 여부" 판정 시도 → 라이브 DevTools로 직접
  검증한 결과 정상 대화에서도 `false`만 나옴, 즉 selector 추측 자체가
  틀렸음을 확인 (`user-query`, `model-response` 등은 실제 Gemini DOM과
  불일치)
- 대안으로 `document.body.innerText.length` 기반 임계값 판정으로 전환,
  실측 데이터로 검증: 성공 시 10,924자, 실패 시 853자/1,160자(측정마다
  다름 — "최근 대화" 목록이 시점마다 바뀌기 때문으로 추정). 성공/실패
  사이 8배 이상 차이가 나서 안정적 판정 가능함을 확인
- Codex 지시문까지 작성(텍스트 길이 임계값 프로브 + reload →
  loadURL(no-cache) → reloadIgnoringCache 3단계 에스컬레이션 재시도)했으나,
  **적용 직전 최종 검증 단계에서 원인이 완전히 다른 곳에 있음을 발견**
  (아래 "최종 결론" 참고) → 이 지시문은 커밋하지 않고 폐기

**최종 결론 — 이 이슈는 우리 코드가 원인이 아니며, 우리 쪽에서 고칠 수 없음**

실패가 뜬 상태에서 그 Gemini 딥링크 URL을 그대로 복사해 다음 세 가지
환경에서 각각 열어봄:

1. Omni Workspace(Electron webview) — 실패
2. **순정 Chrome 브라우저 주소창에 직접 붙여넣기** — 동일하게 실패
3. **Chrome 자체 탭그룹 기능으로 열기** — 동일하게 실패

3번(Chrome 자체 탭그룹)까지 동일하게 재현된다는 것이 결정적 증거.
이는 Electron/webview/User-Agent/우리 앱의 코드 구조와 완전히 무관하게,
**Google이 자기 자신의 1st-party 브라우저에서 자기 자신의 1st-party
웹앱을 열 때도 발생하는 Gemini 자체 버그**임을 뜻함. 순정 Chrome에서도
재현율이 간헐적(체감상 5번 중 1번 정도만 성공)이라, 순수 레이스 컨디션으로
추정됨 (Gemini SPA의 라우터가 "내 Gem 목록/대화 목록" 비동기 데이터
도착보다 먼저 딥링크 경로를 판정해버리면 실패하는 구조로 추정).

**폐기된 가설들 (모두 실측으로 반증됨, 재시도 금지)**

- User-Agent 위장(순정 Chrome UA로 스푸핑) — "F5로는 거의 안 살아나고
  앱 재시작으로는 가끔 살아난다"는 관찰과 애초에 모순(UA는 둘 다 동일).
  결정적으로 크롬 탭그룹에서도 동일하게 실패하므로 UA는 애초에 무관했음이
  확정됨
- selector 기반 DOM 렌더링 판정 (`user-query`, `model-response` 등) —
  정상 대화에서도 라이브 검증 결과 `false`만 나와 기각. Angular 커스텀
  태그 이름을 추측으로 맞히려 한 접근 자체가 비효율적이었음
- 텍스트 길이 임계값 + 3단계 캐시 무시 에스컬레이션 재시도 — 로직
  자체는 유효했으나(성공/실패 판정 정확도는 실측으로 검증됨), 원인이
  Google 자체 버그로 확정되면서 "이 정도 완화책을 우리 앱에 추가할
  가치가 있는가"를 재검토 → **적용하지 않기로 결정, 지시문 폐기**
- URL 저장 로직 의심 — 재차 확인했으나 여전히 무죄. 저장된 값과
  `webview.getURL()`은 항상 정확히 일치함. **URL 저장/복원 코드는
  전혀 건드리지 않음**

**결정사항**

- 이 이슈에 대한 추가 코드 작업(우리 쪽)은 **완전히 중단**. Google이
  자체적으로 고칠 때까지 근본 해결 불가능한 영역으로 확정
- URL 저장/복원 로직은 그대로 유지(변경 없음) — 애초에 문제가 없었음
- 커밋되지 않은 관련 브랜치/변경사항은 전부 버리고 main으로 복귀
- 메모리(memory_user_edits)에 이 결론을 기록해, 다음 세션에서 같은
  가설(UA 위장, cold-load 워밍업, WebContentsView 이관 등)을 또 시도하는
  일이 없도록 조치함

**문제**

- 없음(진단 세션, 결론은 "우리 문제 아님"으로 확정)

---
## 2026-06-30 — Gemini 튕김 버그 근본 수정 (webview src 피드백 루프 + 무한루프 + 탭 전환 URL 유실)

**배경**

`docs/IN-PROGRESS.md`의 "[막힘, 최우선] Gemini 채팅 클릭/메시지 전송 시 홈 화면으로
튕기는 문제" 항목을 이어서 진행. 핵심 발견은 단일 원인이 아니라 **레이어가 다른
네 가지 문제가 겹쳐 있었다**는 것.

**진단 1 — webview src 피드백 루프 (확정, 수정 완료)**

`<webview src={slot.currentUrl}>` 구조에서 `did-navigate-in-page`가 `currentUrl`
state를 갱신할 때마다 React가 `src`를 재할당 → 살아있는 webview가 강제 full
reload됨. Gemini 딥링크는 fresh reload 시 홈/젬 목록으로 튕기고, Claude/ChatGPT는
같은 메커니즘이 "깜빡임"으로만 보였음(딥링크가 fresh load에 강해서).

대조 실험(Gemini만 currentUrl 갱신 임시 차단)으로 원인 확정. 수정: 슬롯별 초기
src를 `initialWebviewSrcBySlotIdRef`(ref)에 마운트 시 1회만 고정(`??=`), 이후
`currentUrl` state 변경이 살아있는 webview의 `src`에 되먹임되지 않게 함.
`currentUrl` state는 저장/복원용으로 계속 추적. ref 정리는 `!webview` null 분기,
`cleanupTabSlotState`, `closeSlot` 3곳에서.

부수 효과: 콘솔의 `GUEST_VIEW_MANAGER_CALL ERR_ABORTED (-3)` 노이즈가 크게 감소
(강제 reload로 인한 navigation abort 흔적이었던 것으로 추정).

**진단 2 — 탭 전환 시 URL 갱신이 엉뚱한 탭에 적용됨 (확정, 수정 완료)**

`setGroup`이 `activeTabId`를 클로저로 캡처해서 항상 "현재 active한 탭"만
patch함. Gemini에서 navigate가 발생한 직후 사용자가 다른 탭으로 전환하면, 그
navigate 이벤트가 처리되는 시점엔 이미 activeTabId가 바뀌어 있어 엉뚱한(또는
존재하지 않는) 슬롯을 patch 시도 → 원래 탭의 Gemini URL이 영원히 갱신 안 됨.

수정: `attachNavigationTracker`가 `slot`과 함께 `ownerTabId`(그 슬롯이 실제로
속한 탭 id)를 캡처하도록 시그니처 확장. `saveCurrentUrl`/`updateSlotTitle`이
`setGroupRef`(activeTabId 의존) 대신 `ownerTabId`를 직접 대상으로 하는 `setTabs`
호출로 전환.

**진단 3 — ref callback 무한 재생성 루프 (자체 회귀, 발견 즉시 수정)**

진단 2의 ownerTabId 패치 도입 과정에서, `attachNavigationTracker`의 `!webview`
정리 분기가 `webviewRefCallbacks`/`webviewRefCallbackOwnerTabIdsRef`까지 같이
지우도록 잘못 구현됨. React가 ref를 `null`로 호출(표준 cleanup)할 때마다 이
캐시가 지워지고, 다음 렌더에서 owner 비교가 매번 "다르다"고 오판해 콜백을
새로 생성 → React가 다시 `null`/재attach를 반복하는 무한 루프 발생. 증상은
Gemini 즉시 튕김 재발 + Claude/ChatGPT/Grok 깜빡임 폭증 + ERR_ABORTED 콘솔
노이즈 폭증으로 나타남(거의 매 렌더마다 강제 reload).

수정: `!webview` 분기에서는 `webviewRefs`/`webviewReadyRef`/
`initialWebviewSrcBySlotIdRef`만 정리하고, `webviewRefCallbacks`/
`webviewRefCallbackOwnerTabIdsRef` 정리는 `cleanupTabSlotState`/`closeSlot`
(슬롯이 진짜로 사라질 때)에만 맡김.

**진단 4 — 탭 전환 시 webview unmount/remount (확정, 수정 완료)**

`slots`가 `activeTab.group.slots`에서만 오는 구조라, 탭 전환 시 비활성 탭의
webview가 전부 unmount되고 재진입 시 새로 mount됨(메모리의 "webview never
unmount" 원칙이 탭 단위로는 깨져 있었던 셈). Gemini 딥링크가 fresh load될 때마다
같은 튕김 재발.

수정: 렌더링을 `activeTab.group.slots`가 아니라 `tabs.flatMap(ownerTab =>
ownerTab.group.slots...)`로 변경해 **열린 모든 탭의 webview를 항상 mount 유지**,
`display:none`으로만 숨김(activeTabId와 ownerTab.id 일치 + Stage 포함 여부로
가시성 결정). `key`는 `${ownerTab.id}:${slot.id}`로 충돌 방지.
`getSlotWebviewRef(slot, ownerTab.id)`로 owner 일관성 유지.

⚠️ 2026-06-25 새벽에 시도했던 webview retention(recentTabIdsRef/retainedSlots
방식)과는 구조가 다름 — 그때는 슬롯을 다른 탭으로 동적 재할당하려다 partition
충돌과 탭 간 슬롯 누출 회귀로 전체 revert됨. 이번 방식은 각 탭이 자신의
group.slots를 영구 소유한 채 단순히 계속 렌더만 하는 거라 슬롯 소유권 이동이
없음.

**시도했으나 실패하고 되돌린 것 — webview src를 about:blank로 시작 후 dom-ready
시 loadURL (되돌림)**

워크스페이스를 **닫았다가 다시 여는**(진짜 webview가 새로 생성되는) 경우, Gemini
딥링크 fresh load가 가끔(10번 중 약 8번) 빈 화면을 보여주는 잔여 문제가 확인됨.
원인으로 "webview 마운트 시 src 속성이 게스트 프로세스 연결 전에 너무 일찍
설정돼 발생하는 초기 네비게이션 레이스"를 추정, src를 비워두고 dom-ready 이후에
loadURL로 명령형 초기 네비게이션을 하는 방식을 시도.

결과: 모든 provider가 완전히 빈 화면(about:blank)에서 멈추는 더 심각한 회귀
발생, 콘솔 에러조차 안 뜸(=loadURL이 아예 호출 안 됨, 즉 dom-ready 자체가
발생하지 않은 것으로 추정 — Electron webview가 src 없이는 게스트 프로세스를
안 만드는 것으로 보임). src="about:blank" 명시로 재시도했으나, about:blank의
dom-ready가 트리비얼하게 빨리 발생해 오히려 원래보다 레이스가 심해짐(10번 모두
실패, 수동 새로고침도 안 먹힘).

**진단 3까지의 안전한 상태로 되돌리고 이 시도는 폐기.** 더 이상 진행하지 않음.

**남은 미해결 문제**

워크스페이스를 닫았다가 다시 여는 경우(진짜 새 webview 생성), Gemini 딥링크
fresh load가 약 10번 중 2번만 즉시 성공하고 나머지는 빈 화면(Gemini SPA가
세션/인증 컨텍스트를 못 채우고 기본 화면을 그리는 것으로 추정)을 보여줌. 수동
새로고침으로는 결국 항상(4~5회 이내) 성공함이 확인됨. 자동 재시도(reload loop)
방식도 검토했으나 "막 정상 렌더링되던 것도 강제로 끊어버릴 수 있다"는 구조적
결함 때문에 보류함. **탭 전환과 일반 대화(`/app/{id}`) 복원은 100% 정상** —
영향받는 건 Gem/프로젝트 채팅(`/gem/.../...`)을 워크스페이스 재오픈으로 복원하는
경우로 한정됨.

**검증 방식**: 매 단계 Codex 작업 → src.zip 직접 추출해 diff/grep으로 코드
레벨 검증(보고 텍스트만 믿지 않음) → 흥기님이 직접 Electron 앱에서 손으로
반복 클릭/재현(클릭 자동화는 macOS 접근권한 문제로 Codex가 못 함) → 통과 시
커밋. localStorage(`omni-workspaces`)와 live webview DOM(`getURL()`, `src`
attribute)을 직접 비교하는 진단 스크립트로 "저장은 항상 정확했고, 문제는
복원 타이밍/레이스였다"는 것을 실측으로 확인.


## 2026-06-30 — 저위험 구조 리팩터 1차 완료 (entitlement, data repository, memo 일부 분리)

**배경**

`main.tsx`가 3,180줄 단일 파일에 탭/워크스테이션/Stage/Dock/메모/Broadcast가
전부 뭉쳐있는 구조를 정리하기로 함. 한 번에 다 뜯으면 디버깅이 어려워지므로
위험도 순으로 범위를 좁혀 진행: 저위험(데이터 계층, entitlement, memo
일부) → 중위험(워크스테이션, 브로드캐스트, 탭) → 고위험(Stage/Dock
드래그앤드롭)은 다음 라운드로 미룸. 6개 커밋으로 쪼개 각 커밋마다 Codex
지시문 → src.zip 검증 → 사용자 직접 커밋/머지 절차를 거침. **전체 6개
커밋 모두 동작 변경 없음(앱 외관/저장 포맷/기능 동일)이 목표였고 달성됨.**

**커밋 0 — groupStore 죽은 코드 제거**
- `groupStore.ts`의 `loadGroup()`/`saveGroup()`이 실행 경로에서 호출되지
  않는 죽은 코드임을 grep으로 확인 (6/26 IN-PROGRESS 기록과 일치)
- `Group` 타입만 `types.ts`로 이동, 파일 삭제
- 브랜치: `refactor/remove-dead-groupstore`

**커밋 1 — entitlement 계층 추가**
- `src/renderer/entitlement/` 신설: `planTypes.ts`, `planConfig.ts`,
  `useEntitlement.ts`
- `PlanId = 'free' | 'pro' | 'promax'`, `PLAN_CONFIG`(satisfies
  `Record<PlanId, PlanLimits>`)로 무료(2탭/2슬롯/분할2), 프로/프로맥스
  (4탭/8슬롯/분할4) 정의
- `main.tsx`의 하드코딩 상수(`MAX_TABS=4`, `MAX_SLOTS=8`,
  `MAX_STAGE_SLOTS=4`)를 `useEntitlement()` 훅으로 대체. `CURRENT_MOCK_PLAN`은
  `'pro'`로 고정 (현재 앱 동작과 동일하게 유지하기 위함 — `'free'`로 두면
  탭/슬롯 수가 줄어드는 회귀가 생김)
- 사용처 20곳 이상은 변수명을 그대로 유지해 한 줄도 수정하지 않음
- 브랜치: `refactor/add-entitlement`

**커밋 2 — data repository 계층 추가**
- `src/renderer/data/repositories.ts`에 `WorkspaceRepository`,
  `MemoRepository` 인터페이스 정의
- `workspaceStore.ts`(전체)를 `data/local/localWorkspaceRepository.ts`로,
  `memoStore.ts`의 localStorage IO 부분(`loadMemos`/`saveMemos`)을
  `data/local/localMemoRepository.ts`로 이동. 내부 로직/검증 함수는 한 글자도
  변경하지 않고 import 경로만 위치에 맞게 조정
- `createMemo`(순수 팩토리 함수, IO 없음)는 `features/memos/memoStore.ts`에
  그대로 유지 — repository로 옮기지 않음
- `main.tsx`의 15개 호출부를 `workspaceRepository.list()` 등으로 1:1 교체
- `data/sync/README.md` 추가: "local repository는 교체 대상이 아니라
  1차 저장소, Supabase는 향후 동기화 보조 계층" 원칙 기록
- localStorage key(`omni-workspaces`, `omni-memos`)와 JSON 포맷은 변경 없음
- 브랜치: `refactor/add-data-repositories`

**커밋 3 — PersistedMeta 옵셔널 필드 추가**
- `data/persistedMeta.ts`에 `SyncState`, `PersistedMeta`
  (`schemaVersion?`, `deletedAt?`, `syncState?`, `lastSyncedAt?`) 신설
- `WorkspaceRecord`, `Memo` 타입에 `& PersistedMeta` 교차 타입으로 추가.
  `createdAt`/`updatedAt`은 두 타입이 각각 string/number로 의미가 달라
  PersistedMeta에 포함하지 않음
- 순환 의존 방지를 위해 `PersistedMeta`를 `repositories.ts`가 아닌 독립
  파일에 정의 (`repositories.ts`가 `WorkspaceRecord`/`Memo`를 import하므로,
  반대 방향 import 시 순환 발생)
- 모든 필드 옵셔널이라 기존 검증 로직(`isValidWorkspaceRecord`, `isMemo`)과
  생성 함수는 수정 없이 그대로 통과. 필드를 실제로 읽거나 쓰는 로직은
  추가하지 않음 (타입만 존재)
- 브랜치: `refactor/add-persisted-meta`

**커밋 4a — memo 순수 헬퍼 함수 분리**
- `formatMemoDate`, `getMemoProviderLabel`, `getMemoDisplayTitle`,
  `isNavigableProvider`, `getSourceHint`를
  `features/memos/memoUtils.ts`로 이동
- `getMemoProviderLabel`이 참조하던 `PROVIDER_LABELS` 상수는 `main.tsx`에서
  `providerLabels.ts`로 분리(순환 의존 방지 — memoUtils가 main.tsx를 직접
  import하지 않도록)
- 브랜치: `refactor/extract-memo-utils`

**커밋 4b — MemoCard 컴포넌트 분리**
- `main.tsx`의 `renderMemoCard` 클로저를 `features/memos/MemoCard.tsx`
  컴포넌트로 분리. JSX 구조/className/문구는 diff로 한 줄씩 대조해 완전히
  동일함 확인 (들여쓰기와 `key` 위치 변경만 차이)
- `key={memo.id}`는 컴포넌트 내부가 아니라 `pinnedMemos.map`/
  `unpinnedMemos.map` 호출부에서만 부여 (React list key 원칙)
- 이 프로젝트가 `jsx: 'react-jsx'` 설정이라 `import React from 'react'`가
  불필요함을 `SlotHeader.tsx` 사례로 확인, MemoCard.tsx에도 추가 안 함
- `openMemoDetail`/`updateMemo`/`copyMemo`/`deleteMemo`는 memos state를
  직접 참조하므로 main.tsx에 그대로 두고 props로 전달
- 브랜치: `refactor/extract-memo-card`

**의도적으로 멈춘 지점 (4c, 보류)**
- 메모 페이지 레이아웃 전체와 상세 모달(`MemoDetailModal`)은 이번 라운드에서
  분리하지 않기로 결정. 자세한 사유는 `docs/IN-PROGRESS.md`의 "[보류]
  MemoPanel/MemoDetailModal 분리" 항목 참고 — 요약하면 `navigateToMemoSource`
  핸들러가 `slots`/`dockIds`/`webviewRefs`(Stage/Dock 도메인)에 직접
  의존해서, 지금 분리하면 Stage/Dock 분리 작업 때 다시 뜯어야 함

**검증 방식**
- 매 커밋마다: 작업 전 `git status`/브랜치 확인 → Codex 작업 → src.zip
  업로드 → Claude가 zip을 직접 풀어 코드 레벨로 diff 검증(보고된 압축
  diff/diffstat을 그대로 믿지 않고 원본과 바이트 단위 비교) → 통과 시
  사용자가 직접 커밋/push/머지
- 중간에 브랜치 머지 누락 1건 발생(`refactor/add-entitlement` 위에서 커밋
  2 작업을 이어서 진행) — 발견 즉시 새 브랜치로 분리해 복구. 이후 머지
  순서를 매번 명확히 안내하는 절차로 보완

## 2026-06-29 — "Claude 고장/워크스테이션 소실"의 진짜 원인 발견 (포트 충돌)
npm run dev 좀비 프로세스가 5173 포트 점유 → Vite가 5174로 밀림 → Electron은 하드코딩된 5173 계속 로드 시도 → 메인 윈도우/webview 전부 깨짐. lsof -ti:5173 | xargs kill -9로 해결됨. 1차/2차 시도 때 의심했던 groupStore.ts/workspaceStore.ts 코드는 무죄였다는 것도 명시

## 2026-06-28 — 웹슬롯 1단계 2차 시도 실패, 브랜치 폐기 (Claude 로그아웃 원인 미확정)

**작업**
- 1차 실패(워크스테이션 strict 검증 버그) 반영해서 새 브랜치
  `feature/web-slot-foundation`에서 재작성. `Slot = AiSlot | WebSlot`
  discriminated union, `workspaceStore.ts` lenient migration
  (`normalizeSlot`/`normalizeWorkspaceRecord`), `WEB_SLOT_PARTITION`,
  `isAiSlot()` 분기, 웹슬롯 추가 모달(URL 입력), favicon/제목 표시까지 구현
- Codex 보고: typecheck/build 통과

**증상 A — 발견 및 해결**
- Google Docs 웹슬롯에서 이메일 호버카드 등 내부 subframe 이동 시
  `contacts.google.com/widget/hovercard/...` URL이 슬롯의 `currentUrl`을
  덮어써서 빈 화면이 되는 문제

**원인 A**
- `main.tsx`의 `attachNavigationTracker` 안 `saveCurrentUrl`이
  `did-navigate`/`did-navigate-in-page`에서 `event.isMainFrame`을 체크하지
  않고 모든 navigation을 그대로 `currentUrl`에 반영

**해결 A**
- `saveCurrentUrl` 최상단에 `if (event.isMainFrame === false) { updateSlotNavigationState(slotId); return; }`
  가드 추가. 코드 검증 + 실사용 확인 완료 — **유효한 해법으로 확정**

**증상 B — 재발, 끝내 미해결**
- 위 수정 이후 앱을 다시 켜자 기존 워크스테이션이 사이드바에서 또 사라지고
  Claude 슬롯이 로그아웃 상태로 보임 — 1차 시도와 동일 증상 재발

**원인 B 추적 과정**
- 1차 가설: `groupStore.ts`의 `isValidSlot`이 `kind` 없는 슬롯을 검증만
  통과시키고 실제로는 `kind: 'ai'`를 채워 반환하지 않아 `isAiSlot()`이
  `false`로 판정되고, 그 결과 기존 Claude 슬롯이 `persist:webslot`
  partition으로 잘못 떴을 것이라는 진단(ChatGPT 진단, Claude 코드 검증으로
  재확인)
- 이 가설대로 `groupStore.ts`에 `normalizeSlot`/`normalizeGroup`을 추가해
  실제로 새 객체에 `kind: 'ai'`를 채워 반환하도록 수정 완료, 코드로 정확성
  재검증까지 마침
- **하지만 그 수정 적용 후에도 워크스테이션 소실이 또 재발**
- 추가 조사 결과: `groupStore.ts`의 `loadGroup()`은 `main.tsx`에서 단 한
  곳도 호출되지 않는 **죽은 코드**였음 (6/26 워크스테이션 기능 도입 시
  `loadGroup()` 호출이 이미 제거됨, 앱은 항상 `createBlankGroup()`으로 시작).
  `workspaceStore.ts`의 `normalizeSlot`은 1차/2차 모두 처음부터 정상이었음
  (코드로 재확인)
- **결론: 증상 B의 진짜 원인은 2차 시도에서도 끝내 특정 못함.** 의심했던
  두 파일(`groupStore.ts`, `workspaceStore.ts`) 모두 원인이 아니었을
  가능성이 높음 — webview 렌더링 JSX 단계 또는 state 전달 과정의 다른
  지점일 것으로 추정, 미확정 상태로 다음 시도로 이전

**조치**
- `feature/web-slot-foundation` 브랜치 작업 전체 폐기, **브랜치 삭제**.
  커밋 없었음, main 복귀
- 상세 시행착오 기록은 `docs/IN-PROGRESS.md` 참고


## 2026-06-27 (밤) — 웹슬롯 1단계 1차 시도 실패 (워크스테이션 데이터 소실 버그)

**작업**
- `feature/web-slot-foundation` 브랜치에서 웹슬롯 1단계 구현 (Slot kind 분리,
  persist:webslot partition, UA 처리, URL 검증, 저장/복원 포함)
- Codex 보고: typecheck/build 통과, getProviderConfig 호출부 점검 완료

**증상**
- 구현 후 Google Docs 웹슬롯 로그인은 정상 동작 확인
- 하지만 앱을 재시작하면 기존에 저장해둔 워크스테이션이 사이드바에서
  통째로 사라짐 (콘솔에 에러 없이 조용히 사라짐)
- 동시에 Claude 슬롯이 로그아웃 상태(New chat 기본 화면)로 보이는 현상도
  관찰됨 — 단, 이건 별개 증상일 가능성 있어 추가 확인 필요로 남김

**원인 진단 과정**
- 콘솔의 `GUEST_VIEW_MANAGER_CALL ERR_ABORTED(-3)` 노이즈는 6/26에 이미
  "무해, 방치 결정"했던 것과 동일한 노이즈로 확인 — 원인 아님
- `git stash` + `git checkout main`으로 머지 전 상태로 되돌려서 동일하게
  테스트 → 워크스테이션 정상 유지, Claude 로그인도 정상
  → `feature/web-slot-foundation`이 원인임을 확정

**원인**
- `workspaceStore.ts`의 `isValidWorkspaceRecord()`가 `createdAt`,
  `updatedAt`, `dockMinimized` 등 모든 필드가 정확히 존재해야만 유효한
  워크스테이션으로 인정하는 엄격한(strict) 검증 구조였음
- `loadWorkspaceRecords()`에서 `filter(isValidWorkspaceRecord)`로 거르는데,
  기존에 저장된 워크스테이션 데이터가 새 스키마 검증 기준과 완전히
  일치하지 않아 전체가 필터링되어 사라짐
- `normalizeSlot()`도 동일한 패턴 — 슬롯 필드 중 하나라도 안 맞으면
  슬롯 전체를 `null` 처리해서 버림
- 콘솔 에러가 안 뜨는 이유: 타입 검증 실패가 예외(throw)가 아니라
  단순 `filter`로 조용히 빠지는 구조라서 에러 로그 자체가 안 남음

**조치**
- `git checkout -- .` 로 작업 디렉토리 변경사항 전체 폐기, main으로 복귀
- 워크스테이션/Claude 로그인 정상 상태 확인 완료
- 1단계 재시도 결정: 검증 로직을 "느슨하게(lenient)" — 필드 없으면
  기본값으로 채워서 통과시키는 방식으로 재작성하여 새 채팅에서 다시 진행

**교훈 (다음 작업에 반영)**
- 기존 저장 데이터를 다루는 검증/마이그레이션 로직은 "필드 없으면 거부"가
  아니라 "필드 없으면 기본값으로 보정" 방식을 기본으로 해야 함
- 이런 종류의 버그는 콘솔에 에러가 안 남을 수 있다는 것을 전제하고,
  "안 보이면 안전하다"고 판단하지 말 것
- 의심 가는 변경이 있을 때 `git stash` + `git checkout main`으로 빠르게
  되돌려 비교하는 방법이 원인 확정에 효과적이었음 (6/24 Perplexity OAuth
  원인 진단 때도 비슷하게 단계적 비교로 접근했던 패턴과 유사)

---

## 2026-06-27 (오후) — i18n 머지 완료 + 웹슬롯 로그인 가능성 테스트

**작업**
- `feature/i18n-foundation` 머지 완료 (main에 push 완료, 커밋 `9a03a42`)
  - 설정 팝오버에서 한/영 전환 확인됨, 기존 워크스테이션/탭/Stage/Dock
    회귀 없음 확인
- `feature/webpage-slot-test`(실험용, 정식 기능 아님)에서 Google Docs를
  webview 슬롯으로 띄우고 로그인 가능성 테스트
  - persist:webslot-test partition, UA 트릭 적용, did-fail-load 로깅
  - **결과: 로그인 성공.** 앱 재시작 후에도 세션 유지됨 확인
  - 이 결과를 근거로 웹슬롯 정식 구현(1단계) 착수 결정

**결정사항**
- 웹슬롯 정체성 확정: "AI처럼 조작하는 대상이 아니라 옆에 띄워두는
  참고 자료 화면" — Broadcast/메모/프롬프트 라이브러리 대상에서 제외
- Slot 타입을 `kind: 'ai' | 'web'` discriminated union으로 분리하기로 확정
  (provider 필드를 가짜로 채우는 방식은 채택 안 함)
- 웹슬롯 partition은 슬롯마다 분리하지 않고 `persist:webslot` 하나를
  공유하는 방식으로 결정 (여러 사이트가 같은 partition을 써도 쿠키는
  도메인별로 격리되어 큰 문제 없음 — 일반 브라우저 프로필과 동일한 원리)
- 즐겨찾기 폴더 구조는 1단계(깊이)만 지원, 평면 배열 + `folderId` 방식으로
  단순하게 가기로 결정 (중첩 트리는 불필요한 복잡도로 보류)
- 실험 브랜치(`feature/webpage-slot-test`)는 정식 구현 착수와 함께 폐기

**작업 범위 분할 (예정)**
- 1단계: Slot kind 도입, partition/UA 처리, URL 검증, 저장/복원, 기존
  데이터 마이그레이션
- 2단계: 즐겨찾기 store, 사이드바 즐겨찾기 탭, SlotHeader 추가 버튼
- 3단계: Dock "+" 진입점 연결, Broadcast/메모/프롬프트 가드

**문제**
- 1단계 1차 구현 시도는 워크스테이션 데이터 소실 버그로 실패 (위 항목 참고)
---

## 2026-06-27 — i18n 기반 다국어 지원 뼈대 구축

**작업**
- `react-i18next` 도입, `src/renderer/locales/ko`, `en` 폴더 구조 생성
- `src/renderer/i18n.ts` 초기화 파일 작성 (localStorage `omni-language` 키 → 없으면 `window.omni.systemLocale` 기준 자동 감지 → 둘 다 없으면 영어 기본값)
- Electron `main.ts`에서 `app.getLocale()` 결과를 preload 통해 `window.omni.systemLocale`로 renderer에 노출
- 설정 팝오버(`settingsMenuOpen`)에 언어 선택 드롭다운 추가 — 이번 작업에서 `t()`를 쓰는 유일한 컴포넌트로 범위 한정

**결정사항**
- 기존 화면(사이드바/탭바/워크스테이션 모달/메모 패널 등)의 한국어 문자열은 일괄 변환하지 않음 — 나중에 한 번에 몰아서 처리
- `i18next-browser-languagedetector` 라이브러리는 설치하지 않음 (자체 로직으로 충분)
- 1차 출시 타겟을 **한/영 동시 출시**로 확정 → 이 결정이 Windows 결제 채널(Paddle, 영어권 친화적) 선택을 사실상 확정시킴

**문제**
- 없음 (Codex 프롬프트 작성 단계, 아직 구현/검증 전)

---

## 2026-06-26 (밤) — 맥북 로그인 문제 해결 (Grok/Perplexity Google OAuth)

**증상**
- Perplexity에서 Google 로그인 시 webview에서 SetSID 단계까지 진행 후 `ERR_ABORTED(-3)` 실패
- Grok은 Google 로그인 정상 작동, Perplexity만 불안정

**원인 1**
- OAuth 중간 URL(`accounts.google.com` 등)이 `isRestorableUrl` 필터를 거치지 않고 그대로 `slot.currentUrl`에 저장됨 → 워크스테이션에 깨진 URL이 영속 저장되던 버그

**원인 2**
- webview에서 뜨는 OAuth 팝업을 받아주는 핸들러가 없어서 Google 로그인 팝업 자체가 막힘

**해결**
- `feature/prevent-oauth-url-persistence` 브랜치: `providerUrlStore.ts`에서 `isRestorableUrl`을 export하고, `saveCurrentUrl` 내 `setGroupRef.current()` 호출을 이 필터로 감쌈 (단, `updateSlotNavigationState`와 Gemini 제목 갱신은 필터 없이 항상 실행되게 유지)
- `feature/handle-webview-popups` 브랜치: `main.ts`에 `setWindowOpenHandler` 추가, `contents.getType() === 'webview'`일 때만 동작. 부모 webview와 동일한 `session`을 명시적으로 공유하는 팝업 `BrowserWindow` 생성
- 두 브랜치 모두 main 머지 + push 완료
- userData 폴더(`~/Library/Application Support/omni-workspace`) 삭제 후 깨끗한 환경에서 Claude/ChatGPT/Gemini/Grok/Perplexity 5개 전부 로그인 성공 확인, 워크스테이션 저장/복원 회귀 테스트도 정상

**부수 발견 (해결 안 함, 의도적으로 방치)**
- devtools 콘솔에 `GUEST_VIEW_MANAGER_CALL ERR_ABORTED(-3)` 노이즈 반복 출력
- `canGoBack()`/`canGoForward()`를 try/catch로 감싸는 `feature/suppress-err-aborted-noise` 브랜치로 시도했으나 효과 없음 → 커밋 안 하고 버림
- 실제 기능에는 무해, 프로덕션 빌드에는 안 보임 → 추가 수정 안 하기로 결정

---

## 2026-06-26 (낮) — 워크스테이션 기능 구현 상태 확인 + Stage 6 완료

**작업**
- Codex가 생성한 diff 검증: 탭/워크스테이션 한도 초과 시 에러 메시지를 3개 함수(`confirmWorkspaceCreate`, `handleCreateGroupTab`, `openWorkspaceTab`)에서 통일, 기존에 조용히 return만 하던 `handleCreateGroupTab`에 `navigationNotice` 알림 추가
- Stage 6 (MAX_TABS vs MAX_WORKSPACES 분리 검증, 탭 닫을 때 저장 확정) 수동 테스트 완료 → 커밋
- 메모리 정정: Gemini 통합, Slot/Stage/Dock 리팩터, Grok/Perplexity 추가, Stage 6 전부 완료 및 main 머지 확인 (기존 문서의 "다음 작업: Gemini 추가" 등은 이미 끝난 과거 스냅샷이었음)

**결정사항 (이후 작업 계획)**
- dev/prod 환경 분리: Supabase 연동 시점까지 보류
- 분할 레이아웃 브레이크포인트: Android/Apple 개발 시점까지 보류 (Windows는 고정 3열 레이아웃이라 당장 불필요)
- 프롬프트 라이브러리: 진입점 2곳으로 설계 (Broadcast 입력창 옆 📚 버튼 = 전체 전송, SlotHeader ⋯ 드롭다운 = 단일 슬롯 삽입)
- 상용화 체크리스트 작성: Supabase 연동/Pro-무료 구분/dev-prod 분리/사이드바 새그룹 버그 = 필수, 프롬프트 라이브러리/UI 개선/언어결정 = 권장

**문제**
- 없음 (검증 + 계획 수립 세션)

---

## 2026-06-26 (새벽) — 탭 동작 정상화 및 워크스테이션 설계

**작업**
- 워크스테이션(워크스페이스) 기능 설계를 자연어로 확정 후 6단계로 구현 시작
- 1단계: `WorkspaceRecord` 타입 + `workspaceStore.ts` CRUD 골격
- 2단계: `saveGroup` effect 제거, 앱 시작 시 항상 `createBlankGroup()`으로 빈 그룹 시작
- 3단계: 일반그룹 → 워크스테이션 승격 버튼/모달 ("Save as workstation")
- 4단계: 사이드바 워크스페이스 패널 (목록/카드 미리보기/열기·포커스이동/이름수정 등)

**문제 1**
- `handleConfirmAddSlot`의 `useCallback` deps가 `[group.slots.length]`라는 숫자값이라, 탭 전환 후에도 함수가 재생성되지 않는 stale closure 버그

**해결 1**
- deps를 숫자값이 아닌 적절한 참조값으로 교체

**문제 2**
- `attachNavigationTracker`(webview 이벤트 리스너)가 탭 전환 시 엉뚱한 탭에 URL을 저장할 수 있는 구조적 문제

**해결 2**
- `setGroupRef` ref 패턴으로 수정 (단, 근본적인 webview 이벤트 리스너 재바인딩 이슈는 완전히 해결된 건 아니고 계속 추적 필요한 항목으로 남음)

---

## 2026-06-25 (낮) — Dock 드래그앤드롭 마우스 이벤트 문제

**증상**
- Dock의 `<button draggable>` 요소가 Chromium/Electron에서 `dragstart` 이벤트를 발생시키지 않음

**해결**
- `<button draggable>`을 `<div role="button" tabIndex={0}>`로 교체 → 정상 동작

**추가 작업**
- 사이드바를 슬롯 목록 → 전역 메뉴(새그룹/워크스페이스/프롬프트라이브러리/메모/계정아바타)로 교체
- 내부 Group state 리팩터: 5개의 분리된 React state를 하나의 `Group` 객체로 통합, 슬롯 ID와 provider ID를 `crypto.randomUUID()`로 분리
- Dock "+" 버튼 + provider 선택 모달 구현 (Stage 자동 4개 채움, 넘치면 Dock으로)
- Grok/Perplexity provider adapter 추가 (partition + UA 트릭 등록)
- localStorage 기반 단일 그룹 저장/복원 (`groupStore.ts`, 기존 `memoStore.ts` 검증 패턴 차용)

**문제 (이때 처음 발견, 당시엔 보류)**
- Perplexity Google OAuth가 SetSID 단계 후 `ERR_ABORTED` 실패 — Grok은 정상이라 일단 보류 (→ 6/26 밤에 최종 해결됨)

---

## 2026-06-25 (새벽) — 코드 리뷰 및 멀티탭 시스템 작업

**작업**
- 멀티탭 시스템 구축: Stage 1(탭 UI 골격, `MAX_TABS=4`, "+" 모달), Stage 2(탭마다 독립 Group, `setGroup` 래퍼 패턴)

**문제 1**
- 새 그룹이 직전 탭의 마지막 방문 URL을 그대로 물려받는 버그

**해결 1**
- `createBlankGroup()`(항상 `defaultUrl` 사용)과 `createInitialGroup()`(직전 provider URL 유지, 앱 재시작 복원용)을 용도별로 분리

**문제 2 — 가장 큰 이슈**
- Stage 3: 이전 탭의 webview를 유지하려는 시도(`recentTabIdsRef`, `retainedSlots`)가 연쟁적으로 버그 유발:
  - 비활성 탭의 `currentUrl`이 navigation 이벤트로 갱신되지 않음
  - 동일 provider 탭이 동시에 마운트될 때 partition 충돌 에러
  - partition 중복 제거 수정을 하니 retention 기능 자체가 무의미해짐
  - **심각한 회귀**: Tab B에 추가한 슬롯이 Tab A에도 나타나는 현상

**해결 2**
- `updateSlotInOwningTab`으로 슬롯의 소유 탭을 직접 찾아 업데이트하도록 수정 시도했으나, 결국 **main(`bf57c91`)으로 전체 되돌림(revert)** → webview retention 자체를 포기하고 "탭 전환 시 단순 재로드" 방식으로 단순화

**결정사항**
- 탭은 트리거 역할만, Stage/Dock은 전역 싱글톤 — 한 번에 하나의 그룹만 보임
- 다음 주요 작업으로 워크스테이션(워크스페이스) 기능 설계 필요성 확인 (일반그룹 vs 워크스테이션 구분 부재가 "재시작 시 어느 탭 URL을 기억하는지" 혼란의 근본 원인으로 진단됨)

---

## 2026-06-24 — 네 개 브랜치 머지 준비

**작업**
- 4개 브랜치(`codex/sidebar-global-nav`, `codex/group-state-refactor`, `dock-add-slot`, `add-grok-perplexity-providers`) main 머지 진행

**증상**
- Perplexity Google 로그인이 webview에서 `ERR_ABORTED(-3)`로 실패하다가, 앱을 껐다 켜면 우연히 성공하는 불안정한 패턴

**원인 진단**
- Google의 embedded webview 감지가 고정 차단이 아닌 리스크 기반 휴리스틱 판단이라 불안정하게 나타남

**검토한 해결책 3가지**
1. 시스템 기본 브라우저로 OAuth 위임 + 커스텀 protocol/로컬 루프백 서버로 콜백 수신
2. 해당 슬롯을 외부 브라우저로 여는 폴백
3. 이메일 로그인으로 우회 안내

**결정**
- 당장은 4개 브랜치 머지를 마무리하는 게 우선이라 **이슈 해결을 보류**하고 2번(폴백)을 임시안으로 채택, 1번은 Phase 2로 미룸 (→ 실제로는 6/25~6/26에 원인을 더 깊이 파서 OAuth URL 영속화 버그 + 팝업 핸들러 부재로 진단, 다른 방식으로 해결됨)

---

## 2026-06-23 (밤) — Slot/Stage/Dock 구조 리팩터링 계획

**작업**
- 고정 3패널 레이아웃 → Slot/Stage/Dock 유동 모델로 전환하는 아키텍처 설계
- `Slot` 타입을 `{ id, providerId, currentUrl, title }`로 확정 (확장성 위해 `provider`가 아닌 `providerId` 사용)
- `stageIds`(최대 4) / `dockIds`(전체 8개 한도 내) 구조, `layoutMode`('row' | 'grid2x2') 토글 규칙 확정
- 무료 2탭·4슬롯·2분할 / 프로 4탭·8슬롯·4분할(가로 ↔ 2x2) 확정
- 인터랙티브 HTML/JS 프로토타입으로 Stage/Dock 동작, 드래그앤드롭, Dock 축소 상태, 레이아웃 토글 시연

**문제**
- 샌드박스 환경에서 `dataTransfer.getData()`가 빈 문자열을 반환하는 버그

**해결**
- `useRef`(`draggedIdRef`)를 `dragstart`에서 설정, `dragend`에서 초기화, 모든 drop 핸들러에서 이 ref를 읽는 방식으로 교체

**결정사항**
- Dock에 아이템이 들어올 때 Stage가 가득 차 있으면 마지막 아이템을 내쫓되, 그게 방금 삽입한 아이템이면 인덱스를 하나 밀어서 처리 (swap이 아닌 insertion 방식, splice 사용)
- 3분할(좌2+우1, 상2+하1, 균등3열)은 태블릿/폴드 전용, Windows는 고정 3열이라 회전 버튼 불필요

---

## 2026-06-23 (밤, 초반) — 앱 개발 환경 구성 방식 (dev/prod 분리)

**작업**
- dev/prod 환경 분리 전략 논의

**결정사항**
- 폴더 복사 방식 기각 (코드베이스 분기, git 히스토리 단절 위험)
- 환경변수(`NODE_ENV` 또는 `.env.development`/`.env.production`) 기반으로 같은 코드베이스를 다른 모드로 실행
- dev 모드는 별도 webview partition(`persist:claude-dev` 등) + 별도 localStorage 키 prefix 사용
- **실사용자 유입 전 반드시 처리해야 하는 필수 작업으로 메모리에 등록** (Slot/Stage/Dock 리팩터 전후 시점 목표)

**문제**
- 없음 (순수 설계 논의)

---

## 2026-06-23 (오후) — 북마크 기능 보류, Gemini 통합, SlotHeader 확정

**작업**
- 슬롯 헤더 툴바 사양 확정: 좌측(뒤로/앞으로/새로고침, `canGoBack()`/`canGoForward()` 기반 비활성화), 중앙(provider 아이콘+이름, 표시 전용), 우측(홈/접기/닫기)
- "접기"(Dock으로, webview는 `display:none`으로 살아있음)와 "닫기"(슬롯 완전 종료, state에서 제거)를 명확히 구분
- **Broadcast는 펼쳐진(Stage) 슬롯에만 전송, Dock 슬롯에는 전송 안 함** — 이 규칙을 메모리에 핵심 원칙으로 저장
- Gemini provider 통합: UA 토큰 제거 트릭으로 Google 로그인 webview 작동 확인 → SlotHeader, URL 저장/복원(`did-navigate-in-page` 포함), Broadcast 연결까지 전체 완료

**결정사항**
- "Ready" 상태 표시 기능은 완료 감지를 위한 DOM 스크래핑이 필요해서 보류 (기존 원칙과 충돌)
- 슬롯 닫기(X) 후 앱 재시작하면 복원되는 걸 확인 → 재오픈 UI는 다음 Slot/Stage/Dock 리팩터 때 같이 처리하기로 미룸

**문제**
- 없음 (기능 구현 + 정리 세션)

---

## 2026-06-23 (오전) — Omni Workspace 프로젝트 인수인계 (split view, UA fix, 메모 기능)

**작업**
- 분할 뷰 레이아웃: Claude/ChatGPT webview 50:50 좌우 배치, 패널 개별 접기 가능
- 메모 기능 전체 구현: 드래그 선택 → "메모로 저장" 플로팅 버튼(3자 이상) → `window.getSelection()` + URL + 페이지 제목 캡처 → `ipcRenderer.sendToHost`로 전송. 3열 카드 그리드, provider별 색상 구분, 핀/복사/삭제, "채팅방으로 이동" 버튼

**증상**
- Electron 기본 User-Agent 문자열에 `Electron/x.x.x` 토큰이 포함되어 있어 Claude/ChatGPT가 로그인 세션을 차단하거나 즉시 무효화함

**해결**
- `session.fromPartition('persist:claude').setUserAgent()` 등으로 `app.whenReady()` 이후, BrowserWindow/webview 생성 이전에 해당 토큰만 정규식으로 제거 (Chrome 버전을 하드코딩하지 않아 OS별로 자동으로 올바른 값 유지)
- Windows/Mac 양쪽에서 로그인 문제 해결 확인

**규칙 확정**
- webview DOM 노드는 패널 숨김/뷰 전환 시 절대 unmount 금지, `display:none` CSS 토글만 사용 (unmount 시 로그인 세션 파괴)
- 완료 감지(채팅 종료 등)는 `did-fail-load` 등 Electron 네이티브 이벤트만 사용, DOM 스크래핑 금지

**문제 (해결 안 됨, 다음 세션으로 이전)**
- "Make memo board scrollable" 커밋이 main에 실제로 머지됐는지 불확실한 상태로 세션 종료 → 다음 세션 시작 시 `git status`/`git log` 직접 확인 필요로 인수인계

---

## 2026-06-22 — 한의원 윈도우 컴퓨터 초기 설정 (프로젝트 시작)

**작업**
- GitHub 저장소 생성(`github.com/kimhung910924/omni-workspace`)
- 클리닉 PC에 로컬 폴더 구조 세팅 (`C:\dev\omni-workspace` — OneDrive 동기화 경로 의도적으로 회피)
- git 초기화, `AGENTS.md` 작성 (Codex가 자동으로 읽는 컨텍스트 파일)
- Milestone 1: Electron + React + TS + Vite 골격, 사이드바/탭바/Claude webview, `persist:claude` 세션 영속
- Milestone 2: ChatGPT 추가(`persist:chatgpt`), provider 간 세션 격리 검증
- Milestone 3: provider별 URL 저장/복원 (`did-navigate` + `did-navigate-in-page` — SPA 라우팅 대응 위해 둘 다 필요)
- Milestone 4: Broadcast 기능 — 하단 고정 입력창에서 `webview.executeJavaScript()`로 양쪽 webview에 동시 전송, `src/renderer/providerAdapters/`에 provider adapter 패턴으로 분리

**증상**
- `preload.ts`가 ESM으로 빌드되는데, Electron의 샌드박스 preload 컨텍스트는 이를 CommonJS로 실행할 수 없어서 에러 발생

**원인**
- `package.json`에 `"type": "module"`이 있어서 preload 빌드 결과물이 ESM으로 출력됨

**해결**
- 파일을 `preload.cts`로 변경하고 `preload.cjs`로 출력되게 수정

**문제 2**
- Codex 클라우드(chatgpt.com/codex) 사용 시도 → npm registry 403 에러 + 헤드리스 클라우드 환경에서 GUI Electron 앱 테스트가 근본적으로 불가능

**해결 2**
- 클라우드 Codex 완전 포기, 이후 모든 작업은 **로컬 Codex CLI로만** 진행

**반복 패턴 확정 (이후 계속 적용)**
- 로컬 Codex CLI가 커밋했다고 보고하지만 실제로 `git commit`을 실행하지 않는 경우가 빈번 → 매번 `git status` + `git log --oneline -3`으로 수동 확인 필수

**보류 결정**
- 수익화 아이디어(무료 1~2개 워크스페이스, 프로 최대 10개)는 `docs/future-features.md`에 기록만 해두고 핵심 MVP 완성 후로 명시적 보류

