/**
 * 시간가계부「과제 기록」— 모바일 과제 선택 (하단 다이얼 시트 + 검색 모달).
 */

import { lpSetClasses, lpTokenAdd, lpTokenRemove } from "./timeLedgerClassPolicy.js";
import { getTimeTaskListIconSrc } from "./timeTaskIconUrls.js";

function scrollItemToCenter(listEl, itemEl) {
  if (!(listEl instanceof HTMLElement) || !(itemEl instanceof HTMLElement)) return;
  const targetY =
    itemEl.offsetTop + itemEl.offsetHeight / 2 - listEl.clientHeight / 2;
  listEl.scrollTop = Math.max(
    0,
    Math.min(targetY, listEl.scrollHeight - listEl.clientHeight),
  );
}

function nearestWheelItem(listEl) {
  if (!(listEl instanceof HTMLElement)) return null;
  const items = listEl.querySelectorAll(
    ".lp-task-log-mobile-picker-item, [data-legacy~='lp-task-log-mobile-picker-item']",
  );
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
    getCurrentValue,
    onConfirm = () => {},
    abortSignal,
  } = options;

  let pendingValue = "";
  let searchPendingValue = "";
  let searchQuery = "";
  /** @type {HTMLElement | null} */
  let lastSelectedWheelRow = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let wheelScrollTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let searchRenderTimer = null;
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
  sheet.append(toolbar, wheelWrap);
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
      scrollItemToCenter(wheelList, scrollToRow);
    }
  }

  function buildWheelItem(task) {
    const row = document.createElement("div");
    lpSetClasses(row, "lp-task-log-mobile-picker-item");
    row.dataset.taskName = task.name || "";
    row.setAttribute("role", "option");

    const iconSrc = getTimeTaskListIconSrc(task.name, {
      category: task.category,
      productivity: task.productivity,
      iconKey: task.iconKey,
    });
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

  function renderWheel() {
    const tasks = getTasks?.() || [];
    lastSelectedWheelRow = null;
    wheelList.replaceChildren();

    const topSpacer = document.createElement("div");
    lpSetClasses(topSpacer, "lp-task-log-mobile-picker-spacer");
    const bottomSpacer = document.createElement("div");
    lpSetClasses(bottomSpacer, "lp-task-log-mobile-picker-spacer");
    const frag = document.createDocumentFragment();
    frag.appendChild(topSpacer);
    tasks.forEach((t) => frag.appendChild(buildWheelItem(t)));
    frag.appendChild(bottomSpacer);
    wheelList.appendChild(frag);

    syncWheelSelectionClass();
    const target =
      lastSelectedWheelRow ||
      wheelList.querySelector(
        ".lp-task-log-mobile-picker-item, [data-legacy~='lp-task-log-mobile-picker-item']",
      );
    if (target instanceof HTMLElement) {
      requestAnimationFrame(() => scrollItemToCenter(wheelList, target));
    }
  }

  function onWheelScrollEnd() {
    const nearest = nearestWheelItem(wheelList);
    if (!nearest?.dataset?.taskName) return;
    pendingValue = nearest.dataset.taskName;
    syncWheelSelectionClass();
  }

  function scheduleWheelScrollEnd() {
    if (wheelScrollTimer) clearTimeout(wheelScrollTimer);
    wheelScrollTimer = setTimeout(onWheelScrollEnd, 80);
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

    const iconSrc = getTimeTaskListIconSrc(task.name, {
      category: task.category,
      productivity: task.productivity,
      iconKey: task.iconKey,
    });
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

  function renderSearchList() {
    const q = (searchQuery || "").trim().toLowerCase();
    const tasks = (getTasks?.() || []).filter((t) =>
      q ? (t.name || "").toLowerCase().includes(q) : true,
    );
    const frag = document.createDocumentFragment();
    tasks.forEach((t) => frag.appendChild(buildSearchRow(t)));
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
    searchRoot.hidden = false;
    requestAnimationFrame(() => {
      try {
        searchInput.focus({ preventScroll: true });
      } catch (_) {}
    });
  }

  function closeSearch(apply) {
    searchRoot.hidden = true;
    if (searchRenderTimer) {
      clearTimeout(searchRenderTimer);
      searchRenderTimer = null;
    }
    try {
      searchInput.blur();
    } catch (_) {}
    if (apply && searchPendingValue) {
      const next = searchPendingValue;
      if (next !== pendingValue) {
        pendingValue = next;
        renderWheel();
      } else {
        syncWheelSelectionClass();
        if (lastSelectedWheelRow instanceof HTMLElement) {
          requestAnimationFrame(() =>
            scrollItemToCenter(wheelList, lastSelectedWheelRow),
          );
        }
      }
    }
  }

  function cancelPicker() {
    pendingValue = getCurrentValue?.() || "";
    closePicker();
  }

  function closePicker() {
    pickerRoot.hidden = true;
    closeSearch(false);
    document.documentElement.classList.remove("lp-task-log-mobile-picker-open");
    if (wheelScrollTimer) {
      clearTimeout(wheelScrollTimer);
      wheelScrollTimer = null;
    }
    if (searchRenderTimer) {
      clearTimeout(searchRenderTimer);
      searchRenderTimer = null;
    }
  }

  function openPicker() {
    ensureMounted();
    pendingValue = getCurrentValue?.() || "";
    renderWheel();
    bringPickerToFront();
    pickerRoot.hidden = false;
    document.documentElement.classList.add("lp-task-log-mobile-picker-open");
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
    isOpen: () => !pickerRoot.hidden || !searchRoot.hidden,
  };
}
