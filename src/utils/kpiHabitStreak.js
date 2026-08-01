/**
 * 매일하기(needHabitTracker) KPI — 연속 수행 일수
 */

import { resolveKpiDetailLogEntriesLocal } from "./kpiTimeLedgerLogs.js";
import {
  normalizeKpiLogDateYmd,
  getKpiLedgerPerformedValueOnDate,
} from "./timeKpiSync.js";
import { isHabitScheduledOnYmd } from "./kpiHabitWeekdays.js";

function parseKpiLogNumeric(val) {
  const n = parseFloat(String(val || "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

export { kpiHasHabitUnitGoal } from "./kpiHabitUnitGoal.js";

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
    if (dk === today) {
      const fromLog = parseKpiLogNumeric(log.value);
      if (fromLog > 0) return fromLog;
    }
  }
  return parseKpiLogNumeric(
    getKpiLedgerPerformedValueOnDate(kpi?.id, kpi?.name, today),
  );
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
/**
 * @param {Set<string>} success
 * @param {string} [todayYmd]
 * @param {{ needHabitTracker?: boolean, habitWeekdays?: unknown }|null} [kpi]
 *   — 있으면 하는 요일만 연속일에 넣고, 쉬는 요일은 건너뜀
 */
export function computeKpiHabitCurrentStreakFromSuccess(
  success,
  todayYmd = "",
  kpi = null,
) {
  const today = normalizeKpiLogDateYmd(
    todayYmd || new Date().toISOString().slice(0, 10),
  );
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today)) return 0;

  const onSchedule = (ymd) =>
    !kpi?.needHabitTracker || isHabitScheduledOnYmd(kpi, ymd);

  let cursor = today;
  /* 오늘은 하는 요일인데 아직 미완 → 어제부터(진행 중에도 어제까지 연속 유지) */
  if (onSchedule(cursor) && !success.has(cursor)) {
    cursor = addDaysToYmd(cursor, -1);
  }
  let guard = 0;
  while (
    /^\d{4}-\d{2}-\d{2}$/.test(cursor) &&
    !onSchedule(cursor) &&
    guard < 14
  ) {
    cursor = addDaysToYmd(cursor, -1);
    guard += 1;
  }

  let streak = 0;
  guard = 0;
  while (/^\d{4}-\d{2}-\d{2}$/.test(cursor) && guard < 400) {
    guard += 1;
    if (!onSchedule(cursor)) {
      cursor = addDaysToYmd(cursor, -1);
      continue;
    }
    if (!success.has(cursor)) break;
    streak += 1;
    cursor = addDaysToYmd(cursor, -1);
  }
  return streak;
}

export function computeKpiHabitCurrentStreak(kpi, storedLogs = [], todayYmd = "") {
  const success = collectKpiHabitSuccessDateKeys(kpi, storedLogs);
  return computeKpiHabitCurrentStreakFromSuccess(success, todayYmd, kpi);
}

/**
 * @param {object} kpi
 * @param {object[]} storedLogs
 */
export function computeKpiHabitTotalDays(kpi, storedLogs = []) {
  return collectKpiHabitSuccessDateKeys(kpi, storedLogs).size;
}

const HABIT_WEEKDAY_LABELS = ["월", "화", "수", "목", "금", "토", "일"];

/** 기준일이 속한 주(월~일) 7일 ymd */
export function habitWeekDateKeysMonSun(refYmd = "") {
  const today = normalizeKpiLogDateYmd(
    refYmd || new Date().toISOString().slice(0, 10),
  );
  const m = String(today).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date();
  const day = base.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(base);
  monday.setDate(base.getDate() + mondayOffset);
  /** @type {string[]} */
  const keys = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    keys.push(`${y}-${mo}-${da}`);
  }
  return keys;
}

/**
 * 매일하기 카드 — 이번 주 월~일 완료 칩 (블랙/화이트)
 * @param {Iterable<string>|Set<string>|string[]} successYmds
 * @param {string} [todayYmd]
 * @param {unknown} [habitWeekdays] 하는 요일(월=0…일=6). 없으면 전부 표시
 */
export function buildKpiCardHabitWeekStripHtml(
  successYmds,
  todayYmd = "",
  habitWeekdays,
) {
  const today = normalizeKpiLogDateYmd(
    todayYmd || new Date().toISOString().slice(0, 10),
  );
  const success = new Set(
    [...(successYmds || [])]
      .map((x) => normalizeKpiLogDateYmd(x))
      .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)),
  );
  const scheduled = new Set(
    Array.isArray(habitWeekdays) && habitWeekdays.length
      ? habitWeekdays
          .map((x) => Number(x))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      : [0, 1, 2, 3, 4, 5, 6],
  );
  const keys = habitWeekDateKeysMonSun(today);
  const chips = keys
    .map((ymd, i) => {
      const onSchedule = scheduled.has(i);
      const done = onSchedule && success.has(ymd);
      const isToday = ymd === today;
      const cls = [
        "dream-kpi-card-habit-day",
        done ? "is-done" : "",
        isToday ? "is-today" : "",
        onSchedule ? "" : "is-off",
      ]
        .filter(Boolean)
        .join(" ");
      const label = HABIT_WEEKDAY_LABELS[i] || "";
      const offHint = onSchedule ? "" : " (해당 없음)";
      return `<span class="${cls}" title="${ymd}${offHint}" aria-label="${label} ${ymd}${done ? " 완료" : ""}${offHint}">${label}</span>`;
    })
    .join("");
  return `<div class="dream-kpi-card-habit-week" role="list" aria-label="이번 주 수행">${chips}</div>`;
}

/** @param {object} kpi */
export function formatKpiHabitPeriodRangeLabel(kpi) {
  const start = String(
    kpi?.targetStartDate || kpi?.habitTrackerStartDate || "",
  )
    .trim()
    .slice(0, 10);
  const end = String(kpi?.targetDeadline || "").trim().slice(0, 10);
  const fmt = (ymd) => {
    const m = String(ymd).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    return `${m[1]}.${m[2]}.${m[3]}`;
  };
  const a = fmt(start);
  const b = fmt(end);
  if (a && b) return `${a} ~ ${b}`;
  if (a) return `${a} ~`;
  if (b) return `~ ${b}`;
  return "";
}
