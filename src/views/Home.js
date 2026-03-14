/**
 * Home 페이지 - 대시보드/홈 빈 페이지
 */

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content home-view";

  const title = document.createElement("h2");
  title.className = "home-view-title";
  title.textContent = "Home";
  el.appendChild(title);

  return el;
}
