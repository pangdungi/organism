/**
 * KPI 화면(꿈·건강·행복·부회·사랑)에서 상위 탭·선택 KPI·필터를 sessionStorage에 둡니다.
 * renderMain으로 패널이 통째로 다시 그려질 때(모바일에서 앱 전환 후 동기화 등)에도 이어 보기 위함입니다.
 */

export const KPI_UI_SESSION_KEYS = {
  dream: "lp-kpi-ui-dream",
  health: "lp-kpi-ui-health",
  happiness: "lp-kpi-ui-happiness",
  sideincome: "lp-kpi-ui-sideincome",
  love: "lp-kpi-ui-love",
};

export function readKpiUiSession(storageKey) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o || typeof o !== "object") return null;
    return o;
  } catch {
    return null;
  }
}

export function writeKpiUiSession(storageKey, state) {
  try {
    sessionStorage.setItem(
      storageKey,
      JSON.stringify({
        tabId: state.tabId ?? null,
        selectedKpiId: state.selectedKpiId ?? null,
        kpiFilter: state.kpiFilter ?? "all",
      }),
    );
  } catch (_) {}
}

export function clearKpiUiSession(storageKey) {
  try {
    sessionStorage.removeItem(storageKey);
  } catch (_) {}
}

export function clearAllKpiUiSessions() {
  Object.values(KPI_UI_SESSION_KEYS).forEach((k) => clearKpiUiSession(k));
}

/**
 * @param {object|null} session
 * @param {{ categoryIds: Array<{ id: string }>, kpis: Array<Record<string, unknown>>, foreignKey: string }} opts
 */
export function restoreKpiTabFromSession(session, { categoryIds, kpis, foreignKey }) {
  const list = Array.isArray(categoryIds) ? categoryIds : [];
  const idSet = new Set(list.map((c) => String(c.id)));
  let tabId = session?.tabId != null ? String(session.tabId) : null;
  if (!tabId || !idSet.has(tabId)) {
    tabId = list[0]?.id != null ? String(list[0].id) : null;
  }
  let selectedKpiId = null;
  if (tabId && session?.selectedKpiId != null) {
    const want = String(session.selectedKpiId);
    const k = (Array.isArray(kpis) ? kpis : []).find((x) => x && String(x.id) === want);
    if (k && String(k[foreignKey]) === tabId) {
      selectedKpiId = want;
    }
  }
  const kf = session?.kpiFilter;
  const kpiFilter = kf === "active" || kf === "completed" || kf === "all" ? kf : "all";
  return { tabId, selectedKpiId, kpiFilter };
}
