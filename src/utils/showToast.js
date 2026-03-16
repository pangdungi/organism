/**
 * 앱 톤앤매너(흰색/회색/블랙)에 맞는 알림 모달
 * @param {string} message - 메인 메시지
 * @param {string} [subMessage] - 서브 메시지 (작게 회색으로 표시)
 */
export function showToast(message, subMessage) {
  let overlay = document.querySelector(".app-toast-modal");
  if (overlay) overlay.remove();

  const subHtml = subMessage ? `<p class="app-toast-sub">${escapeHtml(subMessage)}</p>` : "";
  overlay = document.createElement("div");
  overlay.className = "app-toast-modal";
  overlay.innerHTML = `
    <div class="app-toast-backdrop"></div>
    <div class="app-toast-panel">
      <p class="app-toast-message">${escapeHtml(message)}</p>
      ${subHtml}
      <button type="button" class="app-toast-btn">확인</button>
    </div>
  `;

  const close = () => overlay.remove();

  overlay.querySelector(".app-toast-backdrop").addEventListener("click", close);
  overlay.querySelector(".app-toast-btn").addEventListener("click", close);

  document.body.appendChild(overlay);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
