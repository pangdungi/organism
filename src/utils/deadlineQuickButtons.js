import { initModalStandardDateFields } from "./modalNativeDateField.js";

function localYmdWithOffset(dayOffset) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function applyYmdToDateInput(inputEl, ymd) {
  if (!(inputEl instanceof HTMLInputElement)) return;
  inputEl.value = ymd;
  inputEl.dispatchEvent(new Event("input", { bubbles: true }));
  inputEl.dispatchEvent(new Event("change", { bubbles: true }));
}

/** 할일·일정 수정 모달 — 마감일 아래 미니 퀵 칩(오늘·내일) */
export function buildTodoTaskDateQuickMarkup() {
  return `<div class="todo-task-date-quick" role="group" aria-label="날짜 빠른 입력">
    <button type="button" class="todo-task-date-quick-btn" data-offset="0">오늘</button>
    <button type="button" class="todo-task-date-quick-btn" data-offset="1">내일</button>
  </div>`;
}

/** 마지막으로 탭한 시작일·마감일 필드에 오늘/내일 적용 */
export function setupTodoTaskDateQuickButtons(modal) {
  const startInput = modal.querySelector(".todo-task-edit-start");
  const dueInput = modal.querySelector(".todo-task-edit-due");
  if (!startInput && !dueInput) return;

  let lastFocusedDateInput = dueInput || startInput;

  [startInput, dueInput].filter(Boolean).forEach((inp) => {
    inp.addEventListener("focus", () => {
      lastFocusedDateInput = inp;
    });
    const wrap = inp.closest(".time-task-log-date-native-wrap");
    wrap?.addEventListener("click", () => {
      lastFocusedDateInput = inp;
    });
  });

  modal.querySelectorAll(".todo-task-date-quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!lastFocusedDateInput) return;
      const offset = parseInt(btn.dataset.offset, 10);
      if (Number.isNaN(offset)) return;
      applyYmdToDateInput(lastFocusedDateInput, localYmdWithOffset(offset));
    });
  });
}

/**
 * KPI 모달 날짜 퀵 버튼(오늘, +14일, +30일) 설정
 * 마지막으로 포커스된 날짜 입력(시작일/마감일)에 적용됨
 */
export function setupDeadlineQuickButtons(modal) {
  const startInput = modal.querySelector('input[name="targetStartDate"]');
  const deadlineInput = modal.querySelector('input[name="targetDeadline"]');
  if (!startInput && !deadlineInput) return;

  let lastFocusedDateInput = deadlineInput || startInput;

  const markDateTarget = (inp) => {
    if (!(inp instanceof HTMLInputElement)) return;
    lastFocusedDateInput = inp;
    [startInput, deadlineInput].filter(Boolean).forEach((el) => {
      el.closest(".time-task-log-date-native-wrap")?.classList.toggle(
        "is-date-target",
        el === inp,
      );
    });
  };

  [startInput, deadlineInput].filter(Boolean).forEach((inp) => {
    inp.addEventListener("focus", () => markDateTarget(inp));
    const wrap = inp.closest(".time-task-log-date-native-wrap");
    wrap?.addEventListener("click", () => markDateTarget(inp));
  });
  markDateTarget(lastFocusedDateInput);

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  modal.querySelectorAll(".dream-kpi-today-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (lastFocusedDateInput) {
        lastFocusedDateInput.value = todayStr();
        lastFocusedDateInput.dispatchEvent(new Event("input", { bubbles: true }));
        lastFocusedDateInput.dispatchEvent(new Event("change", { bubbles: true }));
        markDateTarget(lastFocusedDateInput);
      }
    });
  });

  modal.querySelectorAll(".dream-kpi-deadline-quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const days = parseInt(btn.dataset.days, 10);
      if (isNaN(days) || !lastFocusedDateInput) return;
      const baseVal = lastFocusedDateInput.value?.trim();
      const otherInput = lastFocusedDateInput === startInput ? deadlineInput : startInput;
      const fallback = otherInput?.value?.trim();
      const baseDate = baseVal
        ? new Date(baseVal + "T12:00:00")
        : fallback
          ? new Date(fallback + "T12:00:00")
          : new Date();
      if (isNaN(baseDate.getTime())) return;
      const result = new Date(baseDate);
      result.setDate(result.getDate() + days);
      const y = result.getFullYear();
      const m = String(result.getMonth() + 1).padStart(2, "0");
      const d = String(result.getDate()).padStart(2, "0");
      lastFocusedDateInput.value = `${y}-${m}-${d}`;
      lastFocusedDateInput.dispatchEvent(new Event("input", { bubbles: true }));
      lastFocusedDateInput.dispatchEvent(new Event("change", { bubbles: true }));
      markDateTarget(lastFocusedDateInput);
    });
  });

  initModalStandardDateFields(modal);
}
