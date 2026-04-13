/**
 * navigator.onLine + online/offline 이벤트로 전면 차단 UI.
 * PWA(standalone)·좁은 화면에서는 핀터레스트 유사 레이아웃 클래스 부여.
 */

function isStandaloneDisplayMode() {
  try {
    if (typeof window.matchMedia === "function") {
      if (window.matchMedia("(display-mode: standalone)").matches) return true;
      if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    }
  } catch (_) {}
  try {
    if (/** @type {Navigator & { standalone?: boolean }} */ (navigator).standalone)
      return true;
  } catch (_) {}
  return false;
}

function shouldUsePwaRichLayout() {
  return (
    isStandaloneDisplayMode() &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 48rem)").matches
  );
}

function updatePwaClass(root) {
  root.classList.toggle("lp-offline-gate--pwa", shouldUsePwaRichLayout());
}

function syncBodyScroll(blocked) {
  try {
    document.body.style.overflow = blocked ? "hidden" : "";
  } catch (_) {}
}

function applyVisibility(root) {
  const offline = typeof navigator !== "undefined" && !navigator.onLine;
  root.hidden = !offline;
  root.setAttribute("aria-hidden", offline ? "false" : "true");
  syncBodyScroll(offline);
}

let _inited = false;

export function initOfflineAppGate() {
  if (_inited || typeof document === "undefined") return;
  _inited = true;

  let root = document.getElementById("lp-offline-gate");
  if (!root) {
    root = document.createElement("div");
    root.id = "lp-offline-gate";
    root.className = "lp-offline-gate";
    root.setAttribute("role", "alertdialog");
    root.setAttribute("aria-live", "assertive");
    root.setAttribute("aria-label", "오프라인 안내");
    root.innerHTML = `
<div class="lp-offline-gate__banner" role="status">
  <span class="lp-offline-gate__banner-icon" aria-hidden="true">!</span>
  <span class="lp-offline-gate__banner-text">인터넷에 연결되어 있지 않습니다.</span>
</div>
<div class="lp-offline-gate__body">
  <div class="lp-offline-gate__art" aria-hidden="true">
    <svg class="lp-offline-gate__svg" viewBox="0 0 200 160" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="100" cy="38" rx="52" ry="18" fill="#7CB342" opacity="0.9"/>
      <ellipse cx="100" cy="42" rx="28" ry="10" fill="#AED581"/>
      <circle cx="82" cy="40" r="5" fill="#E8F5E9"/><circle cx="100" cy="36" r="5" fill="#E8F5E9"/><circle cx="118" cy="40" r="5" fill="#E8F5E9"/>
      <path d="M100 56 L100 92" stroke="#9CCC65" stroke-width="3"/>
      <rect x="78" y="92" width="44" height="32" rx="4" fill="#B39DDB" stroke="#7E57C2" stroke-width="2"/>
      <rect x="84" y="98" width="32" height="18" rx="2" fill="#EDE7F6"/>
      <circle cx="100" cy="106" r="3" fill="#5E35B1"/>
      <path d="M92 114 L108 114" stroke="#5E35B1" stroke-width="1.5"/>
    </svg>
  </div>
  <div class="lp-offline-gate__card">
    <p class="lp-offline-gate__card-text">
      데이터를 불러오려면 Wi-Fi 또는 모바일 데이터에 연결해 주세요. 비행기 모드가 켜져 있으면 꺼 주세요.
    </p>
    <div class="lp-offline-gate__card-actions">
      <button type="button" class="lp-offline-gate__btn lp-offline-gate__btn--primary" data-lp-offline-reload>
        페이지 다시 불러오기
      </button>
    </div>
  </div>
</div>
`;
    document.body.appendChild(root);

    root.querySelector("[data-lp-offline-reload]")?.addEventListener("click", () => {
      try {
        window.location.reload();
      } catch (_) {}
    });
  }

  const refresh = () => {
    updatePwaClass(root);
    applyVisibility(root);
  };

  window.addEventListener("online", refresh, { passive: true });
  window.addEventListener("offline", refresh, { passive: true });
  window.addEventListener(
    "resize",
    () => {
      updatePwaClass(root);
    },
    { passive: true },
  );

  refresh();
}
