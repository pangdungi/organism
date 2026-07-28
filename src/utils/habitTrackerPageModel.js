/**
 * 해빗 트랙커 페이지 — 행·날짜·셀 표시값 모델
 */

import { readTimeDailyBudgetGoalsRaw } from "./timeDailyBudgetModel.js";
import {
  ledgerRowEntryDateYmd,
  readTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";
import { kpiHasHabitUnitGoal } from "./kpiHabitUnitGoal.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { resolveKpiDetailLogEntriesLocal } from "./kpiTimeLedgerLogs.js";
import { formatKpiHistoryValueText } from "./kpiLogFields.js";
import {
  ledgerRowDateYmd,
  normalizeKpiLogDateYmd,
  syncHabitTrackerLogs,
} from "./timeKpiSync.js";
import { timeLedgerRowHasOpenEnd } from "./timeLedgerStaleInProgressClose.js";
import { ensureAllKpiTimeTasksFromStorage } from "./kpiTimeTaskSync.js";
import {
  getKpiHabitTrackerStartYmd,
  isKpiHabitDateBeforeStart,
} from "./kpiHabitTrackerStartDate.js";
import { isKpiEligibleForTimeTaskList } from "./kpiProgressStatus.js";
import { getFullTaskOptions } from "./timeTaskOptionsModel.js";

const DAY_END_MIN = 23 * 60 + 59;
const BUDGET_PLACEHOLDER_PREFIX = "(과제 선택)·";
/** 상단 고정 행과 겹치는 과제목록 이름 */
const BUILTIN_TRACKER_TASK_NAMES = new Set(["시간기록하기", "시간 계획하기"]);

const KPI_DOMAIN_STORAGE = [
  { storageKey: "kpi-dream-map", domain: "dream" },
  { storageKey: "kpi-health-map", domain: "health" },
  { storageKey: "kpi-sideincome-paths", domain: "sideincome" },
  { storageKey: "kpi-happiness-map", domain: "happiness" },
];

/** @typedef {"time-record"|"time-plan"|"kpi"|"ledger-task"} HabitTrackerRowKind */

/**
 * @typedef {object} HabitTrackerRow
 * @property {string} id
 * @property {HabitTrackerRowKind} kind
 * @property {string} label
 * @property {object} [kpi]
 * @property {string} [storageKey]
 * @property {object[]} [storedLogs]
 * @property {Array<{id?: string, text?: string}>} [dailyTodos]
 * @property {string} [taskId]
 * @property {string} [taskName]
 */

function normYmd(v) {
  return normalizeKpiLogDateYmd(v);
}

function parseClockToMinutesOfDay(str) {
  if (!str || typeof str !== "string") return null;
  const t = str.trim();
  const m = t.match(/[T\s](\d{1,2}):(\d{2})/) || t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return (((h % 24) + 24) % 24) * 60 + (((min % 60) + 60) % 60);
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

/** @returns {{ startMin: number, endMin: number } | null} */
function ledgerRowDaySegment(row) {
  if (!row) return null;
  const startMin = parseClockToMinutesOfDay(String(row.startTime || ""));
  if (startMin == null) return null;

  let endMin = parseClockToMinutesOfDay(String(row.endTime || ""));
  if (endMin == null) {
    const tracked = parseTimeTrackedToMinutes(row.timeTracked);
    if (tracked > 0) endMin = startMin + tracked;
  }
  if (endMin == null && timeLedgerRowHasOpenEnd(row)) return null;
  if (endMin == null) return null;

  if (endMin <= startMin) endMin = Math.min(24 * 60, startMin + Math.max(1, parseTimeTrackedToMinutes(row.timeTracked)));
  endMin = Math.min(24 * 60, endMin);
  if (endMin <= startMin) return null;
  return { startMin, endMin };
}

function mergeDaySegments(segments) {
  const sorted = [...segments].sort((a, b) => a.startMin - b.startMin);
  /** @type {{ startMin: number, endMin: number }[]} */
  const merged = [];
  for (const seg of sorted) {
    if (!merged.length) {
      merged.push({ ...seg });
      continue;
    }
    const last = merged[merged.length - 1];
    if (seg.startMin <= last.endMin + 1) {
      last.endMin = Math.max(last.endMin, seg.endMin);
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

function isTimeRecordingCompleteFromSegments(segments) {
  if (!segments?.length) return false;
  const merged = mergeDaySegments(segments);
  if (merged[0].startMin > 0) return false;
  let cursor = 0;
  for (const seg of merged) {
    if (seg.startMin > cursor + 1) return false;
    cursor = Math.max(cursor, seg.endMin);
  }
  return cursor >= DAY_END_MIN;
}

/** 해당 날짜 시간기록이 0:00~23:59까지 빈틈 없이 채워졌는지 */
export function isTimeRecordingCompleteForDay(ymd) {
  const key = normYmd(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  if (_paintLedgerIndex) return _paintLedgerIndex.timeRecordOk.has(key);

  const segments = [];
  for (const row of readTimeLedgerEntriesRaw()) {
    const d = ledgerRowDateYmd(row) || ledgerRowEntryDateYmd(row);
    if (d !== key) continue;
    const seg = ledgerRowDaySegment(row);
    if (seg) segments.push(seg);
  }
  return isTimeRecordingCompleteFromSegments(segments);
}

function getBudgetGoalsForDay(ymd) {
  const key = normYmd(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return {};
  try {
    const raw = readTimeDailyBudgetGoalsRaw();
    const all = raw ? JSON.parse(raw) : {};
    const result = all[key];
    if (!result || typeof result !== "object" || Array.isArray(result)) return {};
    return result;
  } catch (_) {
    return {};
  }
}

/** 데일리뷰 예상 일정(시간 블록)이 하나라도 있으면 true */
function dayGoalsHaveSchedule(goals) {
  if (!goals || typeof goals !== "object" || Array.isArray(goals)) return false;
  for (const [taskName, data] of Object.entries(goals)) {
    if (taskName.startsWith(BUDGET_PLACEHOLDER_PREFIX)) continue;
    const sched = Array.isArray(data?.scheduledTimes)
      ? data.scheduledTimes
      : data?.scheduledTime && String(data.scheduledTime).trim()
        ? [String(data.scheduledTime).trim()]
        : [];
    if (sched.some((x) => String(x || "").trim())) return true;
  }
  return false;
}

export function hasTimePlanForDay(ymd) {
  const key = normYmd(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  if (_paintLedgerIndex) return _paintLedgerIndex.timePlanOk.has(key);
  return dayGoalsHaveSchedule(getBudgetGoalsForDay(key));
}

function loadKpiMapData(storageKey) {
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

/** @returns {Map<string, { kpi: object, storageKey: string, data: object }>} */
function indexKpisById() {
  /** @type {Map<string, { kpi: object, storageKey: string, data: object }>} */
  const map = new Map();
  for (const { storageKey } of KPI_DOMAIN_STORAGE) {
    const data = loadKpiMapData(storageKey);
    for (const kpi of data.kpis || []) {
      const id = String(kpi?.id || "").trim();
      if (!id || map.has(id)) continue;
      map.set(id, { kpi, storageKey, data });
    }
  }
  return map;
}

/** 해당일 시간가계부에 이 과제 기록이 있으면 true */
/**
 * @typedef {{
 *   timeRecordOk: Set<string>,
 *   timePlanOk: Set<string>,
 *   taskIdDays: Map<string, Set<string>>,
 *   taskNameDays: Map<string, Set<string>>,
 * }} HabitTrackerLedgerDayIndex
 */

/** @type {HabitTrackerLedgerDayIndex | null} */
let _paintLedgerIndex = null;

/**
 * 잔디표 1회 페인트용 — 가계부·일간계획을 날짜별로 한 번만 훑음
 * @param {Iterable<string>} dateKeys
 * @returns {HabitTrackerLedgerDayIndex}
 */
function buildHabitTrackerLedgerDayIndex(dateKeys) {
  /** @type {Set<string>} */
  const dateKeySet = new Set();
  for (const dk of dateKeys || []) {
    const k = normYmd(dk);
    if (/^\d{4}-\d{2}-\d{2}$/.test(k)) dateKeySet.add(k);
  }

  /** @type {Set<string>} */
  const timePlanOk = new Set();
  let budgetAll = {};
  try {
    const raw = readTimeDailyBudgetGoalsRaw();
    budgetAll = raw ? JSON.parse(raw) : {};
  } catch (_) {
    budgetAll = {};
  }
  for (const ymd of dateKeySet) {
    if (dayGoalsHaveSchedule(budgetAll[ymd])) timePlanOk.add(ymd);
  }

  /** @type {Map<string, { startMin: number, endMin: number }[]>} */
  const segmentsByDay = new Map();
  /** @type {Map<string, Set<string>>} */
  const taskIdDays = new Map();
  /** @type {Map<string, Set<string>>} */
  const taskNameDays = new Map();

  const addDay = (map, key, ymd) => {
    if (!key) return;
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(ymd);
  };

  for (const row of readTimeLedgerEntriesRaw()) {
    const d = normYmd(ledgerRowDateYmd(row) || ledgerRowEntryDateYmd(row));
    if (!d || (dateKeySet.size > 0 && !dateKeySet.has(d))) continue;

    const seg = ledgerRowDaySegment(row);
    if (seg) {
      let list = segmentsByDay.get(d);
      if (!list) {
        list = [];
        segmentsByDay.set(d, list);
      }
      list.push(seg);
    }

    const tracked = parseTimeTrackedToMinutes(row.timeTracked);
    if (tracked <= 0 && !seg) continue;
    addDay(taskIdDays, String(row.taskId || "").trim(), d);
    addDay(taskNameDays, String(row.taskName || "").trim(), d);
  }

  /** @type {Set<string>} */
  const timeRecordOk = new Set();
  for (const [ymd, segs] of segmentsByDay) {
    if (isTimeRecordingCompleteFromSegments(segs)) timeRecordOk.add(ymd);
  }

  return { timeRecordOk, timePlanOk, taskIdDays, taskNameDays };
}

function hasLedgerActivityForTaskOnDay(taskId, taskName, ymd) {
  const tid = String(taskId || "").trim();
  const name = String(taskName || "").trim();
  if (!tid && !name) return false;
  const key = normYmd(ymd);
  if (_paintLedgerIndex) {
    if (tid && _paintLedgerIndex.taskIdDays.get(tid)?.has(key)) return true;
    if (!tid && name && _paintLedgerIndex.taskNameDays.get(name)?.has(key)) {
      return true;
    }
    return false;
  }
  for (const row of readTimeLedgerEntriesRaw()) {
    const d = ledgerRowDateYmd(row) || ledgerRowEntryDateYmd(row);
    if (normYmd(d) !== key) continue;
    const tracked = parseTimeTrackedToMinutes(row.timeTracked);
    if (tracked <= 0 && !ledgerRowDaySegment(row)) continue;
    if (tid && String(row.taskId || "").trim() === tid) return true;
    if (!tid && name && String(row.taskName || "").trim() === name) return true;
  }
  return false;
}

/** @param {HabitTrackerRow} row */
function ensureRowEntryByYmd(row) {
  if (row?._entryByYmd instanceof Map) return row._entryByYmd;
  /** @type {Map<string, object>} */
  const map = new Map();
  if (row?.kind === "kpi" && row.kpi) {
    const kid = String(row.kpi.id || "").trim();
    const logs = (row.storedLogs || []).filter(
      (l) => String(l?.kpiId || "").trim() === kid,
    );
    try {
      const entries = resolveKpiDetailLogEntriesLocal(row.kpi, logs);
      for (const e of entries || []) {
        const dk = normYmd(e?.dateRaw || e?.date || "");
        if (dk) map.set(dk, e);
      }
    } catch (_) {}
  }
  row._entryByYmd = map;
  return map;
}

/** @param {HabitTrackerRow[]} rows */
function prepareHabitTrackerRowsForPaint(rows) {
  for (const row of rows || []) {
    if (row?.kind === "kpi") ensureRowEntryByYmd(row);
  }
}

function pushKpiHabitRow(rows, seenKpiIds, kpi, storageKey, data) {
  const kpiId = String(kpi?.id || "").trim();
  const name = String(kpi?.name || "").trim();
  if (!kpiId || !name || seenKpiIds.has(kpiId)) return;
  seenKpiIds.add(kpiId);
  const dailyTodos = (
    Array.isArray(data.kpiDailyRepeatTodos) ? data.kpiDailyRepeatTodos : []
  ).filter((t) => String(t?.kpiId || "").trim() === kpiId);
  rows.push({
    id: `kpi-${kpiId}`,
    kind: "kpi",
    label: name,
    kpi,
    storageKey,
    storedLogs: Array.isArray(data.kpiLogs) ? data.kpiLogs : [],
    dailyTodos,
    habitStartYmd: getKpiHabitTrackerStartYmd(kpi),
  });
}

/**
 * @param {number} year
 * @param {number} month
 * @param {{ skipSync?: boolean, habitsOnly?: boolean }} [opts]
 *   habitsOnly — 달성률·링용. 매일 반복 KPI만 (잔디표는 과제목록 전체)
 * @returns {HabitTrackerRow[]}
 */
export function buildHabitTrackerRows(year, month, opts = {}) {
  if (!opts.skipSync) {
    ensureAllKpiTimeTasksFromStorage();
    try {
      syncHabitTrackerLogs({ throttleMs: 1500 });
    } catch (_) {}
  }

  /** @type {HabitTrackerRow[]} */
  const rows = [
    { id: "builtin-time-record", kind: "time-record", label: "시간기록하기" },
    { id: "builtin-time-plan", kind: "time-plan", label: "시간 계획하기" },
  ];
  const seenKpiIds = new Set();

  /* 하단 달성률·오늘 링 — 예전과 같이 매일 반복만 */
  if (opts.habitsOnly) {
    for (const { storageKey } of KPI_DOMAIN_STORAGE) {
      const data = loadKpiMapData(storageKey);
      for (const kpi of data.kpis || []) {
        if (!kpi?.needHabitTracker) continue;
        pushKpiHabitRow(rows, seenKpiIds, kpi, storageKey, data);
      }
    }
    return rows;
  }

  const seenTaskIds = new Set();
  const kpiById = indexKpisById();

  /* 잔디표 — 시간가계부 과제목록 전부 */
  for (const task of getFullTaskOptions()) {
    const name = String(task?.name || "").trim();
    if (!name || BUILTIN_TRACKER_TASK_NAMES.has(name)) continue;
    const tid = String(task?.id || "").trim();
    if (tid) {
      if (seenTaskIds.has(tid)) continue;
      seenTaskIds.add(tid);
    }

    const kpiId = String(task?.kpiId || "").trim();
    const linked = kpiId ? kpiById.get(kpiId) : null;
    if (linked && isKpiEligibleForTimeTaskList(linked.kpi)) {
      pushKpiHabitRow(
        rows,
        seenKpiIds,
        linked.kpi,
        linked.storageKey,
        linked.data,
      );
      continue;
    }

    rows.push({
      id: tid ? `task-${tid}` : `task-name-${name}`,
      kind: "ledger-task",
      label: name,
      taskId: tid,
      taskName: name,
    });
  }
  return rows;
}

function pad2Local(n) {
  return String(n).padStart(2, "0");
}

function ymdFromLocalDate(d) {
  return `${d.getFullYear()}-${pad2Local(d.getMonth() + 1)}-${pad2Local(d.getDate())}`;
}

/** @param {number} year @param {number} month 1-12 */
export function buildMonthDateKeys(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return [];
  const lastDay = new Date(y, m, 0).getDate();
  /** @type {string[]} */
  const keys = [];
  for (let d = 1; d <= lastDay; d += 1) {
    keys.push(`${y}-${pad2Local(m)}-${pad2Local(d)}`);
  }
  return keys;
}

/** 기준일이 속한 주(월~일) 7일 */
export function habitTrackerWeekDateKeys(refYmd) {
  const raw = String(refYmd || "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
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
    keys.push(ymdFromLocalDate(d));
  }
  return keys;
}

/** @param {string} anchorYmd @param {number} weekDelta */
export function shiftHabitTrackerWeekAnchorYmd(anchorYmd, weekDelta) {
  const keys = habitTrackerWeekDateKeys(anchorYmd);
  const monday = keys[0] || String(anchorYmd || "").slice(0, 10);
  const m = monday.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return monday;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  d.setDate(d.getDate() + Math.trunc(Number(weekDelta) || 0) * 7);
  return ymdFromLocalDate(d);
}

/** @param {string[]} weekKeys */
export function formatHabitTrackerWeekRangeLabel(weekKeys) {
  const keys = Array.isArray(weekKeys) ? weekKeys.filter(Boolean) : [];
  if (!keys.length) return "";
  const a = String(keys[0] || "");
  const b = String(keys[keys.length - 1] || a);
  const fmt = (ymd) => {
    const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return ymd;
    return `${Number(m[2])}/${Number(m[3])}`;
  };
  return `${fmt(a)} – ${fmt(b)}`;
}

/** @param {number} year @param {number} month 1-12 */
export function formatHabitTrackerMonthCornerLabel(year, month) {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "";
  return `${y}/${m}`;
}

/** @param {string} dateKey — 열 제목: 일(1, 2, 3…) */
export function formatHabitTrackerDayColLabel(dateKey) {
  const key = normYmd(dateKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return "";
  const day = parseInt(key.slice(8, 10), 10);
  if (!Number.isFinite(day)) return key;
  return String(day);
}

/**
 * @param {HabitTrackerRow} row
 * @param {object | undefined} entry
 * @returns {{ done: number, total: number }}
 */
function dailyTodoProgressFromEntry(row, entry) {
  const todos = (Array.isArray(row.dailyTodos) ? row.dailyTodos : []).filter(
    (t) => String(t?.id || "").trim() || String(t?.text || "").trim(),
  );
  const total = todos.length;
  if (total <= 0) return { done: 0, total: 0 };
  const completed = Array.isArray(entry?.dailyCompleted)
    ? entry.dailyCompleted
    : [];
  let done = 0;
  for (const t of todos) {
    if (isHabitDailyTodoCompleted(t, completed)) done += 1;
  }
  return { done, total };
}

/**
 * @param {HabitTrackerRow} row
 * @param {string} dateKey
 * @returns {{ text: string, beforeStart: boolean, level: 0|1|2|3|4 }}
 */
export function getHabitTrackerCellDisplay(row, dateKey) {
  const dk = normYmd(dateKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) {
    return { text: "", beforeStart: false, level: 0 };
  }

  if (row.kind === "kpi" && row.kpi && isKpiHabitDateBeforeStart(row.kpi, dk)) {
    return { text: "", beforeStart: true, level: 0 };
  }

  if (row.kind === "time-record") {
    const ok = isTimeRecordingCompleteForDay(dk);
    return { text: ok ? "O" : "", beforeStart: false, level: ok ? 4 : 0 };
  }
  if (row.kind === "time-plan") {
    const ok = hasTimePlanForDay(dk);
    return { text: ok ? "O" : "", beforeStart: false, level: ok ? 4 : 0 };
  }
  if (row.kind === "ledger-task") {
    const ok = hasLedgerActivityForTaskOnDay(row.taskId, row.taskName, dk);
    return { text: ok ? "O" : "", beforeStart: false, level: ok ? 4 : 0 };
  }

  const entry = ensureRowEntryByYmd(row).get(dk);
  const { done, total } = dailyTodoProgressFromEntry(row, entry);
  if (total > 0) {
    const level =
      done <= 0
        ? 0
        : /** @type {1|2|3|4} */ (
            Math.min(4, Math.max(1, Math.ceil((done / total) * 4)))
          );
    return {
      text: `${done}/${total}`,
      beforeStart: false,
      level,
    };
  }

  const text = getHabitTrackerCellTextFromEntry(row, entry);
  return {
    text,
    beforeStart: false,
    level: text ? 4 : 0,
  };
}

/**
 * 해당일 매일할일 완료 수
 * @param {HabitTrackerRow} row
 * @param {string} dateKey
 * @returns {{ done: number, total: number }}
 */
export function getHabitTrackerDailyTodoProgress(row, dateKey) {
  if (row?.kind !== "kpi") return { done: 0, total: 0 };
  const dk = normYmd(dateKey);
  const entry = ensureRowEntryByYmd(row).get(dk);
  return dailyTodoProgressFromEntry(row, entry);
}

/**
 * 툴팁용 — "1/4" 형태
 * @param {HabitTrackerRow} row
 * @param {string} dateKey
 */
function getHabitTrackerDailyProgressLabel(row, dateKey) {
  const { done, total } = getHabitTrackerDailyTodoProgress(row, dateKey);
  if (total <= 0) return "";
  return `${done}/${total}`;
}

/**
 * 매일할일 완료 수 / 전체 수 → 잔디 단계 0~4
 * 예: 4개 중 1개 → 1(가장 연함), 4개 중 4개 → 4(가장 진함)
 * @param {HabitTrackerRow} row
 * @param {string} dateKey
 * @param {string} [cellText]
 * @returns {0|1|2|3|4}
 */
export function getHabitTrackerCellLevel(row, dateKey, cellText) {
  const dk = normYmd(dateKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return 0;

  if (row.kind === "time-record") {
    return isTimeRecordingCompleteForDay(dk) ? 4 : 0;
  }
  if (row.kind === "time-plan") {
    return hasTimePlanForDay(dk) ? 4 : 0;
  }
  if (row.kind === "ledger-task") {
    return hasLedgerActivityForTaskOnDay(row.taskId, row.taskName, dk) ? 4 : 0;
  }

  const kpi = row.kpi;
  if (!kpi) return 0;
  if (isKpiHabitDateBeforeStart(kpi, dk)) return 0;

  const entry = ensureRowEntryByYmd(row).get(dk);
  const { done, total } = dailyTodoProgressFromEntry(row, entry);
  if (total > 0) {
    if (done <= 0) return 0;
    return /** @type {1|2|3|4} */ (
      Math.min(4, Math.max(1, Math.ceil((done / total) * 4)))
    );
  }

  const text =
    cellText != null
      ? String(cellText)
      : getHabitTrackerCellTextFromEntry(row, entry);
  if (!text) return 0;
  return 4;
}

/** @param {{id?: string, text?: string}} todo @param {object[]} completedList */
function isHabitDailyTodoCompleted(todo, completedList) {
  const tid = String(todo?.id || "").trim();
  const ttext = String(todo?.text || "").trim();
  for (const x of completedList || []) {
    const xid = String(x?.id || "").trim();
    const xtext = String(x?.text || "").trim();
    if (tid && xid && tid === xid) return true;
    if (ttext && xtext && ttext === xtext) return true;
  }
  return false;
}

/**
 * @param {HabitTrackerRow} row
 * @param {string} dateKey
 * @returns {string}
 */
/** @param {HabitTrackerRow} row @param {object | undefined} entry */
function getHabitTrackerCellTextFromEntry(row, entry) {
  const kpi = row?.kpi;
  if (!kpi || !entry) return "";

  if (kpiHasHabitUnitGoal(kpi)) {
    const text = formatKpiHistoryValueText(entry, kpi).trim();
    if (!text || text === "—") return "";
    return text;
  }

  const v = String(entry.value ?? "").trim();
  const hasChecks = (entry.dailyCompleted || []).length > 0;
  const hasLedger =
    (Array.isArray(entry.timeLedgerEntryIds) &&
      entry.timeLedgerEntryIds.length > 0) ||
    Number(entry.__ledgerMinutes) > 0;
  if (hasChecks || hasLedger || (v && v !== "0")) return "O";
  return "";
}

export function getHabitTrackerCellText(row, dateKey) {
  const dk = normYmd(dateKey);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) return "";

  if (row.kind === "kpi" && row.kpi && isKpiHabitDateBeforeStart(row.kpi, dk)) {
    return "";
  }

  if (row.kind === "time-record") {
    return isTimeRecordingCompleteForDay(dk) ? "O" : "";
  }
  if (row.kind === "time-plan") {
    return hasTimePlanForDay(dk) ? "O" : "";
  }
  if (row.kind === "ledger-task") {
    return hasLedgerActivityForTaskOnDay(row.taskId, row.taskName, dk)
      ? "O"
      : "";
  }

  return getHabitTrackerCellTextFromEntry(
    row,
    ensureRowEntryByYmd(row).get(dk),
  );
}

/**
 * @param {{
 *   year?: number,
 *   month?: number,
 *   refDate?: Date,
 *   skipSync?: boolean,
 *   viewMode?: "month" | "week",
 *   weekAnchorYmd?: string,
 * }} [opts]
 */
export function buildHabitTrackerPageModel(opts = {}) {
  const refDate = opts.refDate instanceof Date ? opts.refDate : new Date();
  const todayYmd = ymdFromLocalDate(refDate);
  const viewMode = opts.viewMode === "week" ? "week" : "month";
  const rowOpts = opts.skipSync ? { skipSync: true } : {};

  /** @type {{
   *   year: number,
   *   month: number,
   *   todayYmd: string,
   *   dateKeys: string[],
   *   rows: HabitTrackerRow[],
   *   viewMode: "month" | "week",
   *   weekAnchorYmd?: string,
   * }} */
  let model;

  if (viewMode === "week") {
    const dateKeys = habitTrackerWeekDateKeys(
      opts.weekAnchorYmd || todayYmd,
    );
    /** @type {Map<string, HabitTrackerRow>} */
    const rowsById = new Map();
    const seenYm = new Set();
    for (const dk of dateKeys) {
      const ym = dk.slice(0, 7);
      if (seenYm.has(ym)) continue;
      seenYm.add(ym);
      const y = Number(dk.slice(0, 4));
      const m = Number(dk.slice(5, 7));
      for (const row of buildHabitTrackerRows(y, m, rowOpts)) {
        if (!rowsById.has(row.id)) rowsById.set(row.id, row);
      }
    }
    const mid = dateKeys[3] || dateKeys[0] || todayYmd;
    model = {
      year: Number(mid.slice(0, 4)) || refDate.getFullYear(),
      month: Number(mid.slice(5, 7)) || refDate.getMonth() + 1,
      todayYmd,
      dateKeys,
      rows: [...rowsById.values()],
      viewMode: "week",
      weekAnchorYmd: dateKeys[0] || todayYmd,
    };
  } else {
    const year = Number.isFinite(Number(opts.year))
      ? Number(opts.year)
      : refDate.getFullYear();
    const month = Number.isFinite(Number(opts.month))
      ? Number(opts.month)
      : refDate.getMonth() + 1;
    model = {
      year,
      month,
      todayYmd,
      dateKeys: buildMonthDateKeys(year, month),
      rows: buildHabitTrackerRows(year, month, rowOpts),
      viewMode: "month",
    };
  }

  prepareHabitTrackerRowsForPaint(model.rows);
  /* 셀 DOM 생성까지 유지 — createHabitTrackerPageGridElement 가 finally 에서 해제 */
  _paintLedgerIndex = buildHabitTrackerLedgerDayIndex(model.dateKeys);
  return model;
}

/** 격자 DOM 생성 직후 호출 — 페인트용 인덱스 해제 */
export function releaseHabitTrackerPaintCaches() {
  _paintLedgerIndex = null;
}
