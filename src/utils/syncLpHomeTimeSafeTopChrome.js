/**
 * 로그인·비번재설정 게이트 + 오늘(메인): 노치·상태줄 뒤 상단 밴드 네이비.
 * — html/body 클래스 + main.css 그라데이션
 * — 시간가계부는 본문 전체 흰색(상단 세이프 포함).
 * — iOS standalone translucent 일 때 세로 세이프는 #signin-page(및 로그인 게이트)에서만 처리.
 */
const CLASS = "lp-top-safe-chrome-navy";
/** 로그인·비번재설정: html/body 전체 네이비 (그라데이션 흰 하단 제거) */
const GATE_CLASS = "lp-auth-gate-chrome";
const NAVY = "#1e4d7b";
const WHITE = "#ffffff";

let loginGateVisible = false;
let lastTabId = "";

/** Android Chrome·PWA: 상태줄 색은 CSS가 아니라 theme-color 메타로만 칠해짐 */
function syncThemeColorMeta(navyTop) {
  const color = navyTop ? NAVY : WHITE;
  try {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      document.head.appendChild(meta);
    }
    if (meta.getAttribute("content") !== color) {
      meta.setAttribute("content", color);
    }
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
