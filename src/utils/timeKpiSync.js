/**
 * KPI ↔ 시간가계부 연동
 * - 과제명(KPI 이름)으로 시간 기록 누적합 조회
 */

import { readTimeLedgerEntriesRaw } from "./timeLedgerEntriesModel.js";
import { stampAndPersistKpiMap } from "./kpiTodoSync.js";

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
 * 과제명(태스크명)으로 누적 시간(분) 조회
 * @param {string} taskName - KPI 이름 또는 과제명
 * @returns {number} 누적 분
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

const KPI_STORAGE_KEYS = [
  "kpi-dream-map",
  "kpi-sideincome-paths",
  "kpi-happiness-map",
  "kpi-health-map",
];

/**
 * KPI에서 추가된 과제명 집합 (꿈/부수입/행복/건강)
 * 시간가계부 과제 설정에서 삭제·이름 수정 불가 — 해당 KPI를 KPI 화면에서 삭제할 때만 목록에서 제거(KPI 완료만으로는 제거하지 않음)
 * @returns {Set<string>}
 */
export function getKpiSyncedTaskNames() {
  const names = new Set();
  KPI_STORAGE_KEYS.forEach((key) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const sync = parsed?.kpiTaskSync || {};
      Object.values(sync).forEach((name) => {
        if (name && typeof name === "string") names.add(String(name).trim());
      });
    } catch (_) {}
  });
  return names;
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

/** 같은 날짜·같은 KPI 로그에 여러 번 시간기록할 때 체크 항목 합집합(id 우선, 없으면 텍스트) */
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
    return Array.isArray(log?.dailyCompleted) ? dedupeDailyCompletedList(log.dailyCompleted) : [];
  } catch (_) {
    return [];
  }
}

/**
 * 해당 날짜 KPI 로그의 dailyCompleted를 모달 체크 상태와 동일하게 덮어씀 (템플릿 kpiDailyRepeatTodos.completed 미사용)
 */
export function replaceHabitTrackerLogDailyCompleted(storageKey, kpiId, dateRaw, completed) {
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
    } else if (list.length > 0) {
      logs.push({
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
      });
    } else {
      return;
    }
    data.kpiLogs = logs;
    stampAndPersistKpiMap(storageKey, prev, data);
  } catch (_) {}
}

const STORAGE_CONFIG = [
  { key: "kpi-dream-map", kpiKey: "dreamId", idKey: "dreamId" },
  { key: "kpi-sideincome-paths", kpiKey: "pathId", idKey: "pathId" },
  { key: "kpi-happiness-map", kpiKey: "happinessId", idKey: "happinessId" },
  { key: "kpi-health-map", kpiKey: "healthId", idKey: "healthId" },
];

/**
 * 시간가계부 행에 기록한 스냅샷(해당 기록이 KPI daily_completed에 합친 todo id)만큼 제거
 */
export function removeKpiHabitCheckTimeLedgerSnapshot(snap) {
  if (!snap || typeof snap !== "object") return;
  const storageKey = String(snap.storageKey || "").trim();
  const kpiId = String(snap.kpiId || "").trim();
  const dateRaw = String(snap.dateRaw || "")
    .trim()
    .replace(/\//g, "-")
    .slice(0, 10);
  const ids = Array.isArray(snap.completedTodoIds)
    ? snap.completedTodoIds
    : Array.isArray(snap.completed_todo_ids)
      ? snap.completed_todo_ids
      : [];
  removeHabitTrackerDailyCompletedByTodoIds(storageKey, kpiId, dateRaw, ids);
}

function removeHabitTrackerDailyCompletedByTodoIds(
  storageKey,
  kpiId,
  dateRaw,
  todoIds,
) {
  if (!storageKey || !kpiId || !dateRaw) return;
  const normDate = normalizeLogDate(dateRaw);
  if (normDate.length < 10) return;
  const idSet = new Set(
    (Array.isArray(todoIds) ? todoIds : [])
      .map((t) => String(t || "").trim())
      .filter(Boolean),
  );
  if (idSet.size === 0) return;
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
    const logs = data.kpiLogs || [];
    const existingIdx = logs.findIndex(
      (l) => l.kpiId === kpiId && normalizeLogDate(l.dateRaw || l.date || "") === normDate,
    );
    if (existingIdx < 0) return;
    const cur = Array.isArray(logs[existingIdx].dailyCompleted)
      ? logs[existingIdx].dailyCompleted
      : [];
    const next = cur.filter((t) => {
      const id = String(t?.id || "").trim();
      if (!id) return true;
      return !idSet.has(id);
    });
    if (next.length === cur.length) return;
    logs[existingIdx].dailyCompleted = next;
    logs[existingIdx].dailyIncomplete = [];
    data.kpiLogs = logs;
    stampAndPersistKpiMap(storageKey, prev, data);
  } catch (_) {}
}

/**
 * 해당 과제명·날짜에 사용시간이 남은 시간가계부 행이 없으면, 매일할일(needHabitTracker) KPI의 그날 **로그 행 전체** 제거.
 * (dailyCompleted만 비우면 value·'1일'이 남는 문제를 막기 위함. 삭제된 행 기준 `rowsOverride` 권장)
 * @param {string} taskName
 * @param {string|undefined} dateRaw
 * @param {unknown[]|undefined} rowsOverride - 삭제 직후 배열(미주입 시 readTimeLedgerEntriesRaw)
 */
export function pruneHabitKpiDayLogsIfNoTimeEntryForTaskDate(
  taskName,
  dateRaw,
  rowsOverride,
) {
  const name = (taskName || "").trim();
  if (!name) return;
  const norm = normalizeLogDate(
    String(dateRaw || "")
      .trim()
      .replace(/\//g, "-"),
  );
  if (norm.length < 10) return;
  const rows = Array.isArray(rowsOverride)
    ? rowsOverride
    : readTimeLedgerEntriesRaw();
  const hasTime = rows.some((r) => {
    if (!r || typeof r !== "object") return false;
    if ((r.taskName || "").trim() !== name) return false;
    const d = (r.date || "").toString();
    if (normalizeLogDate(d) !== norm) return false;
    return !!((r.timeTracked || "").trim());
  });
  if (hasTime) return;

  STORAGE_CONFIG.forEach(({ key }) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const prev = JSON.parse(raw);
      const data = JSON.parse(raw);
      const kpis = data.kpis || [];
      const kpiIds = new Set();
      for (const k of kpis) {
        if (!k || !k.needHabitTracker) continue;
        if ((k.name || "").trim() !== name) continue;
        kpiIds.add(k.id);
      }
      if (kpiIds.size === 0) return;
      const logs = data.kpiLogs || [];
      const next = logs.filter((l) => {
        if (!kpiIds.has(l.kpiId)) return true;
        const ld = normalizeLogDate(l.dateRaw || l.date || "");
        return ld !== norm;
      });
      if (next.length === logs.length) return;
      data.kpiLogs = next;
      stampAndPersistKpiMap(key, prev, data);
    } catch (_) {}
  });
}

/**
 * 매일 반복 KPI: 과제 기록 시 해당 날짜 로그에 체크한 매일 할 일만 저장(시간기록 모달)
 * @param {string} storageKey
 * @param {string} kpiId
 * @param {string} dateRaw - YYYY-MM-DD
 * @param {{ completed: Array<{id:string,text:string}> }} dailyState — 체크된 매일 할 일만(미체크는 저장하지 않음)
 */
export function upsertHabitTrackerLogWithDailyState(storageKey, kpiId, dateRaw, dailyState) {
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
    } else {
      logs.push({
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
      });
    }
    data.kpiLogs = logs;
    stampAndPersistKpiMap(storageKey, prev, data);
  } catch (_) {}
}

/**
 * 매일 반복(needHabitTracker) KPI: 시간가계부 과제 기록이 있으면 해당 날짜 KPI 로그에 자동 연동
 * saveTimeRows 호출 후 실행
 */
export function syncHabitTrackerLogs() {
  const rows = loadTimeRows();
  const taskByDate = new Map();
  rows.forEach((r) => {
    const name = (r.taskName || "").trim();
    const dateRaw = (r.date || "").toString().replace(/\//g, "-").slice(0, 10);
    if (!name || !dateRaw || dateRaw.length < 10) return;
    if (!(r.timeTracked || "").trim()) return;
    const key = `${name}|${dateRaw}`;
    if (!taskByDate.has(key)) taskByDate.set(key, { taskName: name, dateRaw });
  });

  STORAGE_CONFIG.forEach(({ key, kpiKey, idKey }) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const prev = JSON.parse(raw);
      const data = JSON.parse(raw);
      const kpis = data.kpis || [];
      const logs = data.kpiLogs || [];
      const existingLogKeys = new Set(
        logs.map((l) => `${l.kpiId}|${normalizeLogDate(l.dateRaw || l.date || "")}`),
      );

      let changed = false;
      taskByDate.forEach(({ taskName, dateRaw }) => {
        const matchingKpis = kpis.filter((k) => (k.name || "").trim() === taskName);
        matchingKpis.forEach((kpi) => {
        if (!kpi.needHabitTracker) return;
        const nd = normalizeLogDate(dateRaw);
        const logKey = `${kpi.id}|${nd}`;
        if (existingLogKeys.has(logKey)) {
          return;
        }

        const dateDisplay = toDisplayDate(nd);
        logs.push({
          id: nextLogId(),
          kpiId: kpi.id,
          [idKey]: kpi[kpiKey],
          date: dateDisplay,
          dateRaw: nd,
          value: "1",
          status: "순항",
          memo: "",
          dailyCompleted: [],
          dailyIncomplete: [],
        });
        existingLogKeys.add(logKey);
        changed = true;
        });
      });

      if (changed) {
        data.kpiLogs = logs;
        stampAndPersistKpiMap(key, prev, data);
      }
    } catch (_) {}
  });
}
