/**
 * KPI(꿈·부수입·행복·건강) 동기화 — 콘솔 출력 없음.
 * kpiSyncDebugLog / kpiSyncTrace 는 호환용 no-op.
 * payload·로컬 스냅샷 요약 유틸만 유지.
 */

const KPI_LOCAL_KEYS = {
  dream: "kpi-dream-map",
  health: "kpi-health-map",
  happiness: "kpi-happiness-map",
  sideincome: "kpi-sideincome-paths",
};

export const KPI_SYNC_DEBUG_FLAG = "debug_kpi_sync";

export function kpiSyncDebugEnabled() {
  try {
    return (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(KPI_SYNC_DEBUG_FLAG) === "1"
    );
  } catch (_) {
    return false;
  }
}

export function kpiSyncDebugLog(..._args) {}

/**
 * 단계 구분용 — grep: [kpi-sync][dream]
 * @param {'dream'|'happiness'|'health'|'sideincome'} tab
 * @param {string} step
 * @param {Record<string, unknown>} detail
 */
export function kpiSyncTrace(_tab, _step, _detail) {}

/** deleted_refs 각 배열 길이 + KPI id 샘플(최대 5개) */
export function kpiSyncDeletedRefsBrief(dr) {
  if (!dr || typeof dr !== "object") {
    return { categories: 0, kpis: 0, kpiLogs: 0, kpiTodos: 0, kpiDailyRepeatTodos: 0, pathLogs: 0, sampleKpiIds: [] };
  }
  const kpis = Array.isArray(dr.kpis) ? dr.kpis : [];
  return {
    categories: Array.isArray(dr.categories) ? dr.categories.length : 0,
    kpis: kpis.length,
    kpiLogs: Array.isArray(dr.kpiLogs) ? dr.kpiLogs.length : 0,
    kpiTodos: Array.isArray(dr.kpiTodos) ? dr.kpiTodos.length : 0,
    kpiDailyRepeatTodos: Array.isArray(dr.kpiDailyRepeatTodos) ? dr.kpiDailyRepeatTodos.length : 0,
    pathLogs: Array.isArray(dr.pathLogs) ? dr.pathLogs.length : 0,
    sampleKpiIds: kpis.slice(0, 5).map(String),
  };
}

/**
 * 탭별 payload 요약(개수만 — 원인: merge 전후·pull 후 비교)
 * @param {'dream'|'happiness'|'health'|'sideincome'} tab
 */
export function kpiSyncPayloadSummary(tab, p) {
  if (!p || typeof p !== "object") {
    return { error: "empty_payload" };
  }
  const drBrief = kpiSyncDeletedRefsBrief(p.deletedRefs);
  const base = { deletedRefs: drBrief };
  switch (tab) {
    case "dream":
      return {
        ...base,
        dreams: Array.isArray(p.dreams) ? p.dreams.length : 0,
        kpis: Array.isArray(p.kpis) ? p.kpis.length : 0,
        kpiLogs: Array.isArray(p.kpiLogs) ? p.kpiLogs.length : 0,
        kpiTodos: Array.isArray(p.kpiTodos) ? p.kpiTodos.length : 0,
        kpiDailyRepeatTodos: Array.isArray(p.kpiDailyRepeatTodos) ? p.kpiDailyRepeatTodos.length : 0,
      };
    case "happiness":
      return {
        ...base,
        happinesses: Array.isArray(p.happinesses) ? p.happinesses.length : 0,
        kpis: Array.isArray(p.kpis) ? p.kpis.length : 0,
        kpiLogs: Array.isArray(p.kpiLogs) ? p.kpiLogs.length : 0,
        kpiTodos: Array.isArray(p.kpiTodos) ? p.kpiTodos.length : 0,
        kpiDailyRepeatTodos: Array.isArray(p.kpiDailyRepeatTodos) ? p.kpiDailyRepeatTodos.length : 0,
      };
    case "health":
      return {
        ...base,
        healths: Array.isArray(p.healths) ? p.healths.length : 0,
        kpis: Array.isArray(p.kpis) ? p.kpis.length : 0,
        kpiLogs: Array.isArray(p.kpiLogs) ? p.kpiLogs.length : 0,
        kpiTodos: Array.isArray(p.kpiTodos) ? p.kpiTodos.length : 0,
        kpiDailyRepeatTodos: Array.isArray(p.kpiDailyRepeatTodos) ? p.kpiDailyRepeatTodos.length : 0,
      };
    case "sideincome":
      return {
        ...base,
        paths: Array.isArray(p.paths) ? p.paths.length : 0,
        pathLogs: Array.isArray(p.pathLogs) ? p.pathLogs.length : 0,
        kpis: Array.isArray(p.kpis) ? p.kpis.length : 0,
        kpiLogs: Array.isArray(p.kpiLogs) ? p.kpiLogs.length : 0,
        kpiTodos: Array.isArray(p.kpiTodos) ? p.kpiTodos.length : 0,
        kpiDailyRepeatTodos: Array.isArray(p.kpiDailyRepeatTodos) ? p.kpiDailyRepeatTodos.length : 0,
      };
    default:
      return { ...base, note: "unknown_tab" };
  }
}

/** 각 KPI 로컬 저장소 요약(바이트·배열 길이) — 화면은 이 값을 읽어 그림 */
export function snapshotKpiLocalStorageBrief() {
  const out = {};
  for (const [name, key] of Object.entries(KPI_LOCAL_KEYS)) {
    try {
      const raw = localStorage.getItem(key);
      const bytes = raw ? raw.length : 0;
      const row = { storageKey: key, bytes };
      if (!raw) {
        out[name] = row;
        continue;
      }
      const p = JSON.parse(raw);
      if (Array.isArray(p.dreams)) row.dreams = p.dreams.length;
      if (Array.isArray(p.healths)) row.healths = p.healths.length;
      if (Array.isArray(p.paths)) row.paths = p.paths.length;
      if (Array.isArray(p.kpis)) row.kpis = p.kpis.length;
      if (Array.isArray(p.kpiLogs)) row.kpiLogs = p.kpiLogs.length;
      if (Array.isArray(p.kpiTodos)) row.kpiTodos = p.kpiTodos.length;
      out[name] = row;
    } catch (e) {
      out[name] = { storageKey: key, parseError: String(e?.message || e) };
    }
  }
  return out;
}

export function kpiSyncDebugUserHint(uid) {
  if (!kpiSyncDebugEnabled()) return;
  const short = uid ? `${String(uid).slice(0, 8)}…` : "(없음)";
  kpiSyncDebugLog("로그인 사용자 id(앞 8자만)", short);
}

/** 꿈·부수입·행복·건강 탭 id */
export const KPI_TAB_IDS = new Set(["dream", "sideincome", "happiness", "health"]);
