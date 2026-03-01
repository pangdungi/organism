export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content routine-view";
  const h = document.createElement("h2");
  h.textContent = "데일리 루틴 트랙";
  el.appendChild(h);
  const p = document.createElement("p");
  p.textContent = "데일리 루틴 트랙 화면 (준비 중)";
  el.appendChild(p);
  return el;
}
