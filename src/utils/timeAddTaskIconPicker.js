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
  CALENDAR_STAMP_ICON_PICKER_LIST_OPTS,
  CALENDAR_STAMP_CATEGORY_ALL,
  CALENDAR_STAMP_CATEGORY_HOLIDAY,
  CALENDAR_STAMP_CATEGORY_TIME,
  CALENDAR_STAMP_CATEGORY_EVENT,
  CALENDAR_STAMP_CATEGORY_FOOD,
  CALENDAR_STAMP_CATEGORY_EMOTION,
  CALENDAR_STAMP_CATEGORY_WORK,
  CALENDAR_STAMP_CATEGORY_DAILY,
  CALENDAR_STAMP_CATEGORY_WEATHER,
  CALENDAR_STAMP_CATEGORY_CHEER,
  CALENDAR_STAMP_CATEGORY_MENT,
  CALENDAR_STAMP_CATEGORY_QUOTE,
  CALENDAR_STAMP_CATEGORY_CUSTOM,
} from "./timeTaskIconUrls.js";
import {
  buildCalendarCustomStampKey,
  getCalendarCustomStampSrc,
  isCalendarCustomStampKey,
  resizeImageFileToCalendarStampBlob,
  uploadCalendarCustomStampForDate,
} from "./calendarDayCustomStamp.js";
import { showToast } from "./showToast.js";
import { attachPickerIconSrcFallback } from "./timeTaskIconLazyDisplay.js";
import { lpSetClasses, lpTokenToggle } from "./timeLedgerClassPolicy.js";
import { markModalOpened } from "./modalNoAutoFocus.js";
import { syncBodyOverflowAfterModalClose } from "./lpModalStack.js";
import {
  warmFullPickerIconsWhenOpeningPicker,
  warmPickerIconKeyInSwCache,
} from "./pickerIconCacheWarm.js";

/** @param {(query: string) => void} onInput */
function mountPickerIconSearchInput(onInput) {
  const searchBar = document.createElement("div");
  searchBar.className = "lp-search-bar";
  const searchRow = document.createElement("div");
  searchRow.className = "lp-search-bar__row";
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "lp-search-bar__input";
  searchInput.placeholder = "";
  searchInput.setAttribute("aria-label", "아이콘 검색");
  searchInput.autocomplete = "off";
  searchInput.enterKeyHint = "search";
  /* 모달 자동 키보드 가드 제외 — 유예 중 탭해도 검색 잠기지 않게 */
  searchInput.dataset.lpKbAllow = "1";
  const emit = () => onInput(String(searchInput.value ?? ""));
  searchInput.addEventListener("input", emit);
  searchInput.addEventListener("compositionend", emit);
  searchInput.addEventListener("search", emit);
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
  const initialKey = String(opts.currentKey || "").trim();
  const stampDateKey = String(opts.dateKey || "").trim().slice(0, 10);
  let currentKey = initialKey;
  const { onPick, onRemove } = opts;
  const isEdit = !!initialKey;
  warmFullPickerIconsWhenOpeningPicker();

  /* 이전에 안 닫힌 날짜 아이콘 픽커만 제거(검색 먹통·오버레이 잔존 방지) */
  document.querySelectorAll(".calendar-day-icon-pick-modal").forEach((el) => {
    if (el instanceof HTMLElement && el.isConnected) {
      try {
        el.remove();
      } catch (_) {}
    }
  });
  cancelPickerIconHydration();

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
        <div class="calendar-day-icon-pick-tabs" role="tablist" aria-label="스탬프 분류">
          <button type="button" class="calendar-day-icon-pick-tab is-active" role="tab" aria-selected="true" data-stamp-category="all">전체</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="holiday">공휴일</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="time">시간</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="event">이벤트</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="food">음식</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="emotion">감정</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="work">직장인</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="daily">일상</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="weather">날씨</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="cheer">응원</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="ment">멘트</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="quote">명언</button>
          <button type="button" class="calendar-day-icon-pick-tab" role="tab" aria-selected="false" data-stamp-category="custom">사진 추가</button>
        </div>
        <div class="time-add-task-icon-modal-search-mount" data-legacy="time-add-task-icon-modal-search-mount"></div>
        <div class="time-add-task-icon-modal-divider" data-legacy="time-add-task-icon-modal-divider" role="separator" aria-hidden="true"></div>
        <div class="time-add-task-icon-modal-grid-mount" data-legacy="time-add-task-icon-modal-grid-mount"></div>
      </div>
      <div class="time-task-log-footer calendar-day-icon-pick-footer" data-legacy="time-task-log-footer">
        <button type="button" class="calendar-day-icon-pick-remove" data-calendar-day-icon-pick-remove hidden>스탬프 제거</button>
        <button type="button" class="time-task-log-submit" data-legacy="time-task-log-submit" data-calendar-day-icon-pick-confirm></button>
      </div>
    </div>
  `;
  modal.querySelector(".time-task-setup-title").textContent = title;

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    cancelPickerIconHydration();
    revokePendingCustomPreview();
    modal.remove();
    syncBodyOverflowAfterModalClose();
  }

  modal.querySelector(".time-task-setup-close")?.addEventListener("click", close);
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  const removeBtn = modal.querySelector("[data-calendar-day-icon-pick-remove]");
  const confirmBtn = modal.querySelector("[data-calendar-day-icon-pick-confirm]");
  if (confirmBtn instanceof HTMLElement) {
    confirmBtn.textContent = isEdit ? "변경" : "추가";
  }
  if (removeBtn instanceof HTMLElement && isEdit && typeof onRemove === "function") {
    removeBtn.hidden = false;
    removeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onRemove();
      close();
    });
  }

  function syncConfirmEnabled() {
    if (!(confirmBtn instanceof HTMLButtonElement)) return;
    confirmBtn.disabled = !String(currentKey || "").trim();
  }

  let pendingCustomBlob = null;
  let pendingCustomPreviewUrl = "";
  function revokePendingCustomPreview() {
    if (pendingCustomPreviewUrl) {
      try {
        URL.revokeObjectURL(pendingCustomPreviewUrl);
      } catch (_) {}
      pendingCustomPreviewUrl = "";
    }
  }

  confirmBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const key = String(currentKey || "").trim();
    if (!key) return;
    if (confirmBtn instanceof HTMLButtonElement) confirmBtn.disabled = true;
    if (pendingCustomBlob && stampDateKey) {
      const uploaded = await uploadCalendarCustomStampForDate(
        stampDateKey,
        pendingCustomBlob,
      );
      if (!uploaded.ok) {
        showToast("사진을 올리지 못했습니다. 다시 시도해 주세요.");
        syncConfirmEnabled();
        return;
      }
      currentKey = uploaded.key || buildCalendarCustomStampKey(stampDateKey);
    }
    if (!isCalendarCustomStampKey(currentKey)) {
      warmPickerIconKeyInSwCache(currentKey);
    }
    onPick?.(currentKey);
    close();
  });

  const searchMount = modal.querySelector(
    '[data-legacy~="time-add-task-icon-modal-search-mount"]',
  );
  const dividerEl = modal.querySelector(
    '[data-legacy~="time-add-task-icon-modal-divider"]',
  );
  const gridMount = modal.querySelector(
    '[data-legacy~="time-add-task-icon-modal-grid-mount"]',
  );
  let searchInput = null;
  let stampCategory = isCalendarCustomStampKey(initialKey)
    ? CALENDAR_STAMP_CATEGORY_CUSTOM
    : CALENDAR_STAMP_CATEGORY_ALL;
  let stampGrid = null;

  function stampSearchQuery() {
    return String(searchInput?.value ?? "").trim();
  }

  function applySearchFilter() {
    remountStampGrid();
  }

  function syncGridSelection() {
    modal
      .querySelectorAll('[data-legacy~="time-add-task-icon-modal-item"]')
      .forEach((btn) => {
        const on = btn.getAttribute("data-icon-key") === currentKey;
        lpTokenToggle(btn, "time-add-task-icon-modal-item--selected", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
    syncConfirmEnabled();
  }

  function iconsForStampTab() {
    const q = stampSearchQuery();
    return getTimeTaskPickableIcons({
      ...CALENDAR_STAMP_ICON_PICKER_LIST_OPTS,
      stampCategory: q ? CALENDAR_STAMP_CATEGORY_ALL : stampCategory,
    });
  }

  function setCustomSearchChromeHidden(hidden) {
    if (searchMount instanceof HTMLElement) searchMount.hidden = hidden;
    if (dividerEl instanceof HTMLElement) dividerEl.hidden = hidden;
  }

  async function acceptCustomStampFile(file) {
    if (!(file instanceof Blob) || !stampDateKey) {
      showToast("이 날짜에 사진을 올릴 수 없습니다.");
      return;
    }
    try {
      const blob = await resizeImageFileToCalendarStampBlob(file);
      revokePendingCustomPreview();
      pendingCustomBlob = blob;
      pendingCustomPreviewUrl = URL.createObjectURL(blob);
      currentKey = buildCalendarCustomStampKey(stampDateKey);
      remountStampGrid();
    } catch (_) {
      showToast("이 사진은 쓸 수 없습니다. 다른 사진을 골라 주세요.");
    }
  }

  function mountCustomStampUploadPanel(grid) {
    cancelPickerIconHydration();
    grid.replaceChildren();
    delete grid.dataset.lpStampSearchAll;
    grid.classList.remove("time-add-task-icon-modal-grid");
    grid.classList.add("calendar-day-custom-stamp-panel");

    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "calendar-day-custom-stamp-drop";
    const previewSrc =
      pendingCustomPreviewUrl ||
      getCalendarCustomStampSrc(buildCalendarCustomStampKey(stampDateKey));
    if (previewSrc) {
      const img = document.createElement("img");
      img.className = "calendar-day-custom-stamp-preview";
      img.alt = "";
      img.src = previewSrc;
      drop.appendChild(img);
      const hint = document.createElement("span");
      hint.className = "calendar-day-custom-stamp-drop-label";
      hint.textContent = "다른 사진으로 바꾸기";
      drop.appendChild(hint);
    } else {
      const frame = document.createElement("span");
      frame.className = "calendar-day-custom-stamp-frame";
      frame.setAttribute("aria-hidden", "true");
      frame.innerHTML =
        '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3.2" y="6.2" width="17.6" height="13.6" rx="1.2"/><circle cx="12" cy="13.2" r="3.1"/><path d="M8.2 6.2 9.5 4.2h5l1.3 2"/></svg>';
      const title = document.createElement("span");
      title.className = "calendar-day-custom-stamp-drop-title";
      title.textContent = "사진 넣기";
      const hint = document.createElement("span");
      hint.className = "calendar-day-custom-stamp-drop-label";
      hint.textContent = "끌어다 놓거나 앨범에서 고르기";
      drop.append(frame, title, hint);
    }

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*,.heic,.heif,image/heic,image/heif";
    fileInput.hidden = true;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (file) void acceptCustomStampFile(file);
    });
    drop.addEventListener("click", () => fileInput.click());
    drop.addEventListener("dragover", (e) => {
      e.preventDefault();
      drop.classList.add("is-dragover");
    });
    drop.addEventListener("dragleave", () => {
      drop.classList.remove("is-dragover");
    });
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      drop.classList.remove("is-dragover");
      const file = e.dataTransfer?.files?.[0];
      if (file) void acceptCustomStampFile(file);
    });
    grid.appendChild(drop);
    grid.appendChild(fileInput);
    syncConfirmEnabled();
  }

  function remountStampGrid() {
    if (!stampGrid) return;
    if (stampCategory === CALENDAR_STAMP_CATEGORY_CUSTOM) {
      setCustomSearchChromeHidden(true);
      mountCustomStampUploadPanel(stampGrid);
      return;
    }
    setCustomSearchChromeHidden(false);
    stampGrid.classList.remove("calendar-day-custom-stamp-panel");
    lpSetClasses(stampGrid, "time-add-task-icon-modal-grid");
    const q = stampSearchQuery();
    const searchingAll = !!q;
    if (
      searchingAll &&
      stampGrid.dataset.lpStampSearchAll === "1"
    ) {
      applyPickerIconSearchFilter(modal, q);
      syncGridSelection();
      return;
    }
    mountPickerIconGrid(stampGrid, iconsForStampTab(), (key) => {
      revokePendingCustomPreview();
      pendingCustomBlob = null;
      currentKey = key;
      syncGridSelection();
    });
    if (searchingAll) stampGrid.dataset.lpStampSearchAll = "1";
    else delete stampGrid.dataset.lpStampSearchAll;
    applyPickerIconSearchFilter(modal, q);
    syncGridSelection();
  }

  function syncStampCategoryTabs() {
    modal.querySelectorAll(".calendar-day-icon-pick-tab").forEach((btn) => {
      const on =
        btn.getAttribute("data-stamp-category") === stampCategory;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  if (searchMount) {
    const mounted = mountPickerIconSearchInput(applySearchFilter);
    searchInput = mounted.searchInput;
    searchMount.appendChild(mounted.searchBar);
  }

  modal.querySelectorAll(".calendar-day-icon-pick-tab").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const next = String(btn.getAttribute("data-stamp-category") || "").trim();
      const nextCategory = (
        {
          [CALENDAR_STAMP_CATEGORY_HOLIDAY]: CALENDAR_STAMP_CATEGORY_HOLIDAY,
          [CALENDAR_STAMP_CATEGORY_TIME]: CALENDAR_STAMP_CATEGORY_TIME,
          [CALENDAR_STAMP_CATEGORY_EVENT]: CALENDAR_STAMP_CATEGORY_EVENT,
          [CALENDAR_STAMP_CATEGORY_FOOD]: CALENDAR_STAMP_CATEGORY_FOOD,
          [CALENDAR_STAMP_CATEGORY_EMOTION]: CALENDAR_STAMP_CATEGORY_EMOTION,
          [CALENDAR_STAMP_CATEGORY_WORK]: CALENDAR_STAMP_CATEGORY_WORK,
          [CALENDAR_STAMP_CATEGORY_DAILY]: CALENDAR_STAMP_CATEGORY_DAILY,
          [CALENDAR_STAMP_CATEGORY_WEATHER]: CALENDAR_STAMP_CATEGORY_WEATHER,
          [CALENDAR_STAMP_CATEGORY_CHEER]: CALENDAR_STAMP_CATEGORY_CHEER,
          [CALENDAR_STAMP_CATEGORY_MENT]: CALENDAR_STAMP_CATEGORY_MENT,
          [CALENDAR_STAMP_CATEGORY_QUOTE]: CALENDAR_STAMP_CATEGORY_QUOTE,
          [CALENDAR_STAMP_CATEGORY_CUSTOM]: CALENDAR_STAMP_CATEGORY_CUSTOM,
        }[next] || CALENDAR_STAMP_CATEGORY_ALL
      );
      if (nextCategory === stampCategory) return;
      stampCategory = nextCategory;
      syncStampCategoryTabs();
      remountStampGrid();
    });
  });

  if (gridMount) {
    stampGrid = document.createElement("div");
    lpSetClasses(stampGrid, "time-add-task-icon-modal-grid");
    gridMount.appendChild(stampGrid);
    syncStampCategoryTabs();
    remountStampGrid();
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
    warmPickerIconKeyInSwCache(key);
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
    warmFullPickerIconsWhenOpeningPicker();
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
      if (selectedKey) {
        userPickedIcon = true;
        warmPickerIconKeyInSwCache(selectedKey);
      }
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
