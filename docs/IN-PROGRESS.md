# 진행 중 / 시행착오 기록

> 완료된 작업은 `docs/CHANGELOG-DEV.md`로 옮기고 여기서는 지운다.
> 여기는 "현재 막혀있는 것" + "과거에 시도했다가 버린 접근법"만 남겨둔다.
> 목적: 같은 방법을 또 시도하지 않게 막는 것 + 새 채팅에서 바로 이어갈 항목 확인.

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

---

## [경과 불명, 확인 필요] 6/23 오전 — "메모보드 스크롤" 커밋 머지 여부

- 2026-06-23 오전 세션 종료 시점에 "Make memo board scrollable" 커밋이
  실제로 main에 머지됐는지 불확실한 상태로 끝남
- 이후 세션에서 별도로 재확인했다는 기록 없음 — 현재 메모 패널이 정상
  스크롤되는지 한 번 가볍게 확인해볼 가치 있음 (낮은 우선순위)
