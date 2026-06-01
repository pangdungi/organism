/** 매일하기 KPI — 목표값·단위가 모두 있는지 (순환 import 방지용 분리) */

/** @param {object} kpi */
export function kpiHasHabitUnitGoal(kpi) {
  if (!kpi?.needHabitTracker) return false;
  const unit = String(kpi.unit || "").trim();
  const target = String(kpi.targetValue ?? "").trim();
  return !!unit && !!target;
}
