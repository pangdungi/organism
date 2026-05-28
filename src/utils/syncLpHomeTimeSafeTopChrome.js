/**
 * 로그인·비번재설정 게이트 + 오늘(메인): 노치·상태줄 뒤 상단 밴드 네이비.
 * — html/body 클래스 + CSS 변수(--lp-shell-chrome-bg)
 * — 시간가계부는 본문 전체 흰색(상단 세이프 포함).
 * — iOS standalone translucent: 세로 세이프는 .app-main padding-top, 셸은 동일 배경.
 * — Android PWA: WebView가 상태줄 아래에서 시작 → safe padding 중복 시 hairline.
 */
const CLASS = "lp-top-safe-chrome-navy";
/** 로그인·비번재설정: html/body 전체 네이비 (그라데이션 흰 하단 제거) */
const GATE_CLASS = "lp-auth-gate-chrome";
const NAVY = "#1e4d7b";
const WHITE = "#ffffff";

let loginGateVisible = false;
let lastTabId = "";

function isAndroidUa() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function isPwaStandaloneShell() {
  try {
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return true;
    if (window.matchMedia?.("(display-mode: fullscreen)")?.matches) return true;
  } catch (_) {}
  return false;
}

/** Android PWA: env(safe-area-inset-top) 실측 — 0 이면 Chrome 이 이미 상태줄 아래에서 그림 */
function measureSafeAreaInsetTopPx() {
  if (typeof document === "undefined") return 0;
  try {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top,0px);padding-top:constant(safe-area-inset-top);";
    document.documentElement.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).paddingTop) || 0;
    probe.remove();
    return px;
  } catch (_) {
    return 0;
  }
}

/** Android 전용 — main.css 가 padding·scrim 분기 */
export function initLpAndroidStatusBarChrome() {
  if (!isAndroidUa()) return;
  const html = document.documentElement;
  html.classList.add("lp-android");
  if (isPwaStandaloneShell()) html.classList.add("lp-pwa-standalone");
  const insetPx = measureSafeAreaInsetTopPx();
  html.classList.toggle("lp-android-no-top-inset", insetPx < 1);
  html.classList.toggle("lp-android-edge-to-edge", insetPx >= 1);
  try {
    html.style.setProperty("--lp-android-safe-top-measured", `${insetPx}px`);
  } catch (_) {}
}

let lpAndroidStatusBarChromeBound = false;

export function bindLpAndroidStatusBarChromeListeners() {
  if (lpAndroidStatusBarChromeBound || typeof window === "undefined") return;
  lpAndroidStatusBarChromeBound = true;
  if (!isAndroidUa()) return;
  const remeasure = () => initLpAndroidStatusBarChrome();
  window.addEventListener("orientationchange", () => setTimeout(remeasure, 150), {
    passive: true,
  });
  window.addEventListener("pageshow", remeasure, { passive: true });
}

/** Android Chrome·PWA: 상태줄 색은 CSS가 아니라 theme-color 메타로만 칠해짐 */
function syncThemeColorMeta(navyTop) {
  const color = navyTop ? NAVY : WHITE;
  try {
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (!metas.length) {
      const meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute("content", color);
      document.head.appendChild(meta);
      return;
    }
    metas.forEach((meta) => {
      if (meta.getAttribute("content") !== color) {
        meta.setAttribute("content", color);
      }
    });
  } catch (_) {}
}

function paint() {
  const gate = loginGateVisible;
  const navyTopTab = lastTabId === "home";
  const navyTop = gate || navyTopTab;
  try {
    document.documentElement.classList.toggle(GATE_CLASS, gate);
    document.documentElement.classList.toggle(CLASS, !gate && navyTopTab);
    document.body?.classList.toggle(GATE_CLASS, gate);
    document.body?.classList.toggle(CLASS, !gate && navyTopTab);
    syncThemeColorMeta(navyTop);
  } catch (_) {}
}

/** 앱 안 탭 전환 — App.js renderMain(본문 그린 뒤)에서 호출 */
export function syncLpTopSafeChromeFromTab(tabId) {
  lastTabId = tabId ?? "";
  paint();
}

/** 로그인 게이트(#login-page)·비번 재설정(reset-password-page) 표시 여부(pages.js showOnly) */
export function syncLpTopSafeChromeLoginGate(isLoginPage) {
  loginGateVisible = !!isLoginPage;
  paint();
}
