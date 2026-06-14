/**
 * 시간가계부 과제 아이콘 — public/toolbaricons/time-task-picker 폴더만 사용.
 * iconKey(`svg:파일이름`) 우선, 없거나 구 세트면 과제·KPI 기본 fallback.
 */

import pickerSvgNames from "../../public/time-task-picker-icons.json";
import pickerIconFiles from "../../public/time-task-picker-icon-files.json";
import { canonicalMealTaskDisplayName, NAP_TASK_NAME } from "./timeTaskOptionsConstants.js";
import { DEFAULT_KPI_ICON_SLUG, DEFAULT_KPI_NAME_ICON_SLUG } from "./defaultKpiIconIds.js";
import { matchFlexibleSearch } from "./flexibleSearchMatch.js";
import { toolbarIconPng } from "./toolbarIconUrl.js";

const PICKER_ICON_BASE = "/toolbaricons/time-task-picker";
/** 과제 아이콘 전부 128×128 PNG (SVG 폴백만) */
const PICKER_ICON_EXT = "png";

/** KPI 탭 헤더 — 메인 메뉴 손그림 (picker 세트와 별도) */
export const KPI_CATEGORY_ICON_SRC = {
  dream: toolbarIconPng("menu-home/dream-new"),
  sideincome: toolbarIconPng("menu-home/sideincome-new"),
  happiness: toolbarIconPng("menu-home/hapiness-new"),
  health: toolbarIconPng("menu-home/health-new"),
};

const PICKER_SVG_SET = new Set(pickerSvgNames);

/** 삭제된 picker 파일명 → 대체 슬러그 (잘못 저장된 iconKey 호환) */
const REMOVED_PICKER_SLUG_ALIAS = {
  "train-1": "burger",
};

/** 기본 내장 과제명 → picker 슬러그 */
export const BUILTIN_TASK_ICON_SLUG = {
  "수면하기": "sleeping",
  "근무하기": "work",
  "생산적 소비": "money",
  "독서 및 독서노트 작성": "reading",
  "시간기록 및 점검": "study",
  "개인 위생": "shower",
  [NAP_TASK_NAME]: "nap",
  "건강한 섭취": "healthy food",
  "건강한 섭취 준비": "cooking",
  "생산적 대화": "happy",
  "생산적 외출": "travel",
  "의식적 콘텐츠 소비": "phone",
  "기록하기": "writting",
  "외모관리": "skin care",
  "비생산적 소비": "shopping bag",
  "건강하지 않은 섭취": "burger",
  "건강하지 않은 섭취 준비": "blender",
  "비생산적 대화": "sad",
  "감정적이기": "angry",
  "비생산적 외출": "beer",
  "물건 찾기": "packing",
  "단순 이동": "train",
  "게임": "headset",
  "무의식적 콘텐츠 소비": "youtube",
  "보충제 섭취": "medicine",
};

/** 아이콘 검색용 한글·별칭 */
const PICKER_SEARCH_EXTRA = {
  sleeping: "수면하기",
  nap: "낮잠",
  work: "근무하기 노트북",
  money: "생산적 소비",
  reading: "독서 독서노트",
  study: "시간기록 공부",
  shower: "위생 개인위생",
  "healthy food": "건강한 섭취",
  cooking: "건강한 섭취 준비",
  happy: "생산적 대화",
  travel: "생산적 외출",
  phone: "의식적 콘텐츠",
  writting: "기록하기",
  "skin care": "외모관리",
  "shopping bag": "비생산적 소비",
  burger: "건강하지 않은 섭취",
  cocktail: "칵테일",
  blender: "건강하지 않은 섭취 준비",
  sad: "비생산적 대화",
  angry: "감정적이기",
  beer: "비생산적 외출",
  packing: "물건 찾기 외출준비",
  train: "단순이동",
  moving_basic: "이동루틴",
  headset: "게임",
  youtube: "영상 콘텐츠",
  medicine: "보충제",
  "drip coffee": "모닝루틴 커피",
  Coffee: "커피",
  dryer: "건조",
  cloth: "외출 후",
  clean: "정리루틴",
  running: "유산소",
  "to do list": "잡무",
  bedtime: "취침루틴",
  "dental appointment": "건강검진",
  meditation: "명상",
  cinema: "영화",
  airplane: "비행",
};

const PRODUCTIVE_CATEGORIES = new Set([
  "sideincome",
  "happiness",
  "health",
]);

/** iconKey 없을 때 — 비생산 카테고리 기본 */
const NONPRODUCTIVE_CATEGORY_PICKER_ICON = {
  unhealthy: "burger",
  unhappiness: "sad",
  media_watch: "youtube",
  pleasure: "cinema",
  moneylosing: "shopping bag",
};

/** @param {string} name */
function findPickerSlug(name) {
  let s = String(name || "").trim();
  if (!s) return "";
  const aliased =
    REMOVED_PICKER_SLUG_ALIAS[s] || REMOVED_PICKER_SLUG_ALIAS[s.toLowerCase()];
  if (aliased) s = aliased;
  if (PICKER_SVG_SET.has(s)) return s;
  const lower = s.toLowerCase();
  if (PICKER_SVG_SET.has(lower)) return lower;
  for (const n of pickerSvgNames) {
    if (n.toLowerCase() === lower) return n;
  }
  const mapped = pickerIconFiles[s] || pickerIconFiles[lower];
  if (mapped && PICKER_SVG_SET.has(mapped)) return mapped;
  return "";
}

/** @param {string} slug */
function normalizePickerSlug(slug) {
  return findPickerSlug(slug);
}

/**
 * picker 폴더에 실제 있는 아이콘인지 (구 svg:슬러그는 false)
 * @param {string} key
 */
export function isValidPickerIconKey(key) {
  return !!getTimeTaskIconSrcByKey(key);
}

/** @param {string} slug @param {string} [ext] */
function pickerIconSrc(slug, ext = PICKER_ICON_EXT) {
  const key = normalizePickerSlug(slug);
  if (!key) return "";
  const fileBase = pickerIconFiles[key];
  if (!fileBase) return "";
  return `${PICKER_ICON_BASE}/${encodeURIComponent(fileBase)}.${ext}`;
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
  return pickerIconSrc(n, PICKER_ICON_EXT);
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
 * 캘린더·목록 등 크게 보이는 곳 — SVG 원본 우선(선명), 없으면 PNG
 * @param {string} key
 * @returns {string}
 */
export function getTimeTaskIconDisplaySrcByKey(key) {
  const k = String(key || "").trim();
  if (!k) return "";
  const slugRaw = k.startsWith("svg:") || k.startsWith("png:") ? k.slice(4).trim() : k;
  const fileName = resolvePickerSvgFileName(slugRaw);
  if (!fileName) return "";
  const svgSrc = pickerIconSrc(fileName, "svg");
  if (svgSrc) return svgSrc;
  return pickerIconSrc(fileName, PICKER_ICON_EXT);
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

/** @param {string} searchText @param {string} query */
export function matchTimeTaskPickerIconSearch(searchText, query) {
  return matchFlexibleSearch(searchText, query);
}

/**
 * @returns {{ key: string, label: string, src: string, searchText: string }[]}
 */
export function getTimeTaskPickableIcons() {
  /** @type {{ key: string, label: string, src: string, searchText: string }[]} */
  const out = [];
  for (const name of pickerSvgNames) {
    const src = pickerListedIconSrc(name);
    if (!src) continue;
    const searchExtra = PICKER_SEARCH_EXTRA[name] || "";
    out.push({
      key: `svg:${name}`,
      label: pickerIconLabelFromFilename(name),
      src,
      searchText: `${name.replace(/-/g, " ")} ${searchExtra}`.trim(),
    });
  }
  return out;
}
