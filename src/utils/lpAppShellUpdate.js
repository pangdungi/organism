/**
 * 깃 푸시로 새 워커가 오면 표시만 해 두고,
 * 보던 화면을 떠나 다른 탭으로 갈 때 한 번 새로고침한다.
 */

let pending = false;

function hasOpenBlockingModal() {
  const nodes = document.querySelectorAll(
    ".time-task-setup-modal, .time-task-log-modal, .lp-calendar-budget-add-modal, .lp-desktop-idea-modal",
  );
  for (const m of nodes) {
    if (!(m instanceof HTMLElement)) continue;
    if (m.hidden || m.hasAttribute("hidden")) continue;
    if (m.getAttribute("aria-hidden") === "true") continue;
    return true;
  }
  return false;
}

export function markAppShellUpdatePending() {
  pending = true;
}

export function consumeAppShellUpdateOnTabLeave() {
  if (!pending) return false;
  if (hasOpenBlockingModal()) return false;
  pending = false;
  location.reload();
  return true;
}

export function bindAppShellUpdateListeners() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("message", (ev) => {
    if (ev?.data?.type === "LP_SW_UPDATED") markAppShellUpdatePending();
  });
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    markAppShellUpdatePending();
  });
}
