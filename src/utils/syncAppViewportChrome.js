/**
 * 상위 탭에 맞춰 theme-color·iOS 상태 표시줄 스타일·html 바운스 배경 클래스를 맞춘다.
 * @param {string} tabId
 */
export function syncAppViewportChromeForTab(tabId) {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.remove("lp-viewport-chrome-dark", "lp-viewport-chrome-idea");

  let themeColor = "#ffffff";
  let appleStatusBar = "default";

  if (tabId === "home" || tabId === "time") {
    root.classList.add("lp-viewport-chrome-dark");
    themeColor = "#1e4d7b";
    appleStatusBar = "black-translucent";
  } else if (tabId === "idea") {
    root.classList.add("lp-viewport-chrome-idea");
    themeColor = "#f0f4fa";
    appleStatusBar = "default";
  }

  const metaTheme = document.getElementById("meta-theme-color");
  if (metaTheme) metaTheme.setAttribute("content", themeColor);

  const metaApple = document.getElementById("meta-apple-status-bar-style");
  if (metaApple) metaApple.setAttribute("content", appleStatusBar);
}
