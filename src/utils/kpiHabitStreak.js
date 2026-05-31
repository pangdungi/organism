/**
 * 매일하기(needHabitTracker) KPI — 연속 수행 일수
 */

import { resolveKpiDetailLogEntriesLocal } from "./kpiTimeLedgerLogs.js";
import { normalizeKpiLogDateYmd } from "./timeKpiSync.js";

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

  const startKey = normalizeKpiLogDateYmd(kpi?.targetStartDate || "");
  const endKey = normalizeKpiLogDateYmd(kpi?.targetDeadline || "");
  const success = collectKpiHabitSuccessDateKeys(kpi, storedLogs);

  let cursor = today;
  if (endKey && cursor > endKey) cursor = endKey;
  if (!success.has(cursor)) {
    cursor = addDaysToYmd(cursor, -1);
  }

  let streak = 0;
  while (/^\d{4}-\d{2}-\d{2}$/.test(cursor)) {
    if (startKey && cursor < startKey) break;
    if (!success.has(cursor)) break;
    streak += 1;
    cursor = addDaysToYmd(cursor, -1);
  }
  return streak;
}
