export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content dream-view";
  const h = document.createElement("h2");
  h.textContent = "꿈";
  el.appendChild(h);
  const p = document.createElement("p");
  p.textContent = "꿈 화면 (준비 중)";
  el.appendChild(p);
  return el;
}
