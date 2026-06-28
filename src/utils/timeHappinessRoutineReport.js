/**
 * 행복 루틴 점검 — needHabitTracker(매일반복) KPI · 매일할일 체크 집계
 */

import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import {
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

function isHabitRoutineKpi(kpi) {
  if (!kpi || typeof kpi !== "object") return false;
  if (!kpi.needHabitTracker) return false;
  if (kpi.useTaskCompletionGoal) return false;
  return happinessKpiInTabScope(kpi);
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

/** @returns {Map<string, object[]>} dateRaw → habitDailyCompleted */
function buildLedgerDailyCompletedByDate(kpiId, startYmd, endYmd) {
  const map = new Map();
  for (const day of getKpiDailyLedgerSummaries(kpiId, "", {
    startYmd,
    endYmd,
  })) {
    const dk = normYmd(day?.dateRaw);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
    const list = Array.isArray(day.habitDailyCompleted) ? day.habitDailyCompleted : [];
    if (list.length > 0) map.set(dk, list);
  }
  return map;
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
 */
export function buildHappinessRoutineReportSnapshot(range) {
  ensureAllKpiTimeTasksFromStorage();
  migrateTimeLogRowsTaskIds();
  syncHabitTrackerLogs();
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
    if (!todos.length) continue;

    const ledgerByDate =
      /^\d{4}-\d{2}-\d{2}$/.test(rangeStart) &&
      /^\d{4}-\d{2}-\d{2}$/.test(rangeEnd)
        ? buildLedgerDailyCompletedByDate(kpiId, rangeStart, rangeEnd)
        : new Map();

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
          ledgerByDate,
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

    const executionPct =
      routineOpportunities > 0
        ? Math.round((routineChecks / routineOpportunities) * 100)
        : 0;

    routines.push({
      kpiId,
      name,
      executionPct,
      totalChecks: routineChecks,
      totalOpportunities: routineOpportunities,
      isWellKept: executionPct >= ROUTINE_WELL_KEPT_PCT,
      items,
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
      b.totalChecks - a.totalChecks ||
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
