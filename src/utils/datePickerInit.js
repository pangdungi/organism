/**
 * Flatpickr로 날짜 입력 스타일링 (파란색 → 회색 미니멀)
 * 네이티브 date picker는 브라우저 제어로 스타일 변경 불가
 */
import flatpickr from "flatpickr";
import { Korean } from "flatpickr/dist/esm/l10n/ko.js";
import "flatpickr/dist/flatpickr.min.css";

const inited = new WeakSet();

const defaultOptions = {
  locale: { ...Korean, firstDayOfWeek: 0 },
  allowInput: true,
  disableMobile: false,
  onReady(selectedDates, dateStr, instance) {
    const wrap = document.createElement("div");
    const hideDelete = instance.input?.dataset?.hideDeleteBtn === "true";
    wrap.className = "flatpickr-custom-buttons" + (hideDelete ? " flatpickr-custom-buttons--no-delete" : "");
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "flatpickr-custom-btn flatpickr-custom-btn-delete";
    delBtn.textContent = "삭제";
    delBtn.addEventListener("click", () => {
      instance.clear();
      instance.close();
    });
    if (hideDelete) delBtn.style.display = "none";
    const todayBtn = document.createElement("button");
    todayBtn.type = "button";
    todayBtn.className = "flatpickr-custom-btn flatpickr-custom-btn-today";
    todayBtn.textContent = "오늘";
    todayBtn.addEventListener("click", () => {
      instance.setDate(new Date());
      instance.close();
    });
    wrap.appendChild(delBtn);
    wrap.appendChild(todayBtn);
    instance.calendarContainer.appendChild(wrap);
  },
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
    .querySelectorAll('input[type="date"]')
    .forEach((el) => initDatePicker(el));
}

export function observeDatePickerInit(container) {
  if (!container) return;
  initDatePickersIn(container);
  const observer = new MutationObserver(() => initDatePickersIn(container));
  observer.observe(container, { childList: true, subtree: true });
}
