/**
 * 시간가계부「과제 기록」모달과 동일한 과제 선택 드롭다운 (버킷·검색).
 */

import {
  lpSetClasses,
  lpTokenAdd,
  lpTokenToggle,
} from "./timeLedgerClassPolicy.js";
import { getFullTaskOptions } from "./timeTaskOptionsModel.js";
import * as TTC from "./timeTaskOptionsConstants.js";
import { getTimeTaskListIconSrc } from "./timeTaskIconUrls.js";
import {
  isIosLikeMobile,
  lockPageScrollForModalKeyboard,
  syncVisualViewportKeyboardInset,
} from "./mobileViewportKeyboard.js";
import { createMobileTaskLogPicker } from "./timeTaskLogPickerMobile.js";

/** 좁은 화면 또는 터치 기기(가로 모드 포함) — 드롭다운 대신 하단 다이얼 시트 */
export function isTaskLogPickerMobile() {
  if (typeof window.matchMedia !== "function") return false;
  return (
    window.matchMedia("(max-width: 48rem)").matches ||
    window.matchMedia("(hover: none) and (pointer: coarse)").matches
  );
}

function blurTaskPickerSearchInput(panelEl) {
  const search = panelEl?.querySelector?.(
    ".time-task-log-task-dropdown-search, [data-legacy~='time-task-log-task-dropdown-search']",
  );
  if (search instanceof HTMLElement && document.activeElement === search) {
    try {
      search.blur();
    } catch (_) {}
  }
}

function getProductivityFromCategory(categoryValue) {
  if (!categoryValue) return "";
  const productive = ["sideincome", "happiness", "health"];
  const nonproductive = [
    "unhappiness",
    "unhealthy",
    "moneylosing",
    "pleasure",
    "media_watch",
  ];
  const other = ["work", "sleep"];
  if (productive.includes(categoryValue)) return "productive";
  if (nonproductive.includes(categoryValue)) return "nonproductive";
  if (other.includes(categoryValue)) return "other";
  return "";
}

const BUILTIN_TEMPLATE_NAMES = new Set([
  ...TTC.FIXED_OTHER_TASKS.map((t) => t.name),
  ...TTC.FIXED_PRODUCTIVE_TASKS.map((t) => t.name),
  ...TTC.FIXED_NONPRODUCTIVE_TASKS.map((t) => t.name),
]);

function isTimeTaskBuiltinTemplate(task) {
  const n = String(task?.name ?? "").trim();
  return Boolean(n && BUILTIN_TEMPLATE_NAMES.has(n));
}

function isTimeTaskKpiLinked(task) {
  return Boolean(task && String(task.kpiId || "").trim());
}

function appendTaskDropdownBadges(textWrap, task, opts = {}) {
  if (opts.omitBadges) return;
  if (isTimeTaskBuiltinTemplate(task)) {
    const bb = document.createElement("span");
    lpSetClasses(bb, "lp-task-badge lp-task-badge--builtin");
    bb.textContent = "기본";
    bb.title =
      "앱에서 제공하는 기본 과제입니다. 과제 설정에서 삭제할 수 없습니다.";
    textWrap.appendChild(bb);
  }
  if (isTimeTaskKpiLinked(task)) {
    const kb = document.createElement("span");
    lpSetClasses(kb, "lp-task-badge lp-task-badge--kpi");
    kb.textContent = "KPI";
    kb.title = "KPI(맵)에서 연결된 과제입니다";
    textWrap.appendChild(kb);
  }
}

/** 드롭다운·모바일 피커 대분류 순서 — 시급 상승·행복·건강·비생산·그외 */
const LEDGER_BUCKET_CHIPS = [
  { id: "sideincome", label: "시급 상승" },
  { id: "happiness", label: "행복" },
  { id: "health", label: "건강" },
  { id: "nonproductive", label: "비생산" },
  { id: "other", label: "그외" },
];

const LEDGER_BUCKET_SORT_ORDER = LEDGER_BUCKET_CHIPS.map((c) => c.id);

function ledgerBucketSortIndex(task) {
  const b = timeLedgerTaskLogPickerBucket(task);
  const i = LEDGER_BUCKET_SORT_ORDER.indexOf(b);
  return i >= 0 ? i : LEDGER_BUCKET_SORT_ORDER.length;
}

export function sortTasksForLedgerPicker(tasks) {
  return [...tasks].sort((a, b) => {
    const ba = ledgerBucketSortIndex(a);
    const bb = ledgerBucketSortIndex(b);
    if (ba !== bb) return ba - bb;
    return (a.name || "").localeCompare(b.name || "", "ko");
  });
}

const LEDGER_BUCKET_PRESET_EXPENSE = new Set(["nonproductive", "other"]);
const LEDGER_BUCKET_PRESET_INVEST = new Set([
  "happiness",
  "sideincome",
  "health",
  "other",
]);

export function timeLedgerTaskLogPickerBucket(t) {
  let prod = String(t?.productivity ?? "")
    .trim()
    .toLowerCase();
  if (!prod) {
    prod = String(
      getProductivityFromCategory(String(t?.category ?? "").trim()) || "",
    ).toLowerCase();
  }
  if (prod === "nonproductive") return "nonproductive";
  if (prod === "other") return "other";
  const cat = String(t?.category ?? "")
    .trim()
    .toLowerCase();
  if (cat === "dream") return "sideincome";
  if (cat === "happiness") return "happiness";
  if (cat === "sideincome") return "sideincome";
  if (cat === "health") return "health";
  return "other";
}

export function getAllowedBucketsForLedgerPreset(preset) {
  if (preset === "expense") return LEDGER_BUCKET_PRESET_EXPENSE;
  if (preset === "invest") return LEDGER_BUCKET_PRESET_INVEST;
  return null;
}

/** 지출하기(expense): 그외+비생산 / 투자하기(invest): 그외+꿈·행복·부수입·건강 */
export function taskAllowedForLedgerPreset(task, preset) {
  const allowed = getAllowedBucketsForLedgerPreset(preset);
  if (!allowed) return true;
  return allowed.has(timeLedgerTaskLogPickerBucket(task));
}

export function buildTimeTaskLogPickerDropdown(options = {}) {
  const {
    abortSignal,
    onTaskSelected = () => {},
    onDismissBlockingLayers = () => {},
  } = options;

  const wrap = document.createElement("div");
  lpSetClasses(wrap, "time-task-log-task-dropdown");
  const trigger = document.createElement("button");
  trigger.type = "button";
  lpSetClasses(trigger, "time-task-log-task-dropdown-trigger");
  let value = "";
  function syncTriggerLabel() {
    const has = !!(value || "").trim();
    trigger.textContent = has ? value : "과제를 선택하세요";
    lpTokenToggle(trigger, "has-value", has);
    trigger.setAttribute(
      "aria-label",
      has ? `선택한 과제: ${value}` : "과제 선택",
    );
  }
  syncTriggerLabel();
  const panel = document.createElement("div");
  lpSetClasses(
    panel,
    "time-task-log-task-dropdown-panel time-task-log-task-dropdown-panel--ledger-buckets",
  );
  panel.hidden = true;
  let searchQuery = "";
  let pickerBucket = "sideincome";
  let ledgerBucketPreset =
    options.ledgerBucketPreset === "expense" ||
    options.ledgerBucketPreset === "invest"
      ? options.ledgerBucketPreset
      : null;

  function findTaskLogScrollArea() {
    return wrap.closest(
      ".time-task-log-scroll-area, [data-legacy~='time-task-log-scroll-area']",
    );
  }

  function findTaskLogModalPanel() {
    return wrap.closest(
      ".time-task-log-panel, .time-task-setup-panel, [data-legacy~='time-task-log-panel']",
    );
  }

  /** @type {AbortController | null} */
  let panelLayoutAc = null;

  function syncPanelMaxHeight() {
    if (panel.hidden || !wrap.classList.contains("is-open")) {
      panel.style.removeProperty("max-height");
      return;
    }
    const modalPanel = findTaskLogModalPanel();
    if (!(modalPanel instanceof HTMLElement)) return;
    const footer = modalPanel.querySelector(
      "[data-legacy~='time-task-log-footer'], [data-task-log-footer]",
    );
    const triggerRect = trigger.getBoundingClientRect();
    const bottomLimit =
      (footer instanceof HTMLElement
        ? footer.getBoundingClientRect().top
        : modalPanel.getBoundingClientRect().bottom) - 8;
    const available = bottomLimit - triggerRect.bottom - 4;
    panel.style.maxHeight = `${Math.max(140, Math.floor(available))}px`;
  }

  function bindPanelLayoutSync() {
    panelLayoutAc?.abort();
    panelLayoutAc = new AbortController();
    const { signal } = panelLayoutAc;
    const run = () => syncPanelMaxHeight();
    window.addEventListener("resize", run, { passive: true, signal });
    window.visualViewport?.addEventListener("resize", run, {
      passive: true,
      signal,
    });
    window.visualViewport?.addEventListener("scroll", run, {
      passive: true,
      signal,
    });
    run();
    requestAnimationFrame(run);
  }

  function setPanelOpen(open) {
    wrap.classList.toggle("is-open", !!open);
    const scroll = findTaskLogScrollArea();
    if (scroll instanceof HTMLElement && !isTaskLogPickerMobile()) {
      scroll.classList.toggle("is-task-picker-open", !!open);
    } else if (scroll instanceof HTMLElement && !open) {
      scroll.classList.remove("is-task-picker-open");
    }
    trigger.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      bindPanelLayoutSync();
    } else {
      panelLayoutAc?.abort();
      panelLayoutAc = null;
      panel.style.removeProperty("max-height");
    }
  }

  function closePanel() {
    if (!panel.hidden) {
      blurTaskPickerSearchInput(panel);
      pickerSearchKeyboardAc?.abort();
      pickerSearchKeyboardAc = null;
      panel.hidden = true;
    }
    setPanelOpen(false);
  }

  function getAllPickerTasks() {
    const bucketAllow = getAllowedBucketsForLedgerPreset(ledgerBucketPreset);
    let tasks = getFullTaskOptions().filter((t) => !(t.name || "").includes(" > "));
    if (bucketAllow) {
      tasks = tasks.filter((t) =>
        bucketAllow.has(timeLedgerTaskLogPickerBucket(t)),
      );
    }
    return sortTasksForLedgerPicker(tasks);
  }

  const mobilePicker = createMobileTaskLogPicker({
    getTasks: getAllPickerTasks,
    getVisibleBucketChips: getVisibleChips,
    getTaskBucket: timeLedgerTaskLogPickerBucket,
    getCurrentValue: () => value,
    onConfirm: (name) => {
      value = name || "";
      syncTriggerLabel();
      onTaskSelected(value);
      onDismissBlockingLayers();
    },
    onShellClose: onDismissBlockingLayers,
    abortSignal,
  });

  function getVisibleChips() {
    const allowed = getAllowedBucketsForLedgerPreset(ledgerBucketPreset);
    if (!allowed) return LEDGER_BUCKET_CHIPS;
    return LEDGER_BUCKET_CHIPS.filter((c) => allowed.has(c.id));
  }

  function ensurePickerBucketInAllowed() {
    const ids = new Set(getVisibleChips().map((c) => c.id));
    if (!ids.has(pickerBucket)) pickerBucket = getVisibleChips()[0]?.id || "sideincome";
  }

  function renderOptions(container, filter) {
    container.innerHTML = "";
    const q = (filter || "").trim().toLowerCase();
    const bucketAllow = getAllowedBucketsForLedgerPreset(ledgerBucketPreset);
    const allTasks = getFullTaskOptions();
    let tasks = allTasks.filter((t) => !(t.name || "").includes(" > "));
    if (bucketAllow) {
      tasks = tasks.filter((t) =>
        bucketAllow.has(timeLedgerTaskLogPickerBucket(t)),
      );
    }
    if (!q) {
      tasks = tasks.filter(
        (t) => timeLedgerTaskLogPickerBucket(t) === pickerBucket,
      );
    }
    if (q) {
      tasks = tasks.filter((t) => (t.name || "").toLowerCase().includes(q));
    }
    tasks = sortTasksForLedgerPicker(tasks);
    tasks.forEach((t) => {
      const row = document.createElement("div");
      lpSetClasses(row, "time-task-log-task-dropdown-option");
      const prod = (
        t.productivity ||
        getProductivityFromCategory(t.category) ||
        "productive"
      ).trim();
      const barClass =
        prod === "productive"
          ? "time-task-prod-bar time-task-prod-bar--productive"
          : prod === "nonproductive"
            ? "time-task-prod-bar time-task-prod-bar--nonproductive"
            : "time-task-prod-bar time-task-prod-bar--other";
      const bar = document.createElement("span");
      lpSetClasses(bar, barClass);
      bar.setAttribute("aria-hidden", "true");
      const iconSrc = getTimeTaskListIconSrc(t.name, {
        category: t.category,
        productivity: t.productivity,
        iconKey: t.iconKey,
      });
      const iconEl = iconSrc ? document.createElement("img") : null;
      if (iconEl) {
        lpSetClasses(iconEl, "time-task-log-task-dropdown-option-icon");
        iconEl.src = iconSrc;
        iconEl.alt = "";
        iconEl.decoding = "sync";
      }
      const textWrap = document.createElement("span");
      lpSetClasses(textWrap, "time-task-log-task-dropdown-option-text");
      const label = document.createElement("span");
      lpSetClasses(label, "time-task-log-task-dropdown-option-label");
      label.textContent = t.name || "";
      textWrap.appendChild(label);
      appendTaskDropdownBadges(textWrap, t);
      row.appendChild(bar);
      if (iconEl) row.appendChild(iconEl);
      row.appendChild(textWrap);
      const closePanelAndSelect = () => {
        value = t.name || "";
        syncTriggerLabel();
        closePanel();
        onTaskSelected(value);
      };
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePanelAndSelect();
      });
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closePanelAndSelect();
      });
      container.appendChild(row);
    });
  }

  /** @type {AbortController | null} */
  let pickerSearchKeyboardAc = null;

  function renderPanel() {
    panel.innerHTML = "";
    let optionsContainer = null;
    ensurePickerBucketInAllowed();

    const searchWrap = document.createElement("div");
    lpSetClasses(searchWrap, "time-task-log-task-dropdown-search-wrap");
    const searchInner = document.createElement("div");
    lpSetClasses(searchInner, "time-task-log-task-dropdown-search-inner");
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "과제 검색...";
    lpSetClasses(searchInput, "time-task-log-task-dropdown-search");
    searchInput.value = searchQuery;
    searchInput.setAttribute("autocomplete", "off");
    const searchClearBtn = document.createElement("button");
    searchClearBtn.type = "button";
    lpSetClasses(searchClearBtn, "time-task-log-date-clear");
    searchClearBtn.setAttribute("aria-label", "검색 지우기");
    searchClearBtn.title = "검색 지우기";
    searchClearBtn.hidden = true;
    searchClearBtn.innerHTML = '<span aria-hidden="true">×</span>';

    function syncSearchClearUi() {
      const has = !!(searchInput.value || "").length;
      lpTokenToggle(searchInner, "has-value", has);
      searchClearBtn.hidden = !has;
    }

    searchInner.appendChild(searchInput);
    searchInner.appendChild(searchClearBtn);
    searchWrap.appendChild(searchInner);
    panel.appendChild(searchWrap);

    const chipsWrap = document.createElement("div");
    lpSetClasses(chipsWrap, "time-task-log-task-dropdown-buckets");
    chipsWrap.setAttribute("role", "tablist");
    chipsWrap.setAttribute("aria-label", "과제 구역");
    getVisibleChips().forEach(({ id, label: chipLabel }) => {
      const b = document.createElement("button");
      b.type = "button";
      lpSetClasses(b, "time-task-log-task-dropdown-bucket");
      b.dataset.bucket = id;
      b.textContent = chipLabel;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", id === pickerBucket ? "true" : "false");
      if (id === pickerBucket) lpTokenAdd(b, "is-active");
      const pickBucket = (e) => {
        e.preventDefault();
        e.stopPropagation();
        pickerBucket = id;
        chipsWrap
          .querySelectorAll(
            ".time-task-log-task-dropdown-bucket, [data-legacy~='time-task-log-task-dropdown-bucket']",
          )
          .forEach((x) => {
            const on = x.dataset.bucket === id;
            lpTokenToggle(x, "is-active", on);
            x.setAttribute("aria-selected", on ? "true" : "false");
          });
        if (optionsContainer) {
          renderOptions(optionsContainer, searchQuery);
          optionsContainer.scrollTop = 0;
        }
      };
      b.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        pickBucket(e);
      });
      b.addEventListener("click", pickBucket);
      chipsWrap.appendChild(b);
    });
    panel.appendChild(chipsWrap);

    optionsContainer = document.createElement("div");
    lpSetClasses(optionsContainer, "time-task-log-task-dropdown-options");
    panel.appendChild(optionsContainer);
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      syncSearchClearUi();
      renderOptions(optionsContainer, searchQuery);
    });
    function bindPickerSearchKeyboard(input) {
      if (!isTaskLogPickerMobile()) return;

      const bindIosScrollLock = () => {
        pickerSearchKeyboardAc?.abort();
        if (!isIosLikeMobile()) return;
        pickerSearchKeyboardAc = new AbortController();
        const { signal } = pickerSearchKeyboardAc;
        const run = () => {
          lockPageScrollForModalKeyboard();
          syncPanelMaxHeight();
        };
        window.visualViewport?.addEventListener("resize", run, {
          passive: true,
          signal,
        });
        window.visualViewport?.addEventListener("scroll", run, {
          passive: true,
          signal,
        });
        run();
      };

      input.addEventListener("focus", () => {
        bindIosScrollLock();
        syncVisualViewportKeyboardInset();
        lockPageScrollForModalKeyboard();
        syncPanelMaxHeight();
        requestAnimationFrame(() => {
          syncVisualViewportKeyboardInset();
          lockPageScrollForModalKeyboard();
          syncPanelMaxHeight();
        });
        window.setTimeout(() => {
          syncVisualViewportKeyboardInset();
          syncPanelMaxHeight();
        }, 120);
      });

      input.addEventListener("blur", () => {
        pickerSearchKeyboardAc?.abort();
        pickerSearchKeyboardAc = null;
        window.setTimeout(() => {
          if (document.activeElement === input) return;
          syncVisualViewportKeyboardInset();
          syncPanelMaxHeight();
        }, 80);
      });
    }

    bindPickerSearchKeyboard(searchInput);
    searchInput.addEventListener("click", (e) => e.stopPropagation());
    searchInput.addEventListener("keydown", (e) => e.stopPropagation());
    searchClearBtn.addEventListener("mousedown", (e) => {
      e.stopPropagation();
    });
    searchClearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      searchInput.value = "";
      searchQuery = "";
      syncSearchClearUi();
      renderOptions(optionsContainer, searchQuery);
      const dismissSearchKeyboard = () => {
        try {
          searchInput.blur();
        } catch (_) {}
        if (document.activeElement === searchInput) {
          try {
            trigger.focus({ preventScroll: true });
            trigger.blur();
          } catch (_) {}
        }
      };
      dismissSearchKeyboard();
      requestAnimationFrame(dismissSearchKeyboard);
    });
    syncSearchClearUi();
    renderOptions(optionsContainer, searchQuery);
  }

  function openMobileSheet() {
    closePanel();
    onDismissBlockingLayers();
    if (mobilePicker.isOpen()) {
      mobilePicker.close();
    } else {
      mobilePicker.open();
    }
  }

  function openPanelAfterRender() {
    if (isTaskLogPickerMobile()) {
      openMobileSheet();
      return;
    }
    panel.hidden = false;
    setPanelOpen(true);
    syncPanelMaxHeight();
  }

  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");
  let mobilePickerActivateLockUntil = 0;

  function activateTaskPicker(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isTaskLogPickerMobile()) {
      const now = Date.now();
      if (now < mobilePickerActivateLockUntil) return;
      mobilePickerActivateLockUntil = now + 450;
      openMobileSheet();
      return;
    }
    searchQuery = "";
    ensurePickerBucketInAllowed();
    renderPanel();
    if (panel.hidden) {
      openPanelAfterRender();
    } else {
      closePanel();
    }
    /* 과제 검색 — 사용자가 입력칸을 직접 탭할 때만 키보드(드롭다운 열기만으로 포커스 금지) */
  }

  const onTriggerActivate = (e) => activateTaskPicker(e);

  trigger.addEventListener("click", onTriggerActivate);
  if (isTaskLogPickerMobile()) {
    const taskField = wrap.closest(
      ".time-task-log-field, [data-legacy~='time-task-log-field']",
    );
    if (taskField instanceof HTMLElement) {
      const openFromTaskField = (e) => {
        if (
          e.target.closest(
            ".time-task-log-task-dropdown-panel, [data-legacy~='time-task-log-task-dropdown-panel']",
          )
        ) {
          return;
        }
        activateTaskPicker(e);
      };
      taskField.addEventListener("click", openFromTaskField, true);
    }
  }
  const closePanelOnOutside = (e) => {
    if (isTaskLogPickerMobile()) return;
    if (panel.hidden) return;
    if (!wrap.contains(e.target)) closePanel();
  };
  const opts = { capture: true };
  if (abortSignal) opts.signal = abortSignal;
  document.addEventListener("mousedown", closePanelOnOutside, opts);
  document.addEventListener("touchstart", closePanelOnOutside, opts);
  wrap.appendChild(trigger);
  wrap.appendChild(panel);
  wrap._getValue = () => value;
  wrap._setValue = (v) => {
    value = v || "";
    syncTriggerLabel();
    onTaskSelected(value);
  };
  wrap._setLedgerBucketPreset = (preset) => {
    ledgerBucketPreset =
      preset === "expense" || preset === "invest" ? preset : null;
    searchQuery = "";
    ensurePickerBucketInAllowed();
    value = "";
    syncTriggerLabel();
    wrap._closePanel?.();
  };
  wrap._closePanel = () => {
    closePanel();
    mobilePicker.forceDismiss?.() || mobilePicker.close();
    onDismissBlockingLayers();
    const scroll = findTaskLogScrollArea();
    scroll?.classList?.remove?.("is-task-picker-open");
    document.documentElement.classList.remove("lp-task-log-mobile-picker-open");
  };
  wrap._getLedgerBucketPreset = () => ledgerBucketPreset;
  return wrap;
}
