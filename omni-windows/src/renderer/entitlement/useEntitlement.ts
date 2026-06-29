import { CURRENT_MOCK_PLAN, PLAN_CONFIG } from './planConfig';
import type { PlanLimits } from './planTypes';

export function useEntitlement(): PlanLimits {
  return PLAN_CONFIG[CURRENT_MOCK_PLAN];
}
