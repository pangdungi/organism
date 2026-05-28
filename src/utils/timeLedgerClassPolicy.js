/**
 * Time.js 전용: DOM class 는 main.css 에 정의된 토큰만 유지, 나머지는 data-legacy.
 * 이 파일의 LP_MAIN_CLASS 는 scripts/time-js-main-only-classes.mjs 가 main.css 에서 동기화합니다.
 */
export const LP_MAIN_CLASS = new Set([
  "active",
  "admin-subs-action-btns",
  "admin-subs-btn",
  "admin-subs-btn--save",
  "admin-subs-btn--year",
  "admin-subs-refresh",
  "admin-subs-status",
  "admin-subs-statusline",
  "admin-subs-table",
  "admin-subs-table-wrap",
  "admin-subs-td--dt",
  "admin-subs-td--email",
  "admin-subs-td--uid",
  "admin-subs-toolbar",
  "admin-subs-toolbar-label",
  "admin-subs-tr",
  "admin-subs-until",
  "admin-view",
  "admin-view-body",
  "admin-view-header",
  "admin-view-hint",
  "admin-view-title",
  "app-footer-actions",
  "app-footer-icon-btn",
  "app-footer-menu",
  "app-footer-menu-back",
  "app-footer-spacer",
  "app-home-menu-launcher",
  "app-home-menu-launcher-admin-fab",
  "app-home-menu-launcher-body",
  "app-home-menu-launcher-brand",
  "app-home-menu-launcher-btn",
  "app-home-menu-launcher-btn--muted",
  "app-home-menu-launcher-card",
  "app-home-menu-launcher-icon",
  "app-home-menu-launcher-label",
  "app-home-menu-launcher-section-grid",
  "app-home-menu-launcher-title",
  "app-main",
  "app-page",
  "app-tab-panel",
  "app-tab-panel-content",
  "app-toast-backdrop",
  "app-toast-btn",
  "app-toast-message",
  "app-toast-modal",
  "app-toast-panel",
  "app-toast-sub",
  "auth-gate-body",
  "auth-gate-heading",
  "auth-gate-panel",
  "auth-gate-seg",
  "auth-gate-segments",
  "auth-pw-modal",
  "auth-pw-modal-open",
  "auth-pw-modal__backdrop",
  "auth-pw-modal__body",
  "auth-pw-modal__close",
  "auth-pw-modal__head",
  "auth-pw-modal__panel",
  "auth-pw-modal__title",
  "dream-view-header",
  "dream-view-label",
  "dream-view-title",
  "idea-app-font-dropdown-slot",
  "idea-basic-row",
  "idea-basic-rows",
  "idea-btn-calc",
  "idea-btn-delete-account",
  "idea-btn-logout",
  "idea-delete-account-block",
  "idea-delete-account-hint",
  "idea-delete-account-modal",
  "idea-delete-account-modal-backdrop",
  "idea-delete-account-modal-body",
  "idea-delete-account-modal-cancel",
  "idea-delete-account-modal-close",
  "idea-delete-account-modal-footer",
  "idea-delete-account-modal-header",
  "idea-delete-account-modal-label",
  "idea-delete-account-modal-panel",
  "idea-delete-account-modal-pw",
  "idea-delete-account-modal-submit",
  "idea-delete-account-modal-title",
  "idea-delete-account-modal-warn",
  "idea-font-settings-row",
  "idea-form-hint",
  "idea-form-input",
  "idea-form-label",
  "idea-form-row",
  "idea-hourly-form",
  "idea-hourly-result-label",
  "idea-hourly-result-unit",
  "idea-hourly-result-value",
  "idea-hourly-result-wrap",
  "idea-hourly-tab",
  "idea-hourly-tabs",
  "idea-input-unit",
  "idea-input-with-unit",
  "idea-logout-row",
  "idea-subscription-body",
  "idea-subscription-pass",
  "idea-user-id-value",
  "idea-view",
  "idea-view--mobile",
  "idea-view-title",
  "idea-widget",
  "idea-widget-grid",
  "is-active",
  "is-signup",
  "login-auth-switch",
  "login-auth-switch--forgot",
  "login-btn-cta",
  "login-btn-sm",
  "login-card",
  "login-card--brand",
  "login-change-actions",
  "login-change-form",
  "login-desc",
  "login-field--auth",
  "login-forgot-desc",
  "login-form--auth-gate",
  "login-input--auth",
  "login-input--in-password-row",
  "login-label",
  "login-link",
  "login-link--forgot",
  "login-page",
  "login-page--gate",
  "login-password-row",
  "login-pw-toggle",
  "login-show-pw",
  "login-title",
  "login-wrap",
  "lp-app-bg",
  "lp-search-bar",
  "lp-search-bar__input",
  "lp-search-bar__row",
  "lp-tab-footer-visible",
  "otf",
  "time-dashboard-view",
  "time-dashboard-widget",
  "time-dashboard-widget-title",
  "time-task-log-task-dropdown",
  "time-task-log-task-dropdown-trigger"
]);

export function lpSetClasses(el, classString) {
  if (!el) return;
  const tokens = String(classString ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const allowed = [];
  const legacy = [];
  for (const t of tokens) {
    (LP_MAIN_CLASS.has(t) ? allowed : legacy).push(t);
  }
  el.className = allowed.join(" ");
  if (legacy.length) el.setAttribute("data-legacy", legacy.join(" "));
  else el.removeAttribute("data-legacy");
}

export function lpTokenAdd(el, token) {
  if (!el || token == null || token === "") return;
  const t = String(token).trim();
  if (!t) return;
  if (LP_MAIN_CLASS.has(t)) el.classList.add(t);
  else {
    const cur = (el.getAttribute("data-legacy") || "").split(/\s+/).filter(Boolean);
    if (!cur.includes(t)) {
      cur.push(t);
      el.setAttribute("data-legacy", cur.join(" "));
    }
  }
}

export function lpTokenRemove(el, token) {
  if (!el || token == null || token === "") return;
  const t = String(token).trim();
  if (!t) return;
  if (LP_MAIN_CLASS.has(t)) el.classList.remove(t);
  else {
    const cur = (el.getAttribute("data-legacy") || "").split(/\s+/).filter(Boolean);
    const next = cur.filter((x) => x !== t);
    if (next.length) el.setAttribute("data-legacy", next.join(" "));
    else el.removeAttribute("data-legacy");
  }
}

export function lpTokenToggle(el, token, on) {
  if (!el || token == null || token === "") return;
  const t = String(token).trim();
  if (!t) return;
  if (LP_MAIN_CLASS.has(t)) el.classList.toggle(t, on);
  else {
    const cur = (el.getAttribute("data-legacy") || "").split(/\s+/).filter(Boolean);
    const set = new Set(cur);
    if (on) set.add(t);
    else set.delete(t);
    const next = [...set];
    if (next.length) el.setAttribute("data-legacy", next.join(" "));
    else el.removeAttribute("data-legacy");
  }
}

export function lpTokenHas(el, token) {
  if (!el || token == null || token === "") return false;
  const t = String(token).trim();
  if (!t) return false;
  if (LP_MAIN_CLASS.has(t)) return el.classList.contains(t);
  return (el.getAttribute("data-legacy") || "")
    .split(/\s+/)
    .filter(Boolean)
    .includes(t);
}
