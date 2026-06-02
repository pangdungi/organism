/**
 * 시간가계부 과제 아이콘 — time-task-picker SVG + 과제·KPI 기본 매핑.
 * iconKey(`svg:슬러그`) 우선, 없으면 기본 과제명·KPI·카테고리 fallback.
 */

import pickerSvgNames from "../../public/time-task-picker-icons.json";
import pickerIconFiles from "../../public/time-task-picker-icon-files.json";
import { canonicalMealTaskDisplayName, NAP_TASK_NAME } from "./timeTaskOptionsConstants.js";
import { DEFAULT_KPI_ICON_SLUG, DEFAULT_KPI_NAME_ICON_SLUG } from "./defaultKpiIconIds.js";

const PICKER_SVG_BASE = "/toolbaricons/time-task-picker";
const MENU_HOME_BASE = "/toolbaricons/menu-home";

/** KPI 탭 헤더 — 메인 메뉴 손그림 (picker 세트와 별도) */
export const KPI_CATEGORY_ICON_SRC = {
  dream: `${MENU_HOME_BASE}/dream-new.svg`,
  sideincome: `${MENU_HOME_BASE}/sideincome-new.svg`,
  happiness: `${MENU_HOME_BASE}/happiness-new.svg`,
  health: `${MENU_HOME_BASE}/health-new.svg`,
};

const PICKER_SVG_SET = new Set(pickerSvgNames);

/** 구 `-new` 슬러그 → 새 picker 슬러그 */
const LEGACY_PICKER_SLUG = {
  "sleep-new": "bed",
  "work-new": "laptop",
  "bed-new": "bed",
  "laptop-new": "laptop",
};

/** 기본 내장 과제명 → picker 슬러그 */
export const BUILTIN_TASK_ICON_SLUG = {
  "수면하기": "bed",
  "근무하기": "laptop",
  "생산적 소비": "money",
  "독서 및 독서노트 작성": "onebook",
  "시간기록 및 점검": "book",
  "개인 위생": "bath",
  [NAP_TASK_NAME]: "sleep",
  "건강한 섭취": "brocoli",
  "건강한 섭취 준비": "eggdrop",
  "생산적 대화 또는 모임": "happy3",
  "의식적 콘텐츠 소비": "music",
  "기록하기": "writting",
  "외모관리": "hair",
  "비생산적 소비": "credit",
  "건강하지 않은 섭취": "burger",
  "건강하지 않은 섭취 준비": "cook",
  "비생산적 대화 또는 모임": "emotionsad-2",
  "물건 찾기": "emotionsad-3",
  "단순 이동": "car",
  "게임": "baseball",
  "무의식적 콘텐츠 소비": "youtube",
  "보충제 섭취": "drug",
};

/** 아이콘 검색용 한글·별칭 */
const PICKER_SEARCH_EXTRA = {
  bed: "침대 수면하기",
  laptop: "노트북 근무하기",
  sleep: "낮잠",
  money: "생산적 소비",
  onebook: "독서",
  book: "시간기록",
  bath: "위생",
  brocoli: "건강한 섭취",
  eggdrop: "섭취 준비",
  happy3: "대화 모임",
  music: "콘텐츠",
  writting: "기록",
  hair: "외모",
  credit: "비생산적 소비",
  burger: "건강하지 않은 섭취",
  cook: "요리",
  car: "이동",
  car2: "이동루틴",
  baseball: "게임",
  youtube: "영상",
  drug: "보충제",
  sun: "모닝루틴",
  vaccum: "정리루틴",
  bag: "외출준비",
  sofa: "외출 후",
  gym: "유산소",
  hospital: "건강검진",
};

const PRODUCTIVE_CATEGORIES = new Set([
  "dream",
  "sideincome",
  "happiness",
  "health",
]);

/** iconKey 없을 때 — 비생산 카테고리 기본 */
const NONPRODUCTIVE_CATEGORY_PICKER_ICON = {
  unhealthy: "burger",
  unhappiness: "emotionsad-2",
  media_watch: "youtube",
  pleasure: "car",
  moneylosing: "credit",
};

/** @param {string} slug */
function normalizePickerSlug(slug) {
  const s = String(slug || "").trim();
  if (!s) return "";
  if (LEGACY_PICKER_SLUG[s]) return LEGACY_PICKER_SLUG[s];
  if (PICKER_SVG_SET.has(s)) return s;
  const lower = s.toLowerCase();
  if (PICKER_SVG_SET.has(lower)) return lower;
  return "";
}

/** @param {string} slug */
function pickerSvgSrc(slug) {
  const key = normalizePickerSlug(slug);
  if (!key) return "";
  const fileBase = pickerIconFiles[key];
  if (!fileBase) return "";
  return `${PICKER_SVG_BASE}/${encodeURIComponent(fileBase)}.svg`;
}

/** @param {string} taskName */
export function getDefaultTaskIconKey(taskName) {
  const canon = canonicalMealTaskDisplayName(String(taskName || "").trim());
  const slug = BUILTIN_TASK_ICON_SLUG[canon];
  if (!slug || !normalizePickerSlug(slug)) return "";
  return `svg:${normalizePickerSlug(slug)}`;
}

/** @param {string} [kpiId] @param {string} [kpiName] */
export function getDefaultKpiIconKey(kpiId, kpiName) {
  const id = String(kpiId || "").trim();
  if (id && DEFAULT_KPI_ICON_SLUG[id]) {
    const slug = normalizePickerSlug(DEFAULT_KPI_ICON_SLUG[id]);
    if (slug) return `svg:${slug}`;
  }
  const name = String(kpiName || "").trim();
  if (name && DEFAULT_KPI_NAME_ICON_SLUG[name]) {
    const slug = normalizePickerSlug(DEFAULT_KPI_NAME_ICON_SLUG[name]);
    if (slug) return `svg:${slug}`;
  }
  return getDefaultTaskIconKey(kpiName);
}

/**
 * 저장 iconKey → KPI·과제 기본 순으로 유효 키 선택
 * @param {{ iconKey?: string, kpiId?: string, taskName?: string }} opts
 */
export function resolveEffectiveTaskIconKey(opts = {}) {
  const stored = String(opts.iconKey || "").trim();
  if (stored && getTimeTaskIconSrcByKey(stored)) {
    return normalizeStoredPickerIconKey(stored) || stored;
  }
  const kpiDefault = getDefaultKpiIconKey(opts.kpiId, opts.taskName);
  if (kpiDefault && getTimeTaskIconSrcByKey(kpiDefault)) return kpiDefault;
  const taskDefault = getDefaultTaskIconKey(opts.taskName);
  if (taskDefault && getTimeTaskIconSrcByKey(taskDefault)) return taskDefault;
  return "";
}

function resolvePickerSvgFileName(name) {
  return normalizePickerSlug(name);
}

/** @param {string} fileName picker JSON 슬러그 */
function pickerListedIconSrc(fileName) {
  const n = resolvePickerSvgFileName(fileName);
  if (!n) return "";
  return pickerSvgSrc(n);
}

/**
 * @param {string} key
 * @returns {string}
 */
export function getTimeTaskIconSrcByKey(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  if (k.startsWith("svg:")) {
    const fileName = resolvePickerSvgFileName(k.slice(4).trim());
    if (!fileName) return "";
    return pickerListedIconSrc(fileName);
  }
  if (k.startsWith("png:")) {
    const name = resolvePickerSvgFileName(k.slice(4).trim());
    if (!name) return "";
    return pickerListedIconSrc(name);
  }
  const bare = resolvePickerSvgFileName(k);
  if (bare) return pickerListedIconSrc(bare);
  return "";
}

/**
 * @param {string} taskName
 * @param {{ iconKey?: string, category?: string, productivity?: string }} [opts]
 * @returns {string}
 */
export function getTimeTaskListIconSrc(taskName, opts = {}) {
  const effectiveKey = resolveEffectiveTaskIconKey({
    iconKey: opts.iconKey,
    kpiId: opts.kpiId,
    taskName,
  });
  if (effectiveKey) {
    const src = getTimeTaskIconSrcByKey(effectiveKey);
    if (src) return src;
  }
  return resolveCategoryFallbackIconSrc(opts.category, opts.productivity);
}

function normalizeStoredPickerIconKey(iconKey) {
  const k = String(iconKey || "").trim();
  if (!k) return "";
  if (k.startsWith("png:") || k.startsWith("svg:")) {
    const fileName = resolvePickerSvgFileName(k.slice(4).trim());
    return fileName ? `svg:${fileName}` : "";
  }
  const fileName = resolvePickerSvgFileName(k);
  return fileName ? `svg:${fileName}` : "";
}

/**
 * @param {string} taskName
 * @param {{ iconKey?: string, category?: string, productivity?: string }} [opts]
 * @returns {string}
 */
export function resolveTimeTaskIconKey(taskName, opts = {}) {
  const iconKey = String(opts.iconKey || "").trim();
  const normalized = normalizeStoredPickerIconKey(iconKey);
  if (normalized && getTimeTaskIconSrcByKey(normalized)) return normalized;
  if (iconKey && getTimeTaskIconSrcByKey(iconKey)) {
    return normalizeStoredPickerIconKey(iconKey) || iconKey;
  }
  const defaultKey = getDefaultTaskIconKey(taskName);
  if (defaultKey && getTimeTaskIconSrcByKey(defaultKey)) return defaultKey;
  return resolveCategoryFallbackIconKey(opts.category, opts.productivity);
}

/**
 * @param {string} taskName
 * @param {{ iconKey?: string, category?: string, productivity?: string, kpiId?: string }} [opts]
 * @returns {string}
 */
export function resolveTimeTaskDisplayIconSrc(taskName, opts = {}) {
  return getTimeTaskListIconSrc(taskName, opts);
}

function productiveCategoryFallbackSrc(category, productivity) {
  const cat = String(category || "")
    .trim()
    .toLowerCase();
  if (!PRODUCTIVE_CATEGORIES.has(cat)) return "";
  const p = String(productivity || "")
    .trim()
    .toLowerCase();
  if (p === "nonproductive" || p === "other") return "";
  return KPI_CATEGORY_ICON_SRC[cat] || "";
}

function nonproductiveCategoryFallbackKey(category, productivity) {
  const cat = String(category || "")
    .trim()
    .toLowerCase();
  const name = NONPRODUCTIVE_CATEGORY_PICKER_ICON[cat];
  if (!name || !PICKER_SVG_SET.has(name)) return "";
  const p = String(productivity || "")
    .trim()
    .toLowerCase();
  if (p === "productive" || p === "other") return "";
  return `svg:${name}`;
}

function resolveCategoryFallbackIconSrc(category, productivity) {
  const prod = productiveCategoryFallbackSrc(category, productivity);
  if (prod) return prod;
  const key = nonproductiveCategoryFallbackKey(category, productivity);
  return key ? getTimeTaskIconSrcByKey(key) : "";
}

function resolveCategoryFallbackIconKey(category, productivity) {
  if (productiveCategoryFallbackSrc(category, productivity)) return "";
  return nonproductiveCategoryFallbackKey(category, productivity);
}

function pickerIconLabelFromFilename(name) {
  return String(name || "")
    .trim()
    .replace(/-/g, " ");
}

/** @param {string} text */
function normalizePickerSearchHaystack(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, " ");
}

/**
 * @param {string} searchText
 * @param {string} query
 */
export function matchTimeTaskPickerIconSearch(searchText, query) {
  const q = String(query ?? "")
    .trim()
    .toLowerCase();
  if (!q) return true;
  const hay = normalizePickerSearchHaystack(searchText);
  const qFlat = q.replace(/[\s_-]+/g, "");
  if (qFlat && hay.replace(/\s/g, "").includes(qFlat)) return true;
  if (hay.includes(q)) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => {
    const tFlat = t.replace(/[\s_-]+/g, "");
    return hay.includes(t) || (tFlat && hay.replace(/\s/g, "").includes(tFlat));
  });
}

/**
 * @returns {{ key: string, label: string, src: string, searchText: string }[]}
 */
export function getTimeTaskPickableIcons() {
  /** @type {{ key: string, label: string, src: string, searchText: string }[]} */
  const out = [];
  for (const name of pickerSvgNames) {
    const searchExtra = PICKER_SEARCH_EXTRA[name] || "";
    out.push({
      key: `svg:${name}`,
      label: pickerIconLabelFromFilename(name),
      src: pickerListedIconSrc(name),
      searchText: `${name.replace(/-/g, " ")} ${searchExtra}`.trim(),
    });
  }
  return out;
}
