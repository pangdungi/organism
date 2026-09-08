/** 매일하기 KPI — 목표값·단위가 모두 있는지 (순환 import 방지용 분리) */

/** @param {object} kpi */
export function kpiHasHabitUnitGoal(kpi) {
  if (!kpi?.needHabitTracker) return false;
  const unit = String(kpi.unit || "").trim();
  const target = String(kpi.targetValue ?? "").trim();
  return !!unit && !!target;
}

export function kpiHabitUnitIsMinutesLabel(unit) {
  return /^(분|min|mins|minute|minutes|분\(min\))$/i.test(
    String(unit || "").trim(),
  );
}

/** 매일하기 + 단위 분 — 시간기록 분수로 측정 */
export function kpiHabitMeasuresFromLedgerMinutes(kpi) {
  if (!kpiHasHabitUnitGoal(kpi)) return false;
  return kpiHabitUnitIsMinutesLabel(kpi.unit);
}

/** 00:30 → 30분, 01:00 → 60분. 콜론 없으면 그 숫자=분 */
export function parseHabitMinuteTargetToMinutes(str) {
  const raw = String(str || "").trim();
  if (!raw) return 0;
  if (raw.includes(":")) {
    const parts = raw.split(":");
    const h = parseInt(parts[0], 10) || 0;
    const m = parseInt(parts[1], 10) || 0;
    const total = h * 60 + m;
    return total > 0 ? total : 0;
  }
  const n = parseFloat(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/** 30 → 00:30 */
export function formatHabitMinutesAsClock(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export function normalizeHabitMinuteClock(str) {
  const mins = parseHabitMinuteTargetToMinutes(str);
  if (mins <= 0) return "";
  return formatHabitMinutesAsClock(mins);
}
