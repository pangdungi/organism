/**
 * #app-splash — 모바일 PWA·Safari에서 dvh/svh·visualViewport 어긋남으로
 * 스플래시가 반만 보이는 경우를 막고 항상 전체 화면을 덮도록 한다.
 */

const SPLASH_ID = "app-splash";

/** @type {AbortController | null} */
let _viewportAc = null;

export function readSplashViewportHeightPx() {
  if (typeof window === "undefined") return 0;
  const inner = window.innerHeight || 0;
  const vv = window.visualViewport;
  const vvTotal =
    vv && vv.height > 0 ? vv.height + Math.max(0, vv.offsetTop || 0) : 0;
  const docH = document.documentElement?.clientHeight || 0;
  return Math.ceil(Math.max(inner, vvTotal, docH, 0));
}

export function syncFullscreenOverlayViewport(el) {
  if (!(el instanceof HTMLElement) || el.hidden) return;
  const h = readSplashViewportHeightPx();
  if (!(h > 0)) return;
  el.style.setProperty("height", `${h}px`);
  el.style.setProperty("min-height", `${h}px`);
}

export function syncAppSplashViewport() {
  if (typeof document === "undefined") return;
  const splash = document.getElementById(SPLASH_ID);
  if (!splash || splash.hasAttribute("hidden")) return;
  syncFullscreenOverlayViewport(splash);
}

function bindSplashViewportListeners() {
  _viewportAc?.abort();
  if (typeof window === "undefined") return;
  _viewportAc = new AbortController();
  const { signal } = _viewportAc;
  const run = () => {
    syncAppSplashViewport();
    const tabOverlay = document.getElementById("lp-tab-loading-overlay");
    if (tabOverlay && !tabOverlay.hidden) syncFullscreenOverlayViewport(tabOverlay);
  };
  window.addEventListener("resize", run, { passive: true, signal });
  window.visualViewport?.addEventListener("resize", run, { passive: true, signal });
  window.visualViewport?.addEventListener("scroll", run, { passive: true, signal });
  window.addEventListener(
    "orientationchange",
    () => window.setTimeout(run, 120),
    { passive: true, signal },
  );
  run();
  requestAnimationFrame(run);
  window.setTimeout(run, 80);
  window.setTimeout(run, 280);
}

function unbindSplashViewportListeners() {
  _viewportAc?.abort();
  _viewportAc = null;
}

export function setAppSplashViewportLock(on) {
  if (typeof document === "undefined") return;
  try {
    document.documentElement.classList.toggle("lp-splash-active", !!on);
  } catch (_) {}
  if (on) {
    bindSplashViewportListeners();
    syncAppSplashViewport();
    return;
  }
  unbindSplashViewportListeners();
  const splash = document.getElementById(SPLASH_ID);
  if (splash) {
    splash.style.removeProperty("height");
    splash.style.removeProperty("min-height");
  }
}

export function initAppSplashViewportLock() {
  if (typeof document === "undefined") return;
  const splash = document.getElementById(SPLASH_ID);
  const tabOverlay = document.getElementById("lp-tab-loading-overlay");
  if (
    (splash && !splash.hasAttribute("hidden")) ||
    (tabOverlay && !tabOverlay.hidden)
  ) {
    setAppSplashViewportLock(true);
  }
}
