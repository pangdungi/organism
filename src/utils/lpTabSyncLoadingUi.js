/**
 * 홈·시간가계부 — 서버 pull 대기 중 빈 화면/0원 오해 방지
 */

const TAB_IDS = new Set(["home", "time"]);

/** @type {Set<string>} */
const pending = new Set();

export function setLpTabPullPending(tabId) {
  const id = String(tabId || "").trim();
  if (!TAB_IDS.has(id) || pending.has(id)) return;
  pending.add(id);
  dispatch("lp-tab-pull-pending", { tabId: id });
}

export function clearLpTabPullPending(tabId) {
  const id = String(tabId || "").trim();
  if (!pending.has(id)) return;
  pending.delete(id);
  dispatch("lp-tab-pull-settled", { tabId: id });
}

export function isLpTabPullPending(tabId) {
  return pending.has(String(tabId || "").trim());
}

function dispatch(name, detail) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }));
  } catch (_) {}
}

export function renderLpTabSyncLoadingMarkup(
  message = "데이터 불러오는 중…",
) {
  const text = String(message || "데이터 불러오는 중…");
  return `
    <div class="lp-tab-sync-loading dream-kpi-map-sync-loading" role="status" aria-live="polite" aria-busy="true">
      <p class="dream-kpi-map-sync-loading-text lp-tab-sync-loading-text">${escapeHtml(text)}</p>
      <div class="dream-kpi-map-sync-loading-bar" aria-hidden="true">
        <div class="dream-kpi-map-sync-loading-bar-fill"></div>
      </div>
    </div>
  `;
}

export function mountLpTabSyncLoading(container, message) {
  if (!container) return;
  container.innerHTML = renderLpTabSyncLoadingMarkup(message);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
