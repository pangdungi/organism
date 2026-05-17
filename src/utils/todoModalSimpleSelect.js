/**
 * 할 일 추가/수정 모달용: 네이티브 select 대신 과제 기록과 동일한 흰 패널 커스텀 드롭다운.
 * 모달 본문 overflow:auto 에서도 잘리지 않도록 패널은 position:fixed + 트리거 좌표로 연다.
 */

import { lpSetClasses } from "./timeLedgerClassPolicy.js";

const PANEL_Z = 10070;

function resetPanelBox(panel) {
  panel.style.position = "";
  panel.style.left = "";
  panel.style.top = "";
  panel.style.width = "";
  panel.style.maxHeight = "";
  panel.style.right = "";
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
  panel.style.width = `${r.width}px`;
  panel.style.maxHeight = `${maxH}px`;
  panel.style.zIndex = String(PANEL_Z);
}

/**
 * @param {object} options
 * @param {{ value: string, label: string }[]} options.items
 * @param {string} [options.value]
 * @param {string} [options.placeholder]
 * @param {string} [options.ariaLabel]
 * @param {AbortSignal} [options.abortSignal]
 * @param {(v: string) => void} [options.onChange]
 */
export function buildModalSimpleSelect(options = {}) {
  const {
    items = [],
    value: initialValue = "",
    placeholder = "선택",
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
    trigger.setAttribute("aria-expanded", panel.hidden ? "false" : "true");
  }

  const optionsEl = document.createElement("div");
  lpSetClasses(optionsEl, "time-task-log-task-dropdown-options");

  function renderOptionRows() {
    optionsEl.innerHTML = "";
    items.forEach((it) => {
      const selected = String(it.value) === String(value);
      const row = document.createElement("div");
      lpSetClasses(row, "time-task-log-task-dropdown-option");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", selected ? "true" : "false");
      const lab = document.createElement("span");
      lpSetClasses(lab, "time-task-log-task-dropdown-option-label");
      lab.textContent = it.label;
      row.appendChild(lab);
      const pick = () => {
        value = String(it.value);
        panel.hidden = true;
        resetPanelBox(panel);
        syncTrigger();
        renderOptionRows();
        onChange?.(value);
      };
      row.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      row.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        pick();
      });
      optionsEl.appendChild(row);
    });
  }

  panel.appendChild(optionsEl);
  renderOptionRows();
  syncTrigger();

  function closePanel() {
    if (!panel.hidden) {
      panel.hidden = true;
      resetPanelBox(panel);
      syncTrigger();
    }
  }

  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel.hidden) {
      panel.hidden = false;
      layoutFixedPanel(trigger, panel);
      syncTrigger();
      renderOptionRows();
    } else {
      closePanel();
    }
  });

  const closePanelOnOutside = (e) => {
    if (panel.hidden) return;
    if (!wrap.contains(e.target)) closePanel();
  };

  const closeOnScrollOrResize = () => closePanel();

  const listenOpts = { capture: true };
  if (abortSignal) listenOpts.signal = abortSignal;
  document.addEventListener("mousedown", closePanelOnOutside, listenOpts);
  document.addEventListener("touchstart", closePanelOnOutside, listenOpts);
  window.addEventListener("scroll", closeOnScrollOrResize, {
    capture: true,
    ...listenOpts,
  });
  window.addEventListener("resize", closeOnScrollOrResize, listenOpts);

  wrap.appendChild(trigger);
  wrap.appendChild(panel);

  wrap._getValue = () => value;
  wrap._setValue = (v) => {
    value = v === undefined || v === null ? "" : String(v);
    closePanel();
    syncTrigger();
    renderOptionRows();
  };

  return wrap;
}
