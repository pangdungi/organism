/**
 * 앱 준비·초기 진입 로딩 UI — 통일 스플래시·탭 오버레이
 */

import {
  LP_UNIFIED_LOADING_MESSAGE,
  renderLpUnifiedLoadingInnerMarkup,
} from "./lpUnifiedLoadingUi.js";

/** @type {HTMLElement | null} */
let tabOverlayEl = null;

export function setAppSplashMessage(_message) {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  try {
    splash.setAttribute("aria-label", LP_UNIFIED_LOADING_MESSAGE);
  } catch (_) {}
}

function ensureTabOverlay() {
  if (tabOverlayEl?.isConnected) return tabOverlayEl;
  const el = document.createElement("div");
  el.id = "lp-tab-loading-overlay";
  el.className = "lp-unified-loading lp-unified-loading--overlay";
  el.hidden = true;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-busy", "true");
  el.setAttribute("aria-label", LP_UNIFIED_LOADING_MESSAGE);
  el.innerHTML = renderLpUnifiedLoadingInnerMarkup();
  document.body.appendChild(el);
  tabOverlayEl = el;
  return el;
}

/** @param {string} [_message] */
export function showLpTabLoading(_message) {
  const el = ensureTabOverlay();
  el.hidden = false;
  el.setAttribute("aria-busy", "true");
  try {
    document.documentElement.classList.add("lp-tab-loading-active");
  } catch (_) {}
}

export function hideLpTabLoading() {
  if (!tabOverlayEl) return;
  tabOverlayEl.hidden = true;
  tabOverlayEl.setAttribute("aria-busy", "false");
  try {
    document.documentElement.classList.remove("lp-tab-loading-active");
  } catch (_) {}
}

/** @param {string} tabId */
export function tabLoadingMessage(tabId) {
  return LP_UNIFIED_LOADING_MESSAGE;
}

export function afterLpTabPaint(fn) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      try {
        fn?.();
      } catch (_) {}
    });
  });
}
