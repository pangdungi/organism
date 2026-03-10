/**
 * Flatpickr로 날짜 입력 스타일링 (파란색 → 회색 미니멀)
 * 네이티브 date picker는 브라우저 제어로 스타일 변경 불가
 */
import flatpickr from "flatpickr";
import { Korean } from "flatpickr/dist/esm/l10n/ko.js";
import "flatpickr/dist/flatpickr.min.css";

const inited = new WeakSet();

const defaultOptions = {
  locale: { ...Korean, firstDayOfWeek: 1 },
  allowInput: true,
  disableMobile: false,
};

export function initDatePicker(inputEl, options = {}) {
  if (!inputEl || inited.has(inputEl)) return null;
  if (inputEl.type !== "date" && inputEl.type !== "datetime-local") return null;
  const fp = flatpickr(inputEl, { ...defaultOptions, ...options });
  inited.add(inputEl);
  inputEl.dataset.fpInitialized = "true";
  return fp;
}

export function initDatePickersIn(container) {
  if (!container) return;
  container
    .querySelectorAll(
      'input[type="date"]:not(.todo-due-input-hidden):not(.todo-start-input-hidden)',
    )
    .forEach((el) => initDatePicker(el));
}

export function observeDatePickerInit(container) {
  if (!container) return;
  initDatePickersIn(container);
  const observer = new MutationObserver(() => initDatePickersIn(container));
  observer.observe(container, { childList: true, subtree: true });
}
