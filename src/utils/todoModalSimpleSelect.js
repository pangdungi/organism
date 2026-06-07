/**
 * 할 일·과제 기록 모달용 커스텀 드롭다운 — 과제 선택과 동일한 흰 패널(데스크탑) / 하단 시트(모바일).
 */

import { isTaskLogPickerMobile } from "./timeTaskLogPickerDropdown.js";
import {
  lpSetClasses,
  lpTokenAdd,
  lpTokenRemove,
  lpTokenToggle,
} from "./timeLedgerClassPolicy.js";

const FLOATING_PANEL_Z = 10080;

function resetPanelBox(panel) {
  panel.style.position = "";
  panel.style.left = "";
  panel.style.top = "";
  panel.style.width = "";
  panel.style.maxHeight = "";
  panel.style.right = "";
  panel.style.display = "";
  panel.style.zIndex = "";
  panel.removeAttribute("data-lp-floating-select-panel");
}

function layoutFixedPanel(trigger, panel) {
  const r = trigger.getBoundingClientRect();
  const gap = 4;
  const maxH = Math.max(
    120,
    Math.min(window.innerHeight - r.bottom - gap - 8, 304),
  );
  panel.style.position = "fixed";
  panel.style.left = `${Math.max(8, r.left)}px`;
  panel.style.top = `${r.bottom + gap}px`;
  panel.style.width = `${Math.max(160, r.width)}px`;
  panel.style.maxHeight = `${maxH}px`;
  panel.style.zIndex = String(FLOATING_PANEL_Z);
  panel.style.display = "flex";
  panel.setAttribute("data-lp-floating-select-panel", "");
}

function isModalSimpleSelectPanelNode(node) {
  return !!node?.closest?.(
    ".time-task-log-task-dropdown-panel, [data-legacy~='time-task-log-task-dropdown-panel'], [data-lp-modal-simple-select-sheet]",
  );
}

/**
 * @param {object} options
 * @param {{ value: string, label: string }[]} options.items
 * @param {string} [options.value]
 * @param {string} [options.placeholder]
 * @param {string} [options.sheetTitle]
 * @param {string} [options.ariaLabel]
 * @param {AbortSignal} [options.abortSignal]
 * @param {(v: string) => void} [options.onChange]
 */
export function buildModalSimpleSelect(options = {}) {
  const {
    items = [],
    value: initialValue = "",
    placeholder = "선택",
    sheetTitle = "",
    ariaLabel = "",
    abortSignal = null,
    onChange = null,
  } = options;

  const wrap = document.createElement("div");
  lpSetClasses(wrap, "time-task-log-task-dropdown");
  const trigger = document.createElement("button");
  trigger.type = "button";
  lpSetClasses(trigger, "time-task-log-task-dropdown-trigger");
  trigger.setAttribute("aria-haspopup", "listbox");
  if (ariaLabel) trigger.setAttribute("aria-label", ariaLabel);

  const panel = document.createElement("div");
  lpSetClasses(panel, "time-task-log-task-dropdown-panel");
  panel.hidden = true;
  panel.setAttribute("role", "listbox");

  let value =
    initialValue === undefined || initialValue === null
      ? ""
      : String(initialValue);

  function labelFor(v) {
    const it = items.find((x) => String(x.value) === String(v));
    return it ? it.label : "";
  }

  function syncTrigger() {
    const lab = labelFor(value);
    trigger.textContent = lab || placeholder;
    trigger.setAttribute("aria-expanded", panelOpen ? "true" : "false");
    lpTokenToggle(trigger, "has-value", !!String(value || "").trim());
    lpTokenToggle(wrap, "is-open", panelOpen);
  }

  const optionsEl = document.createElement("div");
  lpSetClasses(optionsEl, "time-task-log-task-dropdown-options");

  function renderOptionRows() {
    optionsEl.innerHTML = "";
    items.forEach((it) => {
      const selected = String(it.value) === String(value);
      const row = document.createElement("div");
      lpSetClasses(row, "time-task-log-task-dropdown-option");
      row.setAttribute("data-lp-modal-simple-select-item", "");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", selected ? "true" : "false");
      const lab = document.createElement("span");
      lpSetClasses(lab, "time-task-log-task-dropdown-option-label");
      lab.textContent = it.label;
      row.appendChild(lab);
      const pick = () => {
        value = String(it.value);
        closePanel();
        onChange?.(value);
      };
      row.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        pick();
      });
      optionsEl.appendChild(row);
    });
  }

  panel.appendChild(optionsEl);
  renderOptionRows();

  let panelOpen = false;
  let mobileSheetRoot = null;
  let mobileListEl = null;
  let mobileTitleEl = null;

  function ensureMobileSheet() {
    if (mobileSheetRoot) return;
    mobileSheetRoot = document.createElement("div");
    mobileSheetRoot.setAttribute("data-lp-modal-simple-select-sheet", "");
    lpSetClasses(mobileSheetRoot, "lp-task-log-mobile-picker");
    mobileSheetRoot.hidden = true;

    const backdrop = document.createElement("button");
    backdrop.type = "button";
    lpSetClasses(backdrop, "lp-task-log-mobile-picker-backdrop");
    backdrop.setAttribute("aria-label", "닫기");

    const sheet = document.createElement("div");
    lpSetClasses(sheet, "lp-task-log-mobile-picker-sheet");

    const toolbar = document.createElement("div");
    lpSetClasses(toolbar, "lp-task-log-mobile-picker-toolbar");

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    lpSetClasses(closeBtn, "lp-task-log-mobile-picker-toolbar-btn");
    closeBtn.textContent = "닫기";

    mobileTitleEl = document.createElement("span");
    lpSetClasses(mobileTitleEl, "lp-task-log-mobile-picker-toolbar-title");
    mobileTitleEl.textContent = sheetTitle || ariaLabel || placeholder;

    const toolbarSpacer = document.createElement("span");
    lpSetClasses(toolbarSpacer, "lp-task-log-mobile-picker-toolbar-btn");
    toolbarSpacer.setAttribute("aria-hidden", "true");
    toolbarSpacer.style.visibility = "hidden";
    toolbarSpacer.textContent = "닫기";

    mobileListEl = document.createElement("div");
    lpSetClasses(mobileListEl, "lp-task-log-mobile-search-list");
    mobileListEl.setAttribute("role", "listbox");

    toolbar.append(closeBtn, mobileTitleEl, toolbarSpacer);
    sheet.append(toolbar, mobileListEl);
    mobileSheetRoot.append(backdrop, sheet);
    document.body.appendChild(mobileSheetRoot);

    const closeMobile = () => closePanel();
    backdrop.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMobile();
    });
    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeMobile();
    });
  }

  function renderMobileSheetRows() {
    if (!mobileListEl) return;
    mobileListEl.innerHTML = "";
    items.forEach((it) => {
      const selected = String(it.value) === String(value);
      const row = document.createElement("div");
      lpSetClasses(row, "lp-task-log-mobile-search-item");
      row.setAttribute("data-lp-modal-simple-select-item", "");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", selected ? "true" : "false");
      row.tabIndex = 0;

      const lab = document.createElement("span");
      lpSetClasses(lab, "lp-task-log-mobile-search-item-label");
      lab.textContent = it.label;
      row.appendChild(lab);

      const pick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        value = String(it.value);
        closePanel();
        onChange?.(value);
      };
      row.addEventListener("click", pick);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") pick(e);
      });
      mobileListEl.appendChild(row);
    });
  }

  function dockPanel() {
    if (panel.parentElement !== wrap) wrap.appendChild(panel);
  }

  function closePanel() {
    if (!panelOpen) return;
    panelOpen = false;
    panel.hidden = true;
    resetPanelBox(panel);
    dockPanel();
    if (mobileSheetRoot) mobileSheetRoot.hidden = true;
    document.documentElement.classList.remove("lp-task-log-mobile-picker-open");
    syncTrigger();
    renderOptionRows();
  }

  function openDesktopPanel() {
    panel.hidden = false;
    panelOpen = true;
    if (panel.parentElement !== document.body) {
      document.body.appendChild(panel);
    }
    layoutFixedPanel(trigger, panel);
    syncTrigger();
    renderOptionRows();
  }

  function openMobileSheet() {
    ensureMobileSheet();
    panelOpen = true;
    if (mobileTitleEl) {
      mobileTitleEl.textContent = sheetTitle || ariaLabel || placeholder;
    }
    renderMobileSheetRows();
    if (mobileSheetRoot) mobileSheetRoot.hidden = false;
    document.documentElement.classList.add("lp-task-log-mobile-picker-open");
    syncTrigger();
  }

  function isMobileSheetVisible() {
    return !!(
      mobileSheetRoot &&
      !mobileSheetRoot.hidden &&
      mobileSheetRoot.isConnected
    );
  }

  let activateLockUntil = 0;

  function activateSelect(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isTaskLogPickerMobile()) {
      const now = Date.now();
      if (now < activateLockUntil) return;
      activateLockUntil = now + 450;
      if (isMobileSheetVisible()) closePanel();
      else openMobileSheet();
      return;
    }
    if (panelOpen) closePanel();
    else openDesktopPanel();
  }

  trigger.addEventListener("click", activateSelect);

  const closePanelOnOutside = (e) => {
    if (!panelOpen) return;
    /* 모바일 하단 시트 — 백드롭이 닫기 처리 (과제 선택과 동일) */
    if (isTaskLogPickerMobile()) return;
    const t = e.target;
    if (!(t instanceof Node)) return;
    if (wrap.contains(t)) return;
    if (panel.contains(t)) return;
    closePanel();
  };

  const listenOpts = { capture: true };
  if (abortSignal) listenOpts.signal = abortSignal;
  document.addEventListener("mousedown", closePanelOnOutside, listenOpts);
  document.addEventListener("touchstart", closePanelOnOutside, listenOpts);

  wrap.appendChild(trigger);
  wrap.appendChild(panel);

  wrap._getValue = () => value;
  wrap._setValue = (v) => {
    value = v === undefined || v === null ? "" : String(v);
    if (!panelOpen) {
      syncTrigger();
      renderOptionRows();
    } else {
      closePanel();
    }
  };
  wrap._closePanel = closePanel;
  wrap._isPanelNode = isModalSimpleSelectPanelNode;
  syncTrigger();

  return wrap;
}
