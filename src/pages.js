import { syncLpTopSafeChromeLoginGate } from "./utils/syncLpHomeTimeSafeTopChrome.js";
import { refreshLpPwaInstall } from "./utils/lpPwaInstall.js";

export function showOnly(pageId) {
  if (pageId !== "login") {
    const m = document.getElementById("auth-pw-recovery-modal");
    if (m) {
      m.setAttribute("hidden", "");
      m.setAttribute("aria-hidden", "true");
    }
    document.body.classList.remove("auth-pw-modal-open");
  }
  const pages = document.querySelectorAll("#app > .page");
  pages.forEach((p) => {
    if (p.id === pageId + "-page") {
      /* signin: 세로 flex로 #app-screen → .app-page 높이 체인(메인만 스크롤·하단 푸터 고정) */
      p.style.display =
        p.classList.contains("login-page") || p.id === "signin-page"
          ? "flex"
          : "block";
    } else {
      p.style.display = "none";
    }
  });
  syncLpTopSafeChromeLoginGate(
    pageId === "login" || pageId === "reset-password",
  );
  refreshLpPwaInstall();
}
