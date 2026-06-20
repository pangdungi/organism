/**
 * 과제 추가·수정 모달 — 아이콘 트리거(점선 1칸) + 아이콘 선택 내부 모달.
 */

import {
  applyEagerIconImg,
  applyStaticAppIconImg,
} from "./staticAppIconImg.js";
import {
  getTimeTaskIconSrcByKey,
  getTimeTaskPickableIcons,
  getTimeTaskListIconSrc,
  resolveTimeTaskIconKey,
  matchTimeTaskPickerIconSearch,
  TIME_TASK_ICON_PICKER_LIST_OPTS,
} from "./timeTaskIconUrls.js";
import { attachPickerIconSrcFallback } from "./timeTaskIconLazyDisplay.js";
import { lpSetClasses, lpTokenToggle } from "./timeLedgerClassPolicy.js";
import { markModalOpened } from "./modalNoAutoFocus.js";
import { syncBodyOverflowAfterModalClose } from "./lpModalStack.js";

/** @param {(query: string) => void} onInput */
function mountPickerIconSearchInput(onInput) {
  const searchBar = document.createElement("div");
  searchBar.className = "lp-search-bar";
  const searchRow = document.createElement("div");
  searchRow.className = "lp-search-bar__row";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "lp-search-bar__input";
  searchInput.placeholder = "";
  searchInput.setAttribute("aria-label", "아이콘 검색");
  searchInput.autocomplete = "off";
  searchInput.addEventListener("input", () => {
    onInput(String(searchInput.value ?? ""));
  });
  searchRow.appendChild(searchInput);
  searchBar.appendChild(searchRow);
  return { searchBar, searchInput };
}

/** @param {ParentNode} root @param {string} query */
function applyPickerIconSearchFilter(root, query) {
  root
    .querySelectorAll('[data-legacy~="time-add-task-icon-modal-item"]')
    .forEach((item) => {
      const hay = String(item.getAttribute("data-icon-search-text") || "");
      item.hidden = !matchTimeTaskPickerIconSearch(hay, query);
    });
}

const TIME_TASK_ICON_PICK_MODAL_SHELL_CLASS =
  "time-task-setup-modal time-add-task-icon-modal";

/** iOS·Android WebView — SVG 116개 동시 src 금지(셧다운) */
/** PNG 썸네일이면 한꺼번에 더 불러도 됨 */
const PICKER_HYDRATE_BATCH = 24;
const PICKER_HYDRATE_FIRST = 48;
let pickerGridHydrationGen = 0;

function cancelPickerIconHydration() {
  pickerGridHydrationGen += 1;
}

/** 그리드 버튼은 즉시, img src 만 배치로 (셧다운 방지) */
function hydratePickerGridImgs(grid, opts = {}) {
  if (!grid) return;
  const gen = ++pickerGridHydrationGen;
  const jobs = [];
  for (const img of grid.querySelectorAll(
    '[data-legacy~="time-add-task-icon-modal-item-icon"]',
  )) {
    if (!(img instanceof HTMLImageElement)) continue;
    const src = String(img.dataset.lpIconSrc || "").trim();
    if (!src || img.src) continue;
    jobs.push({ img, src });
  }
  if (!jobs.length) return;

  const firstSync = Math.min(
    opts.firstSync ?? PICKER_HYDRATE_FIRST,
    jobs.length,
  );
  for (let i = 0; i < firstSync; i++) {
    const { img, src } = jobs[i];
    applyEagerIconImg(img);
    img.src = src;
    delete img.dataset.lpIconSrc;
  }

  let idx = firstSync;
  const step = () => {
    if (gen !== pickerGridHydrationGen) return;
    let n = 0;
    while (idx < jobs.length && n < PICKER_HYDRATE_BATCH) {
      const { img, src } = jobs[idx++];
      applyEagerIconImg(img);
      img.src = src;
      delete img.dataset.lpIconSrc;
      n += 1;
    }
    if (idx < jobs.length) requestAnimationFrame(step);
  };
  if (idx < jobs.length) requestAnimationFrame(step);
}

/**
 * @param {HTMLElement} grid
 * @param {{ key: string, label: string, src: string, searchText: string }[]} icons
 * @param {(key: string) => void} onPick
 */
function mountPickerIconGrid(grid, icons, onPick) {
  cancelPickerIconHydration();
  grid.replaceChildren();

  for (const { key, label, src, searchText } of icons) {
    const btn = document.createElement("button");
    btn.type = "button";
    lpSetClasses(btn, "time-add-task-icon-modal-item");
    btn.setAttribute("data-icon-key", key);
    btn.setAttribute("data-icon-search-text", searchText);
    btn.setAttribute("aria-label", label);
    btn.title = label;

    const img = document.createElement("img");
    img.alt = "";
    lpSetClasses(img, "time-add-task-icon-modal-item-icon");
    if (src) img.dataset.lpIconSrc = src;
    attachPickerIconSrcFallback(img, src);
    img.addEventListener("error", () => {
      if (img.dataset.lpIconFallback !== "1") return;
      btn.remove();
    });
    btn.appendChild(img);

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onPick(key);
    });
    grid.appendChild(btn);
  }
  hydratePickerGridImgs(grid);
}

/**
 * body에 붙는 독립 아이콘 선택 모달 (캘린더 날짜 아이콘 등).
 */
export function openStandaloneTimeTaskIconPickModal(opts = {}) {
  const title = String(opts.title || "아이콘 선택").trim() || "아이콘 선택";
  let currentKey = String(opts.currentKey || "").trim();
  const { onPick, onRemove } = opts;

  const modal = document.createElement("div");
  modal.className = `${TIME_TASK_ICON_PICK_MODAL_SHELL_CLASS} calendar-day-icon-pick-modal`;
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", title);
  modal.innerHTML = `
    <div class="time-task-setup-backdrop" data-legacy="time-task-setup-backdrop"></div>
    <div class="time-task-setup-panel time-add-task-panel" data-legacy="time-task-setup-panel time-add-task-panel">
      <div class="time-task-setup-header" data-legacy="time-task-setup-header">
        <h3 class="time-task-setup-title" data-legacy="time-task-setup-title"></h3>
        <button type="button" class="time-task-setup-close" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
      </div>
      <div class="time-task-setup-body time-add-task-icon-modal-body" data-legacy="time-task-setup-body time-add-task-icon-modal-body">
        <div class="calendar-day-icon-pick-actions" data-calendar-day-icon-pick-actions hidden></div>
        <div class="time-add-task-icon-modal-search-mount" data-legacy="time-add-task-icon-modal-search-mount"></div>
        <div class="time-add-task-icon-modal-divider" data-legacy="time-add-task-icon-modal-divider" role="separator" aria-hidden="true"></div>
        <div class="time-add-task-icon-modal-grid-mount" data-legacy="time-add-task-icon-modal-grid-mount"></div>
      </div>
    </div>
  `;
  modal.querySelector(".time-task-setup-title").textContent = title;

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    cancelPickerIconHydration();
    modal.remove();
    syncBodyOverflowAfterModalClose();
  }

  modal.querySelector(".time-task-setup-close")?.addEventListener("click", close);
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  const actionsEl = modal.querySelector("[data-calendar-day-icon-pick-actions]");
  if (actionsEl instanceof HTMLElement && currentKey && onRemove) {
    actionsEl.hidden = false;
    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "calendar-day-icon-pick-remove";
    removeBtn.textContent = "아이콘 제거";
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRemove();
      close();
    });
    actionsEl.appendChild(removeBtn);
  }

  const searchMount = modal.querySelector(
    '[data-legacy~="time-add-task-icon-modal-search-mount"]',
  );
  const gridMount = modal.querySelector(
    '[data-legacy~="time-add-task-icon-modal-grid-mount"]',
  );
  let searchInput = null;

  function applySearchFilter() {
    applyPickerIconSearchFilter(modal, String(searchInput?.value ?? ""));
  }

  function syncGridSelection() {
    modal
      .querySelectorAll('[data-legacy~="time-add-task-icon-modal-item"]')
      .forEach((btn) => {
        const on = btn.getAttribute("data-icon-key") === currentKey;
        lpTokenToggle(btn, "time-add-task-icon-modal-item--selected", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
  }

  if (searchMount) {
    const mounted = mountPickerIconSearchInput(applySearchFilter);
    searchInput = mounted.searchInput;
    searchMount.appendChild(mounted.searchBar);
  }

  if (gridMount) {
    const grid = document.createElement("div");
    lpSetClasses(grid, "time-add-task-icon-modal-grid");
    gridMount.appendChild(grid);
    mountPickerIconGrid(
      grid,
      getTimeTaskPickableIcons(TIME_TASK_ICON_PICKER_LIST_OPTS),
      (key) => {
      currentKey = key;
      onPick?.(key);
      close();
    },
    );
    syncGridSelection();
  }

  markModalOpened();
  document.body.appendChild(modal);
  return { close };
}

/**
 * @param {HTMLElement|null|undefined} mountEl
 */
export function mountTimeAddTaskIconPicker(mountEl) {
  const noop = {
    getSelectedKey: () => "",
    setSelectedKey: () => {},
    setFromTaskDisplay: () => {},
    refreshDefaultPreview: () => {},
    reset: () => {},
  };
  if (!mountEl) return noop;

  mountEl.innerHTML = "";
  let selectedKey = "";
  let previewSrc = "";
  let userPickedIcon = false;
  let modalEl = null;
  let iconSearchInput = null;

  const trigger = document.createElement("button");
  trigger.type = "button";
  lpSetClasses(trigger, "time-add-task-icon-picker__trigger");
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "아이콘 선택");

  function syncTrigger() {
    const src =
      (selectedKey && getTimeTaskIconSrcByKey(selectedKey)) ||
      previewSrc ||
      "";
    const has = !!src;
    lpTokenToggle(trigger, "time-add-task-icon-picker__trigger--selected", has);
    trigger.setAttribute(
      "aria-label",
      has ? "아이콘 선택됨, 변경하려면 누르세요" : "아이콘 선택",
    );
    trigger.replaceChildren();
    if (!has) return;
    const img = document.createElement("img");
    img.alt = "";
    applyStaticAppIconImg(img);
    attachPickerIconSrcFallback(img, src);
    img.src = src;
    lpSetClasses(img, "time-add-task-icon-picker__trigger-icon");
    trigger.appendChild(img);
  }

  function syncGridSelection() {
    if (!modalEl) return;
    modalEl
      .querySelectorAll(
        '[data-legacy~="time-add-task-icon-modal-item--selected"]',
      )
      .forEach((btn) => {
        lpTokenToggle(btn, "time-add-task-icon-modal-item--selected", false);
        btn.setAttribute("aria-pressed", "false");
      });
    if (!selectedKey) return;
    const btn = modalEl.querySelector(
      `[data-legacy~="time-add-task-icon-modal-item"][data-icon-key="${CSS.escape(selectedKey)}"]`,
    );
    if (!btn) return;
    lpTokenToggle(btn, "time-add-task-icon-modal-item--selected", true);
    btn.setAttribute("aria-pressed", "true");
  }

  function applyIconSearchFilter() {
    if (!modalEl) return;
    applyPickerIconSearchFilter(modalEl, String(iconSearchInput?.value ?? ""));
  }

  let pickerGridMounted = false;

  function onPickIconKey(key) {
    selectedKey = key;
    previewSrc = "";
    userPickedIcon = true;
    syncTrigger();
    syncGridSelection();
    closeIconModal();
  }

  function renderIconGrid() {
    if (!modalEl) return;
    const gridMount = modalEl.querySelector(
      '[data-legacy~="time-add-task-icon-modal-grid-mount"]',
    );
    if (!gridMount) return;
    gridMount.removeAttribute("aria-hidden");

    let grid = gridMount.querySelector(
      '[data-legacy~="time-add-task-icon-modal-grid"]',
    );
    if (!grid) {
      grid = document.createElement("div");
      lpSetClasses(grid, "time-add-task-icon-modal-grid");
      gridMount.appendChild(grid);
    }

    if (!pickerGridMounted) {
      mountPickerIconGrid(
        grid,
        getTimeTaskPickableIcons(TIME_TASK_ICON_PICKER_LIST_OPTS),
        onPickIconKey,
      );
      pickerGridMounted = true;
    } else {
      hydratePickerGridImgs(grid, { firstSync: PICKER_HYDRATE_FIRST });
    }
    syncGridSelection();
    applyIconSearchFilter();
  }

  function closeIconModal() {
    if (!modalEl) return;
    cancelPickerIconHydration();
    modalEl.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (iconSearchInput) {
      iconSearchInput.value = "";
      applyIconSearchFilter();
    }
    try {
      trigger.focus();
    } catch (_) {}
  }

  function openIconModal() {
    if (!modalEl) return;
    renderIconGrid();
    modalEl.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    syncGridSelection();
  }

  function ensureIconModal() {
    if (modalEl?.isConnected) return modalEl;
    modalEl = document.createElement("div");
    modalEl.className = TIME_TASK_ICON_PICK_MODAL_SHELL_CLASS;
    modalEl.hidden = true;
    modalEl.setAttribute("role", "dialog");
    modalEl.setAttribute("aria-modal", "true");
    modalEl.setAttribute("aria-label", "아이콘 선택");
    modalEl.innerHTML = `
      <div class="time-task-setup-backdrop" data-legacy="time-task-setup-backdrop"></div>
      <div class="time-task-setup-panel time-add-task-panel" data-legacy="time-task-setup-panel time-add-task-panel">
        <div class="time-task-setup-header" data-legacy="time-task-setup-header">
          <h3 class="time-task-setup-title" data-legacy="time-task-setup-title">아이콘 선택</h3>
          <button type="button" class="time-task-setup-close" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
        </div>
        <div class="time-task-setup-body time-add-task-icon-modal-body" data-legacy="time-task-setup-body time-add-task-icon-modal-body">
          <div class="time-add-task-icon-modal-search-mount" data-legacy="time-add-task-icon-modal-search-mount"></div>
          <div class="time-add-task-icon-modal-divider" data-legacy="time-add-task-icon-modal-divider" role="separator" aria-hidden="true"></div>
          <div class="time-add-task-icon-modal-grid-mount" data-legacy="time-add-task-icon-modal-grid-mount"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    const searchMount = modalEl.querySelector(
      '[data-legacy~="time-add-task-icon-modal-search-mount"]',
    );
    if (searchMount) {
      const mounted = mountPickerIconSearchInput(applyIconSearchFilter);
      iconSearchInput = mounted.searchInput;
      searchMount.appendChild(mounted.searchBar);
    }

    modalEl
      .querySelector(".time-task-setup-close")
      ?.addEventListener("click", closeIconModal);
    return modalEl;
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    ensureIconModal();
    openIconModal();
  });

  mountEl.appendChild(trigger);
  syncTrigger();

  return {
    getSelectedKey: () => selectedKey,
    setSelectedKey: (key) => {
      selectedKey = String(key || "").trim();
      previewSrc = selectedKey ? "" : previewSrc;
      if (selectedKey) userPickedIcon = true;
      syncTrigger();
      syncGridSelection();
    },
    setFromTaskDisplay(taskName, opts = {}) {
      selectedKey = resolveTimeTaskIconKey(taskName, opts);
      previewSrc = selectedKey
        ? ""
        : getTimeTaskListIconSrc(taskName, opts) || "";
      userPickedIcon = false;
      syncTrigger();
      syncGridSelection();
    },
    refreshDefaultPreview(taskName, opts = {}) {
      if (userPickedIcon) return;
      selectedKey = "";
      previewSrc = getTimeTaskListIconSrc(taskName, opts) || "";
      syncTrigger();
      syncGridSelection();
    },
    reset: () => {
      selectedKey = "";
      previewSrc = "";
      userPickedIcon = false;
      closeIconModal();
      syncTrigger();
    },
  };
}
