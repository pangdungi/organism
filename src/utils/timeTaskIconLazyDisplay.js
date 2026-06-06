/**
 * 과제 아이콘(SVG) — 한꺼번에 <img src> 넣지 않음(iOS·Android WebView 멈춤·종료 방지)
 */
import { applyLazyPickerIconImg } from "./staticAppIconImg.js";
import { isIosLikeMobile } from "./mobileViewportKeyboard.js";
import { matchTimeTaskPickerIconSearch } from "./timeTaskIconUrls.js";

const PICKER_SEARCH_MAX = 36;
const LAZY_ICON_ROOT_MARGIN = "80px 0px";

/** @returns {boolean} */
export function isMobileIconBudgetDevice() {
  if (isIosLikeMobile()) return true;
  if (typeof window !== "undefined" && window.matchMedia) {
    try {
      if (window.matchMedia("(pointer: coarse)").matches) return true;
    } catch (_) {}
  }
  return false;
}

/**
 * @param {string} src
 * @returns {HTMLImageElement}
 */
export function createDeferredIconImg(src) {
  const img = document.createElement("img");
  img.alt = "";
  applyLazyPickerIconImg(img);
  if (src) img.dataset.lpIconSrc = src;
  return img;
}

/** @param {HTMLImageElement} img */
function hydrateIconImg(img) {
  const src = String(img.dataset.lpIconSrc || "").trim();
  if (!src || img.src) return;
  img.src = src;
  delete img.dataset.lpIconSrc;
}

/**
 * @param {HTMLElement|null} root
 * @param {string} itemSelector
 * @returns {() => void} disconnect
 */
export function attachLazyIconHydration(root, itemSelector) {
  if (!root?.isConnected) return () => {};
  const items = root.querySelectorAll(itemSelector);
  if (!items.length) return () => {};

  if (typeof IntersectionObserver === "undefined") {
    items.forEach((item) => {
      const img = item.querySelector("img[data-lp-icon-src]");
      if (img instanceof HTMLImageElement) hydrateIconImg(img);
    });
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target.querySelector?.("img[data-lp-icon-src]");
        if (img instanceof HTMLImageElement) hydrateIconImg(img);
        observer.unobserve(entry.target);
      }
    },
    { root: root.closest(".time-task-setup-body") || null, rootMargin: LAZY_ICON_ROOT_MARGIN },
  );

  items.forEach((item) => observer.observe(item));
  return () => observer.disconnect();
}

/**
 * @param {{ key: string, label: string, src: string, searchText: string }[]} icons
 * @param {string} query
 * @returns {{ key: string, label: string, src: string, searchText: string }[]}
 */
export function filterPickerIconsForDisplay(icons, query) {
  const list = Array.isArray(icons) ? icons : [];
  const q = String(query || "").trim();
  if (!q) return [];
  const out = [];
  for (const icon of list) {
    if (!matchTimeTaskPickerIconSearch(icon.searchText, q)) continue;
    out.push(icon);
    if (out.length >= PICKER_SEARCH_MAX) break;
  }
  return out;
}

export function getPickerSearchMaxResults() {
  return PICKER_SEARCH_MAX;
}
