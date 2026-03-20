/**
 * 할일목록 환경설정 - localStorage
 */
const TODO_SETTINGS_KEY = "todo-settings";
const CUSTOM_SECTIONS_KEY = "todo-custom-sections";

/** 앱 정체성용 10가지 프리셋 색상 (hex) - 컬러 코드 팔레트 */
export const APP_PRESET_COLORS = [
  { id: "rose", name: "로즈", hex: "#C97A6A" },
  { id: "peach", name: "피치", hex: "#C4906A" },
  { id: "sand", name: "샌드", hex: "#B89A6A" },
  { id: "sage", name: "세이지", hex: "#8A9E82" },
  { id: "mint", name: "민트", hex: "#6B7A6E" },
  { id: "sky", name: "스카이", hex: "#7A8E9A" },
  { id: "lavender", name: "라벤더", hex: "#8A7A9E" },
  { id: "mauve", name: "모브", hex: "#9E8A8A" },
  { id: "smoke", name: "스모크", hex: "#3D4A3E" },
  { id: "slate", name: "슬레이트", hex: "#C4BEA8" },
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
  braindump: hexToRgba("#C4BEA8", 0.6),
  dream: hexToRgba("#8A9E82", 0.6),
  sideincome: hexToRgba("#B89A6A", 0.6),
  health: hexToRgba("#C97A6A", 0.6),
  happy: hexToRgba("#C4906A", 0.6),
};

/** 시간가계부 생산/비생산/기타 기본 색상 (rgba, time-tag-pill용) */
export const DEFAULT_TIME_CATEGORY_COLORS = {
  productive: hexToRgba("#C97A6A", 0.9),
  nonproductive: hexToRgba("#7A8E9A", 0.9),
  other: hexToRgba("#8A9E82", 0.9),
};

/** 시간가계부 작업(세부) 카테고리 기본 색상 - .time-tag-pill.cat-* 배경 */
export const DEFAULT_TASK_CATEGORY_COLORS = {
  "": hexToRgba("#C4BEA8", 0.5),
  dream: hexToRgba("#8A9E82", 0.7),
  sideincome: hexToRgba("#B89A6A", 0.7),
  happiness: hexToRgba("#C4906A", 0.7),
  health: hexToRgba("#C97A6A", 0.7),
  pleasure: hexToRgba("#C4906A", 0.7),
  dreamblocking: hexToRgba("#8A7A9E", 0.7),
  unhappiness: hexToRgba("#8A7A9E", 0.65),
  unhealthy: hexToRgba("#7A8E9A", 0.7),
  moneylosing: hexToRgba("#C97A6A", 0.65),
  work: hexToRgba("#7A8E9A", 0.7),
  sleep: hexToRgba("#8A7A9E", 0.75),
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

/**
 * 리스트(섹션) 색상 조회. 월별 캘린더 태스크 색상은 이 값만 사용한다.
 * 나의 계정 → 리스트 색상에서 고른 컬러(todoSettings.sectionColors) 및 기본값(DEFAULT_SECTION_COLORS),
 * 미지정 시 앱 컬러팔레트(APP_PRESET)에서만 fallback.
 */
export function getSectionColor(sectionId) {
  const s = getTodoSettings();
  return (
    s.sectionColors[sectionId] ||
    DEFAULT_SECTION_COLORS[sectionId] ||
    CUSTOM_SECTION_COLOR_POOL[Math.abs(hashCode(String(sectionId || ""))) % CUSTOM_SECTION_COLOR_POOL.length]
  );
}

export function getTimeCategoryColor(key) {
  const s = getTodoSettings();
  return s.timeCategoryColors?.[key] || DEFAULT_TIME_CATEGORY_COLORS[key] || "rgba(232,232,232,0.9)";
}

/** 작업(세부) 카테고리 색상 조회 - 쾌락충족·꿈방해·불행·비건강·돈잃는일·근무·수면 등만 작업 카테고리 설정 사용 */
export function getTaskCategoryColor(key) {
  const s = getTodoSettings();
  const taskColors = s.taskCategoryColors || DEFAULT_TASK_CATEGORY_COLORS;
  return taskColors[key] ?? DEFAULT_TASK_CATEGORY_COLORS[key] ?? "rgba(212, 212, 208, 0.5)";
}

/** 작업 카테고리 색상 조회 - 꿈/부수입/건강/행복은 리스트 색상, 나머지는 작업 카테고리 설정 */
export function getCategoryColorForReport(key) {
  const sectionMap = { dream: "dream", sideincome: "sideincome", happiness: "happy", health: "health" };
  const sectionId = sectionMap[key];
  if (sectionId) return getSectionColor(sectionId);
  if (key === "productive_consumption") return getSectionColor("sideincome");
  return getTaskCategoryColor((key || "").trim());
}

/** rgba → rgb 변환 (텍스트 색상용 불투명 색) */
function rgbaToRgb(rgbaStr) {
  const m = rgbaStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return rgbaStr;
  return `rgb(${m[1]}, ${m[2]}, ${m[3]})`;
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
  const prodRgb = rgbaToRgb(productive);
  const nonprodRgb = rgbaToRgb(nonproductive);
  styleEl.textContent = `
    .time-tag-pill.prod-pink { background: ${productive} !important; color: #fff !important; }
    .time-tag-pill.prod-blue { background: ${nonproductive} !important; color: #fff !important; }
    .time-tag-pill.prod-green { background: ${other} !important; color: #fff !important; }
    .time-tag-pill.prod-empty,
    .time-tag-pill.cat-empty { background: var(--ui-surface-alt) !important; color: var(--text-muted) !important; }
    .time-task-prod-bar--productive { background: ${productive} !important; }
    .time-task-prod-bar--nonproductive { background: ${nonproductive} !important; }
    .time-task-prod-bar--other { background: ${other} !important; }
    .time-dash-donut-seg.prod-pink { stroke: ${productive} !important; }
    .time-dash-donut-seg.prod-blue { stroke: ${nonproductive} !important; }
    .time-dash-donut-seg.prod-green { stroke: ${other} !important; }
    .time-dash-bar-fill.prod-pink { background: ${productive} !important; }
    .time-dash-bar-fill.prod-blue { background: ${nonproductive} !important; }
    .time-dash-bar-fill.prod-green { background: ${other} !important; }
    .time-audit-available-value-plus .time-audit-available-num { color: ${prodRgb} !important; }
    .time-audit-available-value-minus .time-audit-available-num { color: ${nonprodRgb} !important; }
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

/** 저장된 작업(세부) 카테고리 색상을 DOM에 적용. 꿈/부수입/행복/건강은 리스트 색상, 나머지는 작업 카테고리 설정 */
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
    if (!bg) return "";
    return `.time-tag-pill.${cls}, .time-dash-bar-fill.${cls} { background: ${bg} !important; }`;
  }).filter(Boolean);
  styleEl.textContent = rules.join("\n");
}
