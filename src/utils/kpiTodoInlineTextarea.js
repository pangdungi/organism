/**
 * KPI 패널 안 할 일 한 줄 — 줄바꿈 표시용 textarea 높이·키 처리
 */

export function setupKpiTodoInlineTextarea(textarea, options = {}) {
  const { maxLength = 500 } = options;
  if (!textarea || textarea.tagName !== "TEXTAREA") return;
  textarea.rows = 1;
  textarea.setAttribute("maxlength", String(maxLength));
  const fit = () => {
    textarea.style.height = "0";
    textarea.style.height = `${textarea.scrollHeight}px`;
  };
  textarea.addEventListener("input", fit);
  requestAnimationFrame(fit);
}

export function bindKpiTodoTextareaKeydown(textarea) {
  if (!textarea) return;
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      textarea.blur();
    }
  });
}
