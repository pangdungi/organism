/**
 * 과제 추가·수정 모달 — 아이콘 트리거(점선 1칸) + 아이콘 선택 내부 모달.
 */

import { applyStaticAppIconImg } from "./staticAppIconImg.js";
import {
  getTimeTaskIconSrcByKey,
  getTimeTaskPickableIcons,
  matchTimeTaskPickerIconSearch,
} from "./timeTaskIconUrls.js";
import { lpSetClasses, lpTokenToggle } from "./timeLedgerClassPolicy.js";

/**
 * @param {HTMLElement|null|undefined} mountEl
 * @returns {{ getSelectedKey: () => string, setSelectedKey: (key: string) => void, reset: () => void }}
 */
export function mountTimeAddTaskIconPicker(mountEl) {
  const noop = {
    getSelectedKey: () => "",
    setSelectedKey: () => {},
    reset: () => {},
  };
  if (!mountEl) return noop;

  mountEl.innerHTML = "";
  let selectedKey = "";
  let modalEl = null;
  let iconSearchInput = null;

  const trigger = document.createElement("button");
  trigger.type = "button";
  lpSetClasses(trigger, "time-add-task-icon-picker__trigger");
  trigger.setAttribute("aria-haspopup", "dialog");
  trigger.setAttribute("aria-expanded", "false");
  trigger.setAttribute("aria-label", "아이콘 선택");

  function syncTrigger() {
    const has = selectedKey !== "";
    lpTokenToggle(trigger, "time-add-task-icon-picker__trigger--selected", has);
    trigger.setAttribute(
      "aria-label",
      has ? "아이콘 선택됨, 변경하려면 누르세요" : "아이콘 선택",
    );
    trigger.replaceChildren();
    if (!has) return;
    const src = getTimeTaskIconSrcByKey(selectedKey);
    if (!src) return;
    const img = document.createElement("img");
    img.src = src;
    img.alt = "";
    applyStaticAppIconImg(img);
    lpSetClasses(img, "time-add-task-icon-picker__trigger-icon");
    trigger.appendChild(img);
  }

  function syncGridSelection() {
    if (!modalEl) return;
    modalEl
      .querySelectorAll('[data-legacy~="time-add-task-icon-modal-item"]')
      .forEach((btn) => {
        const on = btn.getAttribute("data-icon-key") === selectedKey;
        lpTokenToggle(btn, "time-add-task-icon-modal-item--selected", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
      });
  }

  function applyIconSearchFilter() {
    if (!modalEl) return;
    const q = String(iconSearchInput?.value ?? "");
    modalEl
      .querySelectorAll('[data-legacy~="time-add-task-icon-modal-item"]')
      .forEach((item) => {
        const hay = String(item.getAttribute("data-icon-search-text") || "");
        item.hidden = !matchTimeTaskPickerIconSearch(hay, q);
      });
  }

  function renderIconGrid() {
    if (!modalEl) return;
    const gridMount = modalEl.querySelector(
      '[data-legacy~="time-add-task-icon-modal-grid-mount"]',
    );
    if (!gridMount) return;
    gridMount.replaceChildren();
    gridMount.removeAttribute("aria-hidden");

    const grid = document.createElement("div");
    lpSetClasses(grid, "time-add-task-icon-modal-grid");

    for (const { key, label, src, searchText } of getTimeTaskPickableIcons()) {
      const btn = document.createElement("button");
      btn.type = "button";
      lpSetClasses(btn, "time-add-task-icon-modal-item");
      btn.setAttribute("data-icon-key", key);
      btn.setAttribute("data-icon-search-text", searchText);
      btn.setAttribute("aria-label", label);
      btn.title = label;

      const img = document.createElement("img");
      img.src = src;
      img.alt = "";
      applyStaticAppIconImg(img);
      lpSetClasses(img, "time-add-task-icon-modal-item-icon");
      btn.appendChild(img);

      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        selectedKey = key;
        syncTrigger();
        syncGridSelection();
        closeIconModal();
      });

      grid.appendChild(btn);
    }

    gridMount.appendChild(grid);
    syncGridSelection();
    applyIconSearchFilter();
  }

  function closeIconModal() {
    if (!modalEl) return;
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
    modalEl.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    syncGridSelection();
    try {
      iconSearchInput?.focus?.();
    } catch (_) {}
  }

  function ensureIconModal() {
    if (modalEl?.isConnected) return modalEl;
    modalEl = document.createElement("div");
    lpSetClasses(modalEl, "time-task-setup-modal time-add-task-icon-modal");
    modalEl.hidden = true;
    modalEl.innerHTML = `
      <div data-legacy="time-task-setup-backdrop"></div>
      <div data-legacy="time-task-setup-panel time-add-task-panel">
        <div data-legacy="time-task-setup-header">
          <h3 data-legacy="time-task-setup-title">아이콘 선택</h3>
          <button type="button" data-legacy="time-task-setup-close" aria-label="닫기">&times;</button>
        </div>
        <div data-legacy="time-task-setup-body time-add-task-icon-modal-body">
          <div data-legacy="time-add-task-icon-modal-search-mount"></div>
          <div data-legacy="time-add-task-icon-modal-divider" role="separator" aria-hidden="true"></div>
          <div data-legacy="time-add-task-icon-modal-grid-mount"></div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);

    const searchMount = modalEl.querySelector(
      '[data-legacy~="time-add-task-icon-modal-search-mount"]',
    );
    if (searchMount) {
      const searchBar = document.createElement("div");
      searchBar.className = "lp-search-bar";
      const searchRow = document.createElement("div");
      searchRow.className = "lp-search-bar__row";
      iconSearchInput = document.createElement("input");
      iconSearchInput.type = "text";
      iconSearchInput.className = "lp-search-bar__input";
      iconSearchInput.placeholder = "영어로 검색";
      iconSearchInput.setAttribute("aria-label", "아이콘 파일명 검색");
      iconSearchInput.autocomplete = "off";
      iconSearchInput.addEventListener("input", applyIconSearchFilter);
      searchRow.appendChild(iconSearchInput);
      searchBar.appendChild(searchRow);
      searchMount.appendChild(searchBar);
    }

    renderIconGrid();

    /* 배경 탭으로 닫지 않음 — 아이콘 선택 중 실수 닫힘 방지 (닫기는 ×만) */
    modalEl
      .querySelector('[data-legacy~="time-task-setup-close"]')
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
      syncTrigger();
      syncGridSelection();
    },
    reset: () => {
      selectedKey = "";
      closeIconModal();
      syncTrigger();
    },
  };
}
