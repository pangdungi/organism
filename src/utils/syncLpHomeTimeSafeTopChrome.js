/**
 * 로그인·비번재설정 게이트 + 오늘(메인) + 시간가계부 탭: 노치·상태줄 뒤 상단 밴드 네이비.
 * — html/body 클래스 + main.css 그라데이션
 * — iOS standalone 에서는 index.html 의 apple-mobile-web-app-status-bar-style 이
 *   black-translucent 일 때 웹 배경이 상태줄 뒤까지 그려짐(default 이면 흰 칸 고정).
 */
const CLASS = "lp-top-safe-chrome-navy";

let loginGateVisible = false;
let lastTabId = "";

function paint() {
  const on =
    loginGateVisible ||
    lastTabId === "home" ||
    lastTabId === "time";
  try {
    document.documentElement.classList.toggle(CLASS, on);
    document.body?.classList.toggle(CLASS, on);
  } catch (_) {}
}

/** 앱 안 탭 전환(App.js) */
export function syncLpTopSafeChromeFromTab(tabId) {
  lastTabId = tabId ?? "";
  paint();
}

/** 로그인 게이트(#login-page)·비번 재설정(reset-password-page) 표시 여부(pages.js showOnly) */
export function syncLpTopSafeChromeLoginGate(isLoginPage) {
  loginGateVisible = !!isLoginPage;
  paint();
}
