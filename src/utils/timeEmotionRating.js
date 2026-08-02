/**
 * 감정적이기 과제 — 감정 선택 UI·카드 표시 (부정 2단계 / 긍정 1단계)
 */

import { lpSetClasses, lpTokenToggle } from "./timeLedgerClassPolicy.js";
import {
  EMOTION_CATEGORIES,
  EMOTION_CATEGORIES_POSITIVE,
  buildEmotionCategoryIconImgHtml,
  findEmotionCategoryForSub,
  getEmotionCategoriesForPolarity,
  getEmotionCategoryByRating,
  getEmotionMemoPrompt,
  parseEmotionFromRow,
} from "./timeEmotionTaxonomy.js";
import { emotionTaskPolarity } from "./timeTaskOptionsConstants.js";

export {
  EMOTION_CATEGORIES,
  EMOTION_CATEGORIES_POSITIVE,
  parseEmotionFromRow,
  getEmotionCategoryByRating,
  getEmotionMemoPrompt,
  extractEmotionSubFromMemoTags,
  mergeEmotionSubIntoMemoTags,
  buildEmotionSubTag,
  isValidEmotionSelection,
} from "./timeEmotionTaxonomy.js";

/** @deprecated 구 1~5 얼굴 옵션 — 레거시 표시용만 */
export const EMOTION_RATING_OPTIONS = [];

/**
 * @param {unknown} raw
 * @param {unknown} [memoTagsOrTaskName]
 * @param {string} [taskName]
 * @returns {string | null}
 */
export function formatTimeLedgerEmotionRatingHtml(
  raw,
  memoTagsOrTaskName,
  taskName,
) {
  const row =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : {
          timeRating: raw,
          memoTags: Array.isArray(memoTagsOrTaskName)
            ? memoTagsOrTaskName
            : [],
          taskName:
            typeof memoTagsOrTaskName === "string"
              ? memoTagsOrTaskName
              : taskName,
        };
  const polarity =
    emotionTaskPolarity(row.taskName || taskName) || "negative";
  const { category, subLabel, isModern, isLegacy } = parseEmotionFromRow(
    row,
    polarity,
  );
  if (isModern && category) {
    const icon = buildEmotionCategoryIconImgHtml(category, { size: 22 });
    const label =
      category.selectOnly || !subLabel || subLabel === category.label
        ? category.label
        : `${category.label} · ${subLabel}`;
    return `<span class="time-ledger-emotion-rating-chip">${icon}<span class="time-ledger-emotion-rating-label">${label}</span></span>`;
  }
  if (isLegacy && category) {
    return `<span class="time-ledger-emotion-rating-chip time-ledger-emotion-rating-chip--legacy"><span class="time-ledger-emotion-rating-label">${category.label} (예전 기록)</span></span>`;
  }
  return null;
}

/**
 * @param {HTMLElement|null} container
 * @param {{ categoryRating: number|null, subLabel: string, polarity?: "negative"|"positive", onChange: (state: { categoryRating: number|null, subLabel: string }) => void }} opts
 */
function detachTaskLogEmotionSubRow(container) {
  container?._subRowEl?.remove?.();
  delete container?._subRowEl;
}

export function mountTaskLogEmotionPicker(container, opts = {}) {
  if (!container) return;
  detachTaskLogEmotionSubRow(container);
  container.replaceChildren();
  container.dataset.built = "1";
  const polarity = opts.polarity === "positive" ? "positive" : "negative";
  container.dataset.emotionPolarity = polarity;
  container.className = "time-task-log-emotion-picker";
  container.setAttribute("role", "group");

  const categories = getEmotionCategoriesForPolarity(polarity);
  const mountRoot = container.parentElement;

  const categoryRow = document.createElement("div");
  categoryRow.className = "time-task-log-emotion-category-row";

  const subRow = document.createElement("div");
  subRow.className = "time-task-log-emotion-sub-row";
  subRow.hidden = true;
  container._subRowEl = subRow;

  let categoryRating = opts.categoryRating ?? null;
  let subLabel = String(opts.subLabel || "").trim();

  /* 감정 상태(대분류)만 — 세부 감정 칩은 쓰지 않음 */
  function syncSubRow() {
    subRow.replaceChildren();
    subRow.hidden = true;
  }

  function syncSubChips() {}

  function syncCategoryButtons() {
    categoryRow.querySelectorAll("[data-emotion-category]").forEach((btn) => {
      const n = Number(btn.getAttribute("data-emotion-category"));
      const on = categoryRating != null && n === categoryRating;
      lpTokenToggle(btn, "time-task-log-emotion-category-btn--on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function emitChange() {
    if (typeof opts.onChange === "function") {
      opts.onChange({ categoryRating, subLabel, polarity });
    }
  }

  categories.forEach((cat) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "time-task-log-emotion-category-btn";
    btn.setAttribute("data-emotion-category", String(cat.rating));
    btn.setAttribute("aria-label", cat.label);

    const iconWrap = document.createElement("span");
    iconWrap.className = "time-task-log-emotion-category-icon";
    iconWrap.innerHTML = buildEmotionCategoryIconImgHtml(cat, { size: 44 });

    const lab = document.createElement("span");
    lab.className = "time-task-log-emotion-category-label";
    lab.textContent = cat.label;

    btn.appendChild(iconWrap);
    btn.appendChild(lab);
    btn.addEventListener("click", () => {
      if (categoryRating === cat.rating) {
        categoryRating = null;
        subLabel = "";
      } else {
        categoryRating = cat.rating;
        subLabel = cat.label;
      }
      syncCategoryButtons();
      syncSubRow();
      emitChange();
    });
    categoryRow.appendChild(btn);
  });

  container.appendChild(categoryRow);
  if (mountRoot) {
    mountRoot.insertBefore(subRow, container.nextSibling);
  } else {
    container.appendChild(subRow);
  }

  if (subLabel && !categoryRating) {
    const inferred = findEmotionCategoryForSub(subLabel, polarity);
    if (inferred) categoryRating = inferred.rating;
  }
  const selected = getEmotionCategoryByRating(categoryRating, polarity);
  if (selected) {
    subLabel = selected.label;
  }
  syncCategoryButtons();
  syncSubRow();

  container._setEmotionState = (state) => {
    categoryRating = state?.categoryRating ?? null;
    subLabel = String(state?.subLabel || "").trim();
    if (subLabel && !categoryRating) {
      const inferred = findEmotionCategoryForSub(subLabel, polarity);
      if (inferred) categoryRating = inferred.rating;
    }
    const cat = getEmotionCategoryByRating(categoryRating, polarity);
    if (cat) subLabel = cat.label;
    syncCategoryButtons();
    syncSubRow();
  };

  container._getEmotionState = () => ({
    categoryRating,
    subLabel,
    polarity,
  });

  container._detachSubRow = () => detachTaskLogEmotionSubRow(container);
}

/** @deprecated mountTaskLogEmotionPicker 사용 */
export function mountTaskLogEmotionRating(container, onPick) {
  mountTaskLogEmotionPicker(container, {
    onChange: ({ categoryRating }) => {
      if (typeof onPick === "function") onPick(categoryRating);
    },
  });
}

/** @deprecated */
export function getEmotionRatingLabel() {
  return "";
}

/** @deprecated */
export function buildEmotionFaceSvgHtml() {
  return "";
}

/** @deprecated */
export function buildEmotionTriggerSelect() {
  const wrap = document.createElement("div");
  return wrap;
}
