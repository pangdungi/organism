/**
 * 할 일 목록 환경 설정 모달
 * - 할 일만 / 일정만 보기, 완료 항목 숨기기, 완료 일괄 제거
 */

import {
  getTodoSettings,
  saveTodoSettings,
  normalizeSectionTaskListFilter,
  DEFAULT_SECTION_COLORS,
  DEFAULT_TIME_CATEGORY_COLORS,
  DEFAULT_TASK_CATEGORY_COLORS,
  getCustomSectionColor,
  APP_PRESET_COLORS,
  hexToRgba,
} from "./todoSettings.js";
import { pushAppearanceToSupabase } from "./userHourlySync.js";

function getAlphaFromRgba(rgba) {
  const m = rgba?.match(/rgba?\([^,]+,[^,]+,[^,]+,\s*([\d.]+)/);
  return m ? parseFloat(m[1]) : 0.6;
}

function rgbaToHex(rgba) {
  const m = rgba?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "";
  const r = parseInt(m[1], 10).toString(16).padStart(2, "0");
  const g = parseInt(m[2], 10).toString(16).padStart(2, "0");
  const b = parseInt(m[3], 10).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

function findClosestPresetHex(rgba) {
  const hex = rgbaToHex(rgba);
  if (!hex) return APP_PRESET_COLORS[0].hex;
  const exact = APP_PRESET_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase());
  if (exact) return exact.hex;
  const [r, g, b] = (rgba?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/) || []).slice(1).map(Number);
  if (isNaN(r)) return APP_PRESET_COLORS[0].hex;
  let best = APP_PRESET_COLORS[0].hex;
  let minDist = Infinity;
  for (const c of APP_PRESET_COLORS) {
    const m = c.hex.match(/#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i);
    if (!m) continue;
    const cr = parseInt(m[1], 16);
    const cg = parseInt(m[2], 16);
    const cb = parseInt(m[3], 16);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < minDist) {
      minDist = d;
      best = c.hex;
    }
  }
  return best;
}

function showColorPickerModal(label, currentColor, onChange) {
  const alpha = getAlphaFromRgba(currentColor);
  const currentHex = findClosestPresetHex(currentColor || "rgba(200,200,200,0.6)");

  const modal = document.createElement("div");
  modal.className = "todo-settings-color-modal";
  modal.innerHTML = `
    <div class="todo-settings-color-modal-backdrop"></div>
    <div class="todo-settings-color-modal-panel">
      <h4 class="todo-settings-color-modal-title">${label}</h4>
      <div class="todo-settings-color-modal-swatches"></div>
      <button type="button" class="todo-settings-color-modal-close">저장</button>
    </div>
  `;

  const swatchesEl = modal.querySelector(".todo-settings-color-modal-swatches");
  const closeBtn = modal.querySelector(".todo-settings-color-modal-close");

  let selectedRgba = hexToRgba(currentHex, alpha);

  APP_PRESET_COLORS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "todo-settings-color-modal-swatch";
    btn.style.backgroundColor = preset.hex;
    btn.dataset.hex = preset.hex;
    btn.title = preset.name;
    if (preset.hex.toLowerCase() === currentHex.toLowerCase()) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      swatchesEl.querySelectorAll(".todo-settings-color-modal-swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedRgba = hexToRgba(preset.hex, alpha);
    });
    swatchesEl.appendChild(btn);
  });

  function close() {
    modal.remove();
    document.body.style.overflow = "";
  }

  closeBtn.addEventListener("click", () => {
    onChange(selectedRgba);
    close();
  });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
}

export function createColorPickerRow(sectionId, label, currentColor, onChange) {
  const defaultColor = DEFAULT_SECTION_COLORS[sectionId] || getCustomSectionColor(sectionId);
  let selectedColor = currentColor || defaultColor;

  const row = document.createElement("div");
  row.className = "todo-settings-color-row todo-settings-color-row-chip";
  row.innerHTML = `
    <span class="todo-settings-color-label">${label}</span>
    <button type="button" class="todo-settings-color-chip" title="${label} 색상 선택">
      <span class="todo-settings-color-chip-inner"></span>
    </button>
  `;

  const chip = row.querySelector(".todo-settings-color-chip");
  const chipInner = row.querySelector(".todo-settings-color-chip-inner");

  function updateChip() {
    chipInner.style.backgroundColor = selectedColor;
  }

  chip.addEventListener("click", () => {
    showColorPickerModal(label, selectedColor, (rgba) => {
      selectedColor = rgba;
      updateChip();
      onChange(rgba);
    });
  });

  updateChip();

  return row;
}

function createToggleRow(label, checked, onChange) {
  const row = document.createElement("div");
  row.className = "todo-settings-toggle-row";
  row.innerHTML = `
    <span class="todo-settings-toggle-label">${label}</span>
    <button type="button" class="todo-settings-toggle" role="switch" aria-checked="${!!checked}">
      <span class="todo-settings-toggle-track"></span>
      <span class="todo-settings-toggle-thumb"></span>
    </button>
  `;
  const toggle = row.querySelector(".todo-settings-toggle");
  function setOn(on) {
    toggle.classList.toggle("on", !!on);
    toggle.setAttribute("aria-checked", on ? "true" : "false");
  }
  setOn(!!checked);
  toggle.addEventListener("click", () => {
    const isOn = !toggle.classList.contains("on");
    setOn(isOn);
    onChange(isOn);
  });
  return {
    row,
    setOn,
    getOn: () => toggle.classList.contains("on"),
  };
}

export function createTodoSettingsModal(options = {}) {
  const { onHideCompletedChange, onSectionTaskListFilterChange, onClearCompleted } =
    options;
  const settings = getTodoSettings();

  const modal = document.createElement("div");
  modal.className = "todo-settings-modal";
  modal.innerHTML = `
    <div class="todo-settings-backdrop"></div>
    <div class="todo-settings-panel">
      <div class="todo-settings-header">
        <h3 class="todo-settings-title">할 일 환경 설정</h3>
        <button type="button" class="todo-settings-close" aria-label="닫기">×</button>
      </div>
      <div class="todo-settings-body">
        <div class="todo-settings-block">
          <div class="todo-settings-toggles"></div>
        </div>
      </div>
    </div>
  `;

  const togglesEl = modal.querySelector(".todo-settings-toggles");
  const closeBtn = modal.querySelector(".todo-settings-close");

  let hideCompleted = settings.hideCompleted;
  let sectionTaskListFilter = normalizeSectionTaskListFilter(
    settings.sectionTaskListFilter,
  );

  function persistSectionTaskListFilter() {
    const cur = getTodoSettings();
    saveTodoSettings({ ...cur, sectionTaskListFilter });
    onSectionTaskListFilterChange?.(sectionTaskListFilter);
    void pushAppearanceToSupabase();
  }

  const todoOnlyToggle = createToggleRow(
    "할 일만 보기",
    sectionTaskListFilter === "todo_only",
    (on) => {
      if (on) {
        scheduleOnlyToggle.setOn(false);
        sectionTaskListFilter = "todo_only";
      } else {
        sectionTaskListFilter = scheduleOnlyToggle.getOn()
          ? "schedule_only"
          : "all";
      }
      persistSectionTaskListFilter();
    },
  );
  const scheduleOnlyToggle = createToggleRow(
    "일정만 보기",
    sectionTaskListFilter === "schedule_only",
    (on) => {
      if (on) {
        todoOnlyToggle.setOn(false);
        sectionTaskListFilter = "schedule_only";
      } else {
        sectionTaskListFilter = todoOnlyToggle.getOn() ? "todo_only" : "all";
      }
      persistSectionTaskListFilter();
    },
  );
  togglesEl.appendChild(todoOnlyToggle.row);
  togglesEl.appendChild(scheduleOnlyToggle.row);

  const hideToggle = createToggleRow("완료 항목 숨기기", hideCompleted, (v) => {
    hideCompleted = v;
    const cur = getTodoSettings();
    saveTodoSettings({ ...cur, hideCompleted: v });
    onHideCompletedChange?.(v);
    void pushAppearanceToSupabase();
  });
  togglesEl.appendChild(hideToggle.row);

  const clearBtnRow = document.createElement("div");
  clearBtnRow.className = "todo-settings-clear-row";
  clearBtnRow.innerHTML = `
    <span class="todo-settings-toggle-label">완료 항목 모두 제거</span>
    <button type="button" class="todo-settings-clear-btn">제거</button>
  `;
  clearBtnRow.querySelector(".todo-settings-clear-btn").addEventListener("click", () => {
    onClearCompleted?.();
  });
  togglesEl.appendChild(clearBtnRow);

  function close() {
    modal.remove();
    document.body.style.overflow = "";
  }

  closeBtn.addEventListener("click", close);

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  return modal;
}
