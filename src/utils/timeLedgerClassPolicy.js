/**
 * Time.js 전용: DOM class 는 main.css 에 정의된 토큰만 유지, 나머지는 data-legacy.
 * 이 파일의 LP_MAIN_CLASS 는 scripts/time-js-main-only-classes.mjs 가 main.css 에서 동기화합니다.
 */
export const LP_MAIN_CLASS = new Set([
  "app-footer-actions",
  "app-footer-icon-btn",
  "app-footer-menu",
  "app-footer-menu-back",
  "app-footer-spacer",
  "app-home-menu-launcher",
  "app-home-menu-launcher-admin-fab",
  "app-home-menu-launcher-brand",
  "app-home-menu-launcher-body",
  "app-home-menu-launcher-btn",
  "app-home-menu-launcher-btn--muted",
  "app-home-menu-launcher-card",
  "app-home-menu-launcher-icon",
  "app-home-menu-launcher-label",
  "app-home-menu-launcher-section",
  "app-home-menu-launcher-section-grid",
  "app-home-menu-launcher-section-title",
  "app-home-menu-launcher-title",
  "app-main",
  "app-page",
  "app-tab-panel",
  "lp-app-bg"
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
