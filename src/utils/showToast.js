/**
 * 앱 톤앤매너(흰색/회색/블랙)에 맞는 알림 모달
 * @param {string} message - 메인 메시지
 * @param {string | { autoOnly?: boolean, durationMs?: number }} [subMessageOrOpts] - 서브 메시지, 또는 옵션
 * @param {{ autoOnly?: boolean, durationMs?: number }} [opts]
 */
const TOAST_AUTO_DISMISS_MS = 5200;
const TOAST_AUTO_DISMISS_WITH_SUB_MS = 6800;
const TOAST_AUTO_ONLY_MS = 1600;

/** 열려 있는 토스트만 제거(다른 UI는 건드리지 않음) */
export function dismissAppToast() {
  try {
    document.querySelector(".app-toast-modal")?.remove();
  } catch (_) {}
}

export function showToast(message, subMessageOrOpts, opts) {
  dismissAppToast();

  let subMessage = subMessageOrOpts;
  let options = opts && typeof opts === "object" ? opts : {};
  if (
    subMessageOrOpts &&
    typeof subMessageOrOpts === "object" &&
    !Array.isArray(subMessageOrOpts)
  ) {
    subMessage = undefined;
    options = subMessageOrOpts;
  }

  const autoOnly = !!options.autoOnly;
  const mainHtml = formatToastMainHtml(message);
  const subHtml = subMessage
    ? `<p class="app-toast-sub">${escapeHtml(subMessage)}</p>`
    : "";
  const overlay = document.createElement("div");
  overlay.className = autoOnly
    ? "app-toast-modal app-toast-modal--auto"
    : "app-toast-modal";
  overlay.setAttribute("role", autoOnly ? "status" : "alertdialog");
  if (!autoOnly) overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-live", autoOnly ? "polite" : "assertive");
  overlay.innerHTML = `
    <div class="app-toast-backdrop"></div>
    <div class="app-toast-panel">
      <p class="app-toast-message">${mainHtml}</p>
      ${subHtml}
      ${
        autoOnly
          ? ""
          : `<button type="button" class="app-toast-btn">확인</button>`
      }
    </div>
  `;

  let autoTimer = null;
  const close = () => {
    document.removeEventListener("keydown", onDocKeyDown, true);
    if (autoTimer != null) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
    try {
      overlay.remove();
    } catch (_) {}
  };

  function onDocKeyDown(e) {
    if (!overlay.isConnected) {
      document.removeEventListener("keydown", onDocKeyDown, true);
      return;
    }
    if (overlay.contains(e.target)) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (e.key === "Escape") {
      close();
      return;
    }
    overlay.querySelector(".app-toast-btn")?.focus({ preventScroll: true });
  }

  overlay.querySelector(".app-toast-backdrop")?.addEventListener("click", close);
  overlay.querySelector(".app-toast-btn")?.addEventListener("click", close);

  document.body.appendChild(overlay);
  try {
    const ae = document.activeElement;
    if (ae instanceof HTMLElement && ae !== document.body) ae.blur();
  } catch (_) {}
  if (!autoOnly) {
    overlay.setAttribute("tabindex", "-1");
    requestAnimationFrame(() => {
      overlay.querySelector(".app-toast-btn")?.focus({ preventScroll: true });
    });
    document.addEventListener("keydown", onDocKeyDown, true);
  }

  const autoMs =
    typeof options.durationMs === "number" && options.durationMs > 0
      ? options.durationMs
      : autoOnly
        ? TOAST_AUTO_ONLY_MS
        : subMessage
          ? TOAST_AUTO_DISMISS_WITH_SUB_MS
          : TOAST_AUTO_DISMISS_MS;
  autoTimer = setTimeout(close, autoMs);
}

function formatToastMainHtml(message) {
  return String(message ?? "")
    .split(/\r?\n/)
    .map((line) => escapeHtml(line))
    .join("<br>");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
