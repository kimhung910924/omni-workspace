# 진행 중 / 시행착오 기록

> 완료된 작업은 `docs/CHANGELOG-DEV.md`로 옮기고 여기서는 지운다.
> 여기는 "현재 막혀있는 것" + "과거에 시도했다가 버린 접근법"만 남겨둔다.
> 목적: 같은 방법을 또 시도하지 않게 막는 것 + 새 채팅에서 바로 이어갈 항목 확인.

---

## [재시도 예정] 웹슬롯 1단계 (`feature/web-slot-foundation`)

**시도 1 (2026-06-27, 실패 → 폐기)**
- 구현: Slot에 `kind: 'ai' | 'web'` 도입, `persist:webslot` partition 공유,
  UA 처리, URL 검증, 저장/복원 포함
- 증상: 구현 후 앱 재시작 시 기존 워크스테이션이 사이드바에서 통째로 사라짐
  (콘솔 에러 없이 조용히 사라짐)
- 원인: `workspaceStore.ts`의 `isValidWorkspaceRecord`/`normalizeSlot`이
  `createdAt`/`updatedAt`/`dockMinimized` 등 필드가 하나라도 없으면 전체를
  버리는 strict 검증 구조였음. 기존 저장 데이터가 새 스키마 기준과 안 맞아
  `filter()`에서 전부 걸러짐
- 검증: `git stash` + `git checkout main`으로 되돌려서 동일 증상 재현 안
  되는 것 확인 → web-slot-foundation 브랜치가 원인임을 확정
- 조치: `git checkout -- .`로 변경사항 전체 폐기, main 복귀 확인
- **다음 시도 방향**: 검증 로직을 lenient하게(필드 없으면 기본값으로
  채워서 통과) 재작성. "실제 localStorage 데이터 구조를 먼저 까보고
  그 구조에 맞춰 짜라"는 지시를 프롬프트에 명시할 것
- **시도하지 말 것**: strict 타입 가드로 기존 데이터를 검증하는 방식
  (필드 없으면 거부) — 기존 사용자 데이터가 있는 한 이 방식은 항상
  위험함, 마이그레이션이 필요한 모든 작업에 동일 원칙 적용

---

## [관찰만 함, 원인 미확정] 웹슬롯 1단계 시도 중 Claude 슬롯 로그아웃 현상

- 2026-06-27, 위 워크스테이션 버그와 같은 세션에서 Claude 슬롯이 갑자기
  "New chat" 기본 화면(로그아웃 상태)으로 보이는 현상 관찰됨
- `main.ts`의 UA 처리/partition 목록 코드는 확인 결과 깨끗했음 (의심했던
  지점 아니었음)
- 정확한 재현 조건과 원인은 아직 미확정 — web-slot 1단계를 다시 시도할 때
  같은 현상이 재발하는지 별도로 확인 필요

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
