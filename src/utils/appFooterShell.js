/**
 * 앱 하단 푸터 액션 행 — `data-lp-app-footer-actions` 컨테이너 안에
 * 뒤로가기(`data-lp-app-footer-back`) + 탭이 붙인 아이콘 버튼이 들어가며,
 * main.css에서 칸 단위로 가로 균등 분할합니다.
 * 선택·토글 상태는 `aria-pressed="true"` + main.css 배경으로 표시합니다.
 * 스타일: APP_FOOTER_ICON_BTN_CLASS 를 버튼에 넣으면 main.css 앱 푸터 공통 규격과 맞습니다.
 */
export const APP_FOOTER_ICON_BTN_CLASS = "app-footer-icon-btn";

/** 푸터 +·추가 버튼 — main.css 네이비 동그라미·흰 아이콘 */
export const APP_FOOTER_ADD_BTN_ATTR = "data-lp-app-footer-add";
export const APP_FOOTER_ADD_BTN_CLASS = "app-footer-icon-btn--add";
export const APP_FOOTER_ADD_SLOT_ATTR = "data-lp-app-footer-add-slot";
export const APP_FOOTER_ADD_SLOT_CLASS = "lp-app-footer-add-slot";

/** @param {HTMLElement} btn */
export function markAppFooterAddButton(btn) {
  if (!(btn instanceof HTMLElement)) return;
  btn.classList.add(APP_FOOTER_ICON_BTN_CLASS, APP_FOOTER_ADD_BTN_CLASS);
  btn.setAttribute(APP_FOOTER_ADD_BTN_ATTR, "");
}

/**
 * + 버튼을 칸 래퍼에 넣어 푸터 flex 균등 분할(래퍼) + 동그라미 버튼(고정 2.75rem) 분리
 * @param {HTMLElement} btn
 * @returns {HTMLElement}
 */
export function mountAppFooterAddButton(btn) {
  markAppFooterAddButton(btn);
  const existing = btn.closest(`[${APP_FOOTER_ADD_SLOT_ATTR}]`);
  if (existing instanceof HTMLElement) return existing;
  const shell = document.createElement("div");
  shell.className = APP_FOOTER_ADD_SLOT_CLASS;
  shell.setAttribute(APP_FOOTER_ADD_SLOT_ATTR, "");
  shell.appendChild(btn);
  return shell;
}

/** KPI 서브뷰(kpis·kpiDetail) 푸터 — 메인 메뉴(홈) — 첨부 dashboard 아이콘(윤곽 집) */
export const APP_FOOTER_HOME_ICON =
  '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m8 23v-6c0-2.209 1.791-4 4-4 2.209 0 4 1.791 4 4v6"/><path d="m1 21v-11l11-9 11 9v11c0 1.105-.895 2-2 2h-18c-1.105 0-2-.895-2-2z"/></g></svg>';

export function getAppFooterActionsSlot() {
  return document.querySelector("[data-lp-app-footer-actions]");
}

/** KPI 탭 푸터 — +·홈 등 탭이 붙인 버튼만 제거(뒤로가기는 App이 유지) */
export function clearKpiMapFooterActionButtons() {
  const slot = getAppFooterActionsSlot();
  if (!slot) return;
  slot.querySelectorAll("[data-lp-dream-kpi-footer-action]").forEach((btn) => {
    const wrap = btn.closest(`[${APP_FOOTER_ADD_SLOT_ATTR}]`);
    if (wrap) wrap.remove();
    else btn.remove();
  });
  slot.querySelectorAll("[data-lp-kpi-footer-home]").forEach((n) => n.remove());
}

/** @param {HTMLElement} slot */
export function appendKpiFooterHomeButton(slot) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = APP_FOOTER_ICON_BTN_CLASS;
  btn.setAttribute("data-lp-kpi-footer-home", "");
  btn.title = "메인 메뉴";
  btn.setAttribute("aria-label", "메인 메뉴");
  btn.innerHTML = APP_FOOTER_HOME_ICON;
  btn.addEventListener("click", () => {
    try {
      window.__lpSetTab?.("home");
    } catch (_) {}
  });
  slot.appendChild(btn);
}

/** 탭을 떠날 때 이전 탭 버튼이 남지 않게 비웁니다. (뒤로가기는 App이 유지) */
export function clearAppFooterActions() {
  const slot = getAppFooterActionsSlot();
  if (!slot) return;
  for (const node of [...slot.children]) {
    if (node?.hasAttribute?.("data-lp-app-footer-back")) continue;
    node.remove();
  }
}
