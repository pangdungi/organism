/**
 * 앱 톤앤매너(흰색/회색/블랙)에 맞는 알림 모달
 * @param {string} message - 메인 메시지
 * @param {string} [subMessage] - 서브 메시지 (작게 회색으로 표시)
 */
const TOAST_AUTO_DISMISS_MS = 5200;
const TOAST_AUTO_DISMISS_WITH_SUB_MS = 6800;

/** 열려 있는 토스트만 제거(다른 UI는 건드리지 않음) */
export function dismissAppToast() {
  try {
    document.querySelector(".app-toast-modal")?.remove();
  } catch (_) {}
}

export function showToast(message, subMessage) {
  dismissAppToast();

  const mainHtml = formatToastMainHtml(message);
  const subHtml = subMessage ? `<p class="app-toast-sub">${escapeHtml(subMessage)}</p>` : "";
  const overlay = document.createElement("div");
  overlay.className = "app-toast-modal";
  overlay.setAttribute("role", "alertdialog");
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-live", "assertive");
  overlay.innerHTML = `
    <div class="app-toast-backdrop"></div>
    <div class="app-toast-panel">
      <p class="app-toast-message">${mainHtml}</p>
      ${subHtml}
      <button type="button" class="app-toast-btn">확인</button>
    </div>
  `;

  let autoTimer = null;
  const close = () => {
    if (autoTimer != null) {
      clearTimeout(autoTimer);
      autoTimer = null;
    }
    try {
      overlay.remove();
    } catch (_) {}
  };

  overlay.querySelector(".app-toast-backdrop").addEventListener("click", close);
  overlay.querySelector(".app-toast-btn").addEventListener("click", close);

  document.body.appendChild(overlay);

  const autoMs = subMessage ? TOAST_AUTO_DISMISS_WITH_SUB_MS : TOAST_AUTO_DISMISS_MS;
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
