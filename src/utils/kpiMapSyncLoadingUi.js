/** KPI 탭(꿈·건강·행복·부수입) — 서버 pull 대기 중 빈 화면 오해 방지 */

const KPI_APP_TAB_IDS = new Set(["dream", "health", "happiness", "sideincome"]);

let pendingTabId = null;

export function isKpiAppTabId(tabId) {
  return KPI_APP_TAB_IDS.has(tabId);
}

export function setKpiTabPullPending(tabId) {
  if (!isKpiAppTabId(tabId)) return;
  pendingTabId = tabId;
}

export function clearKpiTabPullPending(tabId) {
  if (!isKpiAppTabId(tabId) || pendingTabId !== tabId) return;
  pendingTabId = null;
  try {
    window.dispatchEvent(
      new CustomEvent("lp-kpi-tab-pull-settled", { detail: { tabId } }),
    );
  } catch (_) {}
}

export function isKpiTabPullPending(tabId) {
  return pendingTabId === tabId;
}

export function shouldShowKpiMapSyncLoading(tabId, isContentEmpty) {
  return !!isContentEmpty && isKpiTabPullPending(tabId);
}

export function renderKpiMapSyncLoadingMarkup() {
  return `
    <div class="dream-kpi-map-sync-loading" role="status" aria-live="polite" aria-busy="true">
      <p class="dream-kpi-map-sync-loading-text">데이터 동기화중...</p>
      <div class="dream-kpi-map-sync-loading-bar" aria-hidden="true">
        <div class="dream-kpi-map-sync-loading-bar-fill"></div>
      </div>
    </div>
  `;
}

export function mountKpiMapSyncLoading(container) {
  if (!container) return;
  container.innerHTML = renderKpiMapSyncLoadingMarkup();
}

/**
 * @param {{ tabId: string, container: HTMLElement, isEmpty: boolean, onLoading?: () => void }} opts
 * @returns {boolean} true면 동기화 로딩 UI를 그렸음
 */
export function renderKpiMapSyncLoadingIfNeeded(opts) {
  const { tabId, container, isEmpty, onLoading } = opts;
  if (!shouldShowKpiMapSyncLoading(tabId, isEmpty)) return false;
  mountKpiMapSyncLoading(container);
  onLoading?.();
  return true;
}
