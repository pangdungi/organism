/**
 * 홈·시간가계부 — 앱 최초 진입(부팅) 시 서버 pull 대기 중 빈 화면/0원 오해 방지.
 * 탭 전환 시에는 pending 을 올리지 않음 — 로컬 데이터 즉시 표시 후 백그라운드 pull.
 */

import { renderLpUnifiedLoadingMarkup } from "./lpUnifiedLoadingUi.js";

const TAB_IDS = new Set(["home", "time"]);

/** @type {Set<string>} */
const pending = new Set();

export function setLpTabPullPending(tabId) {
  const id = String(tabId || "").trim();
  if (!TAB_IDS.has(id) || pending.has(id)) return;
  pending.add(id);
  dispatch("lp-tab-pull-pending", { tabId: id });
}

export function clearLpTabPullPending(tabId) {
  const id = String(tabId || "").trim();
  if (!pending.has(id)) return;
  pending.delete(id);
  dispatch("lp-tab-pull-settled", { tabId: id });
}

export function isLpTabPullPending(tabId) {
  return pending.has(String(tabId || "").trim());
}

function dispatch(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (_) {}
}

export function renderLpTabSyncLoadingMarkup(_message) {
  return renderLpUnifiedLoadingMarkup({
    variant: "inline",
    extraClass: "lp-tab-sync-loading",
  });
}

export function mountLpTabSyncLoading(container, _message) {
  if (!container) return;
  container.innerHTML = renderLpTabSyncLoadingMarkup();
}
