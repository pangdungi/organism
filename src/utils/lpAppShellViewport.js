/**
 * iOS PWA: 앱 껍데(#signin-page) 높이.
 * — 첫 진입 시 innerHeight 는 실제보다 크게 잡히는 경우가 많아 visualViewport 로 보이는 높이 사용.
 * — visualViewport.scroll(바운스)에는 반응하지 않고 resize·orientation·pageshow 만.
 */

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
