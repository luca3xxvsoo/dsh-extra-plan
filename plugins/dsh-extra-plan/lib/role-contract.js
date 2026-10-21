const ROLE_ID_VALUES = ['extra-plan-executor', 'extra-plan-planner', 'extra-plan-reviewer', 'extra-plan-prober']
const ROLE_ORDER_VALUES = [101, 102, 103, 104]

export const ROLE_IDS = Object.freeze(ROLE_ID_VALUES)
export const ROLE_ORDERS = Object.freeze(ROLE_ORDER_VALUES)
export const PLANNER_PRESET_ID = ROLE_IDS[1]
export const PROBER_PRESET_ID = ROLE_IDS[3]
