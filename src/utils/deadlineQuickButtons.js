/**
 * KPI 모달 날짜 퀵 버튼(오늘, +14일, +30일, +60일) 설정
 * 마지막으로 포커스된 날짜 입력(시작기한/달성기한)에 적용됨
 */
export function setupDeadlineQuickButtons(modal) {
  const startInput = modal.querySelector('input[name="targetStartDate"]');
  const deadlineInput = modal.querySelector('input[name="targetDeadline"]');
  if (!startInput && !deadlineInput) return;

  let lastFocusedDateInput = deadlineInput || startInput;

  [startInput, deadlineInput].filter(Boolean).forEach((inp) => {
    inp.addEventListener("focus", () => {
      lastFocusedDateInput = inp;
    });
  });

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  modal.querySelectorAll(".dream-kpi-today-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (lastFocusedDateInput) {
        lastFocusedDateInput.value = todayStr();
        lastFocusedDateInput.dispatchEvent(new Event("input", { bubbles: true }));
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
    });
  });
}
