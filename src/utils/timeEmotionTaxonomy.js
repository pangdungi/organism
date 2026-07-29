/**
 * 감정적이기 — 부정 5대분류·25소분류 / 긍정 5감정
 * (time_rating + memo_tags lp-emotion-sub)
 */

import { normalizeTimeRatingForRow } from "./timeLedgerEntriesModel.js";

export const EMOTION_SUB_TAG_PREFIX = "lp-emotion-sub:";

/** @typedef {{ rating: number, id: string, label: string, iconFile: string, chartColor: string, subs: string[], selectOnly?: boolean, prompt?: string }} EmotionCategory */

/** @type {EmotionCategory[]} */
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

/** 긍정 감정 — 대분류만 선택(세부 칩·트리거 없음) */
/** @type {EmotionCategory[]} */
export const EMOTION_CATEGORIES_POSITIVE = [
  {
    rating: 1,
    id: "gratitude",
    label: "감사함",
    iconFile: "gratitude.svg",
    chartColor: "#C98484",
    subs: ["감사함"],
    selectOnly: true,
    prompt: "왜 감사했어요?",
  },
  {
    rating: 2,
    id: "pride",
    label: "뿌듯함",
    iconFile: "pride.svg",
    chartColor: "#C9A27A",
    subs: ["뿌듯함"],
    selectOnly: true,
    prompt: "무엇이 뿌듯하게 했어요?",
  },
  {
    rating: 3,
    id: "happiness",
    label: "행복함",
    iconFile: "happiness.svg",
    chartColor: "#D4B07A",
    subs: ["행복함"],
    selectOnly: true,
    prompt: "무엇이 행복하게 했어요?",
  },
  {
    rating: 4,
    id: "interest",
    label: "흥미",
    iconFile: "interest.svg",
    chartColor: "#7E9FC3",
    subs: ["흥미"],
    selectOnly: true,
    prompt: "무엇이 흥미롭게 했어요?",
  },
  {
    rating: 5,
    id: "comfort",
    label: "편안함",
    iconFile: "comfort.svg",
    chartColor: "#8FA89A",
    subs: ["편안함"],
    selectOnly: true,
    prompt: "무엇이 편안하게 했어요?",
  },
];

/** @param {"negative"|"positive"|string|null|undefined} polarity */
export function getEmotionCategoriesForPolarity(polarity) {
  return polarity === "positive"
    ? EMOTION_CATEGORIES_POSITIVE
    : EMOTION_CATEGORIES;
}

/** @param {string} id */
export function getEmotionCategoryChartColor(id) {
  const cat =
    EMOTION_CATEGORIES.find((c) => c.id === id) ||
    EMOTION_CATEGORIES_POSITIVE.find((c) => c.id === id);
  return cat?.chartColor || "#666666";
}

const ICON_VERSION = "7";

export function getEmotionCategoryIconUrl(category) {
  const file = category?.iconFile || "";
  if (!file) return "";
  const base = import.meta.env.BASE_URL || "/";
  return `${base}emotion-categories/${file}?v=${ICON_VERSION}`;
}

/**
 * @param {number|null|undefined} rating
 * @param {"negative"|"positive"|string|null|undefined} [polarity]
 */
export function getEmotionCategoryByRating(rating, polarity = "negative") {
  const n = normalizeTimeRatingForRow(rating);
  if (n == null) return null;
  return (
    getEmotionCategoriesForPolarity(polarity).find((c) => c.rating === n) ??
    null
  );
}

/**
 * @param {string} subLabel
 * @param {"negative"|"positive"|string|null|undefined} [polarity]
 */
export function findEmotionCategoryForSub(subLabel, polarity = "negative") {
  const s = String(subLabel || "").trim();
  if (!s) return null;
  return (
    getEmotionCategoriesForPolarity(polarity).find((c) =>
      c.subs.includes(s),
    ) ?? null
  );
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
 * @param {{ timeRating?: unknown, memoTags?: unknown[], taskName?: unknown }} row
 * @param {"negative"|"positive"|string|null|undefined} [polarity]
 */
export function parseEmotionFromRow(row, polarity = "negative") {
  const pol = polarity === "positive" ? "positive" : "negative";
  const category = getEmotionCategoryByRating(row?.timeRating, pol);
  const subLabel = extractEmotionSubFromMemoTags(row?.memoTags);
  if (!category) {
    return { category: null, subLabel, isModern: false, isLegacy: false };
  }
  if (category.selectOnly) {
    const isModern =
      !subLabel || subLabel === category.label || category.subs.includes(subLabel);
    const isLegacy = false;
    return {
      category,
      subLabel: subLabel || category.label,
      isModern,
      isLegacy,
    };
  }
  const isModern = !!subLabel && category.subs.includes(subLabel);
  const isLegacy = !subLabel;
  return { category, subLabel, isModern, isLegacy };
}

/**
 * @param {string} subLabel
 * @param {number|null|undefined} categoryRating
 * @param {"negative"|"positive"|string|null|undefined} [polarity]
 */
export function isValidEmotionSelection(
  categoryRating,
  subLabel,
  polarity = "negative",
) {
  const cat = getEmotionCategoryByRating(categoryRating, polarity);
  if (!cat) return false;
  if (cat.selectOnly) return true;
  const sub = String(subLabel || "").trim();
  if (!sub) return false;
  return cat.subs.includes(sub);
}

/** @param {EmotionCategory|null|undefined} category */
export function getEmotionMemoPrompt(category) {
  const p = String(category?.prompt || "").trim();
  if (p) return p;
  const label = String(category?.label || "").trim();
  if (!label) return "";
  return `무엇이 ${label}하게 했어요?`;
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
