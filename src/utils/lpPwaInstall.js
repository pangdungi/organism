/**
 * PWA 설치 — Android Chrome beforeinstallprompt + iOS Safari 안내.
 */

import { showToast } from "./showToast.js";

const DISMISS_KEY = "lp_pwa_install_dismissed";

/** @type {BeforeInstallPromptEvent | null} */
let deferredPrompt = null;

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

/** 뷰포트가 아니라 기기 UA 기준 (모바일 Chrome·Safari 모두 포함) */
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
  if (wasDismissedRecently()) return false;
  return true;
}

function isPageVisible(pageId) {
  const page = document.getElementById(`${pageId}-page`);
  if (!page) return false;
  const display = page.style.display;
  return display === "flex" || display === "block";
}

function ensureBodyInstallRoot() {
  let root = document.getElementById("lp-pwa-install-root-body");
  if (!root) {
    root = document.createElement("div");
    root.id = "lp-pwa-install-root-body";
    root.className = "lp-pwa-install-root lp-pwa-install-root--app";
    root.hidden = true;
    root.setAttribute("aria-live", "polite");
    document.body.appendChild(root);
  }
  return root;
}

function getLegacyInstallRoots() {
  return [
    document.getElementById("lp-pwa-install-root-login"),
    document.getElementById("lp-pwa-install-root-app"),
  ].filter(Boolean);
}

function hideAllInstallRoots() {
  const bodyRoot = document.getElementById("lp-pwa-install-root-body");
  if (bodyRoot) bodyRoot.hidden = true;
  getLegacyInstallRoots().forEach((root) => {
    root.hidden = true;
  });
}

function getInstallInstructions() {
  const canNativePrompt = !!deferredPrompt;
  const ios = isIosDevice();
  const android = isAndroidDevice();

  if (canNativePrompt) {
    return {
      title: "앱 설치",
      desc: "Time is Price를 홈 화면에 설치하면 앱처럼 전체 화면으로 열 수 있어요.",
      showInstallBtn: true,
    };
  }
  if (ios && isIosNonSafari()) {
    return {
      title: "Safari에서 설치",
      desc: "iPhone·iPad의 Chrome 등에서는 「앱 설치」 메뉴가 없습니다. Safari로 timeisprice.com 을 연 뒤 하단 공유(↑) → 「홈 화면에 추가」를 눌러 주세요.",
      showCopyUrl: true,
    };
  }
  if (ios) {
    return {
      title: "홈 화면에 추가",
      desc: "Safari 하단 공유(↑) 버튼 → 「홈 화면에 추가」를 눌러 주세요. 추가 후 아이콘으로 열면 앱처럼 쓸 수 있어요.",
    };
  }
  if (android) {
    return {
      title: "앱 설치 / 홈 화면 추가",
      desc: "① 주소창 오른쪽 ⊕(설치) 아이콘 또는 ② ⋮ 더보기 → 「앱 설치」·「홈 화면에 추가」를 선택해 주세요. 메뉴에 없으면 페이지를 30초 정도 사용한 뒤 새로고침해 보세요.",
    };
  }
  return {
    title: "앱처럼 쓰기",
    desc: "브라우저 메뉴에서 이 사이트를 홈 화면에 추가할 수 있어요.",
  };
}

function buildInstallCard(opts = {}) {
  const { onDismiss, dismissLabel = "닫기" } = opts;
  const info = getInstallInstructions();
  const canNativePrompt = !!deferredPrompt;

  const card = document.createElement("div");
  card.className = "lp-pwa-install-card";

  const title = document.createElement("p");
  title.className = "lp-pwa-install-title";
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
      void (async () => {
        if (!deferredPrompt) return;
        try {
          await deferredPrompt.prompt();
          const { outcome } = await deferredPrompt.userChoice;
          if (outcome === "accepted") {
            hideAllInstallRoots();
            closeLpPwaInstallHelpModal();
          }
        } catch (_) {}
        deferredPrompt = null;
        refreshLpPwaInstall();
      })();
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
        const url = "https://timeisprice.com/";
        try {
          await navigator.clipboard.writeText(url);
          showToast("주소를 복사했습니다. Safari에 붙여넣어 열어 주세요.");
        } catch (_) {
          showToast(url);
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
    onDismiss?.();
  });
  actions.appendChild(dismissBtn);

  card.appendChild(actions);
  return card;
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
  root.innerHTML = "";
  root.appendChild(
    buildInstallCard({
      dismissLabel: deferredPrompt ? "나중에" : "닫기",
      onDismiss: () => {
        markDismissed();
        hideAllInstallRoots();
      },
    }),
  );
}

function getActiveInstallRoot() {
  if (!shouldOfferInstallBanner()) return null;
  if (isPageVisible("signin") || isPageVisible("login")) {
    return ensureBodyInstallRoot();
  }
  return null;
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
    showToast("PC Chrome ⋮ 메뉴에서 「Time is Price 설치」를 선택해 주세요.");
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
  wrap.querySelector(".lp-pwa-install-modal__backdrop")?.addEventListener("click", closeLpPwaInstallHelpModal);
  document.body.appendChild(wrap);
  helpModalEl = wrap;
  document.body.classList.add("lp-pwa-install-modal-open");
}

export function refreshLpPwaInstall() {
  renderInstallBanner(getActiveInstallRoot());
}

export function initLpPwaInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    refreshLpPwaInstall();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    hideAllInstallRoots();
    closeLpPwaInstallHelpModal();
  });

  window.addEventListener("resize", () => {
    refreshLpPwaInstall();
  });

  refreshLpPwaInstall();
}
