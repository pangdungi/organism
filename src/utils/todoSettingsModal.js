/**
 * 할일목록 환경설정 모달
 * - 완료항목 숨기기/제거 토글
 * - 리스트별 색상 설정 (파스텔 프리셋 + HEX 입력)
 */

import { getTodoSettings, saveTodoSettings, PASTEL_PRESETS, DEFAULT_SECTION_COLORS, getCustomSections, getCustomSectionColor } from "./todoSettings.js";

const FIXED_SECTIONS = [
  { id: "braindump", label: "브레인 덤프" },
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
];

function getSections() {
  return [...FIXED_SECTIONS, ...getCustomSections()];
}

function hexToRgba(hex, alpha = 0.6) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i) || hex.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
  if (!m) return null;
  const r = m[1].length === 2 ? parseInt(m[1], 16) : parseInt(m[1] + m[1], 16);
  const g = m[2].length === 2 ? parseInt(m[2], 16) : parseInt(m[2] + m[2], 16);
  const b = m[3].length === 2 ? parseInt(m[3], 16) : parseInt(m[3] + m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function rgbaToHex(rgba) {
  const m = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "";
  const r = parseInt(m[1], 10).toString(16).padStart(2, "0");
  const g = parseInt(m[2], 10).toString(16).padStart(2, "0");
  const b = parseInt(m[3], 10).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

export function createColorPickerRow(sectionId, label, currentColor, onChange) {
  const row = document.createElement("div");
  row.className = "todo-settings-color-row";
  row.innerHTML = `
    <span class="todo-settings-color-label">${label}</span>
    <div class="todo-settings-color-swatches"></div>
    <div class="todo-settings-color-hex-wrap">
      <input type="text" class="todo-settings-color-hex" placeholder="#HEX" maxlength="7" />
    </div>
  `;

  const swatchesEl = row.querySelector(".todo-settings-color-swatches");
  const hexInput = row.querySelector(".todo-settings-color-hex");

  const defaultColor = DEFAULT_SECTION_COLORS[sectionId] || getCustomSectionColor(sectionId);
  let selectedColor = currentColor || defaultColor;

  PASTEL_PRESETS.forEach((preset) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "todo-settings-color-swatch";
    btn.style.backgroundColor = preset;
    btn.dataset.color = preset;
    btn.title = preset;
    if (preset === selectedColor) btn.classList.add("selected");
    btn.addEventListener("click", () => {
      selectedColor = preset;
      swatchesEl.querySelectorAll(".todo-settings-color-swatch").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      hexInput.value = rgbaToHex(preset);
      onChange(preset);
    });
    swatchesEl.appendChild(btn);
  });

  const customBtn = document.createElement("button");
  customBtn.type = "button";
  customBtn.className = "todo-settings-color-swatch todo-settings-color-swatch-custom";
  customBtn.title = "커스텀 색상";
  customBtn.innerHTML = `<span class="todo-settings-custom-icon">#</span>`;
  if (!PASTEL_PRESETS.includes(selectedColor)) {
    customBtn.classList.add("selected");
    customBtn.style.backgroundColor = selectedColor;
  }
  customBtn.addEventListener("click", () => {
    hexInput.focus();
  });
  swatchesEl.appendChild(customBtn);

  hexInput.value = rgbaToHex(selectedColor);
  hexInput.addEventListener("input", () => {
    const val = hexInput.value.trim();
    if (/^#[0-9a-fA-F]{3,6}$/.test(val)) {
      const rgba = hexToRgba(val);
      if (rgba) {
        selectedColor = rgba;
        swatchesEl.querySelectorAll(".todo-settings-color-swatch:not(.todo-settings-color-swatch-custom)").forEach((b) => b.classList.remove("selected"));
        customBtn.classList.add("selected");
        customBtn.style.backgroundColor = rgba;
        onChange(rgba);
      }
    }
  });
  hexInput.addEventListener("blur", () => {
    const val = hexInput.value.trim();
    if (val && /^#[0-9a-fA-F]{3,6}$/.test(val)) {
      const rgba = hexToRgba(val);
      if (rgba) {
        selectedColor = rgba;
        onChange(rgba);
      }
    }
  });

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
  if (checked) toggle.classList.add("on");
  toggle.addEventListener("click", () => {
    const isOn = toggle.classList.toggle("on");
    onChange(isOn);
  });
  return row;
}

export function createTodoSettingsModal(options = {}) {
  const { onHideCompletedChange, onClearCompleted, onColorsChange } = options;
  const settings = getTodoSettings();

  const modal = document.createElement("div");
  modal.className = "todo-settings-modal";
  modal.innerHTML = `
    <div class="todo-settings-backdrop"></div>
    <div class="todo-settings-panel">
      <div class="todo-settings-header">
        <h3 class="todo-settings-title">할일 환경설정</h3>
        <button type="button" class="todo-settings-close" aria-label="닫기">×</button>
      </div>
      <div class="todo-settings-body">
        <div class="todo-settings-block">
          <h4 class="todo-settings-block-title">표시 옵션</h4>
          <div class="todo-settings-toggles"></div>
        </div>
      </div>
      <div class="todo-settings-footer">
        <button type="button" class="todo-settings-save">저장</button>
      </div>
    </div>
  `;

  const togglesEl = modal.querySelector(".todo-settings-toggles");
  const saveBtn = modal.querySelector(".todo-settings-save");
  const closeBtn = modal.querySelector(".todo-settings-close");
  const backdrop = modal.querySelector(".todo-settings-backdrop");

  let hideCompleted = settings.hideCompleted;

  const hideToggle = createToggleRow("완료항목 숨기기", hideCompleted, (v) => {
    hideCompleted = v;
  });
  togglesEl.appendChild(hideToggle);

  const clearBtnRow = document.createElement("div");
  clearBtnRow.className = "todo-settings-clear-row";
  clearBtnRow.innerHTML = `
    <span class="todo-settings-toggle-label">완료항목 모두 제거</span>
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

  function save() {
    const current = getTodoSettings();
    saveTodoSettings({ hideCompleted, sectionColors: current.sectionColors, timeCategoryColors: current.timeCategoryColors });
    onHideCompletedChange?.(hideCompleted);
    close();
  }

  saveBtn.addEventListener("click", save);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", close);

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  return modal;
}
