import { render as renderIdea } from "../views/Idea.js";
import {
  resolveLpModalStackZIndex,
  syncBodyOverflowAfterModalClose,
} from "./lpModalStack.js";

/** @type {HTMLElement | null} */
let openWrap = null;

function onEsc(e) {
  if (e.key !== "Escape") return;
  closeDesktopIdeaAccountModal();
}

export function closeDesktopIdeaAccountModal() {
  const wrap =
    openWrap ||
    (typeof document !== "undefined"
      ? document.querySelector(".lp-desktop-idea-modal")
      : null);
  if (!wrap) {
    try {
      document.documentElement.classList.remove("lp-desktop-idea-modal-open");
    } catch (_) {}
    try {
      syncBodyOverflowAfterModalClose();
    } catch (_) {}
    return;
  }
  const idea = wrap.querySelector(".idea-view");
  try {
    idea?._lpTabAbortController?.abort();
  } catch (_) {}
  try {
    document.removeEventListener("keydown", onEsc, true);
  } catch (_) {}
  wrap.remove();
  openWrap = null;
  try {
    document.documentElement.classList.remove("lp-desktop-idea-modal-open");
  } catch (_) {}
  syncBodyOverflowAfterModalClose();
}

/**
 * 데스크탑 3분할 — 나의 계정을 페이지 이동 없이 모달로 연다.
 * @param {{ pullAccount?: () => Promise<unknown> }} [opts]
 */
export function openDesktopIdeaAccountModal(opts = {}) {
  if (openWrap) return;
  const wrap = document.createElement("div");
  wrap.className = "lp-desktop-idea-modal";
  wrap.style.zIndex = String(resolveLpModalStackZIndex(12000));

  const backdrop = document.createElement("div");
  backdrop.className = "lp-desktop-idea-modal__backdrop";
  backdrop.setAttribute("aria-hidden", "true");

  const panel = document.createElement("div");
  panel.className = "lp-desktop-idea-modal__panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-labelledby", "lp-desktop-idea-modal-title");

  const body = document.createElement("div");
  body.className = "lp-desktop-idea-modal__body";
  const idea = renderIdea();
  idea.classList.add("idea-view--desktop-modal");
  const title = idea.querySelector(".idea-view-title");
  if (title) title.id = "lp-desktop-idea-modal-title";
  body.appendChild(idea);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "time-task-setup-close lp-desktop-idea-modal__close";
  closeBtn.title = "닫기";
  closeBtn.setAttribute("aria-label", "닫기");
  closeBtn.textContent = "×";

  panel.append(closeBtn, body);
  wrap.append(backdrop, panel);

  const close = () => closeDesktopIdeaAccountModal();
  backdrop.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  document.addEventListener("keydown", onEsc, true);

  document.body.appendChild(wrap);
  openWrap = wrap;
  try {
    document.documentElement.classList.add("lp-desktop-idea-modal-open");
  } catch (_) {}

  void Promise.resolve(opts.pullAccount?.())
    .then(() => {
      try {
        window.__lpIdeaSoftRefresh?.();
      } catch (_) {}
    })
    .catch(() => {});
}
