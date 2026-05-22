/**
 * iOS PWA: 세로 스크롤 rubber-band 후 100dvh가 줄어들며 푸터·본문 높이가 바뀌는 현상 방지.
 * visualViewport.scroll(바운스)에는 반응하지 않고, resize·orientation만 innerHeight로 고정.
 */
export function initLpAppShellViewportLock() {
  if (typeof window === "undefined") return;

  const apply = () => {
    const h = window.innerHeight;
    if (!(h > 0)) return;
    try {
      document.documentElement.style.setProperty("--lp-app-shell-h", `${h}px`);
    } catch (_) {}
  };

  apply();
  window.addEventListener("resize", apply, { passive: true });
  window.visualViewport?.addEventListener("resize", apply, { passive: true });
  window.addEventListener(
    "orientationchange",
    () => {
      window.setTimeout(apply, 120);
    },
    { passive: true },
  );
}
