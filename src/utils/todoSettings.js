/**
 * 할일목록 환경설정 - localStorage
 */
const TODO_SETTINGS_KEY = "todo-settings";
const CUSTOM_SECTIONS_KEY = "todo-custom-sections";

/** 앱 정체성용 10가지 프리셋 색상 (hex) */
export const APP_PRESET_COLORS = [
  { id: "rose", name: "로즈", hex: "#F2C4C4" },
  { id: "peach", name: "피치", hex: "#F2D9C4" },
  { id: "sand", name: "샌드", hex: "#F2E8C4" },
  { id: "sage", name: "세이지", hex: "#C4DCC8" },
  { id: "mint", name: "민트", hex: "#C4E0DC" },
  { id: "sky", name: "스카이", hex: "#C4D8F2" },
  { id: "lavender", name: "라벤더", hex: "#CCC4F2" },
  { id: "mauve", name: "모브", hex: "#E0C4E8" },
  { id: "smoke", name: "스모크", hex: "#D4D4D0" },
  { id: "slate", name: "슬레이트", hex: "#C8D0D8" },
];

export function hexToRgba(hex, alpha = 0.6) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i) || hex.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
  if (!m) return null;
  const r = m[1].length === 2 ? parseInt(m[1], 16) : parseInt(m[1] + m[1], 16);
  const g = m[2].length === 2 ? parseInt(m[2], 16) : parseInt(m[2] + m[2], 16);
  const b = m[3].length === 2 ? parseInt(m[3], 16) : parseInt(m[3] + m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 10가지 프리셋 rgba (리스트용 alpha 0.6) */
export const APP_PRESET_RGBA_LIST = APP_PRESET_COLORS.map((c) => hexToRgba(c.hex, 0.6));

/** 10가지 프리셋 rgba (시간가계부 생산성용 alpha 0.9) */
export const APP_PRESET_RGBA_TIME = APP_PRESET_COLORS.map((c) => hexToRgba(c.hex, 0.9));

/** 리스트 기본 색상 (10 프리셋 내) */
export const DEFAULT_SECTION_COLORS = {
  braindump: hexToRgba("#D4D4D0", 0.6),
  dream: hexToRgba("#C4DCC8", 0.6),
  sideincome: hexToRgba("#F2E8C4", 0.6),
  health: hexToRgba("#F2C4C4", 0.6),
  happy: hexToRgba("#F2D9C4", 0.6),
};

/** 시간가계부 생산/비생산/기타 기본 색상 (rgba, time-tag-pill용) */
export const DEFAULT_TIME_CATEGORY_COLORS = {
  productive: hexToRgba("#F2C4C4", 0.9),
  nonproductive: hexToRgba("#C4D8F2", 0.9),
  other: hexToRgba("#C4DCC8", 0.9),
};

/** 시간가계부 작업(세부) 카테고리 기본 색상 - .time-tag-pill.cat-* 배경 */
export const DEFAULT_TASK_CATEGORY_COLORS = {
  "": hexToRgba("#D4D4D0", 0.5),
  dream: hexToRgba("#C4DCC8", 0.7),
  sideincome: hexToRgba("#F2E8C4", 0.7),
  happiness: hexToRgba("#F2D9C4", 0.7),
  health: hexToRgba("#F2C4C4", 0.7),
  pleasure: hexToRgba("#F2D9C4", 0.7),
  dreamblocking: hexToRgba("#E0C4E8", 0.7),
  unhappiness: hexToRgba("#E0C4E8", 0.65),
  unhealthy: hexToRgba("#C8D0D8", 0.7),
  moneylosing: hexToRgba("#F2C4C4", 0.65),
  work: hexToRgba("#C4D8F2", 0.7),
  sleep: hexToRgba("#CCC4F2", 0.75),
};

/** 커스텀 리스트용 기본 색상 풀 (10 프리셋만) */
const CUSTOM_SECTION_COLOR_POOL = APP_PRESET_RGBA_LIST;

export function getCustomSections() {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr;
    }
  } catch (_) {}
  return [];
}

export function addCustomSection(label) {
  const trimmed = (label || "").trim();
  if (!trimmed) return null;
  const existing = getCustomSections();
  if (existing.some((s) => s.label === trimmed)) return null;
  const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const newSection = { id, label: trimmed };
  existing.push(newSection);
  try {
    localStorage.setItem(CUSTOM_SECTIONS_KEY, JSON.stringify(existing));
    const settings = getTodoSettings();
    const color = CUSTOM_SECTION_COLOR_POOL[existing.length % CUSTOM_SECTION_COLOR_POOL.length];
    saveTodoSettings({ ...settings, sectionColors: { ...settings.sectionColors, [id]: color } });
  } catch (_) {
    return null;
  }
  return newSection;
}

export function removeCustomSection(sectionId) {
  const existing = getCustomSections().filter((s) => s.id !== sectionId);
  try {
    localStorage.setItem(CUSTOM_SECTIONS_KEY, JSON.stringify(existing));
  } catch (_) {}
  return existing;
}

export function updateCustomSectionLabel(sectionId, newLabel) {
  const trimmed = (newLabel || "").trim();
  if (!trimmed) return null;
  const existing = getCustomSections();
  const idx = existing.findIndex((s) => s.id === sectionId);
  if (idx < 0) return null;
  if (existing.some((s) => s.label === trimmed && s.id !== sectionId)) return null;
  existing[idx] = { ...existing[idx], label: trimmed };
  try {
    localStorage.setItem(CUSTOM_SECTIONS_KEY, JSON.stringify(existing));
  } catch (_) {
    return null;
  }
  return existing[idx];
}

export function getCustomSectionColor(sectionId) {
  const settings = getTodoSettings();
  return settings.sectionColors[sectionId] || CUSTOM_SECTION_COLOR_POOL[Math.abs(hashCode(sectionId)) % CUSTOM_SECTION_COLOR_POOL.length];
}

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return h;
}

/** @deprecated 팔레트 선택용 - APP_PRESET_RGBA_LIST 사용 */
export const PASTEL_PRESETS = APP_PRESET_RGBA_LIST;

export function getTodoSettings() {
  try {
    const raw = localStorage.getItem(TODO_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        hideCompleted: !!parsed.hideCompleted,
        sectionColors: { ...DEFAULT_SECTION_COLORS, ...parsed.sectionColors },
        timeCategoryColors: { ...DEFAULT_TIME_CATEGORY_COLORS, ...parsed.timeCategoryColors },
        taskCategoryColors: { ...DEFAULT_TASK_CATEGORY_COLORS, ...parsed.taskCategoryColors },
      };
    }
  } catch (_) {}
  return {
    hideCompleted: false,
    sectionColors: { ...DEFAULT_SECTION_COLORS },
    timeCategoryColors: { ...DEFAULT_TIME_CATEGORY_COLORS },
    taskCategoryColors: { ...DEFAULT_TASK_CATEGORY_COLORS },
  };
}

export function saveTodoSettings(settings) {
  try {
    localStorage.setItem(TODO_SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {}
}

export function getSectionColor(sectionId) {
  const s = getTodoSettings();
  return s.sectionColors[sectionId] || DEFAULT_SECTION_COLORS[sectionId] || "rgba(200, 200, 200, 0.5)";
}

export function getTimeCategoryColor(key) {
  const s = getTodoSettings();
  return s.timeCategoryColors?.[key] || DEFAULT_TIME_CATEGORY_COLORS[key] || "rgba(232,232,232,0.9)";
}

/** rgba 문자열에서 bg(투명) / border 색으로 변환 (타임테이블 예상·실제 블록용) */
function rgbaToTimetableColors(rgbaStr, bgAlpha = 0.15, borderAlpha = 0.5) {
  const m = rgbaStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return { bg: rgbaStr, border: rgbaStr };
  const [, r, g, b] = m;
  return {
    bg: `rgba(${r},${g},${b},${bgAlpha})`,
    border: `rgba(${r},${g},${b},${borderAlpha})`,
  };
}

/** 타임테이블(예상/오늘 실제) 블록용 생산·비생산·기타 색상 { productive, nonproductive, other } 각 { bg, border } */
export function getTimeCategoryColorsForTimetable() {
  const s = getTodoSettings();
  const productive = s.timeCategoryColors?.productive || DEFAULT_TIME_CATEGORY_COLORS.productive;
  const nonproductive = s.timeCategoryColors?.nonproductive || DEFAULT_TIME_CATEGORY_COLORS.nonproductive;
  const other = s.timeCategoryColors?.other || DEFAULT_TIME_CATEGORY_COLORS.other;
  return {
    productive: rgbaToTimetableColors(productive, 0.1, 0.7),
    nonproductive: rgbaToTimetableColors(nonproductive, 0.1, 0.7),
    other: rgbaToTimetableColors(other, 0.1, 0.7),
  };
}

/** 타임테이블 '예상' 컬럼용 (조금 더 연한 배경) */
export function getTimeCategoryColorsForTimetableExpected() {
  const s = getTodoSettings();
  const productive = s.timeCategoryColors?.productive || DEFAULT_TIME_CATEGORY_COLORS.productive;
  const nonproductive = s.timeCategoryColors?.nonproductive || DEFAULT_TIME_CATEGORY_COLORS.nonproductive;
  const other = s.timeCategoryColors?.other || DEFAULT_TIME_CATEGORY_COLORS.other;
  return {
    productive: rgbaToTimetableColors(productive, 0.06, 0.5),
    nonproductive: rgbaToTimetableColors(nonproductive, 0.06, 0.5),
    other: rgbaToTimetableColors(other, 0.06, 0.5),
  };
}

/** 저장된 시간가계부 생산/비생산/기타 색상을 DOM에 적용 */
export function applyTimeCategoryColors() {
  const s = getTodoSettings();
  const productive = s.timeCategoryColors?.productive || DEFAULT_TIME_CATEGORY_COLORS.productive;
  const nonproductive = s.timeCategoryColors?.nonproductive || DEFAULT_TIME_CATEGORY_COLORS.nonproductive;
  const other = s.timeCategoryColors?.other || DEFAULT_TIME_CATEGORY_COLORS.other;
  let styleEl = document.getElementById("time-category-colors-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "time-category-colors-style";
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    .time-tag-pill.prod-pink { background: ${productive} !important; color: #fff !important; }
    .time-tag-pill.prod-blue { background: ${nonproductive} !important; color: #fff !important; }
    .time-tag-pill.prod-green { background: ${other} !important; color: #fff !important; }
    .time-tag-pill.prod-empty,
    .time-tag-pill.cat-empty { background: ${other} !important; color: #888 !important; }
    .time-task-prod-bar--productive { background: ${productive} !important; }
    .time-task-prod-bar--nonproductive { background: ${nonproductive} !important; }
    .time-task-prod-bar--other { background: ${other} !important; }
  `;
}

/** CSS 클래스명과 설정 키 매핑 (빈 값 → cat-empty) */
const TASK_CATEGORY_CSS_MAP = [
  { key: "", class: "cat-empty" },
  { key: "dream", class: "cat-dream" },
  { key: "sideincome", class: "cat-sideincome" },
  { key: "happiness", class: "cat-happiness" },
  { key: "health", class: "cat-health" },
  { key: "pleasure", class: "cat-pleasure" },
  { key: "dreamblocking", class: "cat-dreamblocking" },
  { key: "unhappiness", class: "cat-unhappiness" },
  { key: "unhealthy", class: "cat-unhealthy" },
  { key: "moneylosing", class: "cat-moneylosing" },
  { key: "work", class: "cat-work" },
  { key: "sleep", class: "cat-sleep" },
];

/** 리스트 색상과 통일되는 작업 카테고리 → sectionColors 키 매핑 (행복 = happy) */
const TASK_CATEGORY_TO_SECTION = {
  dream: "dream",
  sideincome: "sideincome",
  happiness: "happy",
  health: "health",
};

/** 저장된 작업(세부) 카테고리 색상을 DOM에 적용. 꿈/부수입/행복/건강은 리스트 색상(sectionColors) 사용 */
export function applyTaskCategoryColors() {
  const s = getTodoSettings();
  const taskColors = s.taskCategoryColors || DEFAULT_TASK_CATEGORY_COLORS;
  const sectionColors = s.sectionColors || {};
  let styleEl = document.getElementById("task-category-colors-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "task-category-colors-style";
    document.head.appendChild(styleEl);
  }
  const rules = TASK_CATEGORY_CSS_MAP.map(({ key, class: cls }) => {
    const bg =
      TASK_CATEGORY_TO_SECTION[key] != null
        ? sectionColors[TASK_CATEGORY_TO_SECTION[key]] ?? DEFAULT_TASK_CATEGORY_COLORS[key]
        : taskColors[key] ?? DEFAULT_TASK_CATEGORY_COLORS[key];
    return bg ? `.time-tag-pill.${cls} { background: ${bg} !important; }` : "";
  }).filter(Boolean);
  styleEl.textContent = rules.join("\n");
}
