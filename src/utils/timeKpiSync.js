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
