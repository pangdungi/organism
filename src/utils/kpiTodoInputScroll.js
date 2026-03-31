/**
 * 모바일: KPI 할일 입력이 하단 탭·키보드에 가리지 않도록 포커스 시 스크롤
 */
export function attachKpiTodoInputScrollIntoView(inputEl) {
  if (!inputEl || typeof inputEl.addEventListener !== "function") return;
  const scroll = () => {
    try {
      inputEl.scrollIntoView({ block: "center", behavior: "smooth" });
    } catch {
      inputEl.scrollIntoView(true);
    }
  };
  inputEl.addEventListener("focus", () => {
    requestAnimationFrame(scroll);
    setTimeout(scroll, 120);
    setTimeout(scroll, 400);
  });
}
