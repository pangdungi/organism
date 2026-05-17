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

/** 메인 할 일/일정 탭: 표시 범위 */
export function normalizeSectionTaskListFilter(v) {
  if (v === "todo_only" || v === "schedule_only") return v;
  return "all";
}

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
 * KPI 고정 리스트색 (코드 고정)
 * 브레인 덤프 빨강 · 꿈·부수입·행복·건강 = 차가운 파스텔(Mist·Seafoam·Periwinkle·Sage Mist)
 */
export const DEFAULT_SECTION_COLORS = {
  braindump: hexToRgba("#FF6B6B", 0.6),
  dream: hexToRgba("#D8EEF2", 0.6),
  sideincome: hexToRgba("#D6EBE8", 0.6),
  health: hexToRgba("#E4EEE8", 0.6),
  happy: hexToRgba("#D8E4F0", 0.6),
};

/**
 * 시간가계부 생산성 3분류 기본 색 — 홈「지금 진행 중」·막대·태그·리스트 카드와 통일
 * - 생산: #FFABAB
 * - 비생산: #AFCBE6
 * - 기타: #A8D5A2 (Foam Green 계열)
 */
export const DEFAULT_TIME_CATEGORY_COLORS = {
  productive: hexToRgba("#FFABAB", 0.94),
  nonproductive: hexToRgba("#AFCBE6", 0.94),
  other: hexToRgba("#A8D5A2", 0.94),
};

/** 생산성 색 프리셋 개편 시 버전 올리면, 저장값 없거나 구버전이면 아래 기본으로 일괄 적용 */
const TIME_CATEGORY_PRESET_VERSION = 4;

/** 고정 리스트(브레인덤프·꿈·부수입·건강·행복) 기본색 재배치 시 버전 증가 */
const SECTION_LIST_PRESET_VERSION = 3;

/**
 * 작업(세부) 카테고리 기본색 — 꿈/부수입/행복/건강은 리스트 KPI색과 동일(폴백용),
 * 그외·쾌락충족 등은 위 4색을 쓰지 않는 팔레트로 서로 다르게
 */
export const DEFAULT_TASK_CATEGORY_COLORS = {
  "": hexToRgba("#C97A6A", 0.5),
  dream: hexToRgba("#D8EEF2", 0.7),
  sideincome: hexToRgba("#D6EBE8", 0.7),
  happiness: hexToRgba("#D8E4F0", 0.7),
  health: hexToRgba("#E4EEE8", 0.7),
  pleasure: hexToRgba("#C4906A", 0.7),
  dreamblocking: hexToRgba("#B89A6A", 0.7),
  media_watch: hexToRgba("#A67C8A", 0.72),
  unhappiness: hexToRgba("#8A9E82", 0.65),
  unhealthy: hexToRgba("#6B7A6E", 0.7),
  moneylosing: hexToRgba("#7A8E9A", 0.65),
  work: hexToRgba("#60746D", 0.7),
  sleep: hexToRgba("#B3C09F", 0.75),
};

/** 작업 세부 기본색 일괄 갱신(구버전 로컬 덮어쓰기) */
const TASK_SUBCATEGORY_PRESET_VERSION = 2;

/** 커스텀 리스트용 기본 색상 풀 (프리셋 전체) */
const CUSTOM_SECTION_COLOR_POOL = APP_PRESET_RGBA_LIST;

/** 고정 5리스트는 앱 기본색, 커스텀 리스트는 id 기준 안정 해시로만 배정(사용자 지정 없음) */
function resolveSectionListColor(sectionId) {
  const id = String(sectionId || "");
  const fixed = DEFAULT_SECTION_COLORS[id];
  if (fixed) return fixed;
  return CUSTOM_SECTION_COLOR_POOL[Math.abs(hashCode(id)) % CUSTOM_SECTION_COLOR_POOL.length];
}

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
  return getSectionColor(sectionId);
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
        sectionTaskListFilter: normalizeSectionTaskListFilter(
          parsed.sectionTaskListFilter,
        ),
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
              sectionTaskListFilter: settings.sectionTaskListFilter,
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
    sectionTaskListFilter: "all",
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
 * 리스트(섹션) 색상 — KPI 고정 5종은 DEFAULT_SECTION_COLORS, 커스텀은 id 해시 풀.
 * 월 캘린더·탭 강조 등은 이 값을 쓴다.
 */
export function getSectionColor(sectionId) {
  return resolveSectionListColor(sectionId);
}

/**
 * 할일목록 일정 마커(동그라미) 등 — 배경 파스텔(getSectionColor)과 달리 눈에 띄는 불투명색
 */
export function getSectionMarkerColor(sectionId) {
  const ink = { r: 42, g: 56, b: 40 };
  const blend = 0.42;
  const mix = (r, g, b) =>
    `rgb(${Math.round(r * (1 - blend) + ink.r * blend)}, ${Math.round(g * (1 - blend) + ink.g * blend)}, ${Math.round(b * (1 - blend) + ink.b * blend)})`;

  const base = getSectionColor(sectionId);
  const rgbStr = rgbaToRgb(base);
  const m = rgbStr.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) return mix(Number(m[1]), Number(m[2]), Number(m[3]));
  const t = String(base || "").trim();
  if (t.startsWith("#")) {
    const full =
      t.length === 4
        ? `#${t[1]}${t[1]}${t[2]}${t[2]}${t[3]}${t[3]}`
        : t.length === 7
          ? t
          : "";
    if (full) {
      const r = parseInt(full.slice(1, 3), 16);
      const g = parseInt(full.slice(3, 5), 16);
      const b = parseInt(full.slice(5, 7), 16);
      return mix(r, g, b);
    }
  }
  return "var(--text-ink)";
}

export function getTimeCategoryColor(key) {
  const k =
    key === "productive"
      ? "productive"
      : key === "nonproductive"
        ? "nonproductive"
        : "other";
  const s = getTodoSettings();
  return (
    (s.timeCategoryColors && s.timeCategoryColors[k]) ||
    DEFAULT_TIME_CATEGORY_COLORS[k] ||
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

function rgbStringToHex6(rgbStr) {
  const m = String(rgbStr || "").match(
    /rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/,
  );
  if (!m) return null;
  const h = (x) =>
    Math.min(255, Math.max(0, parseInt(x, 10)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(m[1])}${h(m[2])}${h(m[3])}`;
}

/**
 * 생산/비생산/기타 — 홈 과제 막대·제목 등에 쓰는 불투명 6자리 hex
 * (설정의 rgba를 rgb로 올린 뒤 변환; 기본 #FFABAB / #AFCBE6 / #A8D5A2)
 */
export function getTimeCategorySolidHex(prodKey) {
  const k =
    prodKey === "productive"
      ? "productive"
      : prodKey === "nonproductive"
        ? "nonproductive"
        : "other";
  const s = getTodoSettings();
  const rgba =
    (s.timeCategoryColors && s.timeCategoryColors[k]) ||
    DEFAULT_TIME_CATEGORY_COLORS[k] ||
    DEFAULT_TIME_CATEGORY_COLORS.other;
  const hex = rgbStringToHex6(rgbaToRgb(rgba));
  if (hex) return hex;
  return k === "productive"
    ? "#FFABAB"
    : k === "nonproductive"
      ? "#AFCBE6"
      : "#A8D5A2";
}

/**
 * 타임블록 면 스펙 — 홈 타임라인 카드·시간 마커 배경·글자
 * 왼쪽 강조 막대는 시간가계부 리스트 카드 컬러바와 동일 톤(#FFABAB / #AFCBE6 / #A8D5A2)
 */
export const TIMETABLE_SURFACE_SPECS = {
  productive: {
    bg: "#FFF5F5",
    border: "#C97B7B",
    /** 타임라인 카드 왼쪽 세로 강조 막대 */
    leftStripe: "#FFABAB",
    textPrimary: "#6B2F2F",
    textSecondary: "#5C1818",
  },
  nonproductive: {
    bg: "#F3F8FC",
    border: "#6B8EAE",
    leftStripe: "#AFCBE6",
    textPrimary: "#2E4A62",
    textSecondary: "#083560",
  },
  other: {
    bg: "#F2F8F0",
    border: "#5E8A52",
    leftStripe: "#A8D5A2",
    textPrimary: "#2D4A28",
    textSecondary: "#1E3F08",
  },
};

function timetableSurfaceEntry(key) {
  const s = TIMETABLE_SURFACE_SPECS[key] || TIMETABLE_SURFACE_SPECS.other;
  return {
    bg: s.bg,
    border: s.border,
    leftStripe: s.leftStripe || s.border,
    accentText: s.textPrimary,
    accentMuted: s.textSecondary,
  };
}

/** rgba 문자열에서 bg(투명) / border 색으로 변환 (리스트·커스텀 과제색 타임블록용) */
function rgbaToTimetableColors(rgbaStr, bgAlpha = 0.15, borderAlpha = 0.5) {
  const m = rgbaStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return { bg: rgbaStr, border: rgbaStr };
  const [, r, g, b] = m;
  return {
    bg: `rgba(${r},${g},${b},${bgAlpha})`,
    border: `rgba(${r},${g},${b},${borderAlpha})`,
  };
}

/** 타임블록 — 생산/비생산/기타 면·테두리·글자색(TIMETABLE_SURFACE_SPECS) */
export function getTimeCategoryColorsForTimetable() {
  return {
    productive: timetableSurfaceEntry("productive"),
    nonproductive: timetableSurfaceEntry("nonproductive"),
    other: timetableSurfaceEntry("other"),
  };
}

/** 타임블록 예상 컬럼 — 동일 서피스 스펙(예상·실제 톤 통일) */
export function getTimeCategoryColorsForTimetableExpected() {
  return getTimeCategoryColorsForTimetable();
}

/** 시간가계부 생산/비생산/기타 색상을 DOM에 적용(앱 기본만) */
export function applyTimeCategoryColors() {
  const productive = DEFAULT_TIME_CATEGORY_COLORS.productive;
  const nonproductive = DEFAULT_TIME_CATEGORY_COLORS.nonproductive;
  const other = DEFAULT_TIME_CATEGORY_COLORS.other;
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
  { key: "media_watch", class: "cat-media-watch" },
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

/** 작업(세부) 카테고리 색상을 DOM에 적용. 꿈/부수입/행복/건강은 리스트 팔레트, 나머지는 기본 팔레트 */
export function applyTaskCategoryColors() {
  let styleEl = document.getElementById("task-category-colors-style");
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "task-category-colors-style";
    document.head.appendChild(styleEl);
  }
  const rules = TASK_CATEGORY_CSS_MAP.map(({ key, class: cls }) => {
    const bg =
      TASK_CATEGORY_TO_SECTION[key] != null
        ? getSectionColor(TASK_CATEGORY_TO_SECTION[key])
        : DEFAULT_TASK_CATEGORY_COLORS[key];
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
