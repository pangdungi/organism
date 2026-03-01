/**
 * 인생 KPI 화면
 * 빈 페이지 - 재구성 예정
 */

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content kpi-view";
  const title = document.createElement("h2");
  title.className = "kpi-view-title";
  title.textContent = "인생 KPI";
  el.appendChild(title);

  const viewTabs = document.createElement("div");
  viewTabs.className = "kpi-view-tabs";
  viewTabs.innerHTML = `
    <button type="button" class="kpi-view-tab active" data-view="1">꿈</button>
    <button type="button" class="kpi-view-tab" data-view="2">부수입</button>
    <button type="button" class="kpi-view-tab" data-view="3">건강</button>
    <button type="button" class="kpi-view-tab" data-view="4">행복</button>
  `;
  el.appendChild(viewTabs);

  const contentWrap = document.createElement("div");
  contentWrap.className = "kpi-view-content-wrap";
  el.appendChild(contentWrap);

  const panels = [];
  for (let i = 1; i <= 4; i++) {
    const panel = document.createElement("div");
    panel.className = "kpi-view-panel";
    panel.dataset.view = String(i);
    panel.hidden = i !== 1;
    contentWrap.appendChild(panel);
    panels.push(panel);
  }

  viewTabs.querySelectorAll(".kpi-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      viewTabs.querySelectorAll(".kpi-view-tab").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
      panels.forEach((p) => {
        p.hidden = p.dataset.view !== view;
      });
    });
  });

  return el;
}
