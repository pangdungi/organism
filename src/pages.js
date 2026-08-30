import { refreshLpPwaInstall } from "./utils/lpPwaInstall.js";

/** 로그인·가입 화면으로 나갈 때 계정 창(시급 등)이 body에 남으면 안 됨 */
function dismissAccountOverlaysOnAuthGate() {
  try {
    document
      .querySelectorAll(".lp-desktop-idea-modal, .idea-delete-account-modal")
      .forEach((n) => n.remove());
  } catch (_) {}
  try {
    document.documentElement.classList.remove("lp-desktop-idea-modal-open");
  } catch (_) {}
  void import("./utils/desktopIdeaAccountModal.js")
    .then((m) => {
      m.closeDesktopIdeaAccountModal();
    })
    .catch(() => {});
}

export function showOnly(pageId) {
  if (pageId === "login" || pageId === "reset-password") {
    dismissAccountOverlaysOnAuthGate();
  }
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
  try {
    document.documentElement.classList.toggle(
      "lp-auth-gate-open",
      pageId === "login" || pageId === "reset-password",
    );
  } catch (_) {}
  refreshLpPwaInstall();
}
