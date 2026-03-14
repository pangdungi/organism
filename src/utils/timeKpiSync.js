/**
 * KPI ↔ 시간가계부 연동
 * - 과제명(KPI 이름)으로 시간 기록 누적합 조회
 */

const TIME_ROWS_KEY = "time_task_log_rows";

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
  try {
    const raw = localStorage.getItem(TIME_ROWS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    }
  } catch (_) {}
  return [];
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
 * 과제설정창에서 수정·삭제 불가
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

const STORAGE_CONFIG = [
  { key: "kpi-dream-map", kpiKey: "dreamId", idKey: "dreamId" },
  { key: "kpi-sideincome-paths", kpiKey: "pathId", idKey: "pathId" },
  { key: "kpi-happiness-map", kpiKey: "happinessId", idKey: "happinessId" },
  { key: "kpi-health-map", kpiKey: "healthId", idKey: "healthId" },
];

/**
 * 매일 반복 KPI: 과제 기록 시 해당 날짜 로그에 매일 할일 완료/미완료 상태 저장 (시간기록 모달에서만 체크 반영)
 * @param {string} storageKey
 * @param {string} kpiId
 * @param {string} dateRaw - YYYY-MM-DD
 * @param {{ completed: Array<{id:string,text:string}>, incomplete: Array<{id:string,text:string}> }} dailyState
 */
export function upsertHabitTrackerLogWithDailyState(storageKey, kpiId, dateRaw, dailyState) {
  if (!storageKey || !kpiId || !dateRaw || dateRaw.length < 10) return;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
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

    const dailyCompleted = Array.isArray(dailyState?.completed) ? dailyState.completed : [];
    const dailyIncomplete = Array.isArray(dailyState?.incomplete) ? dailyState.incomplete : [];
    const dateDisplay = toDisplayDate(dateRaw);

    if (existingIdx >= 0) {
      logs[existingIdx].dailyCompleted = dailyCompleted;
      logs[existingIdx].dailyIncomplete = dailyIncomplete;
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
        dailyCompleted,
        dailyIncomplete,
      });
    }
    data.kpiLogs = logs;
    localStorage.setItem(storageKey, JSON.stringify(data));
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
        const logKey = `${kpi.id}|${dateRaw}`;
        if (existingLogKeys.has(logKey)) return;

        const dateDisplay = toDisplayDate(dateRaw);
        logs.push({
          id: nextLogId(),
          kpiId: kpi.id,
          [idKey]: kpi[kpiKey],
          date: dateDisplay,
          dateRaw,
          value: "1",
          status: "순항",
          memo: "",
        });
        existingLogKeys.add(logKey);
        changed = true;
        });
      });

      if (changed) {
        data.kpiLogs = logs;
        localStorage.setItem(key, JSON.stringify(data));
      }
    } catch (_) {}
  });
}
