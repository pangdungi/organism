/** KPI 탭(꿈·건강·행복·부수입) — pull 은 백그라운드, 화면 중앙 스플래시 UI 는 사용하지 않음 */

import { renderLpUnifiedLoadingMarkup } from "./lpUnifiedLoadingUi.js";

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

export function shouldShowKpiMapSyncLoading(_tabId, _isContentEmpty) {
  /* 탭·내부 화면 전환 시 본문 안 스플래시 금지 — 로컬 데이터 즉시 표시, pull 은 백그라운드 */
  return false;
}

export function renderKpiMapSyncLoadingMarkup() {
  return renderLpUnifiedLoadingMarkup({
    variant: "inline",
    extraClass: "dream-kpi-map-sync-loading",
  });
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
