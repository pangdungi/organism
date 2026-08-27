/**
 * 과제 아이콘(SVG) — 한꺼번에 <img src> 넣지 않음(iOS·Android WebView 멈춤·종료 방지)
 */
import { applyEagerIconImg, applyLazyPickerIconImg } from "./staticAppIconImg.js";
import { attachIconPngFallback } from "./toolbarIconUrl.js";
import { isIosLikeMobile } from "./mobileViewportKeyboard.js";
import { matchTimeTaskPickerIconSearch } from "./timeTaskIconUrls.js";

const PICKER_SEARCH_MAX = 36;
const LAZY_ICON_ROOT_MARGIN = "120px 0px";
const SETUP_LIST_ICON_BATCH = 8;

/** @param {Element|null} root */
function findIconScrollRoot(root) {
  return (
    root?.closest?.("[data-legacy~='time-task-setup-list-scroll']") ||
    root?.closest?.(".time-task-setup-list-scroll") ||
    root?.closest?.("[data-legacy~='time-task-setup-body']") ||
    root?.closest?.(".time-task-setup-body") ||
    null
  );
}

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

/** PNG 없을 때 같은 이름 SVG 로 폴백 @param {string} [pngSrc] */
export function attachPickerIconSrcFallback(img, pngSrc) {
  const cur = String(pngSrc || img.dataset.lpIconSrc || img.src || "").trim();
  if (cur) attachIconPngFallback(img, cur);
}

/** 과제설정 목록 — eager + PNG→SVG 폴백 */
export function createSetupListIconImg(src) {
  const img = document.createElement("img");
  img.alt = "";
  applyEagerIconImg(img);
  if (src) {
    attachIconPngFallback(img, src);
    img.src = src;
  }
  return img;
}

/** @param {HTMLImageElement} img */
export function hydrateDeferredIconImg(img) {
  const src = String(img.dataset.lpIconSrc || "").trim();
  if (!src || img.src) return;
  img.src = src;
  delete img.dataset.lpIconSrc;
}

/**
 * @param {Element[]} items
 * @param {Element|null} scrollRoot
 */
function hydrateVisibleListIcons(items, scrollRoot) {
  const margin = 120;
  const rect = scrollRoot
    ? scrollRoot.getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight };
  for (const item of items) {
    const r = item.getBoundingClientRect();
    if (r.bottom < rect.top - margin || r.top > rect.bottom + margin) continue;
    const img = item.querySelector("img[data-lp-icon-src]");
    if (img instanceof HTMLImageElement) hydrateDeferredIconImg(img);
  }
}

/**
 * @param {Element[]} items
 * @returns {() => void}
 */
function scheduleBatchedIconHydration(items) {
  let idx = 0;
  let rafId = 0;
  const step = () => {
    let n = 0;
    while (idx < items.length && n < SETUP_LIST_ICON_BATCH) {
      const item = items[idx++];
      const img = item.querySelector("img[data-lp-icon-src]");
      if (img instanceof HTMLImageElement) {
        hydrateDeferredIconImg(img);
        n += 1;
      }
    }
    if (idx < items.length) rafId = requestAnimationFrame(step);
  };
  rafId = requestAnimationFrame(step);
  return () => {
    if (rafId) cancelAnimationFrame(rafId);
  };
}

/**
 * 과제설정 목록 — 보이는 행 즉시 로드 + 나머지 배치
 * @param {HTMLElement|null} root
 * @param {string} itemSelector
 * @returns {() => void}
 */
export function attachSetupListIconHydration(root, itemSelector) {
  if (!root?.isConnected) return () => {};
  const items = [...root.querySelectorAll(itemSelector)];
  if (!items.length) return () => {};

  const scrollRoot = findIconScrollRoot(root);
  hydrateVisibleListIcons(items, scrollRoot);
  const cancelBatch = scheduleBatchedIconHydration(items);

  if (typeof IntersectionObserver === "undefined") {
    return cancelBatch;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target.querySelector?.("img[data-lp-icon-src]");
        if (img instanceof HTMLImageElement) hydrateDeferredIconImg(img);
        observer.unobserve(entry.target);
      }
    },
    { root: scrollRoot, rootMargin: LAZY_ICON_ROOT_MARGIN },
  );

  for (const item of items) {
    const img = item.querySelector("img[data-lp-icon-src]");
    if (img instanceof HTMLImageElement) observer.observe(item);
  }

  return () => {
    cancelBatch();
    observer.disconnect();
  };
}

/** @param {HTMLElement|null} root @param {string} itemSelector */
export function attachLazyIconHydration(root, itemSelector) {
  if (!root?.isConnected) return () => {};
  const items = root.querySelectorAll(itemSelector);
  if (!items.length) return () => {};

  const scrollRoot = findIconScrollRoot(root);

  if (typeof IntersectionObserver === "undefined") {
    items.forEach((item) => {
      const img = item.querySelector("img[data-lp-icon-src]");
      if (img instanceof HTMLImageElement) hydrateDeferredIconImg(img);
    });
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const img = entry.target.querySelector?.("img[data-lp-icon-src]");
        if (img instanceof HTMLImageElement) hydrateDeferredIconImg(img);
        observer.unobserve(entry.target);
      }
    },
    { root: scrollRoot, rootMargin: LAZY_ICON_ROOT_MARGIN },
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
