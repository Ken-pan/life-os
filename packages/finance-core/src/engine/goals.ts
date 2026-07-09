import type { Goal, GoalReservePolicy } from "../types.js";

function clampDay(day: number): number {
  return Math.min(28, Math.max(1, Math.round(day)));
}

function dayFromISO(iso?: string): number | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return clampDay(Number(m[3]));
}

export function goalReservePolicy(goal: Goal): GoalReservePolicy {
  if (goal.reservePolicy) return goal.reservePolicy;
  return goal.reserve ? "earmarked_operating_cash" : "milestone_only";
}

export function isMilestoneGoal(goal: Goal): boolean {
  return goalReservePolicy(goal) === "milestone_only";
}

export function isEarmarkedOperatingGoal(goal: Goal): boolean {
  return goalReservePolicy(goal) === "earmarked_operating_cash";
}

export function isEmergencyReserveGoal(goal: Goal): boolean {
  // 不限定 reservePolicy：无论 earmark / protected / milestone，只要是应急储备目标，
  // 都走「最佳日 + 当月实际额度」的安全存钱逻辑，避免落回按固定日一次性全额扣款。
  if (goal.id === "goal-emergency") return true;
  const name = (goal.name ?? "").toLowerCase();
  if (name.includes("emergency") || name.includes("应急")) return true;
  return goal.priority === "critical" && goal.metric === "liquid";
}

export function primaryEmergencyReserveGoal(goals: Goal[]): Goal | null {
  const matched = goals.filter(isEmergencyReserveGoal);
  if (matched.length === 0) return null;
  return matched[0];
}

export function isProtectedReserveGoal(goal: Goal): boolean {
  return goalReservePolicy(goal) === "protected_account";
}

export function goalMonthlyAllocationDay(goal: Goal): number {
  if (goal.monthlyAllocationDay != null) return clampDay(goal.monthlyAllocationDay);
  const fromDate = dayFromISO(goal.targetDate);
  return fromDate ?? 1;
}

export function sumEarmarkedOperatingGoalCash(goals: Goal[]): number {
  return goals
    .filter(isEarmarkedOperatingGoal)
    .reduce((sum, goal) => sum + Math.max(0, goal.current ?? 0), 0);
}

export function sumProtectedReserveGoalCash(goals: Goal[]): number {
  return goals
    .filter(isProtectedReserveGoal)
    .reduce((sum, goal) => sum + Math.max(0, goal.current ?? 0), 0);
}

export function monthlyGoalAllocations(goals: Goal[]): Goal[] {
  return goals.filter((goal) => (goal.monthlyAllocation ?? 0) > 0);
}
