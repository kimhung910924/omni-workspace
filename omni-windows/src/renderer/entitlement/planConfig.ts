import type { PlanId, PlanLimits } from './planTypes';

export const PLAN_CONFIG = {
  free: { maxTabs: 2, maxSlots: 2, maxStageSlots: 2 },
  pro: { maxTabs: 4, maxSlots: 8, maxStageSlots: 4 },
  promax: { maxTabs: 4, maxSlots: 8, maxStageSlots: 4 },
  // promax는 현재 pro와 동일한 제한값. 향후 비교요약 등 별도 기능 플래그로
  // 차별화할 예정이며, 이번 커밋의 범위가 아니다.
} satisfies Record<PlanId, PlanLimits>;

// 실제 로그인/결제 연동 전까지의 임시 고정값. 반드시 'pro'로 고정한다.
// 'free'로 바꾸면 현재 앱 동작(4탭/8슬롯/분할4)이 줄어드는 회귀가 발생한다.
export const CURRENT_MOCK_PLAN: PlanId = 'pro';
