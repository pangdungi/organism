/**
 * PWA 설치 — Android Chrome beforeinstallprompt + iOS Safari 안내.
 */

import { showToast } from "./showToast.js";

const DISMISS_KEY = "lp_pwa_install_dismissed";
const INSTALL_WAIT_MS = 120000;

/** @type {BeforeInstallPromptEvent | null} */
let deferredPrompt = null;

/** @type {"idle" | "prompting" | "downloading" | "done"} */
let installPhase = "idle";
let installWaitTimer = null;
/** 설치 중 사용자가 배너만 닫은 경우 재표시 방지 */
let installUiCollapsed = false;

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
  if (installPhase === "downloading" || installPhase === "prompting" || installPhase === "done") {
    return !installUiCollapsed;
  }
  if (wasDismissedRecently()) return false;
  return true;
}

function isPageVisible(pageId) {
  const page = document.getElementById(`${pageId}-page`);
  if (!page) return false;
  const display = page.style.display;
  return display === "flex" || display === "block";
}

function clearInstallWaitTimer() {
  if (installWaitTimer != null) {
    clearTimeout(installWaitTimer);
    installWaitTimer = null;
  }
}

function resetInstallFlow() {
  clearInstallWaitTimer();
  installUiCollapsed = false;
  installPhase = "idle";
}

function setInstallPhase(phase) {
  installPhase = phase;
  if (phase === "idle" || phase === "done") {
    clearInstallWaitTimer();
  }
  if (phase === "downloading" || phase === "prompting") {
    installUiCollapsed = false;
  }
  repaintInstallSurfaces();
}

function startInstallWaitTimer() {
  clearInstallWaitTimer();
  installWaitTimer = setTimeout(() => {
    if (installPhase !== "downloading") return;
    showToast(
      "설치가 오래 걸리고 있어요",
      "홈 화면에 Time is Price 아이콘이 생겼는지 확인해 주세요. 네트워크가 느리면 1~2분 걸릴 수 있어요.",
    );
    resetInstallFlow();
    refreshLpPwaInstall();
  }, INSTALL_WAIT_MS);
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
  if (installPhase === "prompting") {
    return {
      title: "설치 확인 중",
      desc: "브라우저 설치 창이 뜨면 「설치」를 눌러 주세요.",
      busy: true,
      statusText: "설치 창을 여는 중…",
    };
  }
  if (installPhase === "downloading") {
    return {
      title: "앱 설치 중",
      desc: "다운로드가 끝날 때까지 잠시만 기다려 주세요. 화면을 닫아도 설치는 계속됩니다.",
      busy: true,
      statusText: "설치 파일 받는 중…",
    };
  }
  if (installPhase === "done") {
    return {
      title: "설치 완료",
      desc: "홈 화면의 Time is Price 아이콘을 눌러 앱처럼 열 수 있어요.",
      statusText: "설치가 완료되었습니다",
    };
  }

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
      desc: deferredPrompt
        ? "Time is Price를 홈 화면에 설치하면 앱처럼 전체 화면으로 열 수 있어요."
        : "앱 설치 준비 중이에요. 잠시 후 「앱 설치」가 뜨거나, ⋮ → 「앱 설치」·「홈 화면에 추가」를 눌러 주세요.",
      showInstallBtn: !!deferredPrompt,
    };
  }
  return {
    title: "앱처럼 쓰기",
    desc: "브라우저 메뉴에서 이 사이트를 홈 화면에 추가할 수 있어요.",
  };
}

async function runNativeInstall() {
  if (!deferredPrompt || installPhase === "prompting" || installPhase === "downloading") {
    return;
  }

  setInstallPhase("prompting");
  showToast("설치 창을 확인해 주세요", "브라우저 팝업에서 「설치」를 눌러 주세요.");

  const promptEvent = deferredPrompt;
  deferredPrompt = null;

  try {
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;

    if (outcome === "accepted") {
      installPhase = "downloading";
      startInstallWaitTimer();
      showToast(
        "앱 설치 중입니다",
        "완료까지 잠시만 기다려 주세요. 여러 번 누르지 않아도 됩니다.",
      );
      repaintInstallSurfaces();
      return;
    }

    resetInstallFlow();
    showToast("설치가 취소되었습니다", "다시 설치하려면 「앱 설치」를 눌러 주세요.");
  } catch (_) {
    resetInstallFlow();
    showToast("설치를 시작하지 못했습니다", "잠시 후 다시 시도해 주세요.");
  } finally {
    refreshLpPwaInstall();
  }
}

function buildInstallCard(opts = {}) {
  const { onDismiss, dismissLabel = "닫기" } = opts;
  const info = getInstallInstructions();
  const canNativePrompt = !!deferredPrompt;
  const busy = !!info.busy;
  const allowDismissWhileBusy = installPhase === "downloading" || installPhase === "done";

  const card = document.createElement("div");
  card.className = "lp-pwa-install-card";
  if (busy) {
    card.classList.add("lp-pwa-install-card--busy");
    card.setAttribute("aria-busy", "true");
  }

  const title = document.createElement("p");
  title.className = "lp-pwa-install-title";
  title.id = "lp-pwa-install-modal-title";
  title.textContent = info.title;

  const desc = document.createElement("p");
  desc.className = "lp-pwa-install-desc";
  desc.textContent = info.desc;

  card.appendChild(title);
  card.appendChild(desc);

  if (info.statusText) {
    const status = document.createElement("div");
    status.className = "lp-pwa-install-status";
    status.setAttribute("role", "status");
    const text = document.createElement("span");
    text.textContent = info.statusText;
    const spinner = document.createElement("span");
    spinner.className = "lp-pwa-install-spinner";
    spinner.setAttribute("aria-hidden", "true");
    status.appendChild(spinner);
    status.appendChild(text);
    card.appendChild(status);
  }

  const actions = document.createElement("div");
  actions.className = "lp-pwa-install-actions";

  if (info.showInstallBtn && canNativePrompt && installPhase === "idle") {
    const installBtn = document.createElement("button");
    installBtn.type = "button";
    installBtn.className = "lp-pwa-install-btn lp-pwa-install-btn--primary";
    installBtn.textContent = "앱 설치";
    installBtn.addEventListener("click", () => {
      void runNativeInstall();
    });
    actions.appendChild(installBtn);
  }

  if (info.showCopyUrl && installPhase === "idle") {
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

  if (!busy || allowDismissWhileBusy) {
    const dismissBtn = document.createElement("button");
    dismissBtn.type = "button";
    dismissBtn.className = "lp-pwa-install-btn lp-pwa-install-btn--ghost";
    dismissBtn.textContent =
      installPhase === "downloading"
        ? "닫기 (설치는 계속)"
        : installPhase === "done"
          ? "확인"
          : dismissLabel;
    dismissBtn.addEventListener("click", () => {
      if (installPhase === "downloading") {
        installUiCollapsed = true;
        hideAllInstallRoots();
        closeLpPwaInstallHelpModal();
        showToast("백그라운드에서 설치 중", "완료되면 홈 화면 아이콘을 확인해 주세요.");
        return;
      }
      if (installPhase === "done") {
        resetInstallFlow();
        hideAllInstallRoots();
        closeLpPwaInstallHelpModal();
        return;
      }
      markDismissed();
      onDismiss?.();
    });
    actions.appendChild(dismissBtn);
  }

  if (actions.childElementCount) card.appendChild(actions);
  return card;
}

function mountInstallCard(root, cardOpts) {
  root.innerHTML = "";
  root.appendChild(buildInstallCard(cardOpts));
}

function repaintInstallSurfaces() {
  if (installPhase === "downloading" || installPhase === "prompting" || installPhase === "done") {
    if (installUiCollapsed && installPhase === "downloading") return;

    const root = ensureBodyInstallRoot();
    root.hidden = false;
    mountInstallCard(root, {
      dismissLabel: deferredPrompt ? "나중에" : "닫기",
      onDismiss: () => {
        markDismissed();
        hideAllInstallRoots();
      },
    });

    const panel = helpModalEl?.querySelector(".lp-pwa-install-modal__panel");
    if (panel) {
      panel.innerHTML = "";
      panel.appendChild(
        buildInstallCard({
          dismissLabel: "닫기",
          onDismiss: closeLpPwaInstallHelpModal,
        }),
      );
    }
    return;
  }

  renderInstallBanner(getActiveInstallRoot());
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
    dismissLabel: deferredPrompt ? "나중에" : "닫기",
    onDismiss: () => {
      markDismissed();
      hideAllInstallRoots();
    },
  });
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
  wrap.querySelector(".lp-pwa-install-modal__backdrop")?.addEventListener("click", () => {
    if (installPhase === "downloading") {
      installUiCollapsed = true;
      hideAllInstallRoots();
      closeLpPwaInstallHelpModal();
      showToast("백그라운드에서 설치 중", "완료되면 홈 화면 아이콘을 확인해 주세요.");
      return;
    }
    closeLpPwaInstallHelpModal();
  });
  document.body.appendChild(wrap);
  helpModalEl = wrap;
  document.body.classList.add("lp-pwa-install-modal-open");
}

export function refreshLpPwaInstall() {
  if (installPhase === "prompting" || installPhase === "downloading" || installPhase === "done") {
    repaintInstallSurfaces();
    return;
  }
  renderInstallBanner(getActiveInstallRoot());
}

export function initLpPwaInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installPhase === "idle") refreshLpPwaInstall();
  });

  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.ready.then(() => {
      if (installPhase === "idle") refreshLpPwaInstall();
    });
  }

  window.addEventListener("appinstalled", () => {
    clearInstallWaitTimer();
    deferredPrompt = null;
    installPhase = "done";
    installUiCollapsed = false;
    showToast("설치가 완료되었습니다", "홈 화면에서 Time is Price 아이콘을 눌러 열어 주세요.");
    repaintInstallSurfaces();
    setTimeout(() => {
      if (installPhase === "done") {
        resetInstallFlow();
        hideAllInstallRoots();
        closeLpPwaInstallHelpModal();
      }
    }, 5000);
  });

  window.addEventListener("resize", () => {
    refreshLpPwaInstall();
  });

  refreshLpPwaInstall();
}
