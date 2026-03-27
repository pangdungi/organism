/**
 * KPI(꿈·부수입·행복·건강) 동기화 추적용 — 기본은 조용함.
 * 켜기: localStorage.setItem('debug_kpi_sync', '1') 후 새로고침
 * 끄기: localStorage.removeItem('debug_kpi_sync')
 *
 * 저장소 키는 각 *KpiMapSupabase.js 의 export와 동일한 문자열을 유지합니다.
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

export function kpiSyncDebugLog(...args) {
  if (!kpiSyncDebugEnabled()) return;
  console.log("[kpi-sync]", ...args);
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
