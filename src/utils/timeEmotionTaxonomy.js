/**
 * 감정적이기 — 5대분류·25소분류 (time_rating + memo_tags lp-emotion-sub)
 */

import { normalizeTimeRatingForRow } from "./timeLedgerEntriesModel.js";

export const EMOTION_SUB_TAG_PREFIX = "lp-emotion-sub:";

/** @type {{ rating: number, id: string, label: string, iconFile: string, chartColor: string, subs: string[] }[]} */
export const EMOTION_CATEGORIES = [
  {
    rating: 1,
    id: "anger",
    label: "분노",
    iconFile: "anger.png",
    chartColor: "#D4645C",
    subs: ["짜증", "화남", "억울함", "원망", "질투"],
  },
  {
    rating: 2,
    id: "fear",
    label: "두려움",
    iconFile: "fear.png",
    chartColor: "#7B6BAE",
    subs: ["불안", "공포", "긴장", "초조", "걱정"],
  },
  {
    rating: 3,
    id: "sadness",
    label: "슬픔",
    iconFile: "sadness.png",
    chartColor: "#5A8FC4",
    subs: ["우울", "외로움", "절망", "무기력", "허무함"],
  },
  {
    rating: 4,
    id: "shame",
    label: "수치",
    iconFile: "shame.png",
    chartColor: "#C46B8A",
    subs: ["부끄러움", "죄책감", "자기혐오", "굴욕감", "후회"],
  },
  {
    rating: 5,
    id: "discomfort",
    label: "불쾌",
    iconFile: "discomfort.png",
    chartColor: "#8F9A58",
    subs: ["지루함", "혼란", "실망", "답답함", "좌절"],
  },
];

/** @param {string} id */
export function getEmotionCategoryChartColor(id) {
  const cat = EMOTION_CATEGORIES.find((c) => c.id === id);
  return cat?.chartColor || "#666666";
}

const ICON_VERSION = "1";

export function getEmotionCategoryIconUrl(category) {
  const file = category?.iconFile || "";
  if (!file) return "";
  const base = import.meta.env.BASE_URL || "/";
  return `${base}emotion-categories/${file}?v=${ICON_VERSION}`;
}

/** @param {number|null|undefined} rating */
export function getEmotionCategoryByRating(rating) {
  const n = normalizeTimeRatingForRow(rating);
  if (n == null) return null;
  return EMOTION_CATEGORIES.find((c) => c.rating === n) ?? null;
}

/** @param {string} subLabel */
export function findEmotionCategoryForSub(subLabel) {
  const s = String(subLabel || "").trim();
  if (!s) return null;
  return EMOTION_CATEGORIES.find((c) => c.subs.includes(s)) ?? null;
}

/** @param {unknown[]} memoTags */
export function extractEmotionSubFromMemoTags(memoTags) {
  for (const t of Array.isArray(memoTags) ? memoTags : []) {
    const s = String(t ?? "").trim();
    if (s.startsWith(EMOTION_SUB_TAG_PREFIX)) {
      return s.slice(EMOTION_SUB_TAG_PREFIX.length).trim();
    }
  }
  return "";
}

export function buildEmotionSubTag(subLabel) {
  const s = String(subLabel || "").trim();
  if (!s) return "";
  return `${EMOTION_SUB_TAG_PREFIX}${s}`;
}

/** @param {unknown[]} memoTags @param {string} subLabel */
export function mergeEmotionSubIntoMemoTags(memoTags, subLabel) {
  const base = (Array.isArray(memoTags) ? memoTags : []).filter((t) => {
    const s = String(t ?? "").trim();
    return s && !s.startsWith(EMOTION_SUB_TAG_PREFIX);
  });
  const tag = buildEmotionSubTag(subLabel);
  if (tag) base.push(tag);
  return base;
}

/** @param {unknown[]} memoTags */
export function stripEmotionSubFromMemoTags(memoTags) {
  return (Array.isArray(memoTags) ? memoTags : []).filter((t) => {
    const s = String(t ?? "").trim();
    return s && !s.startsWith(EMOTION_SUB_TAG_PREFIX);
  });
}

/**
 * @param {{ timeRating?: unknown, memoTags?: unknown[] }} row
 * @returns {{ category: typeof EMOTION_CATEGORIES[0]|null, subLabel: string, isModern: boolean, isLegacy: boolean }}
 */
export function parseEmotionFromRow(row) {
  const category = getEmotionCategoryByRating(row?.timeRating);
  const subLabel = extractEmotionSubFromMemoTags(row?.memoTags);
  const isModern =
    !!category &&
    !!subLabel &&
    category.subs.includes(subLabel);
  const isLegacy =
    !!category &&
    !subLabel;
  return { category, subLabel, isModern, isLegacy };
}

/** @param {string} subLabel @param {number|null|undefined} categoryRating */
export function isValidEmotionSelection(categoryRating, subLabel) {
  const cat = getEmotionCategoryByRating(categoryRating);
  const sub = String(subLabel || "").trim();
  if (!cat || !sub) return false;
  return cat.subs.includes(sub);
}

export function buildEmotionCategoryIconImgHtml(category, opts = {}) {
  const cat = category || null;
  if (!cat) return "";
  const url = getEmotionCategoryIconUrl(cat);
  const size = opts.size ?? 40;
  const alt = String(cat.label || "").trim();
  if (!url) return "";
  return `<img class="lp-emotion-category-icon" src="${url}" width="${size}" height="${size}" alt="${alt}" loading="lazy" decoding="async" />`;
}
