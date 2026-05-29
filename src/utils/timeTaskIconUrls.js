/**
 * 시간가계부 과제 아이콘 — time-task-picker 손그림 SVG + 카테고리 기본 fallback.
 * 사용자 iconKey(`svg:파일명`)가 있으면 우선, 없으면 카테고리별 기본 아이콘.
 */

import pickerSvgNames from "../../public/time-task-picker-icons.json";

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

const PRODUCTIVE_CATEGORIES = new Set([
  "dream",
  "sideincome",
  "happiness",
  "health",
]);

/** iconKey 없을 때 — 비생산 카테고리 기본 (picker 손그림) */
const NONPRODUCTIVE_CATEGORY_PICKER_ICON = {
  unhealthy: "potato-new",
  unhappiness: "emotionsad-2-new",
  dreamblocking: "emotionsad-4-new",
  media_watch: "youtube-new",
  pleasure: "beer-new",
  moneylosing: "emotionsad-5-new",
};

/** iconKey 없을 때 — 근무·수면 (other) */
const OTHER_CATEGORY_PICKER_PNG = {
  sleep: "sleep-new",
  work: "work-new",
};

const PICKER_PNG_SET = new Set(Object.values(OTHER_CATEGORY_PICKER_PNG));

/** 아이콘 선택 모달 — PNG(수면·근무) */
const PICKER_PNG_EXTRAS = [
  ["수면", OTHER_CATEGORY_PICKER_PNG.sleep, "sleep 수면하기"],
  ["근무", OTHER_CATEGORY_PICKER_PNG.work, "work 근무하기"],
];

/** @param {string} pngBase */
function pickerPngSrc(pngBase) {
  const name = String(pngBase || "").trim();
  if (!name) return "";
  return `${PICKER_SVG_BASE}/${name}.png`;
}

/**
 * @param {string} [taskName]
 * @param {string} [category]
 * @returns {string}
 */
function fixedSleepWorkIconSrc(taskName, category) {
  const t = String(taskName || "").trim();
  const cat = String(category || "")
    .trim()
    .toLowerCase();
  if (t === "수면하기" || /수면/.test(t) || cat === "sleep") {
    return pickerPngSrc(OTHER_CATEGORY_PICKER_PNG.sleep);
  }
  if (t === "근무하기" || cat === "work") {
    return pickerPngSrc(OTHER_CATEGORY_PICKER_PNG.work);
  }
  return "";
}

/**
 * @param {string} [taskName]
 * @param {string} [category]
 * @returns {string}
 */
function fixedSleepWorkIconKey(taskName, category) {
  const t = String(taskName || "").trim();
  const cat = String(category || "")
    .trim()
    .toLowerCase();
  if (t === "수면하기" || /수면/.test(t) || cat === "sleep") {
    return `png:${OTHER_CATEGORY_PICKER_PNG.sleep}`;
  }
  if (t === "근무하기" || cat === "work") {
    return `png:${OTHER_CATEGORY_PICKER_PNG.work}`;
  }
  return "";
}

/**
 * @param {string} [category]
 * @param {string} [productivity]
 * @returns {string}
 */
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

/**
 * @param {string} [category]
 * @param {string} [productivity]
 * @returns {string}
 */
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

/**
 * @param {string} [category]
 * @param {string} [productivity]
 * @returns {string}
 */
function resolveCategoryFallbackIconSrc(category, productivity) {
  const prod = productiveCategoryFallbackSrc(category, productivity);
  if (prod) return prod;
  const key = nonproductiveCategoryFallbackKey(category, productivity);
  return key ? getTimeTaskIconSrcByKey(key) : "";
}

/**
 * @param {string} [category]
 * @param {string} [productivity]
 * @returns {string}
 */
function resolveCategoryFallbackIconKey(category, productivity) {
  if (productiveCategoryFallbackSrc(category, productivity)) return "";
  return nonproductiveCategoryFallbackKey(category, productivity);
}

/** 구 picker 파일명(`apple`) → 손그림 `-new` 파일명 */
function resolvePickerSvgFileName(name) {
  const n = String(name || "").trim();
  if (!n) return "";
  if (PICKER_SVG_SET.has(n)) return n;
  const migrated = n.endsWith("-new") ? "" : `${n}-new`;
  if (migrated && PICKER_SVG_SET.has(migrated)) return migrated;
  return "";
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
    return `${PICKER_SVG_BASE}/${fileName}.svg`;
  }
  if (k.startsWith("png:")) {
    const name = k.slice(4).trim();
    if (PICKER_PNG_SET.has(name)) {
      return pickerPngSrc(name);
    }
    return "";
  }
  const bare = resolvePickerSvgFileName(k);
  if (bare) return `${PICKER_SVG_BASE}/${bare}.svg`;
  return "";
}

/**
 * @param {string} _taskName
 * @param {{ iconKey?: string, category?: string, productivity?: string }} [opts]
 * @returns {string}
 */
export function getTimeTaskListIconSrc(taskName, opts = {}) {
  const iconKey = String(opts.iconKey || "").trim();
  if (iconKey) {
    const byKey = getTimeTaskIconSrcByKey(iconKey);
    if (byKey) return byKey;
  }
  const sleepWork = fixedSleepWorkIconSrc(taskName, opts.category);
  if (sleepWork) return sleepWork;
  return resolveCategoryFallbackIconSrc(opts.category, opts.productivity);
}

function normalizeStoredPickerIconKey(iconKey) {
  const k = String(iconKey || "").trim();
  if (!k) return "";
  if (k.startsWith("png:")) {
    const name = k.slice(4).trim();
    return PICKER_PNG_SET.has(name) ? `png:${name}` : "";
  }
  if (k.startsWith("svg:")) {
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
  const sleepWork = fixedSleepWorkIconKey(taskName, opts.category);
  if (sleepWork) return sleepWork;
  return resolveCategoryFallbackIconKey(opts.category, opts.productivity);
}

/**
 * @param {string} taskName
 * @param {{ iconKey?: string, category?: string, productivity?: string }} [opts]
 * @returns {string}
 */
export function resolveTimeTaskDisplayIconSrc(taskName, opts = {}) {
  return getTimeTaskListIconSrc(taskName, opts);
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
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const hay = normalizePickerSearchHaystack(searchText);
  const qFlat = q.replace(/[\s_-]+/g, "");
  if (qFlat && hay.replace(/\s/g, "").includes(qFlat)) return true;
  if (hay.includes(q)) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  return tokens.every((t) => {
    const tFlat = t.replace(/[\s_-]+/g, "");
    return (
      hay.includes(t) ||
      (tFlat && hay.replace(/\s/g, "").includes(tFlat))
    );
  });
}

/**
 * @returns {{ key: string, label: string, src: string, searchText: string }[]}
 */
export function getTimeTaskPickableIcons() {
  /** @type {{ key: string, label: string, src: string, searchText: string }[]} */
  const out = [];
  for (const [label, slug, searchExtra] of PICKER_PNG_EXTRAS) {
    out.push({
      key: `png:${slug}`,
      label,
      src: pickerPngSrc(slug),
      searchText: `${label} ${slug} ${searchExtra}`.replace(/-/g, " "),
    });
  }
  for (const name of pickerSvgNames) {
    out.push({
      key: `svg:${name}`,
      label: pickerIconLabelFromFilename(name),
      src: `${PICKER_SVG_BASE}/${name}.svg`,
      searchText: name.replace(/-/g, " "),
    });
  }
  return out;
}
