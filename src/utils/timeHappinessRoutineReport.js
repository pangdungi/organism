/**
 * 행복 루틴 점검 — 기본 루틴 KPI + 매일 반복(needHabitTracker) KPI · 매일할일 체크 집계
 */

import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import {
  DEFAULT_BEDTIME_ROUTINE_KPI_ID,
  DEFAULT_MORNING_ROUTINE_KPI_ID,
  DEFAULT_MOVE_ROUTINE_KPI_ID,
  DEFAULT_OUT_AFTER_ROUTINE_KPI_ID,
  DEFAULT_OUT_PREP_ROUTINE_KPI_ID,
  DEFAULT_TIDY_ROUTINE_KPI_ID,
  ensureHappinessMapDefaults,
  flattenHappinessMapForKpiOnlyTab,
  HAPPINESS_KPI_GLOBAL_SCOPE_ID,
  HAPPINESS_KPI_MAP_STORAGE_KEY,
} from "./happinessKpiMapSupabase.js";
import {
  getKpiDailyLedgerSummaries,
  mergeDailyCompletedLists,
  syncHabitTrackerLogs,
} from "./timeKpiSync.js";
import { migrateTimeLogRowsTaskIds } from "./timeTaskOptionsModel.js";
import { ensureAllKpiTimeTasksFromStorage } from "./kpiTimeTaskSync.js";
import { resolveKpiDetailLogEntriesLocal } from "./kpiTimeLedgerLogs.js";

const ROUTINE_WELL_KEPT_PCT = 75;
const ITEM_WEAK_PCT = 50;

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

function normalizeLogDate(val) {
  if (!val || typeof val !== "string") return "";
  const s = val.trim().replace(/\//g, "-");
  const m = s.match(/(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/);
  if (m) {
    return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  }
  return s.slice(0, 10);
}

function happinessKpiInTabScope(kpi) {
  const hid = String(kpi?.happinessId ?? "").trim();
  return !hid || hid === HAPPINESS_KPI_GLOBAL_SCOPE_ID;
}

/** 행복 기본 루틴 KPI (잡무·독서 등 과제완료형은 제외) */
const DEFAULT_HAPPINESS_ROUTINE_KPI_IDS = new Set([
  DEFAULT_MORNING_ROUTINE_KPI_ID,
  DEFAULT_MOVE_ROUTINE_KPI_ID,
  DEFAULT_TIDY_ROUTINE_KPI_ID,
  DEFAULT_OUT_PREP_ROUTINE_KPI_ID,
  DEFAULT_OUT_AFTER_ROUTINE_KPI_ID,
  DEFAULT_BEDTIME_ROUTINE_KPI_ID,
]);

function isDefaultHappinessRoutineKpi(kpi) {
  return DEFAULT_HAPPINESS_ROUTINE_KPI_IDS.has(String(kpi?.id ?? ""));
}

/**
 * 행복 루틴 점검 대상:
 * - 행복 기본 루틴 KPI
 * - 행복에 추가된 KPI 중 매일 반복(needHabitTracker)이 켜진 것
 */
function isHabitRoutineKpi(kpi) {
  if (!kpi || typeof kpi !== "object") return false;
  if (!happinessKpiInTabScope(kpi)) return false;
  if (isDefaultHappinessRoutineKpi(kpi)) return true;
  return !!kpi.needHabitTracker;
}

function getOrderedHabitKpis(data) {
  const all = (data?.kpis || []).filter(isHabitRoutineKpi);
  const order = (data?.kpiOrder || {})[HAPPINESS_KPI_GLOBAL_SCOPE_ID];
  if (!Array.isArray(order) || !order.length) return all;
  const orderMap = new Map(order.map((id, i) => [String(id), i]));
  return [...all].sort((a, b) => {
    const ia = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 999;
    const ib = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 999;
    return ia - ib;
  });
}

function loadHappinessMapForReport() {
  try {
    const raw = readKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return ensureHappinessMapDefaults(flattenHappinessMapForKpiOnlyTab(parsed));
  } catch (_) {
    return ensureHappinessMapDefaults(flattenHappinessMapForKpiOnlyTab({}));
  }
}

function dailyTodosForKpi(data, kpiId) {
  const kid = String(kpiId || "").trim();
  const deleted = new Set(
    (data?.deletedRefs?.kpiDailyRepeatTodos || []).map(String),
  );
  return (data?.kpiDailyRepeatTodos || []).filter((t) => {
    if (String(t.kpiId || "").trim() !== kid) return false;
    if (!(t.text || "").trim()) return false;
    if (deleted.has(String(t.id || ""))) return false;
    return true;
  });
}

/** @returns {Map<string, object>} key = `${kpiId}|${dateKey}` */
function buildLogIndex(kpiLogs) {
  const map = new Map();
  for (const log of kpiLogs || []) {
    const kid = String(log?.kpiId || "").trim();
    const dk = normalizeLogDate(log?.dateRaw || log?.date || "");
    if (!kid || dk.length < 10) continue;
    map.set(`${kid}|${dk}`, log);
  }
  return map;
}

/** KPI 로그·과제 기록( taskId↔kpiId ) 양쪽 체크 — id 또는 텍스트 일치 */
function isDailyTodoCompleted(todoId, todoText, completedList) {
  const tid = String(todoId || "").trim();
  const ttext = String(todoText || "").trim();
  for (const x of completedList || []) {
    const xid = String(x?.id || "").trim();
    const xtext = String(x?.text || "").trim();
    if (tid && xid && tid === xid) return true;
    if (ttext && xtext && ttext === xtext) return true;
  }
  return false;
}

/**
 * @returns {{
 *   completedByDate: Map<string, object[]>,
 *   minutesByDate: Map<string, number>,
 *   performedByDate: Map<string, string>,
 * }}
 */
function buildLedgerDayMaps(kpiId, startYmd, endYmd) {
  /** @type {Map<string, object[]>} */
  const completedByDate = new Map();
  /** @type {Map<string, number>} */
  const minutesByDate = new Map();
  /** @type {Map<string, string>} */
  const performedByDate = new Map();
  for (const day of getKpiDailyLedgerSummaries(kpiId, "", {
    startYmd,
    endYmd,
  })) {
    const dk = normYmd(day?.dateRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
    const list = Array.isArray(day.habitDailyCompleted)
      ? day.habitDailyCompleted
      : [];
    if (list.length > 0) completedByDate.set(dk, list);
    const mins = Math.max(0, Math.round(Number(day?.minutes) || 0));
    if (mins > 0) minutesByDate.set(dk, mins);
    const performed = String(day?.performedValue || "").trim();
    if (performed) performedByDate.set(dk, performed);
  }
  return { completedByDate, minutesByDate, performedByDate };
}

/** 그날 루틴을 ‘했는지’ — 시간/수행값 기준 (매일할일 체크와 무관) */
function isRoutineDoneOnDay(day, minutesByDate, performedByDate, resolvedEntry) {
  if ((minutesByDate.get(day) || 0) > 0) return true;
  if (performedByDate.has(day)) return true;
  if (!resolvedEntry) return false;
  const ledgerMin = Math.max(
    0,
    Math.round(Number(resolvedEntry.__ledgerMinutes) || 0),
  );
  if (ledgerMin > 0) return true;
  if (String(resolvedEntry.value || "").trim()) return true;
  if (String(resolvedEntry.memo || "").trim()) return true;
  const entryIds = resolvedEntry.timeLedgerEntryIds;
  if (Array.isArray(entryIds) && entryIds.length > 0) return true;
  return false;
}

function mergedDailyCompletedForKpiDay(
  logIndex,
  ledgerByDate,
  kpiId,
  day,
  resolvedEntriesByDay,
) {
  const fromResolved = resolvedEntriesByDay?.get(day);
  const fromLog = Array.isArray(fromResolved?.dailyCompleted)
    ? fromResolved.dailyCompleted
    : Array.isArray(logIndex.get(`${kpiId}|${day}`)?.dailyCompleted)
      ? logIndex.get(`${kpiId}|${day}`).dailyCompleted
      : [];
  const fromLedger = ledgerByDate.get(day) || [];
  return mergeDailyCompletedLists(
    mergeDailyCompletedLists(fromLog, fromLedger),
    [],
  );
}

/**
 * @param {{ start: string, end: string }} range
 * @param {{ skipSync?: boolean }} [opts]
 */
export function buildHappinessRoutineReportSnapshot(range, opts = {}) {
  ensureAllKpiTimeTasksFromStorage();
  migrateTimeLogRowsTaskIds();
  if (!opts.skipSync) syncHabitTrackerLogs();
  const data = loadHappinessMapForReport();
  const kpis = getOrderedHabitKpis(data);
  const calendarDays = listDatesInclusive(range?.start, range?.end);
  const calendarDayCount = calendarDays.length;
  const logIndex = buildLogIndex(data.kpiLogs || []);
  const rangeStart = calendarDays[0] || normYmd(range?.start);
  const rangeEnd = calendarDays[calendarDays.length - 1] || normYmd(range?.end);

  const routines = [];

  for (const kpi of kpis) {
    const kpiId = String(kpi.id || "").trim();
    const name = String(kpi.name || "").trim() || "(이름 없음)";
    const todos = dailyTodosForKpi(data, kpiId);
    /* 매일할일이 없어도 루틴 KPI 자체는 목록에 표시 */

    const ledgerMaps =
      /^\d{4}-\d{2}-\d{2}$/.test(rangeStart) &&
      /^\d{4}-\d{2}-\d{2}$/.test(rangeEnd)
        ? buildLedgerDayMaps(kpiId, rangeStart, rangeEnd)
        : {
            completedByDate: new Map(),
            minutesByDate: new Map(),
            performedByDate: new Map(),
          };
    const { completedByDate, minutesByDate, performedByDate } = ledgerMaps;

    const storedLogs = (data.kpiLogs || []).filter(
      (l) => String(l?.kpiId || "").trim() === kpiId,
    );
    const resolvedEntriesByDay = new Map();
    for (const entry of resolveKpiDetailLogEntriesLocal(kpi, storedLogs)) {
      const dk = normalizeLogDate(entry?.dateRaw || entry?.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
      if (!calendarDays.includes(dk)) continue;
      resolvedEntriesByDay.set(dk, entry);
    }

    let daysDone = 0;
    for (const day of calendarDays) {
      if (
        isRoutineDoneOnDay(
          day,
          minutesByDate,
          performedByDate,
          resolvedEntriesByDay.get(day),
        )
      ) {
        daysDone += 1;
      }
    }

    let routineChecks = 0;
    let routineOpportunities = 0;

    /** @type {{ todoId: string, text: string, checkCount: number, opportunityCount: number, executionPct: number }[]} */
    const items = todos.map((todo) => {
      const todoId = String(todo.id || "").trim();
      const text = String(todo.text || "").trim();
      let checkCount = 0;
      let opportunityCount = 0;

      for (const day of calendarDays) {
        opportunityCount += 1;
        routineOpportunities += 1;
        const completedList = mergedDailyCompletedForKpiDay(
          logIndex,
          completedByDate,
          kpiId,
          day,
          resolvedEntriesByDay,
        );
        if (isDailyTodoCompleted(todoId, text, completedList)) {
          checkCount += 1;
          routineChecks += 1;
        }
      }

      const executionPct =
        opportunityCount > 0
          ? Math.round((checkCount / opportunityCount) * 100)
          : 0;

      return {
        todoId,
        text,
        checkCount,
        opportunityCount,
        executionPct,
        isWeak: opportunityCount > 0 && executionPct < ITEM_WEAK_PCT,
      };
    });

    items.sort(
      (a, b) =>
        a.executionPct - b.executionPct ||
        a.checkCount - b.checkCount ||
        a.text.localeCompare(b.text, "ko"),
    );

    /* 루틴 실행율 = 한 날 했는지 여부만 (매일할일 체크 비율과 무관) */
    const executionPct =
      calendarDayCount > 0
        ? Math.round((daysDone / calendarDayCount) * 100)
        : 0;

    const keptItems = items.filter((i) => i.checkCount > 0);
    const missedItems = items.filter((i) => i.checkCount === 0);

    routines.push({
      kpiId,
      name,
      executionPct,
      daysDone,
      dayCount: calendarDayCount,
      totalChecks: routineChecks,
      totalOpportunities: routineOpportunities,
      isWellKept: executionPct >= ROUTINE_WELL_KEPT_PCT,
      items,
      keptItems,
      missedItems,
      weakItems: items.filter((i) => i.isWeak),
    });
  }

  const wellKept = routines.filter((r) => r.isWellKept);
  const needsAttention = routines.filter((r) => !r.isWellKept);
  const allWeakItems = routines.flatMap((r) =>
    r.weakItems.map((i) => ({ routineName: r.name, ...i })),
  );
  allWeakItems.sort(
    (a, b) =>
      a.executionPct - b.executionPct || a.text.localeCompare(b.text, "ko"),
  );

  const byExecutionDesc = [...routines].sort(
    (a, b) =>
      b.executionPct - a.executionPct ||
      (b.daysDone || 0) - (a.daysDone || 0) ||
      a.name.localeCompare(b.name, "ko"),
  );
  const bestRoutine = byExecutionDesc[0] || null;
  const worstRoutine =
    byExecutionDesc.length > 1
      ? byExecutionDesc[byExecutionDesc.length - 1]
      : bestRoutine;

  return {
    hasData: routines.length > 0,
    calendarDayCount,
    routines,
    wellKept,
    needsAttention,
    allWeakItems,
    bestRoutine,
    worstRoutine,
    isSingleRoutine: routines.length === 1,
  };
}
