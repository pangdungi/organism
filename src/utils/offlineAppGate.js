/**
 * navigator.onLine === false (비행기 모드 등)일 때만 얇은 안내 배너.
 * 앱 사용은 막지 않음 — 로컬에 있는 기록·화면은 그대로 씀.
 */

import { isAppOffline } from "./networkPresence.js";
import { applyUiFontFromLocalCache } from "./appUiFont.js";

function syncBodyScroll(_blocked) {
  /* 전면 차단 제거 — body 스크롤은 항상 허용 */
  try {
    document.body.style.overflow = "";
  } catch (_) {}
}

function applyVisibility(root) {
  const offline = isAppOffline();
  root.hidden = !offline;
  root.setAttribute("aria-hidden", offline ? "false" : "true");
  document.body.classList.toggle("lp-is-offline", offline);
  syncBodyScroll(false);
  if (offline) {
    try {
      applyUiFontFromLocalCache();
    } catch (_) {}
  }
}

let _inited = false;

export function initOfflineAppGate() {
  if (_inited || typeof document === "undefined") return;
  _inited = true;

  let root = document.getElementById("lp-offline-gate");
  if (!root) {
    root = document.createElement("div");
    root.id = "lp-offline-gate";
    root.className = "lp-offline-gate lp-offline-gate--banner-only";
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.setAttribute("aria-label", "오프라인 안내");
    root.innerHTML = `
<div class="lp-offline-gate__banner" role="status">
  <span class="lp-offline-gate__banner-icon" aria-hidden="true">!</span>
  <span class="lp-offline-gate__banner-text">인터넷에 연결되어 있지 않습니다. 기기에 저장된 내용으로 이용할 수 있어요. 연결되면 자동으로 서버에 반영됩니다.</span>
</div>
`;
    document.body.appendChild(root);
  } else {
    root.classList.add("lp-offline-gate--banner-only");
    root.setAttribute("role", "status");
    root.setAttribute("aria-live", "polite");
    root.innerHTML = `
<div class="lp-offline-gate__banner" role="status">
  <span class="lp-offline-gate__banner-icon" aria-hidden="true">!</span>
  <span class="lp-offline-gate__banner-text">인터넷에 연결되어 있지 않습니다. 기기에 저장된 내용으로 이용할 수 있어요. 연결되면 자동으로 서버에 반영됩니다.</span>
</div>
`;
  }

  const refresh = () => {
    applyVisibility(root);
  };

  window.addEventListener("online", refresh, { passive: true });
  window.addEventListener("offline", refresh, { passive: true });

  refresh();
}
