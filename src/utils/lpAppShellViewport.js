/**
 * 앱 껍데(#signin-page) 높이 — lp-app-shell-h
 * — PWA(standalone): CSS inset:0 + html/body 100svh. lvh/dvh(812)는 innerHeight(762)보다 커서 푸터 잘림.
 * — 브라우저 탭: visualViewport 기준 px. scroll(바운스)에는 반응하지 않음.
 */

function isLpPwaStandaloneShell() {
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

function readLpAppShellHeightPx() {
  const ih = window.innerHeight;
  const vv = window.visualViewport;
  if (vv && vv.height > 0) {
    const visible = Math.round(vv.height + Math.max(0, vv.offsetTop || 0));
    if (visible > 0) return Math.min(ih, visible);
  }
  return ih;
}

/** CSS 변수 --lp-app-shell-h 갱신 (mountApp 직후 등에서도 호출) */
export function syncLpAppShellViewportHeight() {
  if (typeof window === "undefined") return;
  if (isLpPwaStandaloneShell()) {
    try {
      document.documentElement.style.removeProperty("--lp-app-shell-h");
    } catch (_) {}
    return;
  }
  const h = readLpAppShellHeightPx();
  if (!(h > 0)) return;
  try {
    document.documentElement.style.setProperty("--lp-app-shell-h", `${h}px`);
  } catch (_) {}
}

export function initLpAppShellViewportLock() {
  if (typeof window === "undefined") return;

  const apply = () => syncLpAppShellViewportHeight();

  apply();
  if (isLpPwaStandaloneShell()) return;

  requestAnimationFrame(() => {
    apply();
    requestAnimationFrame(apply);
  });

  window.addEventListener("resize", apply, { passive: true });
  window.visualViewport?.addEventListener("resize", apply, { passive: true });
  window.addEventListener(
    "orientationchange",
    () => {
      window.setTimeout(apply, 120);
    },
    { passive: true },
  );
  window.addEventListener("pageshow", apply, { passive: true });
}
