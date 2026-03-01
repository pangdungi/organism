export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content health-view";
  const h = document.createElement("h2");
  h.textContent = "건강";
  el.appendChild(h);
  const p = document.createElement("p");
  p.textContent = "건강 화면 (준비 중)";
  el.appendChild(p);
  return el;
}
