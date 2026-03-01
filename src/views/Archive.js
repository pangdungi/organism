export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content archive-view";
  const h = document.createElement("h2");
  h.textContent = "아카이브";
  el.appendChild(h);
  const p = document.createElement("p");
  p.textContent = "아카이브 화면 (준비 중)";
  el.appendChild(p);
  return el;
}
