# 인수인계 메모 (2026-06-30 작성)

## 현재 코드 상태

- `main` 브랜치, 최신 커밋까지 push 완료
- 이번 세션에서 만든 6개 feature 브랜치는 전부 main에 머지 후 삭제 완료
  (`refactor/remove-dead-groupstore`, `refactor/add-entitlement`,
  `refactor/add-data-repositories`, `refactor/add-persisted-meta`,
  `refactor/extract-memo-utils`, `refactor/extract-memo-card`)
- 앱 동작/외관은 이번 작업 전과 100% 동일 (의도된 결과 — 순수 구조 리팩터)

## 이번 세션에서 완료한 것 — 저위험 구조 리팩터 1차

main.tsx(3,180줄 단일 파일) 정리를 위험도 순으로 시작. 자세한 내용은
`docs/CHANGELOG-DEV.md`의 "2026-06-30 — 저위험 구조 리팩터 1차 완료" 항목
참고. 요약:

1. `groupStore.ts` 죽은 코드 제거, `Group` 타입은 `types.ts`로 이동
2. `entitlement/` 계층 신설 — `MAX_TABS`/`MAX_SLOTS`/`MAX_STAGE_SLOTS`
   하드코딩을 `PLAN_CONFIG`(free/pro/promax) + `useEntitlement()`로 대체.
   `CURRENT_MOCK_PLAN = 'pro'`로 고정해 현재 동작 유지
3. `data/repositories.ts` + `data/local/` — `workspaceStore.ts`/
   `memoStore.ts`의 localStorage IO를 `WorkspaceRepository`/`MemoRepository`
   인터페이스로 감쌈. localStorage key/포맷 변경 없음. `data/sync/README.md`에
   "local-first, Supabase는 동기화 보조 계층" 원칙 기록
4. `data/persistedMeta.ts` — `WorkspaceRecord`/`Memo`에 향후 Supabase 동기화
   대비 옵셔널 메타 필드(`schemaVersion`, `deletedAt`, `syncState`,
   `lastSyncedAt`) 추가. 아직 읽기/쓰기 로직 없음, 타입만 존재
5. `features/memos/memoUtils.ts`, `features/memos/MemoCard.tsx` — memo 순수
   헬퍼 5개와 카드 컴포넌트를 main.tsx 밖으로 분리

**의도적으로 멈춘 지점**: 메모 페이지 레이아웃/상세 모달은 분리 안 함.
`navigateToMemoSource`가 Stage/Dock 상태에 의존해서, 지금 분리하면 의미 없는
"파일만 옮기기"가 됨. 사유 상세는 `docs/IN-PROGRESS.md`의 "[보류]
MemoPanel / MemoDetailModal 분리" 참고.

## 검증 방식 (이번 세션에서 확립된 패턴)

매 커밋: Codex 작업 → src.zip 업로드 → Claude가 zip을 직접 풀어 원본과
바이트 단위로 diff 검증(Codex의 압축 diff/diffstat 보고를 그대로 안 믿음)
→ 통과 시 사용자가 직접 commit/push/머지. 앞으로도 이 패턴 유지 권장.

중간에 브랜치 머지 누락 1건 있었음(entitlement 브랜치 위에서 다음 커밋을
이어서 진행) — 발견 즉시 복구함. 다음부터는 매 커밋 후 "머지했는지" 한 번
더 확인하는 습관 필요.

## 다음에 할 수 있는 작업 (우선순위 순)

**1순위 — 웹슬롯 1단계 3차 시도**
- 2차 시도 때 만든 구조(`AiSlot`/`WebSlot` discriminated union,
  `WEB_SLOT_PARTITION`, `isAiSlot()` 분기, `saveCurrentUrl`의 `isMainFrame`
  가드)는 결함 없음으로 결론남 — 그대로 재구현하면 됨
- 이번 리팩터(특히 `Slot`/`WorkspaceRecord` 타입 위치, repository 경유 호출)
  와 충돌 가능성 점검 필요 — 웹슬롯 작업 시작 전에 현재 `types.ts`,
  `localWorkspaceRepository.ts` 구조를 한 번 더 확인하고 지시문 작성할 것
- 작업 시작 전, 재시작 테스트 시 코드 의심 전에 먼저 `lsof -ti:5173` 포트
  점유 확인 (`docs/IN-PROGRESS.md` 참고)

**2순위 (웹슬롯 이후) — 중위험 UI 분리 라운드**
- 후보: BroadcastBar 분리, TopTabBar 분리, WorkspacePanel 일부 분리
- 이번에 만든 패턴(순수 헬퍼 먼저 → 반복 컴포넌트 → 전역 상태 얽힌 부분은
  의존성 분석 후 별도 판단) 그대로 적용

**뒤로 미룰 것 (당분간 손대지 않음)**
- Stage/Dock 드래그앤드롭 분리 — 가장 얽혀있어 회귀 위험 큼
- MemoPanel/MemoDetailModal 완전 분리 — Stage/Dock 분리와 함께 처리
- 콘솔의 `GUEST_VIEW_MANAGER_CALL ERR_ABORTED(-3)` 노이즈 제거 — 다른 각도
  (`did-fail-load` 필터링) 재시도 후보로 메모만 해둠, 우선순위 낮음
- ProMax "Hot Workspace Cache"(탭 전환 즉시화) — RAM 실측 먼저, entitlement
  실제 결제 연동 이후

## 함께 첨부할 파일 (다음 채팅 시작 시)

- `docs/CHANGELOG-DEV.md`
- `docs/IN-PROGRESS.md`
- 이 핸드오프 메모
- 웹슬롯 작업 시작 시점에 최신 src.zip
