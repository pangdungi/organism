/**
 * 이동 루틴 · 단순 이동 — 시간 레포트 집계
 */

import { parseTimeToHours } from "../views/Time.js";

export const MOVE_ROUTINE_TASK_NAME = "이동 루틴";
export const SIMPLE_MOVE_TASK_NAME = "단순 이동";

function normYmd(v) {
  return String(v || "")
    .replace(/\//g, "-")
    .slice(0, 10);
}

function addDaysYmd(ymd, delta) {
  const key = normYmd(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return key;
  const [y, mo, d] = key.split("-").map(Number);
  const dt = new Date(y, mo - 1, d + delta);
  const pad = (n) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function listDatesInclusive(startYmd, endYmd) {
  const out = [];
  let cur = normYmd(startYmd);
  const end = normYmd(endYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cur) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return out;
  }
  while (cur <= end) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

function rowDateYmd(r) {
  return (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
}

function rowMinutes(r) {
  const hrs = parseTimeToHours(r.timeTracked);
  if (!(hrs > 0) || !Number.isFinite(hrs)) return 0;
  return Math.round(hrs * 60);
}

function taskNameOf(r) {
  return String(r?.taskName || "").trim();
}

/**
 * @param {ReturnType<import('../views/Time.js').loadTimeRows>} rows
 * @param {{ start: string, end: string }} range
 */
export function buildMoveReportSnapshot(rows, range) {
  let routineMinutes = 0;
  let simpleMinutes = 0;
  let recordCount = 0;
  /** @type {Set<string>} */
  const daysWithMove = new Set();

  for (const r of rows || []) {
    const name = taskNameOf(r);
    const mins = rowMinutes(r);
    if (mins <= 0) continue;

    if (name === MOVE_ROUTINE_TASK_NAME) {
      routineMinutes += mins;
      recordCount += 1;
      const d = rowDateYmd(r);
      if (d) daysWithMove.add(d);
    } else if (name === SIMPLE_MOVE_TASK_NAME) {
      simpleMinutes += mins;
      recordCount += 1;
      const d = rowDateYmd(r);
      if (d) daysWithMove.add(d);
    }
  }

  const totalMinutes = routineMinutes + simpleMinutes;
  const calendarDays = listDatesInclusive(range?.start, range?.end);
  const calendarDayCount = Math.max(1, calendarDays.length);
  const dailyAvgMinutes = Math.round(totalMinutes / calendarDayCount);
  const routineUtilPct =
    totalMinutes > 0 ? Math.round((routineMinutes / totalMinutes) * 100) : 0;

  return {
    hasData: totalMinutes > 0,
    totalMinutes,
    routineMinutes,
    simpleMinutes,
    routineUtilPct,
    dailyAvgMinutes,
    calendarDayCount,
    daysWithMoveCount: daysWithMove.size,
    recordCount,
  };
}
