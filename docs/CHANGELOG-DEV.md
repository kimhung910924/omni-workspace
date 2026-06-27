# Omni Workspace 개발 히스토리

> 날짜 / 작업 / 문제 / 해결 형식으로 정리. 최신이 위로 오게 배치(최신순).
> 같은 문제를 다시 만났을 때 검색해서 찾아보는 용도.

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

