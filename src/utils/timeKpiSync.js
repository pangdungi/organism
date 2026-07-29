/**
 * KPI ↔ 시간가계부 연동
 * - 과제는 time_ledger_tasks의 kpiId·taskId로만 집계 (이름 대조 금지).
 */

import { readTimeLedgerEntriesRaw } from "./timeLedgerEntriesModel.js";
import { stampAndPersistKpiMap } from "./kpiTodoSync.js";
import {
  getFullTaskOptions,
  readTaskOptionsMemRows,
  getTaskOptionByName,
  getTaskOptionById,
} from "./timeTaskOptionsModel.js";
import { isUuid } from "./idUtils.js";
import {
  KPI_LOG_SOURCE_MANUAL,
  KPI_LOG_SOURCE_TIME_LEDGER,
  defaultManualKpiLogMeta,
} from "./kpiLogFields.js";
import { syncSleepHealthGoalLogsFromTimeLedger } from "./healthSleepGoalTimeLedgerSync.js";
import { kpiSyncDebugEnabled, kpiSyncDebugLog } from "./kpiSyncDebug.js";
import { timeLedgerLocalTodayYmd } from "./timeLedgerEntriesSupabase.js";
export {
  getKpiSyncedTaskNames,
  getKpiSyncActiveKpiIds,
  readKpiMapScopedStorageRaw,
} from "./kpiMapLocalStorage.js";

function parseTimeToHours(str) {
  if (!str || typeof str !== "string") return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h + m / 60;
}

function loadTimeRows() {
  return readTimeLedgerEntriesRaw();
}

/** 레포트 등 — loadTimeRows·과제매칭을 KPI마다 반복하지 않게 */
let _reportAccumRows = null;
/** @type {Map<string, object[]>|null} */
let _reportMatchedRowsByKpi = null;

/**
 * @param {object[]|null|undefined} [rows]
 */
export function beginKpiTimeLedgerReportCache(rows) {
  _reportAccumRows = Array.isArray(rows) ? rows : loadTimeRows();
  _reportMatchedRowsByKpi = null;
  const taskRows = readTaskRowsForKpiMatch();
  /** @type {Map<string, Set<string>>} */
  const kpiIdToTaskIds = new Map();
  /** @type {Map<string, string>} */
  const taskIdToKpiId = new Map();
  for (const o of taskRows) {
    const id = String(o.id || "").trim();
    const kid = String(o.kpiId || "").trim();
    if (!isUuid(id) || !kid) continue;
    taskIdToKpiId.set(id, kid);
    let set = kpiIdToTaskIds.get(kid);
    if (!set) {
      set = new Set();
      kpiIdToTaskIds.set(kid, set);
    }
    set.add(id);
  }
  /** @type {Map<string, object[]>} */
  const matched = new Map();
  for (const r of _reportAccumRows) {
    const resolvedTid = resolveKpiLinkedTaskIdForLedgerRow(
      r,
      taskRows,
      "",
    );
    if (!isUuid(resolvedTid)) continue;
    const kid = taskIdToKpiId.get(resolvedTid);
    if (!kid) continue;
    const hasTime = parseTimeToHours(r.timeTracked) > 0;
    const hasPerf =
      r.kpiPerformedValue != null && String(r.kpiPerformedValue).trim() !== "";
    const hasHabit =
      Array.isArray(r.habitDailyCompleted) && r.habitDailyCompleted.length > 0;
    if (!hasTime && !hasPerf && !hasHabit) continue;
    let arr = matched.get(kid);
    if (!arr) {
      arr = [];
      matched.set(kid, arr);
    }
    arr.push(r);
  }
  _reportMatchedRowsByKpi = matched;
}

export function endKpiTimeLedgerReportCache() {
  _reportAccumRows = null;
  _reportMatchedRowsByKpi = null;
}

function loadTimeRowsForAccum() {
  return _reportAccumRows || loadTimeRows();
}

/** taskId↔kpiId 매칭용 — mem 미로드 시 getFullTaskOptions fallback */
function readTaskRowsForKpiMatch() {
  const mem = readTaskOptionsMemRows();
  if (mem.length > 0) return mem;
  try {
    return getFullTaskOptions().filter(
      (o) => String(o.kpiId || "").trim() || String(o.id || "").trim(),
    );
  } catch (_) {
    return [];
  }
}

/**
 * KPI 연동 과제 — 가계부 행에 taskId 없을 때, kpiId 연결 과제명이 1:1일 때만 id 보완.
 * (KPI 이름 대조가 아니라 time_ledger_tasks.kpiId 가 있는 과제 행만)
 */
function resolveKpiLinkedTaskIdForLedgerRow(row, taskRows, restrictToKpiId = "") {
  const tid = String(row?.taskId || "").trim();
  if (isUuid(tid)) return tid;
  const tn = String(row?.taskName || "").trim();
  if (!tn) return "";
  const kidRestrict = String(restrictToKpiId || "").trim();
  let found = "";
  for (const o of taskRows || []) {
    const oid = String(o.id || "").trim();
    const kid = String(o.kpiId || "").trim();
    if (!isUuid(oid) || !kid) continue;
    if (kidRestrict && kid !== kidRestrict) continue;
    if (String(o.name || "").trim() !== tn) continue;
    if (found) return "";
    found = oid;
  }
  return found;
}

/** KPI에 time_ledger_tasks.kpiId 로 연결된 과제가 있는지 */
export function kpiHasLinkedTimeTask(kpiOrId) {
  const kid =
    kpiOrId && typeof kpiOrId === "object"
      ? String(kpiOrId.id || "").trim()
      : String(kpiOrId || "").trim();
  if (!kid) return false;
  for (const o of readTaskRowsForKpiMatch()) {
    if (String(o.kpiId || "").trim() === kid) return true;
  }
  return false;
}

/** 시간 단위 KPI · 매일 반복 KPI · 가계부 과제 연동 — 로그·누적에 가계부 사용 */
export function kpiShouldUseTimeLedgerLogs(kpi) {
  if (!kpi) return false;
  if (kpi.useTimeAsUnit) return true;
  if (kpi.needHabitTracker) return true;
  return kpiHasLinkedTimeTask(kpi);
}

/**
 * KPI id 기준 시간 합(분). rowsForSum 에 포함된 가계부 줄만 합산한다.
 * taskId ↔ kpiId 연결된 과제 id로만 매칭 (과제명·KPI 이름 대조 없음).
 * @param {string} kpiId
 * @param {Array<object>} rowsForSum
 */
function getMatchingLedgerRowsForKpi(kpiId, rowsForSum) {
  const kid = String(kpiId || "").trim();
  if (!kid) return [];

  if (
    _reportMatchedRowsByKpi &&
    rowsForSum === _reportAccumRows
  ) {
    return _reportMatchedRowsByKpi.get(kid) || [];
  }

  const taskRows = readTaskRowsForKpiMatch();
  const idsForKpi = new Set();
  for (const o of taskRows) {
    if (String(o.kpiId || "").trim() !== kid) continue;
    const id = String(o.id || "").trim();
    if (isUuid(id)) idsForKpi.add(id);
  }

  const taskIdToKpiId = new Map();
  for (const o of taskRows) {
    const tid = String(o.id || "").trim();
    const k = String(o.kpiId || "").trim();
    if (isUuid(tid) && k) taskIdToKpiId.set(tid, k);
  }

  const matched = [];
  const nameOnlySkipped = [];
  for (const r of rowsForSum) {
    const hasTime = !!(r.timeTracked || "").trim();
    const hasPerf = !!sanitizeKpiMeasureLogValue(r.kpiPerformedValue);
    const hasHabit =
      Array.isArray(r.habitDailyCompleted) && r.habitDailyCompleted.length > 0;
    if (!hasTime && !hasPerf && !hasHabit) continue;
    const resolvedTid = resolveKpiLinkedTaskIdForLedgerRow(
      r,
      taskRows,
      kid,
    );
    const tn = String(r.taskName || "").trim();
    if (!isUuid(resolvedTid)) {
      if (tn && kpiSyncDebugEnabled()) {
        nameOnlySkipped.push({
          entryId: String(r.id || "").trim(),
          taskName: tn,
          reason: "task_id 없음",
        });
      }
      continue;
    }
    const mappedKpi = taskIdToKpiId.get(resolvedTid);
    if (idsForKpi.has(resolvedTid) || mappedKpi === kid) {
      matched.push(r);
      continue;
    }
    if (tn && kpiSyncDebugEnabled()) {
      nameOnlySkipped.push({
        entryId: String(r.id || "").trim(),
        taskId: resolvedTid,
        taskName: tn,
        mappedKpiId: mappedKpi || "(없음)",
        reason: "다른 과제 id",
      });
    }
  }

  if (kpiSyncDebugEnabled()) {
    kpiSyncDebugLog("KPI 시간기록 매칭", {
      kpiId: kid,
      linkedTaskIds: [...idsForKpi],
      matchedCount: matched.length,
      matched: matched.map((r) => ({
        entryId: String(r.id || "").trim(),
        taskId: String(r.taskId || "").trim(),
        taskName: String(r.taskName || "").trim(),
        timeTracked: String(r.timeTracked || "").trim(),
      })),
      skipped: nameOnlySkipped.slice(0, 20),
    });
  }

  return matched;
}

function accumulateMinutesForKpiFromRows(kpiId, rowsForSum) {
  let totalHours = 0;
  for (const r of getMatchingLedgerRowsForKpi(kpiId, rowsForSum)) {
    totalHours += parseTimeToHours(r.timeTracked);
  }
  return Math.round(totalHours * 60);
}

/**
 * KPI id 기준 누적 시간(분). 연결된 과제 taskId만 합산.
 * @param {string} kpiId - map_kpis / KPI 카드의 id
 * @param {string=} _kpiName - (미사용, 호환용)
 */
export function getAccumulatedMinutesForKpiId(kpiId, _kpiName) {
  return accumulateMinutesForKpiFromRows(kpiId, loadTimeRowsForAccum());
}

/**
 * KPI id 기준 · 날짜 구간(포함) 안 가계부 줄만 합산한 시간(분).
 * @param {string} kpiId
 * @param {string} startYmdTen - YYYY-MM-DD
 * @param {string} endYmdTenInclusive - YYYY-MM-DD
 */
export function getAccumulatedMinutesForKpiIdInDateRange(
  kpiId,
  startYmdTen,
  endYmdTenInclusive,
  _kpiName = "",
) {
  const s = String(startYmdTen || "").replace(/\//g, "-").slice(0, 10);
  const e = String(endYmdTenInclusive || "").replace(/\//g, "-").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return 0;
  if (s > e) return 0;
  const src = loadTimeRowsForAccum();
  /* 레포트 캐시가 있으면 행을 다시 복사·필터하지 않고 매칭 후 날짜만 검사 */
  if (_reportAccumRows && src === _reportAccumRows) {
    let totalHours = 0;
    for (const r of getMatchingLedgerRowsForKpi(kpiId, src)) {
      const d = ledgerRowDateYmd(r);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < s || d > e) continue;
      totalHours += parseTimeToHours(r.timeTracked);
    }
    return Math.round(totalHours * 60);
  }
  const filtered = src.filter((r) => {
    const d = ledgerRowDateYmd(r);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= s && d <= e;
  });
  return accumulateMinutesForKpiFromRows(kpiId, filtered);
}

/** KPI 목표 기간(시작·마감) — YYYY-MM-DD 또는 빈 문자열 */
export function getKpiTargetDateRange(kpi) {
  const start = normalizeYmdTenForRange(kpi?.targetStartDate);
  const end = normalizeYmdTenForRange(kpi?.targetDeadline);
  return {
    start: /^\d{4}-\d{2}-\d{2}$/.test(start) ? start : "",
    end: /^\d{4}-\d{2}-\d{2}$/.test(end) ? end : "",
  };
}

/** 시간 단위 KPI — 목표 기간이 있으면 그 구간만, 없으면 전체 누적(분) */
export function getAccumulatedMinutesForKpi(kpi) {
  const id = String(kpi?.id || "").trim();
  if (!id) return 0;
  const { start, end } = getKpiTargetDateRange(kpi);
  if (start && end) {
    return getAccumulatedMinutesForKpiIdInDateRange(id, start, end);
  }
  if (start) {
    return getAccumulatedMinutesForKpiIdInDateRange(id, start, "9999-12-31");
  }
  if (end) {
    return getAccumulatedMinutesForKpiIdInDateRange(id, "1970-01-01", end);
  }
  return getAccumulatedMinutesForKpiId(id);
}

/** 특정 일자 KPI 연결 가계부 시간(분) */
export function getAccumulatedMinutesForKpiIdOnDate(kpiId, _kpiName, ymdTen) {
  const d = normalizeYmdTenForRange(ymdTen);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return 0;
  return getAccumulatedMinutesForKpiIdInDateRange(kpiId, d, d);
}

/** 가계부 행 → YYYY-MM-DD (date·startTime) */
export function ledgerRowDateYmd(row) {
  return normalizeLogDate(
    (row?.date || "").toString() || parseDateFromLedgerStartTime(row?.startTime),
  );
}

/**
 * KPI 연결 가계부 — 일별 합산(분·entry id)
 * @param {{ startYmd?: string, endYmd?: string }} [opts]
 */
export function getKpiDailyLedgerSummaries(kpiId, _kpiName, opts = {}) {
  const startYmd = normalizeYmdTenForRange(opts.startYmd);
  const endYmd = normalizeYmdTenForRange(opts.endYmd);
  const matched = getMatchingLedgerRowsForKpi(kpiId, loadTimeRows());
  /** @type {Map<string, { dateRaw: string, dateDisplay: string, minutes: number, entryIds: string[], habitDailyCompleted: Array<{id:string,text:string}> }>} */
  const byDay = new Map();
  for (const r of matched) {
    const d = ledgerRowDateYmd(r);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (startYmd && d < startYmd) continue;
    if (endYmd && d > endYmd) continue;
    if (!byDay.has(d)) {
      byDay.set(d, {
        dateRaw: d,
        dateDisplay: toDisplayDate(d),
        minutes: 0,
        entryIds: [],
        habitDailyCompleted: [],
        performedValue: "",
      });
    }
    const bucket = byDay.get(d);
    bucket.minutes += Math.round(parseTimeToHours(r.timeTracked) * 60);
    const eid = String(r.id || "").trim();
    if (isUuid(eid) && !bucket.entryIds.includes(eid)) {
      bucket.entryIds.push(eid);
    }
    const habitRaw = Array.isArray(r.habitDailyCompleted) ? r.habitDailyCompleted : [];
    if (habitRaw.length > 0) {
      bucket.habitDailyCompleted = mergeDailyCompletedLists(
        bucket.habitDailyCompleted,
        habitRaw,
      );
    }
    const perf = sanitizeKpiMeasureLogValue(r.kpiPerformedValue);
    if (perf) bucket.performedValue = perf;
  }
  return [...byDay.values()].sort((a, b) => b.dateRaw.localeCompare(a.dateRaw));
}

/** KPI·날짜에 연결된 시간기록 «오늘의 수행값» (kpiLogs 없을 때 카드·로그 표시용) */
export function getKpiLedgerPerformedValueOnDate(kpiId, _kpiName, ymdTen) {
  const d = normalizeYmdTenForRange(ymdTen);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  let best = "";
  for (const r of getMatchingLedgerRowsForKpi(kpiId, loadTimeRows())) {
    if (ledgerRowDateYmd(r) !== d) continue;
    const v = sanitizeKpiMeasureLogValue(r.kpiPerformedValue);
    if (v) best = v;
  }
  return best;
}

function parseKpiMeasureNumeric(val) {
  const n = parseFloat(String(val || "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? 0 : n;
}

/**
 * 직접입력 KPI 카드 — kpiLogs + 시간기록 «오늘의 수행값» (목표 기간 내 일별 합산)
 * @param {object} kpi
 * @param {object[]} [storedLogs]
 */
export function getKpiAccumulatedMeasureValue(kpi, storedLogs = []) {
  const kid = String(kpi?.id || "").trim();
  if (!kid || kpi?.useTimeAsUnit || kpi?.useTaskCompletionGoal) {
    return 0;
  }
  /* 매일하기는 체크만이면 누적 수치 없음. 목표값·단위가 있을 때만 일별 수행값 합산 */
  if (kpi?.needHabitTracker) {
    const unit = String(kpi.unit || "").trim();
    const target = String(kpi.targetValue ?? "").trim();
    if (!unit || !target) return 0;
  }
  const { start, end } = getKpiTargetDateRange(kpi);
  const logs = Array.isArray(storedLogs) ? storedLogs : [];

  const inRange = (ymd) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
    if (start && ymd < start) return false;
    if (end && ymd > end) return false;
    return true;
  };

  /** @type {Map<string, number>} */
  const byDay = new Map();
  const setDayVal = (ymd, v) => {
    if (!inRange(ymd) || v <= 0) return;
    byDay.set(ymd, Math.max(byDay.get(ymd) || 0, v));
  };

  for (const log of logs) {
    if (String(log?.kpiId || "").trim() !== kid) continue;
    const d = normalizeKpiLogDateYmd(log?.dateRaw || log?.date || "");
    setDayVal(d, parseKpiMeasureNumeric(log?.value));
  }

  const kpiName = String(kpi?.name || "").trim();
  for (const day of getKpiDailyLedgerSummaries(kid, kpiName, {
    startYmd: start,
    endYmd: end,
  })) {
    const fromLedger = parseKpiMeasureNumeric(day.performedValue);
    if (fromLedger > 0 && !(byDay.get(day.dateRaw) > 0)) {
      setDayVal(day.dateRaw, fromLedger);
    }
  }

  let sum = 0;
  for (const v of byDay.values()) sum += v;
  return sum;
}

export function normalizeKpiLogDateYmd(val) {
  return normalizeLogDate(val);
}

function normalizeYmdTenForRange(raw) {
  return String(raw || "").replace(/\//g, "-").slice(0, 10);
}

/** YYYY-MM-DD 구간(양끝 포함)의 달력 일 수 */
export function countCalendarDaysInInclusiveRange(
  startYmdTen,
  endYmdTenInclusive,
) {
  const s = normalizeYmdTenForRange(startYmdTen);
  const e = normalizeYmdTenForRange(endYmdTenInclusive);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return 0;
  if (s > e) return 0;
  const sy = parseInt(s.slice(0, 4), 10);
  const sm = parseInt(s.slice(5, 7), 10) - 1;
  const sd = parseInt(s.slice(8, 10), 10);
  const ey = parseInt(e.slice(0, 4), 10);
  const em = parseInt(e.slice(5, 7), 10) - 1;
  const ed = parseInt(e.slice(8, 10), 10);
  const t0 = Date.UTC(sy, sm, sd);
  const t1 = Date.UTC(ey, em, ed);
  return Math.floor((t1 - t0) / 86400000) + 1;
}

/**
 * KPI id · 구간 안에서 가계부 기록 1분 이상인 날짜 수(루틴트랙커 월별 「N일 중 M일」).
 */
export function countKpiDaysWithRecordedMinutesInDateRange(
  kpiId,
  startYmdTen,
  endYmdTenInclusive,
) {
  const s = normalizeYmdTenForRange(startYmdTen);
  const e = normalizeYmdTenForRange(endYmdTenInclusive);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return 0;
  if (s > e) return 0;
  /** @type {Map<string, object[]>} */
  const rowsByDay = new Map();
  loadTimeRows().forEach((r) => {
    const d = normalizeYmdTenForRange(r.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d < s || d > e) return;
    if (!rowsByDay.has(d)) rowsByDay.set(d, []);
    rowsByDay.get(d).push(r);
  });
  let activeDays = 0;
  for (const rows of rowsByDay.values()) {
    if (accumulateMinutesForKpiFromRows(kpiId, rows, []) >= 1) activeDays++;
  }
  return activeDays;
}

function shiftYmdByDays(ymdTen, deltaDays) {
  const d = normalizeYmdTenForRange(ymdTen);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "";
  const sy = parseInt(d.slice(0, 4), 10);
  const sm = parseInt(d.slice(5, 7), 10) - 1;
  const sd = parseInt(d.slice(8, 10), 10);
  const dt = new Date(Date.UTC(sy, sm, sd));
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays) || 0);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

function collectTaskLedgerMatchKeys(taskName, taskIdHint = "") {
  const taskIds = new Set();
  const hinted = String(taskIdHint || "").trim();
  if (isUuid(hinted)) taskIds.add(hinted);
  const opt = isUuid(hinted)
    ? getTaskOptionById(hinted)
    : getTaskOptionByName(String(taskName || "").trim());
  const tid = String(opt?.id || hinted || "").trim();
  if (isUuid(tid)) taskIds.add(tid);
  return { names: new Set(), taskIds };
}

function ledgerRowMatchesTaskKeys(row, keys) {
  const rId = String(row?.taskId || "").trim();
  if (!isUuid(rId)) return false;
  return keys.taskIds.has(rId);
}

/**
 * 과제명 · 날짜 구간 — 그 과제를 기록한 날만, 하루 합산 분의 평균.
 * @returns {number|null} null = 해당 구간 기록 없음
 */
export function getTaskDailyAverageMinutesInDateRange(
  taskName,
  startYmdTen,
  endYmdTenInclusive,
  taskIdHint = "",
) {
  const keys = collectTaskLedgerMatchKeys(taskName, taskIdHint);
  if (keys.names.size === 0 && keys.taskIds.size === 0) return null;
  const s = normalizeYmdTenForRange(startYmdTen);
  const e = normalizeYmdTenForRange(endYmdTenInclusive);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) {
    return null;
  }
  if (s > e) return null;
  /** @type {Map<string, number>} */
  const byDay = new Map();
  for (const r of loadTimeRows()) {
    if (!ledgerRowMatchesTaskKeys(r, keys)) continue;
    const tracked = String(r.timeTracked || "").trim();
    if (!tracked) continue;
    const day = ledgerRowDateYmd(r);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < s || day > e) continue;
    const mins = Math.round(parseTimeToHours(tracked) * 60);
    if (mins <= 0) continue;
    byDay.set(day, (byDay.get(day) || 0) + mins);
  }
  if (byDay.size === 0) return null;
  let total = 0;
  for (const mins of byDay.values()) total += mins;
  return Math.round(total / byDay.size);
}

/**
 * 최근 30일(끝 날짜 포함) · 기록한 날 기준 일평균 소요(분).
 * @param {string} [endAnchorYmd] — 기준일(미래면 오늘까지)
 */
export function getTaskDailyAverageMinutesLast30Days(
  taskName,
  endAnchorYmd = "",
  taskIdHint = "",
) {
  const today = timeLedgerLocalTodayYmd();
  let end = normalizeYmdTenForRange(endAnchorYmd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) end = today;
  if (end > today) end = today;
  const start = shiftYmdByDays(end, -29);
  if (!start) return null;
  return getTaskDailyAverageMinutesInDateRange(taskName, start, end, taskIdHint);
}

/**
 * 과제 taskId(우선) 또는 현재 과제 목록 id로 누적 시간(분)
 * @param {string} taskName
 * @param {string} [taskIdHint]
 */
export function getAccumulatedMinutes(taskName, taskIdHint = "") {
  const keys = collectTaskLedgerMatchKeys(taskName, taskIdHint);
  if (keys.taskIds.size === 0) return 0;
  let totalHours = 0;
  for (const r of loadTimeRows()) {
    if (!ledgerRowMatchesTaskKeys(r, keys)) continue;
    if (r.timeTracked) totalHours += parseTimeToHours(r.timeTracked);
  }
  return Math.round(totalHours * 60);
}

/**
 * 분을 hh:mm 형식으로 변환
 */
export function minutesToHhMm(minutes) {
  const m = Math.max(0, Math.floor(minutes));
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * hh:mm 형식을 분으로 변환
 */
export function hhMmToMinutes(str) {
  if (!str || typeof str !== "string") return 0;
  const trimmed = str.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(":");
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

/**
 * KPI 목표 시간(단위=시간): "20" → 20시간, "25:00" → 25시간 0분
 */
export function parseKpiTargetTimeRequiredToMinutes(str) {
  const raw = String(str || "").trim();
  if (!raw) return 0;
  if (raw.includes(":")) return hhMmToMinutes(raw);
  const n = parseFloat(raw.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 60);
}

/** 분 → "20시간" / "1시간 30분" / "30분" */
export function formatMinutesToKoreanHm(minutes) {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m === 0) return "0분";
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min}분`;
  if (min === 0) return `${h}시간`;
  return `${h}시간 ${min}분`;
}

/** targetTimeRequired 저장값 → 카드·진행 표시 */
export function formatKpiTargetTimeRequiredDisplay(str) {
  const raw = String(str || "").trim();
  if (!raw) return "—";
  if (!raw.includes(":")) {
    const n = parseFloat(raw.replace(/[^\d.]/g, ""));
    if (Number.isFinite(n) && n >= 0) {
      const whole = Math.round(n);
      if (Math.abs(n - whole) < 1e-9) return `${whole}시간`;
      return `${n}시간`;
    }
  }
  return formatMinutesToKoreanHm(parseKpiTargetTimeRequiredToMinutes(raw));
}

/** YYYY-MM-DD → "YYYY. MM. DD." */
function toDisplayDate(dateRaw) {
  if (!dateRaw || dateRaw.length < 10) return "";
  const parts = String(dateRaw).replace(/\//g, "-").split("-");
  if (parts.length < 3) return dateRaw;
  return `${parts[0]}. ${parts[1]}. ${parts[2]}.`;
}

/** 로그 날짜를 YYYY-MM-DD로 정규화 */
function normalizeLogDate(val) {
  if (!val || typeof val !== "string") return "";
  const s = val.trim().replace(/\//g, "-");
  const m = s.match(/(\d{4})[.\-\s]*(\d{1,2})[.\-\s]*(\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return s.slice(0, 10);
}

function parseDateFromLedgerStartTime(startTime) {
  if (!startTime || typeof startTime !== "string") return "";
  const m = startTime.trim().match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return "";
  return `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
}

function nextLogId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

/** dailyCompleted 배열 id·텍스트 기준 중복 제거 */
function dedupeDailyCompletedList(arr) {
  const seen = new Set();
  const out = [];
  for (const t of arr || []) {
    if (!t || typeof t !== "object") continue;
    const id = String(t.id || "").trim();
    const text = String(t.text || "").trim();
    const key = id || `text:${text}`;
    if (!id && !text) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: id || key, text: text || id });
  }
  return out;
}

function attachTimeLedgerEntryToLog(log, entryId) {
  const id = String(entryId || "").trim();
  if (!isUuid(id) || !log || typeof log !== "object") return;
  const arr = Array.isArray(log.timeLedgerEntryIds)
    ? [...log.timeLedgerEntryIds]
    : [];
  if (!arr.includes(id)) arr.push(id);
  log.timeLedgerEntryIds = arr;
  log.kpiLogSource = KPI_LOG_SOURCE_TIME_LEDGER;
}

/** @param {object} log */
function logIsExplicitManual(log) {
  return log?.kpiLogSource === KPI_LOG_SOURCE_MANUAL;
}

/** dailyCompleted 병합: prev·next 를 id·텍스트 기준 합침 */
export function mergeDailyCompletedLists(prev, next) {
  const seen = new Set();
  const out = [];
  const add = (t) => {
    if (!t || typeof t !== "object") return;
    const id = String(t.id || "").trim();
    const text = String(t.text || "").trim();
    const key = id || `text:${text}`;
    if (!id && !text) return;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ id: id || key, text: text || id });
  };
  for (const t of prev || []) add(t);
  for (const t of next || []) add(t);
  return out;
}

const STORAGE_CONFIG = [
  { key: "kpi-dream-map", kpiKey: "dreamId", idKey: "dreamId" },
  { key: "kpi-sideincome-paths", kpiKey: "pathId", idKey: "pathId" },
  { key: "kpi-happiness-map", kpiKey: "happinessId", idKey: "happinessId" },
  { key: "kpi-health-map", kpiKey: "healthId", idKey: "healthId" },
];

/**
 * 시간가계부 행 삭제 시: 직접 입력(manual) 로그는 유지, 시간기록 연동분만 entry id 제거·로그 삭제
 * @param {string} entryId time_ledger_entries.id (uuid)
 */
export function removeKpiHabitLogsForTimeLedgerEntry(entryId) {
  const eid = String(entryId || "").trim();
  if (!isUuid(eid)) return;
  STORAGE_CONFIG.forEach(({ key }) => {
    try {
      const raw = readKpiMapScopedStorageRaw(key);
      if (!raw) return;
      const prev = JSON.parse(raw);
      const data = JSON.parse(raw);
      const logs = data.kpiLogs || [];
      let changed = false;
      const nextLogs = [];
      for (const L of logs) {
        if (!L || typeof L !== "object") continue;
        if (logIsExplicitManual(L)) {
          nextLogs.push(L);
          continue;
        }
        const ids = Array.isArray(L.timeLedgerEntryIds)
          ? L.timeLedgerEntryIds.map((x) => String(x || "").trim()).filter(Boolean)
          : [];
        if (!ids.includes(eid)) {
          nextLogs.push(L);
          continue;
        }
        changed = true;
        const rest = ids.filter((x) => x !== eid);
        if (rest.length === 0) continue;
        nextLogs.push({ ...L, timeLedgerEntryIds: rest });
      }
      if (!changed) return;
      data.kpiLogs = nextLogs;
      stampAndPersistKpiMap(key, prev, data);
    } catch (_) {}
  });
}

function findStorageKeyForKpiId(kpiId) {
  const kid = String(kpiId || "").trim();
  if (!kid) return null;
  for (const { key } of STORAGE_CONFIG) {
    try {
      const raw = readKpiMapScopedStorageRaw(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if ((data.kpis || []).some((k) => String(k.id || "").trim() === kid))
        return key;
    } catch (_) {}
  }
  return null;
}

/**
 * 해당 날짜 KPI 로그에 저장된 매일 할 일 체크 목록 (과제 기록 모달 표시용)
 */
function kpiLogMatchesDay(log, kpiId, normDate) {
  return (
    String(log?.kpiId || "").trim() === String(kpiId || "").trim() &&
    normalizeLogDate(log?.dateRaw || log?.date || "") === normDate
  );
}

/**
 * 시간기록 행 id에 연결된 KPI 로그의 매일할일 체크(없으면 해당 날짜·KPI 로그 fallback)
 */
export function getHabitTrackerDailyCompletedForLedgerEntry(
  storageKey,
  kpiId,
  dateRaw,
  entryId,
) {
  const normDate = normalizeLogDate(dateRaw);
  const eid = String(entryId || "").trim();
  if (!storageKey || !kpiId || normDate.length < 10) return [];
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const logs = data.kpiLogs || [];

    if (isUuid(eid)) {
      for (const l of logs) {
        if (!kpiLogMatchesDay(l, kpiId, normDate)) continue;
        const ids = Array.isArray(l.timeLedgerEntryIds)
          ? l.timeLedgerEntryIds.map((x) => String(x || "").trim())
          : [];
        if (!ids.includes(eid)) continue;
        if (Array.isArray(l.dailyCompleted) && l.dailyCompleted.length > 0) {
          return dedupeDailyCompletedList(l.dailyCompleted);
        }
      }
    }

    for (const l of logs) {
      if (!kpiLogMatchesDay(l, kpiId, normDate)) continue;
      if (Array.isArray(l.dailyCompleted) && l.dailyCompleted.length > 0) {
        return dedupeDailyCompletedList(l.dailyCompleted);
      }
    }
    return [];
  } catch (_) {
    return [];
  }
}

export function getHabitTrackerDailyCompletedForDate(storageKey, kpiId, dateRaw) {
  return getHabitTrackerDailyCompletedForLedgerEntry(
    storageKey,
    kpiId,
    dateRaw,
    "",
  );
}

function habitKpiHasUnitGoal(kpi) {
  if (!kpi?.needHabitTracker) return false;
  const unit = String(kpi.unit || "").trim();
  const target = String(kpi.targetValue ?? "").trim();
  return !!unit && !!target;
}

function findHabitKpiLogForDay(logs, kpiId, normDate, entryId) {
  const eid = String(entryId || "").trim();
  if (isUuid(eid)) {
    for (const l of logs) {
      if (!kpiLogMatchesDay(l, kpiId, normDate)) continue;
      const ids = Array.isArray(l.timeLedgerEntryIds)
        ? l.timeLedgerEntryIds.map((x) => String(x || "").trim())
        : [];
      if (!ids.includes(eid)) continue;
      return l;
    }
  }
  for (const l of logs) {
    if (kpiLogMatchesDay(l, kpiId, normDate)) return l;
  }
  return null;
}

/**
 * 해당 날짜 KPI 로그 수행값(과제 기록 모달 — 매일하기+단위 목표)
 */
export function getHabitTrackerLogValueForLedgerEntry(
  storageKey,
  kpiId,
  dateRaw,
  entryId,
) {
  const normDate = normalizeLogDate(dateRaw);
  if (!storageKey || !kpiId || normDate.length < 10) return "";
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    if (!raw) return "";
    const data = JSON.parse(raw);
    const log = findHabitKpiLogForDay(data.kpiLogs || [], kpiId, normDate, entryId);
    return log ? String(log.value ?? "").trim() : "";
  } catch (_) {
    return "";
  }
}

function kpiHasTargetValueAndUnit(kpi) {
  const tv = String(kpi?.targetValue ?? "").trim();
  const u = String(kpi?.unit ?? "").trim();
  return tv !== "" && u !== "";
}

function sanitizeKpiMeasureLogValue(val) {
  const n = parseFloat(String(val || "").replace(/[^0-9.-]/g, ""));
  return Number.isNaN(n) ? "" : String(n);
}

/**
 * 시간기록 «오늘의 수행값» → 해당 날짜 kpiLogs.value (매일하기·직접입력)
 */
export function persistKpiPerformedValueFromTimeLedger(
  storageKey,
  kpiId,
  dateRaw,
  performedValue,
  timeLedgerEntryId,
) {
  const v = sanitizeKpiMeasureLogValue(performedValue);
  const eid = String(timeLedgerEntryId || "").trim();
  const hasLedger = isUuid(eid);
  if (!storageKey || !kpiId || !dateRaw || dateRaw.length < 10) return false;
  if (!v && !hasLedger) return false;
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    if (!raw) return false;
    const prev = JSON.parse(raw);
    const data = JSON.parse(raw);
    const kpi = (data.kpis || []).find(
      (k) => String(k.id || "").trim() === String(kpiId || "").trim(),
    );
    if (!kpi || kpi.useTimeAsUnit || kpi.useTaskCompletionGoal) return false;
    const config = STORAGE_CONFIG.find((c) => c.key === storageKey);
    if (!config) return false;

    const logs = data.kpiLogs || [];
    const normDate = normalizeLogDate(dateRaw);
    const existingIdx = logs.findIndex((l) =>
      kpiLogMatchesDay(l, kpiId, normDate),
    );
    const dateDisplay = toDisplayDate(normDate);

    if (existingIdx >= 0) {
      if (v) logs[existingIdx].value = v;
      if (hasLedger) attachTimeLedgerEntryToLog(logs[existingIdx], eid);
    } else {
      const row = {
        id: nextLogId(),
        kpiId,
        [config.idKey]: kpi[config.kpiKey],
        date: dateDisplay,
        dateRaw: normDate,
        value: v,
        memo: "",
        dailyCompleted: [],
        dailyIncomplete: [],
        ...defaultManualKpiLogMeta(),
      };
      if (hasLedger) attachTimeLedgerEntryToLog(row, eid);
      logs.push(row);
    }
    data.kpiLogs = logs;
    stampAndPersistKpiMap(storageKey, prev, data, { pushServer: true });
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 직접입력 등 매일하기가 아닌 KPI — 과제기록 «오늘의 수행값»을 해당 날짜 kpiLogs에 반영
 */
export function upsertKpiMeasureLogValue(
  storageKey,
  kpiId,
  dateRaw,
  performedValue,
  timeLedgerEntryId,
) {
  if (!storageKey || !kpiId || !dateRaw || dateRaw.length < 10) return false;
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    if (!raw) return false;
    const prev = JSON.parse(raw);
    const data = JSON.parse(raw);
    const kpi = (data.kpis || []).find(
      (k) => String(k.id || "").trim() === String(kpiId || "").trim(),
    );
    if (!kpi || kpi.needHabitTracker) return false;
    const vCheck = sanitizeKpiMeasureLogValue(performedValue);
    if (!kpiHasTargetValueAndUnit(kpi) && !vCheck) return false;

    const config = STORAGE_CONFIG.find((c) => c.key === storageKey);
    if (!config) return false;
    const idKey = config.idKey;
    const idValue = kpi[config.kpiKey];
    const logs = data.kpiLogs || [];
    const normDate = normalizeLogDate(dateRaw);
    const existingIdx = logs.findIndex((l) =>
      kpiLogMatchesDay(l, kpiId, normDate),
    );
    const v = sanitizeKpiMeasureLogValue(performedValue);
    const hasLedger = isUuid(String(timeLedgerEntryId || "").trim());
    const dateDisplay = toDisplayDate(dateRaw);

    if (existingIdx >= 0) {
      if (v !== "") logs[existingIdx].value = v;
      if (hasLedger) {
        attachTimeLedgerEntryToLog(logs[existingIdx], timeLedgerEntryId);
      }
    } else if (v !== "" || hasLedger) {
      const row = {
        id: nextLogId(),
        kpiId,
        [idKey]: idValue,
        date: dateDisplay,
        dateRaw: normDate,
        value: v,
        memo: "",
        ...defaultManualKpiLogMeta(),
      };
      if (hasLedger) attachTimeLedgerEntryToLog(row, timeLedgerEntryId);
      logs.push(row);
    } else {
      return false;
    }
    data.kpiLogs = logs;
    stampAndPersistKpiMap(storageKey, prev, data, { pushServer: true });
    return true;
  } catch (_) {
    return false;
  }
}

function resolveHabitLogValueForSave(kpi, performedValue, existingValue, hasActivity) {
  const trimmed = String(performedValue ?? "").trim();
  if (trimmed) {
    const n = parseFloat(trimmed.replace(/[^0-9.-]/g, ""));
    if (!Number.isNaN(n)) return String(n);
  }
  if (habitKpiHasUnitGoal(kpi)) {
    return String(existingValue ?? "").trim();
  }
  if (hasActivity) return String(existingValue ?? "").trim() || "1";
  return String(existingValue ?? "").trim();
}

/**
 * 해당 날짜 KPI 로그의 dailyCompleted를 모달 체크 상태와 동일하게 덮어씀 (템플릿 kpiDailyRepeatTodos.completed 미사용)
 * @param {string=} timeLedgerEntryId — 시간가계부 행 id가 있으면 로그에 연결(삭제 시 동기 제거용)
 * @param {string=} performedValue — 매일하기+단위 목표 시 오늘 수행값
 */
export function replaceHabitTrackerLogDailyCompleted(
  storageKey,
  kpiId,
  dateRaw,
  completed,
  timeLedgerEntryId,
  performedValue,
) {
  if (!storageKey || !kpiId || !dateRaw || dateRaw.length < 10) return;
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    if (!raw) return;
    const prev = JSON.parse(raw);
    const data = JSON.parse(raw);
    const kpis = data.kpis || [];
    const kpi = kpis.find(
      (k) => String(k.id || "").trim() === String(kpiId || "").trim(),
    );
    if (!kpi || !kpi.needHabitTracker) return;
    const config = STORAGE_CONFIG.find((c) => c.key === storageKey);
    if (!config) return;

    const idKey = config.idKey;
    const idValue = kpi[config.kpiKey];
    const logs = data.kpiLogs || [];
    const normDate = normalizeLogDate(dateRaw);
    const existingIdx = logs.findIndex((l) => kpiLogMatchesDay(l, kpiId, normDate));

    const list = dedupeDailyCompletedList(
      Array.isArray(completed) ? completed : [],
    );
    const dateDisplay = toDisplayDate(dateRaw);
    const hasActivity =
      list.length > 0 || !!String(timeLedgerEntryId || "").trim();
    const hasPerformedInput = String(performedValue ?? "").trim() !== "";

    if (existingIdx >= 0) {
      const prevVal = logs[existingIdx].value;
      logs[existingIdx].dailyCompleted = list;
      logs[existingIdx].dailyIncomplete = [];
      logs[existingIdx].value = resolveHabitLogValueForSave(
        kpi,
        performedValue,
        prevVal,
        hasActivity,
      );
      if (timeLedgerEntryId) {
        attachTimeLedgerEntryToLog(logs[existingIdx], timeLedgerEntryId);
      }
    } else if (hasActivity || hasPerformedInput) {
      const row = {
        id: nextLogId(),
        kpiId,
        [idKey]: idValue,
        date: dateDisplay,
        dateRaw,
        value: resolveHabitLogValueForSave(kpi, performedValue, "", hasActivity),
        memo: "",
        dailyCompleted: list,
        dailyIncomplete: [],
        ...defaultManualKpiLogMeta(),
      };
      if (timeLedgerEntryId) attachTimeLedgerEntryToLog(row, timeLedgerEntryId);
      logs.push(row);
    } else {
      return;
    }
    data.kpiLogs = logs;
    stampAndPersistKpiMap(storageKey, prev, data, { pushServer: true });
  } catch (_) {}
}

/**
 * 매일 반복 KPI: 과제 기록 시 해당 날짜 로그에 체크한 매일 할 일만 저장(시간기록 모달)
 * @param {string} storageKey
 * @param {string} kpiId
 * @param {string} dateRaw - YYYY-MM-DD
 * @param {{ completed: Array<{id:string,text:string}> }} dailyState — 체크된 매일 할 일만(미체크는 저장하지 않음)
 * @param {string=} timeLedgerEntryId
 */
export function upsertHabitTrackerLogWithDailyState(
  storageKey,
  kpiId,
  dateRaw,
  dailyState,
  timeLedgerEntryId,
) {
  if (!storageKey || !kpiId || !dateRaw || dateRaw.length < 10) return;
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    if (!raw) return;
    const prev = JSON.parse(raw);
    const data = JSON.parse(raw);
    const kpis = data.kpis || [];
    const kpi = kpis.find(
      (k) => String(k.id || "").trim() === String(kpiId || "").trim(),
    );
    if (!kpi || !kpi.needHabitTracker) return;
    const config = STORAGE_CONFIG.find((c) => c.key === storageKey);
    if (!config) return;

    const idKey = config.idKey;
    const idValue = kpi[config.kpiKey];
    const logs = data.kpiLogs || [];
    const normDate = normalizeLogDate(dateRaw);
    const existingIdx = logs.findIndex((l) => kpiLogMatchesDay(l, kpiId, normDate));

    const dailyCompleted = Array.isArray(dailyState?.completed)
      ? dailyState.completed
      : [];
    const dateDisplay = toDisplayDate(dateRaw);

    if (existingIdx >= 0) {
      logs[existingIdx].dailyCompleted = mergeDailyCompletedLists(
        logs[existingIdx].dailyCompleted || [],
        dailyCompleted,
      );
      logs[existingIdx].dailyIncomplete = [];
      logs[existingIdx].value = "1";
      if (timeLedgerEntryId) {
        attachTimeLedgerEntryToLog(logs[existingIdx], timeLedgerEntryId);
      }
    } else {
      const row = {
        id: nextLogId(),
        kpiId,
        [idKey]: idValue,
        date: dateDisplay,
        dateRaw,
        value: "1",
        memo: "",
        dailyCompleted: mergeDailyCompletedLists([], dailyCompleted),
        dailyIncomplete: [],
        ...defaultManualKpiLogMeta(),
      };
      if (timeLedgerEntryId) attachTimeLedgerEntryToLog(row, timeLedgerEntryId);
      logs.push(row);
    }
    data.kpiLogs = logs;
    stampAndPersistKpiMap(storageKey, prev, data, { pushServer: true });
  } catch (_) {}
}

/**
 * 시간가계부 과제 기록이 있으면 해당 날짜 KPI 로그에 자동 연동(매일 반복·일반 KPI 공통)
 * saveTimeRows 호출 후 실행
 *
 * 우선순위: time_ledger_tasks ↔ 행의 taskId 로 kpiId 조회만 (이름 대조 없음).
 */
let _syncHabitTrackerInFlight = false;
let _syncHabitTrackerPending = false;

let _syncHabitTrackerLastAt = 0;

/**
 * @param {{ throttleMs?: number }} [opts]
 */
export function syncHabitTrackerLogs(opts = {}) {
  const throttleMs = Number(opts.throttleMs) || 0;
  if (throttleMs > 0 && Date.now() - _syncHabitTrackerLastAt < throttleMs) {
    return;
  }
  if (_syncHabitTrackerInFlight) {
    _syncHabitTrackerPending = true;
    return;
  }
  _syncHabitTrackerInFlight = true;
  try {
    syncHabitTrackerLogsInner();
    _syncHabitTrackerLastAt = Date.now();
  } finally {
    _syncHabitTrackerInFlight = false;
    if (_syncHabitTrackerPending) {
      _syncHabitTrackerPending = false;
      syncHabitTrackerLogs();
    }
  }
}

/** 과제명·taskId → 연결된 KPI(storageKey, kpiId) 목록 (과제 기록 저장·동기화 공통) */
export function resolveKpiLinksForTaskName(taskName, rowTaskId = "") {
  const taskRows = readTaskRowsForKpiMatch();
  const taskIdToKpiId = new Map();
  for (const o of taskRows) {
    const tid = String(o.id || "").trim();
    const kid = String(o.kpiId || "").trim();
    if (isUuid(tid) && kid) taskIdToKpiId.set(tid, kid);
  }
  return resolveKpiLinksForLedgerRow(
    { taskName, taskId: rowTaskId },
    taskIdToKpiId,
    taskRows,
  );
}

function ledgerRowPerformedValue(row) {
  return sanitizeKpiMeasureLogValue(row?.kpiPerformedValue);
}

function ledgerRowDailyCompleted(row) {
  return Array.isArray(row?.habitDailyCompleted) ? row.habitDailyCompleted : [];
}

/** 매일하기(단위 목표) · 직접입력(목표값·단위) — 시간기록 «오늘의 수행값» → KPI 로그 */
function kpiAcceptsPerformedValueFromTimeLedger(kpi) {
  if (!kpi) return false;
  if (kpi.useTimeAsUnit || kpi.useTaskCompletionGoal) return false;
  if (kpi.needHabitTracker) return habitKpiHasUnitGoal(kpi);
  return kpiHasTargetValueAndUnit(kpi);
}

function resolveKpiLinksForLedgerRow(r, taskIdToKpiId, taskRows) {
  /** @type {Array<{ storageKey: string, kpiId: string }>} */
  const links = [];
  const seen = new Set();
  const add = (storageKey, kpiId) => {
    const kid = String(kpiId || "").trim();
    const sk = String(storageKey || "").trim();
    if (!kid || !sk) return;
    const key = `${sk}|${kid}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ storageKey: sk, kpiId: kid });
  };

  const resolvedTid = resolveKpiLinkedTaskIdForLedgerRow(r, taskRows);
  if (isUuid(resolvedTid)) {
    const kpiId = taskIdToKpiId.get(resolvedTid);
    if (kpiId) {
      const sk = findStorageKeyForKpiId(kpiId);
      if (sk) add(sk, kpiId);
    }
  }

  return links;
}

function syncHabitTrackerLogsInner() {
  const rows = loadTimeRows();
  const taskRows = readTaskRowsForKpiMatch();
  const taskIdToKpiId = new Map();
  for (const o of taskRows) {
    const tid = String(o.id || "").trim();
    const kid = String(o.kpiId || "").trim();
    if (isUuid(tid) && kid) taskIdToKpiId.set(tid, kid);
  }

  /** @type {Map<string, Map<string, { entryIds: Set<string>, performedValue: string, dailyCompleted: object[] }>>} */
  const byStorage = new Map();

  const getLedgerBucket = (storageKey, kpiId, normDate) => {
    const combo = `${String(kpiId || "").trim()}|${normDate}`;
    if (!byStorage.has(storageKey)) byStorage.set(storageKey, new Map());
    const inner = byStorage.get(storageKey);
    if (!inner.has(combo)) {
      inner.set(combo, {
        entryIds: new Set(),
        performedValue: "",
        dailyCompleted: [],
      });
    }
    return inner.get(combo);
  };

  rows.forEach((r) => {
    const dateRaw = normalizeLogDate(
      (r.date || "").toString() || parseDateFromLedgerStartTime(r.startTime),
    );
    if (!dateRaw || dateRaw.length < 10) return;

    const hasTime = !!(r.timeTracked || "").trim();
    const performedValue = ledgerRowPerformedValue(r);
    const dailyCompleted = ledgerRowDailyCompleted(r);
    if (!hasTime && !performedValue && dailyCompleted.length === 0) return;

    const entryId = String(r.id || "").trim();
    for (const { storageKey, kpiId } of resolveKpiLinksForLedgerRow(
      r,
      taskIdToKpiId,
      taskRows,
    )) {
      const nd = normalizeLogDate(dateRaw);
      const bucket = getLedgerBucket(storageKey, kpiId, nd);
      if (hasTime && isUuid(entryId)) bucket.entryIds.add(entryId);
      if (performedValue) bucket.performedValue = performedValue;
      if (dailyCompleted.length > 0) {
        bucket.dailyCompleted = mergeDailyCompletedLists(
          bucket.dailyCompleted,
          dailyCompleted,
        );
      }
    }
  });

  /** 직접 입력-only·레거시 로그는 시간가계부 id 자동 병합 제외 (시간 단위 KPI는 항상 병합) */
  const logBlocksTimeLedgerIdMerge = (log, kpi) => {
    if (!log || typeof log !== "object") return true;
    if (kpi?.useTimeAsUnit) return false;
    if (kpi?.needHabitTracker) return false;
    if (log.kpiLogSource === KPI_LOG_SOURCE_TIME_LEDGER) return false;
    if (Array.isArray(log.timeLedgerEntryIds) && log.timeLedgerEntryIds.length > 0)
      return false;
    return true;
  };

  const mergeEntryIdsIntoLog = (log, idSet) => {
    const s = new Set(
      (Array.isArray(log.timeLedgerEntryIds) ? log.timeLedgerEntryIds : [])
        .map((x) => String(x || "").trim())
        .filter((x) => isUuid(x)),
    );
    for (const eid of idSet) {
      if (isUuid(eid)) s.add(eid);
    }
    log.timeLedgerEntryIds = [...s];
    log.kpiLogSource = KPI_LOG_SOURCE_TIME_LEDGER;
  };

  const applyLedgerBucketToKpiLog = (log, kpi, bucket) => {
    let touched = false;
    const canMergeEntryIds =
      bucket.entryIds.size > 0 &&
      (!logBlocksTimeLedgerIdMerge(log, kpi) ||
        kpi.needHabitTracker ||
        kpiHasTargetValueAndUnit(kpi) ||
        !!bucket.performedValue);

    if (canMergeEntryIds) {
      const before = JSON.stringify([
        log.kpiLogSource,
        (log.timeLedgerEntryIds || []).slice().sort(),
      ]);
      mergeEntryIdsIntoLog(log, bucket.entryIds);
      const after = JSON.stringify([
        log.kpiLogSource,
        (log.timeLedgerEntryIds || []).slice().sort(),
      ]);
      if (before !== after) touched = true;
    }

    if (kpi.needHabitTracker && bucket.dailyCompleted.length > 0) {
      const merged = mergeDailyCompletedLists(
        log.dailyCompleted || [],
        bucket.dailyCompleted,
      );
      if (JSON.stringify(merged) !== JSON.stringify(log.dailyCompleted || [])) {
        log.dailyCompleted = merged;
        log.dailyIncomplete = [];
        touched = true;
      }
    }

    const hasActivity =
      bucket.entryIds.size > 0 || bucket.dailyCompleted.length > 0;
    const prevVal = String(log.value ?? "").trim();
    let nextVal = prevVal;

    if (
      bucket.performedValue &&
      !kpi.useTimeAsUnit &&
      !kpi.useTaskCompletionGoal
    ) {
      nextVal = bucket.performedValue;
    } else if (kpi.needHabitTracker) {
      nextVal = resolveHabitLogValueForSave(
        kpi,
        bucket.performedValue,
        prevVal,
        hasActivity,
      );
    }

    if (nextVal !== prevVal) {
      log.value = nextVal;
      touched = true;
    }
    return touched;
  };

  STORAGE_CONFIG.forEach(({ key, kpiKey, idKey }) => {
    const perDay = byStorage.get(key);
    if (!perDay || perDay.size === 0) return;
    try {
      const raw = readKpiMapScopedStorageRaw(key);
      if (!raw) return;
      const prev = JSON.parse(raw);
      const data = JSON.parse(raw);
      const kpis = data.kpis || [];
      const kpiById = new Map(
        kpis.map((k) => [String(k.id || "").trim(), k]).filter(([id]) => id),
      );
      const logs = data.kpiLogs || [];
      let changed = false;

      for (const [comboKey, bucket] of perDay) {
        const pipe = comboKey.indexOf("|");
        if (pipe <= 0) continue;
        const kpiId = comboKey.slice(0, pipe);
        const nd = comboKey.slice(pipe + 1);
        const kpi = kpiById.get(kpiId);
        if (!kpi) continue;

        const idx = logs.findIndex(
          (l) =>
            String(l.kpiId || "").trim() === kpiId &&
            normalizeLogDate(l.dateRaw || l.date || "") === nd,
        );

        if (idx >= 0) {
          if (applyLedgerBucketToKpiLog(logs[idx], kpi, bucket)) {
            changed = true;
          }
        } else if (
          bucket.entryIds.size > 0 ||
          bucket.performedValue ||
          bucket.dailyCompleted.length > 0
        ) {
          const dateDisplay = toDisplayDate(nd);
          const row = {
            id: nextLogId(),
            kpiId: kpi.id,
            [idKey]: kpi[kpiKey],
            date: dateDisplay,
            dateRaw: nd,
            value: "",
            status: "",
            memo: "",
            dailyCompleted: [],
            dailyIncomplete: [],
            ...defaultManualKpiLogMeta(),
          };
          applyLedgerBucketToKpiLog(row, kpi, bucket);
          logs.push(row);
          changed = true;
        }
      }

      if (changed) {
        data.kpiLogs = logs;
        stampAndPersistKpiMap(key, prev, data, { pushServer: true });
      }
    } catch (_) {}
  });

  try {
    syncSleepHealthGoalLogsFromTimeLedger();
  } catch (_) {}
}
