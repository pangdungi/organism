/**
 * 관리자 전용 탭(초기 화면만 — 기능은 이후 확장)
 */

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content admin-view";
  el.innerHTML = `
    <header class="admin-view-header dream-view-header-wrap">
      <h1 class="dream-view-title admin-view-title">관리자전용</h1>
    </header>
    <div class="admin-view-body">
      <p class="admin-view-hint">이 화면은 지정한 관리자 계정으로 로그인한 경우에만 보입니다.</p>
    </div>
  `;
  return el;
}
