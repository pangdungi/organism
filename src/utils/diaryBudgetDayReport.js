/**
 * 시간 레포트 · 예산 탭(데이) — 일간예산(getBudgetGoals)과 시간가계부 실제 기록 비교
 */

import { readTimeLedgerEntriesRaw } from "./timeLedgerEntriesModel.js";
import {
  getBudgetGoals,
  getTimeLedgerRowDisplayProductivity,
} from "../views/Time.js";

const BUDGET_PLACEHOLDER_PREFIX = "(과제 선택)·";

function normYmd(s) {
  return String(s || "").replace(/\//g, "-").slice(0, 10);
}

/** 로컬 행 시각 문자열 → 당일 기준 분(0~1439) — Time.parseLedgerTimeStringToMinutes 와 동일 규칙 */
function parseClockToMinutesOfDay(str) {
  if (!str || typeof str !== "string") return null;
  const t = str.trim();
  const m = t.match(/[T\s](\d{1,2}):(\d{2})/) || t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  const hh = ((h % 24) + 24) % 24;
  const mm = ((min % 60) + 60) % 60;
  return hh * 60 + mm;
}

/** goalTime "02:30" → 목표 소요 150분(시:분 해석) */
function parseGoalDurationMinutes(goalTime) {
  const m = parseClockToMinutesOfDay(String(goalTime || "").trim());
  return m == null ? 0 : m;
}

/** scheduledTimes 한 줄 "09:00-10:30" */
function parseScheduledSlot(slotStr) {
  const parts = String(slotStr || "").trim().split("-");
  if (parts.length < 2) return null;
  const startMin = parseClockToMinutesOfDay(parts[0].trim());
  const endMin = parseClockToMinutesOfDay(parts[1].trim());
  if (startMin == null || endMin == null || endMin <= startMin) return null;
  return { startMin, endMin, durationMin: endMin - startMin };
}

function parseTimeTrackedToMinutes(tt) {
  if (!tt || typeof tt !== "string") return 0;
  const trimmed = tt.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return Math.max(0, h * 60 + m);
}

/**
 * @typedef {{ expectedMin: number, expectedStartMin: number | null }} BudgetExpectedRow
 */

/** 과제명 → 예상 총 분·가장 이른 예상 시작(일간예산 슬롯 기준, 없으면 null) */
function buildBudgetExpectedByTask(ymdTen) {
  /** @type {Map<string, BudgetExpectedRow>} */
  const map = new Map();
  const goals = getBudgetGoals(ymdTen);
  for (const [taskName, data] of Object.entries(goals)) {
    if (taskName.startsWith(BUDGET_PLACEHOLDER_PREFIX)) continue;
    const name = taskName.trim();
    if (!name) continue;
    let totalExpected = 0;
    let earliestStart = /** @type {number | null} */ (null);
    const sched = Array.isArray(data?.scheduledTimes)
      ? data.scheduledTimes
      : data?.scheduledTime && String(data.scheduledTime).trim()
        ? [String(data.scheduledTime).trim()]
        : [];
    for (const slot of sched) {
      const p = parseScheduledSlot(slot);
      if (!p) continue;
      totalExpected += p.durationMin;
      earliestStart =
        earliestStart == null ? p.startMin : Math.min(earliestStart, p.startMin);
    }
    const gt = data?.goalTime && String(data.goalTime).trim();
    if (totalExpected <= 0 && gt) {
      const dm = parseGoalDurationMinutes(gt);
      if (dm > 0) totalExpected = dm;
    }
    if (totalExpected <= 0) continue;
    map.set(name, {
      expectedMin: totalExpected,
      expectedStartMin: earliestStart,
    });
  }
  return map;
}

/** 오늘 「예상 시간 과제」로 칠 과제명 — 슬롯 또는 goalTime 있으면 포함 */
function plannedTaskNamesForDay(ymdTen) {
  const goals = getBudgetGoals(ymdTen);
  const names = new Set();
  for (const [taskName, data] of Object.entries(goals)) {
    if (taskName.startsWith(BUDGET_PLACEHOLDER_PREFIX)) continue;
    const hasSched =
      (Array.isArray(data?.scheduledTimes) &&
        data.scheduledTimes.some((x) => String(x || "").trim())) ||
      !!(data?.scheduledTime && String(data.scheduledTime).trim());
    const hasGoal = !!(data?.goalTime && String(data.goalTime).trim());
    if (hasSched || hasGoal) names.add(taskName.trim());
  }
  return names;
}

/** 과제명 → 실제 합산 분·가장 이른 실제 시작 분 */
function buildActualByTask(ymdTen) {
  /** @type {Map<string, { actualMin: number, earliestStartMin: number | null }>} */
  const map = new Map();
  const rows = readTimeLedgerEntriesRaw();
  for (const r of rows) {
    if (!r) continue;
    const d = normYmd(r.date);
    if (d !== ymdTen) continue;
    const name = String(r.taskName || "").trim();
    if (!name) continue;
    const mins = parseTimeTrackedToMinutes(r.timeTracked);
    if (mins <= 0) continue;
    const stMin = parseClockToMinutesOfDay(String(r.startTime || ""));
    const cur = map.get(name) || { actualMin: 0, earliestStartMin: null };
    cur.actualMin += mins;
    if (stMin != null) {
      cur.earliestStartMin =
        cur.earliestStartMin == null
          ? stMin
          : Math.min(cur.earliestStartMin, stMin);
    }
    map.set(name, cur);
  }
  return map;
}

function sortKoByTaskName(arr) {
  return [...arr].sort((a, b) =>
    String(a.taskName || "").localeCompare(String(b.taskName || ""), "ko"),
  );
}

/**
 * @returns {{
 *   wellDone: Array<{ taskName: string, barPct: number }>,
 *   productivity: Array<{ taskName: string, barPct: number }>,
 *   plannedButNoActual: Array<{ taskName: string, expectedMin: number }>,
 *   unplannedNonproductive: Array<{ taskName: string, minutes: number }>,
 * }}
 */
export function getBudgetDayReportForDay(ymdTen) {
  const ymd = normYmd(ymdTen);
  const empty = () => ({
    wellDone: [],
    productivity: [],
    plannedButNoActual: [],
    unplannedNonproductive: [],
  });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return empty();

  const expectedByTask = buildBudgetExpectedByTask(ymd);
  const actualByTask = buildActualByTask(ymd);
  const plannedNames = plannedTaskNamesForDay(ymd);

  /** @type {Array<{ taskName: string, barPct: number }>} */
  const wellDone = [];
  /** @type {Array<{ taskName: string, barPct: number }>} */
  const productivity = [];
  const wellDoneNames = new Set();

  for (const [name, exp] of expectedByTask.entries()) {
    const act = actualByTask.get(name);
    if (!act || exp.expectedMin <= 0) continue;
    const actualMin = act.actualMin;
    if (
      exp.expectedStartMin != null &&
      act.earliestStartMin != null &&
      actualMin >= 0.7 * exp.expectedMin &&
      Math.abs(act.earliestStartMin - exp.expectedStartMin) <= 30
    ) {
      const ratio = actualMin / exp.expectedMin;
      const barPct = Math.min(100, Math.round(ratio * 100));
      wellDone.push({ taskName: name, barPct });
      wellDoneNames.add(name);
    }
  }

  for (const [name, exp] of expectedByTask.entries()) {
    if (wellDoneNames.has(name)) continue;
    const act = actualByTask.get(name);
    if (!act || exp.expectedMin <= 0) continue;
    const actualMin = act.actualMin;
    const ok70 = actualMin >= 0.7 * exp.expectedMin;
    const over90 = actualMin >= exp.expectedMin + 90;
    const under70 = actualMin < 0.7 * exp.expectedMin;
    if ((ok70 && over90) || under70) {
      const ratio = actualMin / exp.expectedMin;
      const barPct = Math.min(100, Math.round(Math.min(ratio, 1.5) * 100));
      productivity.push({ taskName: name, barPct });
    }
  }

  /** 비생산 기록 중 오늘 예상에 없던 과제 */
  const npAgg = new Map();
  const rows = readTimeLedgerEntriesRaw();
  for (const r of rows) {
    if (!r) continue;
    const d = normYmd(r.date);
    if (d !== ymd) continue;
    const name = String(r.taskName || "").trim();
    if (!name) continue;
    if (plannedNames.has(name)) continue;
    if (getTimeLedgerRowDisplayProductivity(r) !== "nonproductive") continue;
    const mins = parseTimeTrackedToMinutes(r.timeTracked);
    if (mins <= 0) continue;
    npAgg.set(name, (npAgg.get(name) || 0) + mins);
  }
  const unplannedNonproductive = sortKoByTaskName(
    [...npAgg.entries()].map(([taskName, minutes]) => ({ taskName, minutes })),
  );

  /** 예상 시간(일간예산)은 있는데 당일 시간가계부에 사용시간 기록이 없는 과제 */
  /** @type {Array<{ taskName: string, expectedMin: number }>} */
  const plannedButNoActual = [];
  for (const [name, exp] of expectedByTask.entries()) {
    if (!exp || !(exp.expectedMin > 0)) continue;
    const act = actualByTask.get(name);
    const actualMin = act?.actualMin ?? 0;
    if (actualMin <= 0) {
      plannedButNoActual.push({
        taskName: name,
        expectedMin: Math.round(exp.expectedMin),
      });
    }
  }

  return {
    wellDone: sortKoByTaskName(wellDone),
    productivity: sortKoByTaskName(productivity),
    plannedButNoActual: sortKoByTaskName(plannedButNoActual),
    unplannedNonproductive,
  };
}
