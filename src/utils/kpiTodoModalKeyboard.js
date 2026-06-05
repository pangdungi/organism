import {
  bindLpModalMobileKeyboard,
  LP_MODAL_HTML_OPEN_CLASS,
} from "./lpModalKeyboard.js";

/** @deprecated lp-modal-open 과 동일 — 기존 import 호환 */
export const KPI_TODO_MODAL_HTML_OPEN_CLASS = LP_MODAL_HTML_OPEN_CLASS;

/**
 * KPI 할 일 추가·수정 — 컴팩트 모달 키보드 보정
 * @param {HTMLElement} modal
 * @param {HTMLElement} inputEl
 * @returns {() => void}
 */
export function bindKpiTodoModalMobileKeyboard(modal, inputEl) {
  return bindLpModalMobileKeyboard(modal, inputEl, { variant: "compact" });
}
