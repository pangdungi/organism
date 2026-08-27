/**
 * 시간가계부「과제 기록」— 모바일 과제 선택 (하단 다이얼 시트 + 검색 모달).
 */

import {
  lpSetClasses,
  lpTokenAdd,
  lpTokenRemove,
  lpTokenToggle,
} from "./timeLedgerClassPolicy.js";
import { getTimeTaskListIconSrc } from "./timeTaskIconUrls.js";
import { decodeDisplayIconSrcs } from "./decodeDisplayIcons.js";
import { matchFlexibleSearch } from "./flexibleSearchMatch.js";

function scrollItemToCenter(listEl, itemEl) {
  if (!(listEl instanceof HTMLElement) || !(itemEl instanceof HTMLElement)) return;
  const targetY =
    itemEl.offsetTop + itemEl.offsetHeight / 2 - listEl.clientHeight / 2;
  listEl.scrollTop = Math.max(
    0,
    Math.min(targetY, listEl.scrollHeight - listEl.clientHeight),
  );
}

function scrollItemToTop(listEl, itemEl, pad = 2) {
  if (!(listEl instanceof HTMLElement) || !(itemEl instanceof HTMLElement)) return;
  const targetY = itemEl.offsetTop - pad;
  listEl.scrollTop = Math.max(
    0,
    Math.min(targetY, listEl.scrollHeight - listEl.clientHeight),
  );
}

const WHEEL_ITEM_SELECTOR =
  ".lp-task-log-mobile-picker-item, [data-legacy~='lp-task-log-mobile-picker-item']";

function queryWheelItemByBucket(listEl, bucketId) {
  if (!(listEl instanceof HTMLElement) || !bucketId) return null;
  const esc = CSS.escape(bucketId);
  return (
    listEl.querySelector(
      `[data-legacy~="lp-task-log-mobile-picker-item"][data-bucket="${esc}"]`,
    ) ||
    listEl.querySelector(`.lp-task-log-mobile-picker-item[data-bucket="${esc}"]`)
  );
}

function nearestWheelItem(listEl) {
  if (!(listEl instanceof HTMLElement)) return null;
  const items = listEl.querySelectorAll(WHEEL_ITEM_SELECTOR);
  if (!items.length) return null;
  const centerY = listEl.scrollTop + listEl.clientHeight / 2;
  let best = items[0];
  let bestDist = Infinity;
  items.forEach((el) => {
    const mid = el.offsetTop + el.offsetHeight / 2;
    const dist = Math.abs(mid - centerY);
    if (dist < bestDist) {
      bestDist = dist;
      best = el;
    }
  });
  return best;
}

export function createMobileTaskLogPicker(options = {}) {
  const {
    getTasks,
    getVisibleBucketChips,
    getTaskBucket,
    getCurrentValue,
    onConfirm = () => {},
    onShellClose = () => {},
    abortSignal,
  } = options;

  let pendingValue = "";
  let searchPendingValue = "";
  let searchQuery = "";
  /** @type {HTMLElement | null} */
  let lastSelectedWheelRow = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let wheelScrollTimer = null;
  let bucketScrollLockUntil = 0;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let bucketScrollSnapTimer = null;
  let wheelTasksCacheKey = "";
  /** @type {ReturnType<typeof setTimeout> | null} */
  let searchRenderTimer = null;
  let wheelPaintGen = 0;
  let searchPaintGen = 0;
  let mounted = false;

  const pickerRoot = document.createElement("div");
  lpSetClasses(pickerRoot, "lp-task-log-mobile-picker");
  pickerRoot.hidden = true;

  const backdrop = document.createElement("button");
  backdrop.type = "button";
  lpSetClasses(backdrop, "lp-task-log-mobile-picker-backdrop");
  backdrop.setAttribute("aria-label", "닫기");

  const sheet = document.createElement("div");
  lpSetClasses(sheet, "lp-task-log-mobile-picker-sheet");

  const toolbar = document.createElement("div");
  lpSetClasses(toolbar, "lp-task-log-mobile-picker-toolbar");

  const searchOpenBtn = document.createElement("button");
  searchOpenBtn.type = "button";
  lpSetClasses(searchOpenBtn, "lp-task-log-mobile-picker-toolbar-btn");
  searchOpenBtn.textContent = "검색";

  const toolbarTitle = document.createElement("span");
  lpSetClasses(toolbarTitle, "lp-task-log-mobile-picker-toolbar-title");
  toolbarTitle.textContent = "과제";

  const confirmBtn = document.createElement("button");
  confirmBtn.type = "button";
  lpSetClasses(confirmBtn, "lp-task-log-mobile-picker-toolbar-btn");
  confirmBtn.textContent = "확인";

  toolbar.append(searchOpenBtn, toolbarTitle, confirmBtn);

  const bucketChipRow = document.createElement("div");
  lpSetClasses(bucketChipRow, "lp-task-log-mobile-picker-buckets");
  bucketChipRow.setAttribute("role", "tablist");
  bucketChipRow.setAttribute("aria-label", "과제 대분류");
  bucketChipRow.hidden = true;

  const wheelWrap = document.createElement("div");
  lpSetClasses(wheelWrap, "lp-task-log-mobile-picker-wheel");

  const highlight = document.createElement("div");
  lpSetClasses(highlight, "lp-task-log-mobile-picker-highlight");
  highlight.setAttribute("aria-hidden", "true");

  const wheelList = document.createElement("div");
  lpSetClasses(wheelList, "lp-task-log-mobile-picker-list");
  wheelList.setAttribute("role", "listbox");
  wheelList.setAttribute("aria-label", "과제 선택");

  wheelWrap.append(highlight, wheelList);
  sheet.append(toolbar, bucketChipRow, wheelWrap);
  pickerRoot.append(backdrop, sheet);

  const searchRoot = document.createElement("div");
  lpSetClasses(searchRoot, "lp-task-log-mobile-search");
  searchRoot.hidden = true;

  const searchPanel = document.createElement("div");
  lpSetClasses(searchPanel, "lp-task-log-mobile-search-panel");

  const searchHeader = document.createElement("div");
  lpSetClasses(searchHeader, "lp-task-log-mobile-search-header");

  const searchCancelBtn = document.createElement("button");
  searchCancelBtn.type = "button";
  lpSetClasses(searchCancelBtn, "lp-task-log-mobile-search-header-btn");
  searchCancelBtn.textContent = "취소";

  const searchTitle = document.createElement("span");
  lpSetClasses(searchTitle, "lp-task-log-mobile-search-title");
  searchTitle.textContent = "검색";

  const searchDoneBtn = document.createElement("button");
  searchDoneBtn.type = "button";
  lpSetClasses(searchDoneBtn, "lp-task-log-mobile-search-header-btn");
  searchDoneBtn.textContent = "완료";

  searchHeader.append(searchCancelBtn, searchTitle, searchDoneBtn);

  const searchInputWrap = document.createElement("div");
  lpSetClasses(searchInputWrap, "lp-task-log-mobile-search-input-wrap");

  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.placeholder = "과제 검색";
  searchInput.setAttribute("autocomplete", "off");
  searchInput.setAttribute("enterkeyhint", "search");
  lpSetClasses(searchInput, "lp-task-log-mobile-search-input");

  searchInputWrap.appendChild(searchInput);

  const searchList = document.createElement("div");
  lpSetClasses(searchList, "lp-task-log-mobile-search-list");
  searchList.setAttribute("role", "radiogroup");
  searchList.setAttribute("aria-label", "과제 검색 결과");

  searchPanel.append(searchHeader, searchInputWrap, searchList);
  searchRoot.appendChild(searchPanel);

  function ensureMounted() {
    if (mounted) return;
    document.body.appendChild(pickerRoot);
    document.body.appendChild(searchRoot);
    mounted = true;
  }

  function syncWheelSelectionClass() {
    if (
      lastSelectedWheelRow instanceof HTMLElement &&
      lastSelectedWheelRow.dataset.taskName !== pendingValue
    ) {
      lpTokenRemove(lastSelectedWheelRow, "is-selected");
      lastSelectedWheelRow = null;
    }
    if (
      lastSelectedWheelRow instanceof HTMLElement &&
      lastSelectedWheelRow.dataset.taskName === pendingValue
    ) {
      return;
    }
    const next = wheelList.querySelector(
      `[data-task-name="${CSS.escape(pendingValue)}"]`,
    );
    if (next instanceof HTMLElement) {
      lpTokenAdd(next, "is-selected");
      lastSelectedWheelRow = next;
    }
  }

  function selectWheelValue(name, scrollToRow) {
    pendingValue = name || "";
    syncWheelSelectionClass();
    if (scrollToRow instanceof HTMLElement) {
      runProgrammaticBucketScroll(() => {
        scrollItemToCenter(wheelList, scrollToRow);
      });
    }
  }

  function bucketLabelForId(bucketId, chips) {
    return chips.find((c) => c.id === bucketId)?.label || "";
  }

  function chipsWithTasks(tasks, chips) {
    if (!chips.length || typeof getTaskBucket !== "function") return [];
    const ids = new Set(tasks.map((t) => getTaskBucket(t)));
    return chips.filter((c) => ids.has(c.id));
  }

  function syncBucketChipActive(bucketId) {
    bucketChipRow.querySelectorAll(
      ".lp-task-log-mobile-picker-bucket, [data-legacy~='lp-task-log-mobile-picker-bucket']",
    ).forEach((btn) => {
      const on = btn.dataset.bucket === bucketId;
      lpTokenToggle(btn, "is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function runProgrammaticBucketScroll(fn) {
    if (bucketScrollSnapTimer) {
      clearTimeout(bucketScrollSnapTimer);
      bucketScrollSnapTimer = null;
    }
    lpTokenAdd(wheelList, "is-bucket-scrolling");
    bucketScrollLockUntil = Date.now() + 360;
    fn();
    bucketScrollSnapTimer = setTimeout(() => {
      bucketScrollSnapTimer = null;
      lpTokenRemove(wheelList, "is-bucket-scrolling");
    }, 360);
  }

  function scrollToBucket(bucketId) {
    if (!bucketId) return;
    syncBucketChipActive(bucketId);
    const header = wheelList.querySelector(
      `[data-bucket-anchor="${CSS.escape(bucketId)}"]`,
    );
    const firstItem = queryWheelItemByBucket(wheelList, bucketId);
    if (!(firstItem instanceof HTMLElement)) return;

    const scrollAnchor =
      header instanceof HTMLElement ? header : firstItem;
    runProgrammaticBucketScroll(() => {
      scrollItemToTop(wheelList, scrollAnchor, 2);
      pendingValue = firstItem.dataset.taskName || "";
      syncWheelSelectionClass();
    });
  }

  function renderBucketChips(tasks) {
    const chips = getVisibleBucketChips?.() || [];
    const visible = chipsWithTasks(tasks, chips);
    bucketChipRow.replaceChildren();
    if (!visible.length) {
      bucketChipRow.hidden = true;
      return;
    }
    bucketChipRow.hidden = false;
    visible.forEach(({ id, label }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      lpSetClasses(btn, "lp-task-log-mobile-picker-bucket");
      btn.dataset.bucket = id;
      btn.textContent = label;
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        scrollToBucket(id);
      });
      bucketChipRow.appendChild(btn);
    });
  }

  function buildBucketHeader(label, bucketId) {
    const row = document.createElement("div");
    lpSetClasses(row, "lp-task-log-mobile-picker-bucket-header");
    row.dataset.bucketAnchor = bucketId;
    row.setAttribute("aria-hidden", "true");
    row.textContent = label;
    return row;
  }

  function buildWheelItem(task) {
    const row = document.createElement("div");
    lpSetClasses(row, "lp-task-log-mobile-picker-item");
    row.dataset.taskName = task.name || "";
    if (typeof getTaskBucket === "function") {
      row.dataset.bucket = getTaskBucket(task) || "";
    }
    row.setAttribute("role", "option");

    const iconSrc = pickerTaskIconSrc(task);
    if (iconSrc) {
      const icon = document.createElement("img");
      lpSetClasses(icon, "lp-task-log-mobile-picker-item-icon");
      icon.src = iconSrc;
      icon.alt = "";
      icon.decoding = "async";
      row.appendChild(icon);
    }

    const label = document.createElement("span");
    lpSetClasses(label, "lp-task-log-mobile-picker-item-label");
    label.textContent = task.name || "";
    row.appendChild(label);

    if (task.name === pendingValue) lpTokenAdd(row, "is-selected");

    return row;
  }

  function wheelTasksCacheKeyFrom(tasks) {
    return tasks
      .map((t) => {
        const b =
          typeof getTaskBucket === "function" ? getTaskBucket(t) || "" : "";
        return `${t.name || ""}\x1f${t.id || ""}\x1f${b}`;
      })
      .join("\x1e");
  }

  function scrollWheelToPendingValue() {
    const name = (pendingValue || getCurrentValue?.() || "").trim();
    const row = name
      ? wheelList.querySelector(`[data-task-name="${CSS.escape(name)}"]`)
      : wheelList.querySelector(WHEEL_ITEM_SELECTOR);
    if (!(row instanceof HTMLElement)) return;
    runProgrammaticBucketScroll(() => {
      scrollItemToCenter(wheelList, row);
      pendingValue = row.dataset.taskName || pendingValue;
      syncWheelSelectionClass();
      syncActiveBucketChip();
    });
  }

  function pickerTaskIconSrc(task) {
    return getTimeTaskListIconSrc(task.name, {
      category: task.category,
      productivity: task.productivity,
      iconKey: task.iconKey,
    });
  }

  function collectPickerTaskIconSrcs(tasks) {
    return (tasks || []).map((t) => pickerTaskIconSrc(t)).filter(Boolean);
  }

  async function renderWheel(opts = {}) {
    const force = opts.force === true;
    const tasks = getTasks?.() || [];
    const cacheKey = wheelTasksCacheKeyFrom(tasks);
    const hasWheel =
      !!wheelList.querySelector(WHEEL_ITEM_SELECTOR);
    if (!force && cacheKey === wheelTasksCacheKey && hasWheel) {
      renderBucketChips(tasks);
      pendingValue = getCurrentValue?.() || pendingValue;
      syncWheelSelectionClass();
      requestAnimationFrame(() => scrollWheelToPendingValue());
      return;
    }
    const gen = ++wheelPaintGen;
    await decodeDisplayIconSrcs(collectPickerTaskIconSrcs(tasks), {
      timeoutMs: 400,
    });
    if (gen !== wheelPaintGen) return;
    wheelTasksCacheKey = cacheKey;

    const chips = getVisibleBucketChips?.() || [];
    const showHeaders =
      typeof getTaskBucket === "function" && chips.length > 0;
    lastSelectedWheelRow = null;
    wheelList.replaceChildren();
    renderBucketChips(tasks);

    const topSpacer = document.createElement("div");
    lpSetClasses(topSpacer, "lp-task-log-mobile-picker-spacer");
    const bottomSpacer = document.createElement("div");
    lpSetClasses(bottomSpacer, "lp-task-log-mobile-picker-spacer");
    const frag = document.createDocumentFragment();
    frag.appendChild(topSpacer);
    let lastBucket = "";
    tasks.forEach((t) => {
      if (showHeaders) {
        const bucketId = getTaskBucket(t) || "";
        if (bucketId && bucketId !== lastBucket) {
          lastBucket = bucketId;
          const label = bucketLabelForId(bucketId, chips);
          if (label) frag.appendChild(buildBucketHeader(label, bucketId));
        }
      }
      frag.appendChild(buildWheelItem(t));
    });
    frag.appendChild(bottomSpacer);
    wheelList.appendChild(frag);

    syncWheelSelectionClass();
    requestAnimationFrame(() => scrollWheelToPendingValue());
  }

  function syncActiveBucketChip() {
    if (bucketChipRow.hidden || !pendingValue) return;
    const row = wheelList.querySelector(
      `[data-task-name="${CSS.escape(pendingValue)}"]`,
    );
    const bucketId = row?.dataset?.bucket || "";
    if (!bucketId) return;
    syncBucketChipActive(bucketId);
  }

  function onWheelScrollEnd() {
    if (Date.now() < bucketScrollLockUntil) return;
    const nearest = nearestWheelItem(wheelList);
    if (!nearest?.dataset?.taskName) return;
    pendingValue = nearest.dataset.taskName;
    syncWheelSelectionClass();
    syncActiveBucketChip();
  }

  function scheduleWheelScrollEnd() {
    if (Date.now() < bucketScrollLockUntil) return;
    if (wheelScrollTimer) clearTimeout(wheelScrollTimer);
    wheelScrollTimer = setTimeout(onWheelScrollEnd, 120);
  }

  function buildSearchRow(task) {
    const row = document.createElement("label");
    lpSetClasses(row, "lp-task-log-mobile-search-item");

    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "lp-task-log-mobile-search";
    radio.value = task.name || "";
    radio.checked = searchPendingValue === task.name;
    lpSetClasses(radio, "lp-task-log-mobile-search-radio");

    const iconSrc = pickerTaskIconSrc(task);
    const iconWrap = document.createElement("span");
    lpSetClasses(iconWrap, "lp-task-log-mobile-search-item-icon-wrap");
    if (iconSrc) {
      const icon = document.createElement("img");
      lpSetClasses(icon, "lp-task-log-mobile-search-item-icon");
      icon.src = iconSrc;
      icon.alt = "";
      icon.decoding = "async";
      iconWrap.appendChild(icon);
    }

    const label = document.createElement("span");
    lpSetClasses(label, "lp-task-log-mobile-search-item-label");
    label.textContent = task.name || "";

    row.append(radio, iconWrap, label);

    radio.addEventListener("change", () => {
      if (radio.checked) searchPendingValue = task.name || "";
    });
    row.addEventListener("click", (e) => {
      if (e.target === radio) return;
      radio.checked = true;
      searchPendingValue = task.name || "";
    });

    return row;
  }

  function buildSearchBucketHeader(label) {
    const row = document.createElement("div");
    lpSetClasses(row, "lp-task-log-mobile-search-bucket-header");
    row.textContent = label;
    return row;
  }

  async function renderSearchList() {
    const q = (searchQuery || "").trim().toLowerCase();
    const tasks = (getTasks?.() || []).filter((t) =>
      q ? matchFlexibleSearch(t.name || "", q) : true,
    );
    const gen = ++searchPaintGen;
    await decodeDisplayIconSrcs(collectPickerTaskIconSrcs(tasks), {
      timeoutMs: 400,
    });
    if (gen !== searchPaintGen) return;
    const chips = getVisibleBucketChips?.() || [];
    const showHeaders = !q && typeof getTaskBucket === "function" && chips.length;
    const frag = document.createDocumentFragment();
    let lastBucket = "";
    tasks.forEach((t) => {
      if (showHeaders) {
        const bucketId = getTaskBucket(t) || "";
        if (bucketId && bucketId !== lastBucket) {
          lastBucket = bucketId;
          const label = bucketLabelForId(bucketId, chips);
          if (label) frag.appendChild(buildSearchBucketHeader(label));
        }
      }
      frag.appendChild(buildSearchRow(t));
    });
    searchList.replaceChildren(frag);
  }

  function scheduleSearchRender() {
    if (searchRenderTimer) clearTimeout(searchRenderTimer);
    searchRenderTimer = setTimeout(() => {
      searchRenderTimer = null;
      renderSearchList();
    }, 160);
  }

  function bringPickerToFront() {
    document.body.appendChild(pickerRoot);
  }

  function bringSearchToFront() {
    document.body.appendChild(searchRoot);
  }

  function openSearch() {
    searchPendingValue = pendingValue;
    searchQuery = "";
    searchInput.value = "";
    renderSearchList();
    bringSearchToFront();
    setSearchShellHidden(false);
    requestAnimationFrame(() => {
      try {
        searchInput.focus({ preventScroll: true });
      } catch (_) {}
    });
  }

  function closeSearch(apply) {
    setSearchShellHidden(true);
    if (searchRenderTimer) {
      clearTimeout(searchRenderTimer);
      searchRenderTimer = null;
    }
    try {
      searchInput.blur();
    } catch (_) {}
    if (apply && searchPendingValue) {
      pendingValue = searchPendingValue;
      onConfirm(pendingValue);
      closePicker();
      return;
    }
    cancelPicker();
  }

  function cancelPicker() {
    pendingValue = getCurrentValue?.() || "";
    closePicker();
  }

  function setPickerShellHidden(hidden) {
    pickerRoot.hidden = hidden;
    pickerRoot.setAttribute("aria-hidden", hidden ? "true" : "false");
    if ("inert" in pickerRoot) pickerRoot.inert = hidden;
  }

  function setSearchShellHidden(hidden) {
    searchRoot.hidden = hidden;
    searchRoot.setAttribute("aria-hidden", hidden ? "true" : "false");
    if ("inert" in searchRoot) searchRoot.inert = hidden;
  }

  function clearPickerTimers() {
    if (wheelScrollTimer) {
      clearTimeout(wheelScrollTimer);
      wheelScrollTimer = null;
    }
    if (bucketScrollSnapTimer) {
      clearTimeout(bucketScrollSnapTimer);
      bucketScrollSnapTimer = null;
    }
    bucketScrollLockUntil = 0;
    lpTokenRemove(wheelList, "is-bucket-scrolling");
    if (searchRenderTimer) {
      clearTimeout(searchRenderTimer);
      searchRenderTimer = null;
    }
  }

  function closePicker() {
    setPickerShellHidden(true);
    setSearchShellHidden(true);
    try {
      searchInput.blur();
    } catch (_) {}
    clearPickerTimers();
    document.documentElement.classList.remove("lp-task-log-mobile-picker-open");
    onShellClose();
  }

  function openPicker() {
    ensureMounted();
    pendingValue = getCurrentValue?.() || "";
    setPickerShellHidden(true);
    document.documentElement.classList.add("lp-task-log-mobile-picker-open");
    openSearch();
  }

  function confirmPicker() {
    onWheelScrollEnd();
    onConfirm(pendingValue || "");
    closePicker();
  }

  backdrop.addEventListener("click", cancelPicker);
  confirmBtn.addEventListener("click", confirmPicker);
  searchOpenBtn.addEventListener("click", openSearch);
  searchCancelBtn.addEventListener("click", () => closeSearch(false));
  searchDoneBtn.addEventListener("click", () => closeSearch(true));
  searchInput.addEventListener("input", () => {
    searchQuery = searchInput.value.trim();
    scheduleSearchRender();
  });
  wheelList.addEventListener("scroll", scheduleWheelScrollEnd, { passive: true });
  wheelList.addEventListener("click", (e) => {
    const row = e.target.closest?.(
      ".lp-task-log-mobile-picker-item, [data-legacy~='lp-task-log-mobile-picker-item']",
    );
    if (!(row instanceof HTMLElement) || !row.dataset.taskName) return;
    selectWheelValue(row.dataset.taskName, row);
  });

  const acOpts = abortSignal ? { signal: abortSignal } : {};
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Escape") return;
      if (!searchRoot.hidden) {
        e.preventDefault();
        closeSearch(false);
        return;
      }
      if (!pickerRoot.hidden) {
        e.preventDefault();
        cancelPicker();
      }
    },
    acOpts,
  );

  return {
    open: openPicker,
    close: closePicker,
    forceDismiss: closePicker,
    isOpen: () => !pickerRoot.hidden || !searchRoot.hidden,
  };
}
