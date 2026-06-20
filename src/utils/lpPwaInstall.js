/**
 * PWA 설치 — Android Chrome beforeinstallprompt + iOS Safari 안내.
 * Android: 크롬 기본「앱 설치」배너를 막지 않음(다른 PWA와 동일).
 */

import { showToast } from "./showToast.js";

const DISMISS_KEY = "lp_pwa_install_dismissed";

/** @type {BeforeInstallPromptEvent | null} */
let deferredPrompt = null;

/** 네이티브 설치 창이 떠 있는 동안 중복 prompt 방지 */
let installPromptOpen = false;

function isStandaloneDisplayMode() {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
  } catch (_) {}
  try {
    if (/** @type {Navigator & { standalone?: boolean }} */ (navigator).standalone)
      return true;
  } catch (_) {}
  return false;
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isAndroidDevice() {
  return typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent);
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  if (isIosDevice() || isAndroidDevice()) return true;
  return /Mobile|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function isIosSafari() {
  if (!isIosDevice()) return false;
  const ua = navigator.userAgent;
  if (/CriOS|FxiOS|EdgiOS|OPiOS|mercury|GSA/i.test(ua)) return false;
  return /Safari/i.test(ua);
}

function isIosNonSafari() {
  return isIosDevice() && !isIosSafari();
}

function wasDismissedRecently() {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < 7 * 24 * 60 * 60 * 1000;
  } catch (_) {
    return false;
  }
}

function markDismissed() {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch (_) {}
}

function shouldOfferInstallBanner() {
  if (isStandaloneDisplayMode()) return false;
  if (!isMobileDevice()) return false;
  if (installPromptOpen) return false;
  if (wasDismissedRecently()) return false;
  return true;
}

function isPageVisible(pageId) {
  const page = document.getElementById(`${pageId}-page`);
  if (!page) return false;
  try {
    return getComputedStyle(page).display !== "none";
  } catch (_) {
    const display = page.style.display;
    return display === "flex" || display === "block";
  }
}

function hideAllInstallRoots() {
  [
    document.getElementById("lp-pwa-install-root-login"),
    document.getElementById("lp-pwa-install-root-app"),
    document.getElementById("lp-pwa-install-root-body"),
  ]
    .filter(Boolean)
    .forEach((root) => {
      root.hidden = true;
    });
}

function getActiveInstallRoot() {
  if (!shouldOfferInstallBanner()) return null;
  if (isPageVisible("signin")) {
    return document.getElementById("lp-pwa-install-root-app");
  }
  if (isPageVisible("login") || isPageVisible("reset-password")) {
    return document.getElementById("lp-pwa-install-root-login");
  }
  return null;
}

function getInstallInstructions() {
  const canNativePrompt = !!deferredPrompt;
  const ios = isIosDevice();
  const android = isAndroidDevice();

  if (canNativePrompt && !android) {
    return {
      title: "앱 설치",
      desc: "Doodle을 홈 화면에 설치하면 앱처럼 전체 화면으로 열 수 있어요.",
      showInstallBtn: true,
    };
  }
  if (ios && isIosNonSafari()) {
    return {
      title: "Safari에서 설치",
      desc: "iPhone·iPad의 Chrome 등에서는 「앱 설치」 메뉴가 없습니다. Safari로 이 사이트를 연 뒤 하단 공유(↑) → 「홈 화면에 추가」를 눌러 주세요.",
      showCopyUrl: true,
    };
  }
  if (ios) {
    return {
      title: "홈 화면에 추가",
      desc: "Safari에서 공유(↑) → 「홈 화면에 추가」를 눌러 주세요. 예전 아이콘이 있으면 삭제한 뒤 다시 추가해 주세요.",
    };
  }
  if (android) {
    return {
      title: "앱 설치",
      desc: canNativePrompt
        ? "화면 아래 또는 주소창 옆 「앱 설치」를 눌러 주세요. 안 보이면 ⋮ → 「앱 설치」·「홈 화면에 추가」를 이용해 주세요."
        : "⋮ 메뉴 → 「앱 설치」 또는 「홈 화면에 추가」로 설치할 수 있어요.",
      showInstallBtn: canNativePrompt,
    };
  }
  return {
    title: "앱처럼 쓰기",
    desc: "브라우저 메뉴에서 이 사이트를 홈 화면에 추가할 수 있어요.",
  };
}

async function runNativeInstall() {
  if (!deferredPrompt || installPromptOpen) return;

  installPromptOpen = true;
  hideAllInstallRoots();
  closeLpPwaInstallHelpModal();
  showToast("설치 창을 확인해 주세요", "브라우저 팝업에서 「설치」를 눌러 주세요.");

  const promptEvent = deferredPrompt;
  deferredPrompt = null;

  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;

    if (outcome === "accepted") {
      markDismissed();
      hideAllInstallRoots();
      closeLpPwaInstallHelpModal();
      showToast(
        "홈 화면을 확인해 주세요",
        "Doodle 아이콘이 생겼는지 봐 주세요. 예전 아이콘이 남아 있으면 삭제 후 다시 추가해 주세요.",
      );
      return;
    }

    showToast("설치가 취소되었습니다", "다시 설치하려면 「앱 설치」를 눌러 주세요.");
  } catch (_) {
    showToast("설치를 시작하지 못했습니다", "⋮ → 「앱 설치」를 이용해 주세요.");
  } finally {
    installPromptOpen = false;
    refreshLpPwaInstall();
  }
}

function buildInstallCard(opts = {}) {
  const { onDismiss, dismissLabel = "닫기" } = opts;
  const info = getInstallInstructions();
  const canNativePrompt = !!deferredPrompt && !isAndroidDevice();

  const card = document.createElement("div");
  card.className = "lp-pwa-install-card";

  const title = document.createElement("p");
  title.className = "lp-pwa-install-title";
  title.id = "lp-pwa-install-modal-title";
  title.textContent = info.title;

  const desc = document.createElement("p");
  desc.className = "lp-pwa-install-desc";
  desc.textContent = info.desc;

  card.appendChild(title);
  card.appendChild(desc);

  const actions = document.createElement("div");
  actions.className = "lp-pwa-install-actions";

  if (info.showInstallBtn && canNativePrompt) {
    const installBtn = document.createElement("button");
    installBtn.type = "button";
    installBtn.className = "lp-pwa-install-btn lp-pwa-install-btn--primary";
    installBtn.textContent = "앱 설치";
    installBtn.addEventListener("click", () => {
      void runNativeInstall();
    });
    actions.appendChild(installBtn);
  }

  if (info.showCopyUrl) {
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "lp-pwa-install-btn lp-pwa-install-btn--primary";
    copyBtn.textContent = "주소 복사";
    copyBtn.addEventListener("click", () => {
      void (async () => {
        copyBtn.disabled = true;
        copyBtn.textContent = "복사 중…";
        const url = "https://timeisprice.com/";
        try {
          await navigator.clipboard.writeText(url);
          showToast("주소를 복사했습니다", "Safari에 붙여넣어 열어 주세요.");
        } catch (_) {
          showToast(url);
        } finally {
          copyBtn.disabled = false;
          copyBtn.textContent = "주소 복사";
        }
      })();
    });
    actions.appendChild(copyBtn);
  }

  const dismissBtn = document.createElement("button");
  dismissBtn.type = "button";
  dismissBtn.className = "lp-pwa-install-btn lp-pwa-install-btn--ghost";
  dismissBtn.textContent = dismissLabel;
  dismissBtn.addEventListener("click", () => {
    markDismissed();
    onDismiss?.();
  });
  actions.appendChild(dismissBtn);

  card.appendChild(actions);
  return card;
}

function mountInstallCard(root, cardOpts) {
  root.innerHTML = "";
  root.appendChild(buildInstallCard(cardOpts));
}

function renderInstallBanner(root) {
  if (!root || !shouldOfferInstallBanner()) {
    hideAllInstallRoots();
    return;
  }

  if (!isIosDevice() && !isAndroidDevice() && !deferredPrompt) {
    hideAllInstallRoots();
    return;
  }

  hideAllInstallRoots();
  root.hidden = false;
  mountInstallCard(root, {
    dismissLabel: deferredPrompt && !isAndroidDevice() ? "나중에" : "닫기",
    onDismiss: () => {
      hideAllInstallRoots();
    },
  });
}

let helpModalEl = null;

function closeLpPwaInstallHelpModal() {
  helpModalEl?.remove();
  helpModalEl = null;
  document.body.classList.remove("lp-pwa-install-modal-open");
}

/** 설정·수동 호출용 — iOS Chrome 등에서도 항상 안내 표시 */
export function showLpPwaInstallHelp() {
  if (isStandaloneDisplayMode()) {
    showToast("이미 앱으로 실행 중입니다.");
    return;
  }
  if (!isMobileDevice()) {
    showToast("PC Chrome ⋮ 메뉴에서 「Doodle 설치」를 선택해 주세요.");
    return;
  }

  closeLpPwaInstallHelpModal();
  const wrap = document.createElement("div");
  wrap.className = "lp-pwa-install-modal";
  wrap.innerHTML = `<div class="lp-pwa-install-modal__backdrop" tabindex="-1" aria-hidden="true"></div>`;
  const panel = document.createElement("div");
  panel.className = "lp-pwa-install-modal__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "lp-pwa-install-modal-title");
  panel.appendChild(
    buildInstallCard({
      dismissLabel: "닫기",
      onDismiss: closeLpPwaInstallHelpModal,
    }),
  );
  wrap.appendChild(panel);
  wrap.querySelector(".lp-pwa-install-modal__backdrop")?.addEventListener("click", () => {
    closeLpPwaInstallHelpModal();
  });
  document.body.appendChild(wrap);
  helpModalEl = wrap;
  document.body.classList.add("lp-pwa-install-modal-open");
}

export function refreshLpPwaInstall() {
  hideAllInstallRoots();
}

export function initLpPwaInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installPromptOpen = false;
    hideAllInstallRoots();
    closeLpPwaInstallHelpModal();
  });

  hideAllInstallRoots();
}
