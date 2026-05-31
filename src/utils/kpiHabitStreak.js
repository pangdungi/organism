/**
 * 매일하기(needHabitTracker) KPI — 연속 수행 일수
 */

import { resolveKpiDetailLogEntriesLocal } from "./kpiTimeLedgerLogs.js";
import { normalizeKpiLogDateYmd } from "./timeKpiSync.js";

function parseKpiLogNumeric(val) {
  const n = parseFloat(String(val || "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/** @param {object} kpi */
export function kpiHasHabitUnitGoal(kpi) {
  if (!kpi?.needHabitTracker) return false;
  const unit = String(kpi.unit || "").trim();
  const target = String(kpi.targetValue ?? "").trim();
  return !!unit && !!target;
}

/**
 * @param {object} kpi
 * @param {object[]} storedLogs
 * @param {string} [todayYmd]
 */
export function getKpiHabitTodayNumericValue(kpi, storedLogs = [], todayYmd = "") {
  const today = normalizeKpiLogDateYmd(
    todayYmd || new Date().toISOString().slice(0, 10),
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return 0;
  const kid = String(kpi?.id || "").trim();
  if (!kid) return 0;
  for (const log of storedLogs || []) {
    if (String(log?.kpiId || "").trim() !== kid) continue;
    const dk = normalizeKpiLogDateYmd(log?.dateRaw || log?.date || "");
    if (dk === today) return parseKpiLogNumeric(log.value);
  }
  return 0;
}

/** @deprecated — 매일하기+단위 카드는 buildKpiCardHabitStreakAsideMarkup 사용 */
export function buildKpiCardHabitStatsMarkup(totalDays, streak) {
  const total = Math.max(0, Number(totalDays) || 0);
  const s = Math.max(0, Number(streak) || 0);
  const streakLabel = s > 0 ? `연속 ${s}일째!` : "연속 0일";
  return `<div class="dream-kpi-card-habit-stats" aria-label="습관 통계">
    <span class="dream-kpi-card-habit-stats-total">총 ${total}일</span>
    <span class="dream-kpi-card-habit-stats-streak">${streakLabel}</span>
  </div>`;
}

/** 오늘 수치(5 km) 옆 — 연속 일수 */
export function buildKpiCardHabitStreakAsideMarkup(streak) {
  const s = Math.max(0, Number(streak) || 0);
  const streakLabel = s > 0 ? `연속 ${s}일째!` : "연속 0일";
  return `<span class="dream-kpi-card-habit-streak-aside">${streakLabel}</span>`;
}

/** @param {string} ymd @param {number} delta */
export function addDaysToYmd(ymd, delta) {
  const key = normalizeKpiLogDateYmd(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const y = parseInt(key.slice(0, 4), 10);
  const m = parseInt(key.slice(5, 7), 10) - 1;
  const d = parseInt(key.slice(8, 10), 10);
  const dt = new Date(Date.UTC(y, m, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

/**
 * @param {object} kpi
 * @param {object[]} storedLogs
 */
export function collectKpiHabitSuccessDateKeys(kpi, storedLogs = []) {
  const entries = resolveKpiDetailLogEntriesLocal(kpi, storedLogs);
  /** @type {Set<string>} */
  const keys = new Set();
  for (const log of entries) {
    const dk = normalizeKpiLogDateYmd(log?.dateRaw || log?.date || "");
    if (dk) keys.add(dk);
  }
  return keys;
}

/**
 * @param {object} kpi
 * @param {object[]} storedLogs
 * @param {string} [todayYmd]
 */
export function computeKpiHabitCurrentStreak(kpi, storedLogs = [], todayYmd = "") {
  const today = normalizeKpiLogDateYmd(todayYmd || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return 0;

  const success = collectKpiHabitSuccessDateKeys(kpi, storedLogs);

  let cursor = today;
  if (!success.has(cursor)) {
    cursor = addDaysToYmd(cursor, -1);
  }

  let streak = 0;
  while (/^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
    if (!success.has(cursor)) break;
    streak += 1;
    cursor = addDaysToYmd(cursor, -1);
  }
  return streak;
}

/**
 * @param {object} kpi
 * @param {object[]} storedLogs
 */
export function computeKpiHabitTotalDays(kpi, storedLogs = []) {
  return collectKpiHabitSuccessDateKeys(kpi, storedLogs).size;
}
