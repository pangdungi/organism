/**
 * 모바일 PWA: iOS·Android에서 키보드가 올라와도 layout viewport(100vh)는 그대로인 경우가 많아
 * 입력란이 키보드·하단 탭에 가려짐. visualViewport로 키보드에 해당하는 높이를 --vv-keyboard 로 넣어
 * .app-main 하단 패딩을 늘려 스크롤 가능 영역을 확보한다.
 */

/**
 * @returns {number} 추정 키보드·하단 가림 높이(px)
 */
export function syncVisualViewportKeyboardInset() {
  if (typeof window === "undefined") {
    return 0;
  }
  const vv = window.visualViewport;
  if (!vv) {
    try {
      document.documentElement.style.setProperty("--vv-keyboard", "0px");
    } catch (_) {}
    return 0;
  }
  const h = window.innerHeight;
  const kb = Math.max(0, h - vv.height - (vv.offsetTop || 0));
  try {
    document.documentElement.style.setProperty("--vv-keyboard", `${kb}px`);
  } catch (_) {}
  return kb;
}

let _inited = false;

export function initMobileVisualViewportKeyboardInset() {
  if (_inited || typeof window === "undefined" || !window.visualViewport) return;
  _inited = true;
  const run = () => syncVisualViewportKeyboardInset();
  window.visualViewport.addEventListener("resize", run, { passive: true });
  window.visualViewport.addEventListener("scroll", run, { passive: true });
  window.addEventListener("focusin", run, true);
  window.addEventListener("focusout", run, true);
  run();
}
