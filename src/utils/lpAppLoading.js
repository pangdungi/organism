/**
 * 앱 준비·탭 전환 로딩 UI — 스플래시 문구 + 전체화면 오버레이(디자인 교체 예정)
 */

const DEFAULT_MSG = "앱 준비 중…";

/** @type {HTMLElement | null} */
let tabOverlayEl = null;

export function setAppSplashMessage(message = DEFAULT_MSG) {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  const label = splash.querySelector(".app-splash-label");
  if (label) label.textContent = String(message || DEFAULT_MSG);
  try {
    splash.setAttribute("aria-label", String(message || DEFAULT_MSG));
  } catch (_) {}
}

function buildSpinnerMarkup() {
  return `<div class="lp-app-loading-spinner" aria-hidden="true"><div class="lp-app-loading-spinner-ring"></div></div>`;
}

function ensureTabOverlay() {
  if (tabOverlayEl?.isConnected) return tabOverlayEl;
  const el = document.createElement("div");
  el.id = "lp-tab-loading-overlay";
  el.className = "lp-app-loading-overlay lp-app-loading-overlay--tab";
  el.hidden = true;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-busy", "true");
  el.innerHTML = `
    <div class="lp-app-loading-overlay__panel">
      ${buildSpinnerMarkup()}
      <p class="lp-app-loading-overlay__text"></p>
    </div>
  `;
  document.body.appendChild(el);
  tabOverlayEl = el;
  return el;
}

/** @param {string} [message] */
export function showLpTabLoading(message = "불러오는 중…") {
  const el = ensureTabOverlay();
  const text = el.querySelector(".lp-app-loading-overlay__text");
  if (text) text.textContent = String(message || "불러오는 중…");
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
  const id = String(tabId || "").trim();
  const labels = {
    home: "메인 불러오는 중…",
    time: "시간가계부 불러오는 중…",
    calendar: "할 일·일정 불러오는 중…",
    schedulecalendar: "일정 불러오는 중…",
    diary: "시간 레포트 불러오는 중…",
    dream: "꿈 KPI 불러오는 중…",
    health: "건강 KPI 불러오는 중…",
    happiness: "행복 KPI 불러오는 중…",
    sideincome: "부수입 KPI 불러오는 중…",
    workschedule: "근무표 불러오는 중…",
    idea: "계정 설정 불러오는 중…",
    admin: "관리 화면 불러오는 중…",
  };
  return labels[id] || "불러오는 중…";
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
