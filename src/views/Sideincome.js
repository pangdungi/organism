export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content sideincome-view";
  const h = document.createElement("h2");
  h.textContent = "부수입";
  el.appendChild(h);
  const p = document.createElement("p");
  p.textContent = "부수입 화면 (준비 중)";
  el.appendChild(p);
  return el;
}
