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
      instance.input?.dispatchEvent(new Event("change", { bubbles: true }));
    });
    if (hideDelete) delBtn.style.display = "none";
    const todayBtn = document.createElement("button");
    todayBtn.type = "button";
    todayBtn.className = "flatpickr-custom-btn flatpickr-custom-btn-today";
    todayBtn.textContent = "오늘";
    todayBtn.addEventListener("click", () => {
      instance.setDate(new Date());
      instance.close();
      // 프로그래밍 방식 변경은 native change 이벤트를 발생시키지 않음 → 수동 dispatch
      instance.input?.dispatchEvent(new Event("change", { bubbles: true }));
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
    .forEach((el) => {
      const useNativeMobile = el.dataset.useNativeMobile === "true";
      initDatePicker(el, useNativeMobile ? { disableMobile: true } : {});
    });
}

export function observeDatePickerInit(container) {
  if (!container) return;
  initDatePickersIn(container);
  let debounceTimer = 0;
  const scheduleInit = () => {
    if (debounceTimer) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      debounceTimer = 0;
      initDatePickersIn(container);
    }, 80);
  };
  const observer = new MutationObserver(scheduleInit);
  observer.observe(container, { childList: true, subtree: true });
}
