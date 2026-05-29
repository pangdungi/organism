/**
 * 홈·시간가계부 — 서버 pull 대기 중 빈 화면/0원 오해 방지
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
