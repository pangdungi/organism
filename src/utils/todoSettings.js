/**
 * 할일목록 환경설정 - localStorage
 */
const TODO_SETTINGS_KEY = "todo-settings";
const CUSTOM_SECTIONS_KEY = "todo-custom-sections";

/**
 * 앱 정체성용 프리셋 (hex) — 기본 10색 + Behr 세이지/클래식/올리브 차트 12색 (공개 RGB·hex 근사값)
 * Fertile Green은 차트 코드 오기 가능 → Behr 명칭 기준 S340-6 반영
 */
export const APP_PRESET_COLORS = [
  { id: "rose", name: "테라코타 레드", hex: "#C97A6A" },
  { id: "peach", name: "오렌지 브라운 · 피치", hex: "#C4906A" },
  { id: "sand", name: "오렌지 브라운 · 샌드", hex: "#B89A6A" },
  { id: "sage", name: "그린 · 세이지", hex: "#8A9E82" },
  { id: "mint", name: "그린 · 민트", hex: "#6B7A6E" },
  { id: "sky", name: "슬레이트 블루", hex: "#7A8E9A" },
  { id: "lavender", name: "머브", hex: "#8A7A9E" },
  { id: "mauve", name: "로즈", hex: "#9E8A8A" },
  { id: "smoke", name: "그린 · 포레스트", hex: "#3D4A3E" },
  { id: "slate", name: "뉴트럴", hex: "#C4BEA8" },
  { id: "behr-chinese-jade", name: "Behr · Chinese Jade (PPU10-09)", hex: "#CBD1BA" },
  { id: "behr-laurel-mist", name: "Behr · Laurel Mist (430E-3)", hex: "#ACB5A1" },
  { id: "behr-cameroon-green", name: "Behr · Cameroon Green (PPU12-17)", hex: "#60746D" },
  { id: "behr-secluded-woods", name: "Behr · Secluded Woods (S420-7)", hex: "#41534A" },
  { id: "behr-cavan", name: "Behr · Cavan (M380-1)", hex: "#DCE2CE" },
  { id: "behr-chopped-dill", name: "Behr · Chopped Dill (M380-4)", hex: "#B3C09F" },
  { id: "behr-greener-pastures", name: "Behr · Greener Pastures (S410-6)", hex: "#637C65" },
  { id: "behr-deep-jungle", name: "Behr · Deep Jungle (470F-7)", hex: "#3F564A" },
  { id: "behr-bay-water", name: "Behr · Bay Water (S380-4)", hex: "#AAAD94" },
  { id: "behr-fertile-green", name: "Behr · Fertile Green (S340-6)", hex: "#8B8757" },
  { id: "behr-amazon-jungle", name: "Behr · Amazon Jungle (PPU9-24)", hex: "#686747" },
  { id: "behr-down-to-earth", name: "Behr · Down-to-Earth (S360-7)", hex: "#5C6242" },
];

export function hexToRgba(hex, alpha = 0.6) {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i) || hex.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
  if (!m) return null;
  const r = m[1].length === 2 ? parseInt(m[1], 16) : parseInt(m[1] + m[1], 16);
  const g = m[2].length === 2 ? parseInt(m[2], 16) : parseInt(m[2] + m[2], 16);
  const b = m[3].length === 2 ? parseInt(m[3], 16) : parseInt(m[3] + m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 프리셋 rgba (리스트용 alpha 0.6) */
export const APP_PRESET_RGBA_LIST = APP_PRESET_COLORS.map((c) => hexToRgba(c.hex, 0.6));

/** 프리셋 rgba (시간가계부 생산성용 alpha 0.9) */
export const APP_PRESET_RGBA_TIME = APP_PRESET_COLORS.map((c) => hexToRgba(c.hex, 0.9));

function hashCode(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return h;
}

/**
 * 저장된 rgba/rgb를 프리셋 팔레트 중 가장 가까운 색으로 맞춤(알파 유지).
 * 파스텔·임의 hex로 저장된 값도 로드 시 팔레트로만 쓰이게 함.
 */
export function snapRgbaToNearestPreset(colorStr) {
  if (typeof colorStr !== "string") return colorStr;
  const m = colorStr
    .trim()
    .match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
  if (!m) return colorStr;
  const r = parseInt(m[1], 10);
  const g = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
  let bestHex = APP_PRESET_COLORS[0].hex;
  let minD = Infinity;
  for (const c of APP_PRESET_COLORS) {
    const hm = c.hex.match(/^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (!hm) continue;
    const cr = parseInt(hm[1], 16);
    const cg = parseInt(hm[2], 16);
    const cb = parseInt(hm[3], 16);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < minD) {
      minD = d;
      bestHex = c.hex;
    }
  }
  const snapped = hexToRgba(bestHex, a);
  return snapped || colorStr;
}

function snapStoredColorValue(v) {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (/^rgba?\(/i.test(t)) return snapRgbaToNearestPreset(t);
  if (/^#[a-f\d]{3,8}$/i.test(t)) {
    const full =
      t.length === 4
        ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`
        : t.length >= 7
          ? t.slice(0, 7)
          : t;
    const asRgba = hexToRgba(full, 0.6);
    return asRgba ? snapRgbaToNearestPreset(asRgba) : v;
  }
  return v;
}

function snapSettingsColorMaps(settings) {
  let wasMutated = false;
  const snapRecord = (rec) => {
    if (!rec || typeof rec !== "object") return rec;
    const out = { ...rec };
    for (const k of Object.keys(out)) {
      const next = snapStoredColorValue(out[k]);
      if (next !== out[k]) {
        out[k] = next;
        wasMutated = true;
      }
    }
    return out;
  };
  return {
    settings: {
      ...settings,
      sectionColors: snapRecord(settings.sectionColors),
      timeCategoryColors: snapRecord(settings.timeCategoryColors),
      taskCategoryColors: snapRecord(settings.taskCategoryColors),
    },
    wasMutated,
  };
}

/** rgba 배경에 맞는 명도 대비용 글자색(프리셋 톤용) */
function pillTextColorForRgbaBg(rgbaStr) {
  const m = rgbaStr?.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return "#ffffff";
  const r = parseInt(m[1], 10) / 255;
  const g = parseInt(m[2], 10) / 255;
  const b = parseInt(m[3], 10) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.62 ? "#3D4A3E" : "#ffffff";
}

/** 할일 분류 칩 등 프리셋 rgba 배경 위 글자색 */
export function readableTextForPresetRgbaBg(rgbaStr) {
  return pillTextColorForRgbaBg(rgbaStr);
}

/** 신규 리스트·칩 등에 쓸 프리셋 중 무작위 rgba */
export function pickRandomPresetRgba(alpha = 0.6) {
  const i = Math.floor(Math.random() * APP_PRESET_COLORS.length);
  return hexToRgba(APP_PRESET_COLORS[i].hex, alpha) || hexToRgba(APP_PRESET_COLORS[0].hex, alpha);
}

/**
 * 리스트 기본 색 (프리셋만)
 * 꿈·부수입·건강·행복 = 지정 4색, 브레인 덤프는 그 외 팔레트 톤
 */
export const DEFAULT_SECTION_COLORS = {
  braindump: hexToRgba("#8B8757", 0.6),
  dream: hexToRgba("#8A7A9E", 0.6),
  sideincome: hexToRgba("#C4BEA8", 0.6),
  health: hexToRgba("#3D4A3E", 0.6),
  happy: hexToRgba("#9E8A8A", 0.6),
};

/**
 * 시간가계부 생산성 3분류 기본 색 (10색 팔레트와 동일 hex, 알파 0.9)
 * - 생산: 테라코타 레드 #C97A6A
 * - 비생산: 슬레이트 블루 #7A8E9A
 * - 기타: 그린(세이지) #8A9E82
 */
export const DEFAULT_TIME_CATEGORY_COLORS = {
  productive: hexToRgba("#C97A6A", 0.9),
  nonproductive: hexToRgba("#7A8E9A", 0.9),
  other: hexToRgba("#8A9E82", 0.9),
};

/** 생산성 색 프리셋 개편 시 버전 올리면, 저장값 없거나 구버전이면 아래 기본으로 일괄 적용 */
const TIME_CATEGORY_PRESET_VERSION = 1;

/** 고정 리스트(브레인덤프·꿈·부수입·건강·행복) 기본색 재배치 시 버전 증가 */
const SECTION_LIST_PRESET_VERSION = 1;

/**
 * 작업(세부) 카테고리 기본색 — 꿈/부수입/행복/건강은 리스트 4색과 동일(폴백용),
 * 그외·쾌락충족 등은 위 4색을 쓰지 않는 팔레트로 서로 다르게
 */
export const DEFAULT_TASK_CATEGORY_COLORS = {
  "": hexToRgba("#C97A6A", 0.5),
  dream: hexToRgba("#8A7A9E", 0.7),
  sideincome: hexToRgba("#C4BEA8", 0.7),
  happiness: hexToRgba("#9E8A8A", 0.7),
  health: hexToRgba("#3D4A3E", 0.7),
  pleasure: hexToRgba("#C4906A", 0.7),
  dreamblocking: hexToRgba("#B89A6A", 0.7),
  unhappiness: hexToRgba("#8A9E82", 0.65),
  unhealthy: hexToRgba("#6B7A6E", 0.7),
  moneylosing: hexToRgba("#7A8E9A", 0.65),
  work: hexToRgba("#60746D", 0.7),
  sleep: hexToRgba("#B3C09F", 0.75),
};

/** 작업 세부 기본색 일괄 갱신(구버전 로컬 덮어쓰기) */
const TASK_SUBCATEGORY_PRESET_VERSION = 1;

/** 커스텀 리스트용 기본 색상 풀 (프리셋 전체) */
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
    const color = pickRandomPresetRgba(0.6);
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

/** @deprecated 팔레트 선택용 - APP_PRESET_RGBA_LIST 사용 */
export const PASTEL_PRESETS = APP_PRESET_RGBA_LIST;

export function getTodoSettings() {
  try {
    const raw = localStorage.getItem(TODO_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const timePresetOk =
        Number(parsed.timeCategoryPresetVersion) === TIME_CATEGORY_PRESET_VERSION;
      const timeCategoryColors = timePresetOk
        ? { ...DEFAULT_TIME_CATEGORY_COLORS, ...parsed.timeCategoryColors }
        : { ...DEFAULT_TIME_CATEGORY_COLORS };

      const sectionPresetOk =
        Number(parsed.sectionListPresetVersion) === SECTION_LIST_PRESET_VERSION;
      let sectionColors;
      if (sectionPresetOk) {
        sectionColors = { ...DEFAULT_SECTION_COLORS, ...parsed.sectionColors };
      } else {
        sectionColors = { ...DEFAULT_SECTION_COLORS };
        const prevSec = parsed.sectionColors || {};
        for (const k of Object.keys(prevSec)) {
          if (String(k).startsWith("custom-")) sectionColors[k] = prevSec[k];
        }
      }

      const taskSubOk =
        Number(parsed.taskSubcategoryPresetVersion) ===
        TASK_SUBCATEGORY_PRESET_VERSION;
      const taskCategoryColors = taskSubOk
        ? { ...DEFAULT_TASK_CATEGORY_COLORS, ...parsed.taskCategoryColors }
        : { ...DEFAULT_TASK_CATEGORY_COLORS };

      const merged = {
        hideCompleted: !!parsed.hideCompleted,
        sectionColors,
        timeCategoryColors,
        taskCategoryColors,
      };
      const { settings, wasMutated } = snapSettingsColorMaps(merged);
      const needPersistTimePreset = !timePresetOk;
      const needPersistSectionPreset = !sectionPresetOk;
      const needPersistTaskSub = !taskSubOk;
      if (
        wasMutated ||
        needPersistTimePreset ||
        needPersistSectionPreset ||
        needPersistTaskSub
      ) {
        try {
          localStorage.setItem(
            TODO_SETTINGS_KEY,
            JSON.stringify({
              hideCompleted: settings.hideCompleted,
              sectionColors: settings.sectionColors,
              timeCategoryColors: settings.timeCategoryColors,
              taskCategoryColors: settings.taskCategoryColors,
              timeCategoryPresetVersion: TIME_CATEGORY_PRESET_VERSION,
              sectionListPresetVersion: SECTION_LIST_PRESET_VERSION,
              taskSubcategoryPresetVersion: TASK_SUBCATEGORY_PRESET_VERSION,
            }),
          );
        } catch (_) {}
      }
      return settings;
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
    localStorage.setItem(
      TODO_SETTINGS_KEY,
      JSON.stringify({
        ...settings,
        timeCategoryPresetVersion: TIME_CATEGORY_PRESET_VERSION,
        sectionListPresetVersion: SECTION_LIST_PRESET_VERSION,
        taskSubcategoryPresetVersion: TASK_SUBCATEGORY_PRESET_VERSION,
      }),
    );
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
  return (
    s.timeCategoryColors?.[key] ||
    DEFAULT_TIME_CATEGORY_COLORS[key] ||
    hexToRgba(APP_PRESET_COLORS[0].hex, 0.9)
  );
}

/** 작업(세부) 카테고리 색상 조회 - 쾌락충족·꿈방해·불행·비건강·돈잃는일·근무·수면 등만 작업 카테고리 설정 사용 */
export function getTaskCategoryColor(key) {
  const s = getTodoSettings();
  const taskColors = s.taskCategoryColors || DEFAULT_TASK_CATEGORY_COLORS;
  return (
    taskColors[key] ??
    DEFAULT_TASK_CATEGORY_COLORS[key] ??
    hexToRgba(APP_PRESET_COLORS[0].hex, 0.5)
  );
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
    const fg = pillTextColorForRgbaBg(bg);
    return `.time-tag-pill.${cls}, .time-dash-bar-fill.${cls} { background: ${bg} !important; color: ${fg} !important; }`;
  }).filter(Boolean);
  styleEl.textContent = rules.join("\n");
}

/** 로그아웃·계정 전환 — 할일 환경설정·커스텀 리스트·분류 칩 캐시가 다른 계정과 섞이지 않게 */
export function clearTodoSettingsAndCustomSectionsOnSignOut() {
  try {
    localStorage.removeItem(TODO_SETTINGS_KEY);
    localStorage.removeItem(CUSTOM_SECTIONS_KEY);
    localStorage.removeItem("todo_category_options");
    localStorage.removeItem("lp-todo-main-fixed-tab-index");
  } catch (_) {}
}
