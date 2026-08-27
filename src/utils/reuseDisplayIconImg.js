/**
 * 앱 아이콘 — 목록을 다시 그려도 같은 그림은 버리지 않고 옮김.
 * 아이콘 선택 그리드(전량)는 메모리 때문에 그대로 늦게 연다.
 */

import { applyEagerIconImg } from "./staticAppIconImg.js";

const APP_ICON_SRC_RE =
  /(?:^|\/)(?:toolbaricons\/|diary-tr-icons\/|emotion-categories\/|login-brand-logo|icon-512)/i;

const POOL_PER_SRC = 16;
const POOL_TOTAL_MAX = 160;

/** @type {Map<string, HTMLImageElement>} */
const keepalive = new Map();
/** @type {Map<string, HTMLImageElement[]>} */
const pool = new Map();
/** @type {Set<string>} */
const pendingKeep = new Set();

let installed = false;
let poolTotal = 0;

/** @param {string} src */
export function isAppDisplayIconSrc(src) {
  return APP_ICON_SRC_RE.test(String(src || ""));
}

/** @param {string} src */
function iconSrcKey(src) {
  return String(src || "").trim();
}

function keepaliveHost() {
  if (typeof document === "undefined") return null;
  let el = document.getElementById("lp-icon-keepalive");
  if (el) return el;
  if (!document.body) return null;
  el = document.createElement("div");
  el.id = "lp-icon-keepalive";
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
  el.style.cssText =
    "position:fixed;left:0;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;";
  document.body.appendChild(el);
  return el;
}

function flushPendingKeepAlive() {
  if (!pendingKeep.size || !keepaliveHost()) return;
  const keys = [...pendingKeep];
  pendingKeep.clear();
  keys.forEach((k) => keepAliveDisplayIconSrc(k));
}

/** @param {string} src */
export function keepAliveDisplayIconSrc(src) {
  const key = iconSrcKey(src);
  if (!key || !isAppDisplayIconSrc(key) || keepalive.has(key)) return;
  const host = keepaliveHost();
  if (!host) {
    pendingKeep.add(key);
    return;
  }
  const img = document.createElement("img");
  img.alt = "";
  img.dataset.lpIconKeep = "1";
  applyEagerIconImg(img);
  img.src = key;
  host.appendChild(img);
  keepalive.set(key, img);
}

/** @param {HTMLImageElement} img */
function isPickerGridIcon(img) {
  return !!(
    img.classList?.contains("time-add-task-icon-modal-item-icon") ||
    img.closest?.(".time-add-task-icon-modal-item")
  );
}

/** @param {string} key @param {HTMLImageElement} img */
function pushPool(key, img) {
  if (!key || !(img instanceof HTMLImageElement)) return;
  let arr = pool.get(key);
  if (!arr) {
    arr = [];
    pool.set(key, arr);
  }
  if (arr.length >= POOL_PER_SRC || poolTotal >= POOL_TOTAL_MAX) return;
  arr.push(img);
  poolTotal += 1;
}

/** @param {string} key */
function popPool(key) {
  const arr = pool.get(key);
  if (!arr?.length) return null;
  const img = arr.pop();
  poolTotal = Math.max(0, poolTotal - 1);
  return img instanceof HTMLImageElement ? img : null;
}

/**
 * @param {string} src
 * @param {{ className?: string, width?: number, height?: number, alt?: string, decoding?: string, draggable?: boolean }} [opts]
 */
export function takeDisplayIconImg(src, opts = {}) {
  const key = iconSrcKey(src);
  keepAliveDisplayIconSrc(key);
  let img = popPool(key);
  if (!img) {
    img = document.createElement("img");
    img.alt = "";
    if (key) img.src = key;
  }
  applyEagerIconImg(img);
  img.className = opts.className || "";
  img.alt = opts.alt != null ? String(opts.alt) : "";
  if (opts.width != null) img.width = opts.width;
  else img.removeAttribute("width");
  if (opts.height != null) img.height = opts.height;
  else img.removeAttribute("height");
  if (opts.decoding) img.decoding = opts.decoding;
  if (opts.draggable === false) img.draggable = false;
  if (key && img.getAttribute("src") !== key) img.src = key;
  return img;
}

/** @param {Element|Node|null|undefined} root */
export function salvageDisplayIconImgs(root) {
  if (!root) return;
  /** @type {HTMLImageElement[]} */
  const imgs = [];
  if (root instanceof HTMLImageElement) imgs.push(root);
  else if (root.querySelectorAll) {
    root.querySelectorAll("img").forEach((el) => {
      if (el instanceof HTMLImageElement) imgs.push(el);
    });
  }
  imgs.forEach((img) => {
    if (img.dataset.lpIconKeep === "1") return;
    if (isPickerGridIcon(img)) return;
    const key = iconSrcKey(img.currentSrc || img.getAttribute("src") || "");
    if (!key || !isAppDisplayIconSrc(key) || !img.complete) return;
    keepAliveDisplayIconSrc(key);
    const clone = img.cloneNode(true);
    if (!(clone instanceof HTMLImageElement)) return;
    clone.removeAttribute("id");
    applyEagerIconImg(clone);
    pushPool(key, clone);
  });
}

/** @param {HTMLImageElement} img */
function adoptAddedDisplayIcon(img) {
  if (img.dataset.lpIconKeep === "1") return;
  const key = iconSrcKey(img.getAttribute("src") || "");
  if (!key || !isAppDisplayIconSrc(key)) return;
  keepAliveDisplayIconSrc(key);
  if (!isPickerGridIcon(img)) applyEagerIconImg(img);
}

function walkAdded(node) {
  if (node instanceof HTMLImageElement) adoptAddedDisplayIcon(node);
  else if (node?.querySelectorAll) {
    node.querySelectorAll("img").forEach((el) => {
      if (el instanceof HTMLImageElement) adoptAddedDisplayIcon(el);
    });
  }
}

function walkRemoved(node) {
  salvageDisplayIconImgs(node);
}

async function rewarmDisplayIconsOnResume() {
  flushPendingKeepAlive();
  try {
    const { warmDefaultAndInUsePickerIcons } = await import(
      "./pickerIconCacheWarm.js"
    );
    warmDefaultAndInUsePickerIcons();
  } catch (_) {}
  /** @type {HTMLImageElement[]} */
  const imgs = [...keepalive.values()];
  if (typeof document !== "undefined") {
    document.querySelectorAll("img").forEach((el) => {
      if (el instanceof HTMLImageElement) imgs.push(el);
    });
  }
  const seen = new Set();
  const jobs = [];
  for (const img of imgs) {
    const key = iconSrcKey(img.currentSrc || img.src || "");
    if (!key || !isAppDisplayIconSrc(key) || seen.has(key)) continue;
    seen.add(key);
    keepAliveDisplayIconSrc(key);
    if (typeof img.decode === "function") jobs.push(img.decode().catch(() => {}));
  }
  if (jobs.length) await Promise.all(jobs);
}

/** 앱 부팅 시 한 번 — 모든 화면 아이콘에 적용 */
export function installDisplayIconReuse() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  flushPendingKeepAlive();
  const obs = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") {
        m.removedNodes.forEach(walkRemoved);
      }
    }
    for (const m of mutations) {
      if (m.type === "childList") {
        m.addedNodes.forEach(walkAdded);
      } else if (m.type === "attributes" && m.target instanceof HTMLImageElement) {
        adoptAddedDisplayIcon(m.target);
      }
    }
  });
  obs.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src"],
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void rewarmDisplayIconsOnResume();
  });
  window.addEventListener("pageshow", (ev) => {
    if (ev?.persisted) void rewarmDisplayIconsOnResume();
  });
}
