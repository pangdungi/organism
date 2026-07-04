/**
 * 매일하기 KPI — 습관 트랙커 시작(추가)일
 */

import { normalizeKpiLogDateYmd } from "./timeKpiSync.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";

export function localTodayYmdForHabitStart() {
  return timeLedgerLocalTodayYmd();
}

/** @param {object} kpi */
export function getKpiHabitTrackerStartYmd(kpi) {
  if (!kpi?.needHabitTracker) return "";
  const fromField = normalizeKpiLogDateYmd(kpi.habitTrackerStartDate || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(fromField)) return fromField;
  const fromUpdated = ymdFromServerUpdatedAt(kpi.serverUpdatedAt);
  if (fromUpdated) return fromUpdated;
  return "";
}

function ymdFromServerUpdatedAt(raw) {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** @param {object} kpi @param {{ isNew?: boolean }} [opts] */
export function ensureKpiHabitTrackerStartDate(kpi, opts = {}) {
  if (!kpi?.needHabitTracker) return;
  const existing = normalizeKpiLogDateYmd(kpi.habitTrackerStartDate || "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(existing)) return;
  if (opts.isNew || !getKpiHabitTrackerStartYmd(kpi)) {
    kpi.habitTrackerStartDate = localTodayYmdForHabitStart();
  }
}

/** @param {object} kpi @param {number} year @param {number} month 1-12 */
export function isKpiHabitVisibleInMonth(kpi, year, month) {
  if (!kpi?.needHabitTracker) return false;
  const start = getKpiHabitTrackerStartYmd(kpi);
  const monthEnd = lastDayYmdOfMonth(year, month);
  if (!start) return true;
  return start <= monthEnd;
}

/** @param {object} kpi @param {string} dateKey */
export function isKpiHabitDateBeforeStart(kpi, dateKey) {
  const start = getKpiHabitTrackerStartYmd(kpi);
  const dk = normalizeKpiLogDateYmd(dateKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return false;
  if (!start) return false;
  return dk < start;
}

/** @param {number} year @param {number} month */
export function lastDayYmdOfMonth(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "";
  const last = new Date(y, m, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");
  return `${y}-${pad(m)}-${pad(last)}`;
}

/** @param {number} year @param {number} month @param {number} deltaMonths */
export function shiftMonthYear(year, month, deltaMonths) {
  const d = new Date(Number(year), Number(month) - 1 + Number(deltaMonths), 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}
