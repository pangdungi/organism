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

function getProductivityFromCategory(categoryValue) {
  if (!categoryValue) return "";
  const productive = ["dream", "sideincome", "happiness", "health"];
  const nonproductive = [
    "unhappiness",
    "unhealthy",
    "moneylosing",
    "dreamblocking",
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

export function buildTimeTaskLogPickerDropdown(options = {}) {
  const { abortSignal, onTaskSelected = () => {} } = options;

  const LEDGER_BUCKET_CHIPS = [
    { id: "dream", label: "꿈" },
    { id: "happiness", label: "행복" },
    { id: "sideincome", label: "부수입" },
    { id: "health", label: "건강" },
    { id: "nonproductive", label: "비생산" },
    { id: "other", label: "그외" },
  ];

  function timeLedgerTaskLogPickerBucket(t) {
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
    if (cat === "dream") return "dream";
    if (cat === "happiness") return "happiness";
    if (cat === "sideincome") return "sideincome";
    if (cat === "health") return "health";
    return "other";
  }

  const wrap = document.createElement("div");
  lpSetClasses(wrap, "time-task-log-task-dropdown");
  const trigger = document.createElement("button");
  trigger.type = "button";
  lpSetClasses(trigger, "time-task-log-task-dropdown-trigger");
  trigger.textContent = "과제를 선택하세요";
  const panel = document.createElement("div");
  lpSetClasses(
    panel,
    "time-task-log-task-dropdown-panel time-task-log-task-dropdown-panel--ledger-buckets",
  );
  panel.hidden = true;
  let value = "";
  let searchQuery = "";
  let pickerBucket = "dream";

  function renderOptions(container, filter) {
    container.innerHTML = "";
    const q = (filter || "").trim().toLowerCase();
    const allTasks = getFullTaskOptions();
    let tasks = allTasks.filter((t) => !(t.name || "").includes(" > "));
    if (!q) {
      tasks = tasks.filter(
        (t) => timeLedgerTaskLogPickerBucket(t) === pickerBucket,
      );
    }
    if (q) {
      tasks = tasks.filter((t) => (t.name || "").toLowerCase().includes(q));
    }
    tasks.sort((a, b) => (a.name || "").localeCompare(b.name || "", "ko"));
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
      const textWrap = document.createElement("span");
      lpSetClasses(textWrap, "time-task-log-task-dropdown-option-text");
      const label = document.createElement("span");
      lpSetClasses(label, "time-task-log-task-dropdown-option-label");
      label.textContent = t.name || "";
      textWrap.appendChild(label);
      appendTaskDropdownBadges(textWrap, t);
      row.appendChild(bar);
      row.appendChild(textWrap);
      const closePanelAndSelect = () => {
        value = t.name || "";
        trigger.textContent = value || "과제를 선택하세요";
        panel.hidden = true;
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

  function renderPanel() {
    panel.innerHTML = "";
    let optionsContainer = null;

    const searchWrap = document.createElement("div");
    lpSetClasses(searchWrap, "time-task-log-task-dropdown-search-wrap");
    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "과제 검색...";
    lpSetClasses(searchInput, "time-task-log-task-dropdown-search");
    searchInput.value = searchQuery;
    searchInput.setAttribute("autocomplete", "off");
    searchWrap.appendChild(searchInput);
    panel.appendChild(searchWrap);

    const chipsWrap = document.createElement("div");
    lpSetClasses(chipsWrap, "time-task-log-task-dropdown-buckets");
    chipsWrap.setAttribute("role", "tablist");
    chipsWrap.setAttribute("aria-label", "과제 구역");
    LEDGER_BUCKET_CHIPS.forEach(({ id, label: chipLabel }) => {
      const b = document.createElement("button");
      b.type = "button";
      lpSetClasses(b, "time-task-log-task-dropdown-bucket");
      b.dataset.bucket = id;
      b.textContent = chipLabel;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", id === pickerBucket ? "true" : "false");
      if (id === pickerBucket) lpTokenAdd(b, "is-active");
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pickerBucket = id;
        chipsWrap
          .querySelectorAll(
            '[data-legacy~="time-task-log-task-dropdown-bucket"]',
          )
          .forEach((x) => {
            const on = x.dataset.bucket === id;
            lpTokenToggle(x, "is-active", on);
            x.setAttribute("aria-selected", on ? "true" : "false");
          });
        if (optionsContainer) {
          renderOptions(optionsContainer, searchQuery);
        }
      });
      chipsWrap.appendChild(b);
    });
    panel.appendChild(chipsWrap);

    optionsContainer = document.createElement("div");
    lpSetClasses(optionsContainer, "time-task-log-task-dropdown-options");
    panel.appendChild(optionsContainer);
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value.trim();
      renderOptions(optionsContainer, searchQuery);
    });
    searchInput.addEventListener("click", (e) => e.stopPropagation());
    searchInput.addEventListener("keydown", (e) => e.stopPropagation());
    renderOptions(optionsContainer, searchQuery);
  }

  trigger.addEventListener("click", () => {
    searchQuery = "";
    pickerBucket = "dream";
    renderPanel();
    panel.hidden = !panel.hidden;
    if (!panel.hidden)
      panel
        .querySelector('[data-legacy~="time-task-log-task-dropdown-search"]')
        ?.focus();
  });
  const closePanelOnOutside = (e) => {
    if (panel.hidden) return;
    if (!wrap.contains(e.target)) panel.hidden = true;
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
    trigger.textContent = value || "과제를 선택하세요";
    onTaskSelected(value);
  };
  return wrap;
}
