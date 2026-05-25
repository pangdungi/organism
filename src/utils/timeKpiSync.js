/**
 * KPI ↔ 시간가계부 연동
 * - 과제는 time_ledger_tasks의 kpiId·taskId로 집계(이름 변경에 안전).
 * - 레거시: 과제명만 있는 행은 해당 KPI 과제명·연결된 task_id 행의 과제명으로 매칭.
 */

import { readTimeLedgerEntriesRaw } from "./timeLedgerEntriesModel.js";
import { stampAndPersistKpiMap } from "./kpiTodoSync.js";
import { getFullTaskOptions } from "./timeTaskOptionsModel.js";
import { isUuid } from "./idUtils.js";
import {
  KPI_LOG_SOURCE_MANUAL,
  KPI_LOG_SOURCE_TIME_LEDGER,
  defaultManualKpiLogMeta,
} from "./kpiLogFields.js";
export {
  getKpiSyncedTaskNames,
  getKpiSyncActiveKpiIds,
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

/**
 * KPI id 기준 시간 합(분). rowsForSum 에 포함된 가계부 줄만 합산한다.
 * 과제 표시명 별칭은 전체 가계부에서 확장해 레거시 과제명 매칭을 유지한다.
 * @param {string} kpiId
 * @param {Array<object>} rowsForSum
 */
function accumulateMinutesForKpiFromRows(kpiId, rowsForSum, extraNameAliases = []) {
  const kid = String(kpiId || "").trim();
  if (!kid) return 0;

  const opts = getFullTaskOptions().filter(
    (o) => String(o.kpiId || "").trim() === kid,
  );
  const idsForKpi = new Set();
  const nameAliases = new Set();
  for (const n of extraNameAliases) {
    const t = String(n || "").trim();
    if (t) nameAliases.add(t);
  }
  for (const o of opts) {
    const id = String(o.id || "").trim();
    const n = String(o.name || "").trim();
    if (isUuid(id)) idsForKpi.add(id);
    if (n) nameAliases.add(n);
  }

  const taskIdToKpiId = new Map();
  for (const o of getFullTaskOptions()) {
    const tid = String(o.id || "").trim();
    const k = String(o.kpiId || "").trim();
    if (isUuid(tid) && k) taskIdToKpiId.set(tid, k);
  }

  const allRows = loadTimeRows();
  for (const r of allRows) {
    const tid = String(r.taskId || "").trim();
    if (isUuid(tid) && idsForKpi.has(tid)) {
      const tn = String(r.taskName || "").trim();
      if (tn) nameAliases.add(tn);
    }
  }

  let totalHours = 0;
  for (const r of rowsForSum) {
    if (!(r.timeTracked || "").trim()) continue;
    const tid = String(r.taskId || "").trim();
    const tn = String(r.taskName || "").trim();
    if (isUuid(tid)) {
      if (idsForKpi.has(tid)) {
        totalHours += parseTimeToHours(r.timeTracked);
        continue;
      }
      const mapped = taskIdToKpiId.get(tid);
      if (mapped && mapped !== kid) continue;
    }
    if (tn && nameAliases.has(tn)) {
      totalHours += parseTimeToHours(r.timeTracked);
    }
  }
  return Math.round(totalHours * 60);
}

/**
 * KPI id 기준 누적 시간(분). 과제 옵션의 kpiId·taskId·표시명(레거시)으로 매칭.
 * @param {string} kpiId - map_kpis / KPI 카드의 id
 * @param {string=} kpiName - KPI 행동 이름(과제명 레거시 매칭)
 */
export function getAccumulatedMinutesForKpiId(kpiId, kpiName) {
  const extra = kpiName ? [String(kpiName).trim()] : [];
  return accumulateMinutesForKpiFromRows(kpiId, loadTimeRows(), extra);
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
) {
  const s = String(startYmdTen || "").replace(/\//g, "-").slice(0, 10);
  const e = String(endYmdTenInclusive || "").replace(/\//g, "-").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e)) return 0;
  if (s > e) return 0;
  const filtered = loadTimeRows().filter((r) => {
    const d = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= s && d <= e;
  });
  return accumulateMinutesForKpiFromRows(kpiId, filtered, []);
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

/**
 * 과제명(태스크명)으로 누적 시간(분) — KPI가 아닌 일반 과제·레거시 호환용
 * @param {string} taskName
 */
export function getAccumulatedMinutes(taskName) {
  const name = (taskName || "").trim();
  if (!name) return 0;
  const rows = loadTimeRows();
  let totalHours = 0;
  rows.forEach((r) => {
    const rName = (r.taskName || "").trim();
    if (rName === name && r.timeTracked) {
      totalHours += parseTimeToHours(r.timeTracked);
    }
  });
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
function mergeDailyCompletedLists(prev, next) {
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
      const raw = localStorage.getItem(key);
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
      const raw = localStorage.getItem(key);
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
export function getHabitTrackerDailyCompletedForDate(storageKey, kpiId, dateRaw) {
  if (!storageKey || !kpiId || !dateRaw || String(dateRaw).length < 10) return [];
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const data = JSON.parse(raw);
    const normDate = normalizeLogDate(dateRaw);
    const logs = data.kpiLogs || [];
    const log = logs.find(
      (l) =>
        l.kpiId === kpiId &&
        normalizeLogDate(l.dateRaw || l.date || "") === normDate,
    );
    return Array.isArray(log?.dailyCompleted)
      ? dedupeDailyCompletedList(log.dailyCompleted)
      : [];
  } catch (_) {
    return [];
  }
}

/**
 * 해당 날짜 KPI 로그의 dailyCompleted를 모달 체크 상태와 동일하게 덮어씀 (템플릿 kpiDailyRepeatTodos.completed 미사용)
 * @param {string=} timeLedgerEntryId — 시간가계부 행 id가 있으면 로그에 연결(삭제 시 동기 제거용)
 */
export function replaceHabitTrackerLogDailyCompleted(
  storageKey,
  kpiId,
  dateRaw,
  completed,
  timeLedgerEntryId,
) {
  if (!storageKey || !kpiId || !dateRaw || dateRaw.length < 10) return;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const prev = JSON.parse(raw);
    const data = JSON.parse(raw);
    const kpis = data.kpis || [];
    const kpi = kpis.find((k) => k.id === kpiId);
    if (!kpi || !kpi.needHabitTracker) return;
    const config = STORAGE_CONFIG.find((c) => c.key === storageKey);
    if (!config) return;

    const idKey = config.idKey;
    const idValue = kpi[config.kpiKey];
    const logs = data.kpiLogs || [];
    const normDate = normalizeLogDate(dateRaw);
    const existingIdx = logs.findIndex(
      (l) => l.kpiId === kpiId && normalizeLogDate(l.dateRaw || l.date || "") === normDate,
    );

    const list = dedupeDailyCompletedList(
      Array.isArray(completed) ? completed : [],
    );
    const dateDisplay = toDisplayDate(dateRaw);

    if (existingIdx >= 0) {
      logs[existingIdx].dailyCompleted = list;
      logs[existingIdx].dailyIncomplete = [];
      logs[existingIdx].value = logs[existingIdx].value || "1";
      logs[existingIdx].status = logs[existingIdx].status || "순항";
      if (timeLedgerEntryId) {
        attachTimeLedgerEntryToLog(logs[existingIdx], timeLedgerEntryId);
      }
    } else if (list.length > 0) {
      const row = {
        id: nextLogId(),
        kpiId,
        [idKey]: idValue,
        date: dateDisplay,
        dateRaw,
        value: "1",
        status: "순항",
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
    stampAndPersistKpiMap(storageKey, prev, data);
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
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const prev = JSON.parse(raw);
    const data = JSON.parse(raw);
    const kpis = data.kpis || [];
    const kpi = kpis.find((k) => k.id === kpiId);
    if (!kpi || !kpi.needHabitTracker) return;
    const config = STORAGE_CONFIG.find((c) => c.key === storageKey);
    if (!config) return;

    const idKey = config.idKey;
    const idValue = kpi[config.kpiKey];
    const logs = data.kpiLogs || [];
    const normDate = normalizeLogDate(dateRaw);
    const existingIdx = logs.findIndex(
      (l) => l.kpiId === kpiId && normalizeLogDate(l.dateRaw || l.date || "") === normDate,
    );

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
      logs[existingIdx].status = "순항";
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
        status: "순항",
        memo: "",
        dailyCompleted: mergeDailyCompletedLists([], dailyCompleted),
        dailyIncomplete: [],
        ...defaultManualKpiLogMeta(),
      };
      if (timeLedgerEntryId) attachTimeLedgerEntryToLog(row, timeLedgerEntryId);
      logs.push(row);
    }
    data.kpiLogs = logs;
    stampAndPersistKpiMap(storageKey, prev, data);
  } catch (_) {}
}

/**
 * 시간가계부 과제 기록이 있으면 해당 날짜 KPI 로그에 자동 연동(매일 반복·일반 KPI 공통)
 * saveTimeRows 호출 후 실행
 *
 * 우선순위: time_ledger_tasks ↔ 행의 taskId로 kpiId 조회(이름 변경에 안전).
 * taskId·kpiId 없으면 과제명=KPI 이름 매칭(레거시·내장 과제 등).
 */
export function syncHabitTrackerLogs() {
  const rows = loadTimeRows();
  const taskIdToKpiId = new Map();
  for (const o of getFullTaskOptions()) {
    const tid = String(o.id || "").trim();
    const kid = String(o.kpiId || "").trim();
    if (isUuid(tid) && kid) taskIdToKpiId.set(tid, kid);
  }

  /** @type {Map<string, Map<string, Set<string>>>} storageKey → (kpiId|date → entry ids) */
  const byStorage = new Map();

  const addLedgerLink = (storageKey, kpiId, dateRaw, entryId) => {
    const sk = storageKey;
    const kid = String(kpiId || "").trim();
    const nd = normalizeLogDate(dateRaw);
    const eid = String(entryId || "").trim();
    if (!sk || !kid || nd.length < 10 || !isUuid(eid)) return;
    const combo = `${kid}|${nd}`;
    if (!byStorage.has(sk)) byStorage.set(sk, new Map());
    const inner = byStorage.get(sk);
    if (!inner.has(combo)) inner.set(combo, new Set());
    inner.get(combo).add(eid);
  };

  rows.forEach((r) => {
    const dateRaw = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    if (!dateRaw || dateRaw.length < 10) return;
    if (!(r.timeTracked || "").trim()) return;
    const entryId = String(r.id || "").trim();

    const taskId = String(r.taskId || "").trim();
    if (isUuid(taskId)) {
      const kpiId = taskIdToKpiId.get(taskId);
      if (kpiId) {
        const sk = findStorageKeyForKpiId(kpiId);
        if (sk) addLedgerLink(sk, kpiId, dateRaw, entryId);
        return;
      }
    }

    const taskName = (r.taskName || "").trim();
    if (!taskName) return;
    const nd = normalizeLogDate(dateRaw);

    for (const { key } of STORAGE_CONFIG) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const data = JSON.parse(raw);
        const kpis = data.kpis || [];
        kpis.forEach((kpi) => {
          if ((kpi.name || "").trim() !== taskName) return;
          addLedgerLink(key, kpi.id, nd, entryId);
        });
      } catch (_) {}
    }
  });

  /** 직접 입력-only·레거시 로그는 시간가계부 id 자동 병합 제외 */
  const logBlocksTimeLedgerIdMerge = (log) => {
    if (!log || typeof log !== "object") return true;
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

  STORAGE_CONFIG.forEach(({ key, kpiKey, idKey }) => {
    const perDay = byStorage.get(key);
    if (!perDay || perDay.size === 0) return;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const prev = JSON.parse(raw);
      const data = JSON.parse(raw);
      const kpis = data.kpis || [];
      const kpiById = new Map(
        kpis.map((k) => [String(k.id || "").trim(), k]).filter(([id]) => id),
      );
      const logs = data.kpiLogs || [];
      let changed = false;

      for (const [comboKey, idSet] of perDay) {
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
          const log = logs[idx];
          if (logBlocksTimeLedgerIdMerge(log)) continue;
          const before = JSON.stringify([
            log.kpiLogSource,
            (log.timeLedgerEntryIds || []).slice().sort(),
          ]);
          mergeEntryIdsIntoLog(log, idSet);
          const after = JSON.stringify([
            log.kpiLogSource,
            (log.timeLedgerEntryIds || []).slice().sort(),
          ]);
          if (before !== after) changed = true;
        } else {
          const dateDisplay = toDisplayDate(nd);
          const habit = !!kpi.needHabitTracker;
          const row = {
            id: nextLogId(),
            kpiId: kpi.id,
            [idKey]: kpi[kpiKey],
            date: dateDisplay,
            dateRaw: nd,
            value: habit ? "1" : "",
            status: habit ? "순항" : "",
            memo: "",
            dailyCompleted: [],
            dailyIncomplete: [],
            ...defaultManualKpiLogMeta(),
          };
          mergeEntryIdsIntoLog(row, idSet);
          logs.push(row);
          changed = true;
        }
      }

      if (changed) {
        data.kpiLogs = logs;
        stampAndPersistKpiMap(key, prev, data);
      }
    } catch (_) {}
  });
}
