/**
 * 감정적이기 과제 — 2단계 감정 선택 UI·카드 표시
 */

import { lpSetClasses, lpTokenToggle } from "./timeLedgerClassPolicy.js";
import {
  EMOTION_CATEGORIES,
  buildEmotionCategoryIconImgHtml,
  findEmotionCategoryForSub,
  getEmotionCategoryByRating,
  parseEmotionFromRow,
} from "./timeEmotionTaxonomy.js";

export {
  EMOTION_CATEGORIES,
  parseEmotionFromRow,
  getEmotionCategoryByRating,
  extractEmotionSubFromMemoTags,
  mergeEmotionSubIntoMemoTags,
  buildEmotionSubTag,
  isValidEmotionSelection,
} from "./timeEmotionTaxonomy.js";

/** @deprecated 구 1~5 얼굴 옵션 — 레거시 표시용만 */
export const EMOTION_RATING_OPTIONS = [];

/**
 * @param {unknown} raw
 * @returns {string | null}
 */
export function formatTimeLedgerEmotionRatingHtml(raw, memoTags) {
  const row =
    raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? raw
      : { timeRating: raw, memoTags: memoTags || [] };
  const { category, subLabel, isModern, isLegacy } = parseEmotionFromRow(row);
  if (isModern && category) {
    const icon = buildEmotionCategoryIconImgHtml(category, { size: 22 });
    return `<span class="time-ledger-emotion-rating-chip">${icon}<span class="time-ledger-emotion-rating-label">${category.label} · ${subLabel}</span></span>`;
  }
  if (isLegacy && category) {
    return `<span class="time-ledger-emotion-rating-chip time-ledger-emotion-rating-chip--legacy"><span class="time-ledger-emotion-rating-label">${category.label} (예전 기록)</span></span>`;
  }
  return null;
}

/**
 * @param {HTMLElement|null} container
 * @param {{ categoryRating: number|null, subLabel: string, onChange: (state: { categoryRating: number|null, subLabel: string }) => void }} opts
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
  container.className = "time-task-log-emotion-picker";
  container.setAttribute("role", "group");

  const mountRoot = container.parentElement;

  const categoryRow = document.createElement("div");
  categoryRow.className = "time-task-log-emotion-category-row";

  const subRow = document.createElement("div");
  subRow.className = "time-task-log-emotion-sub-row";
  subRow.hidden = true;
  container._subRowEl = subRow;

  let categoryRating = opts.categoryRating ?? null;
  let subLabel = String(opts.subLabel || "").trim();

  function syncSubRow() {
    subRow.replaceChildren();
    const cat = getEmotionCategoryByRating(categoryRating);
    if (!cat) {
      subRow.hidden = true;
      return;
    }
    subRow.hidden = false;
    const subLabelEl = document.createElement("span");
    subLabelEl.className = "time-task-log-section-label time-task-log-emotion-sub-label";
    subLabelEl.textContent = `${cat.label} — 어떤 감정인가요?`;
    subRow.appendChild(subLabelEl);

    const chips = document.createElement("div");
    chips.className = "time-task-log-emotion-sub-chips lp-choice-chip-row";
    cat.subs.forEach((sub) => {
      const btn = document.createElement("button");
      btn.type = "button";
      lpSetClasses(btn, "lp-choice-chip");
      btn.setAttribute("data-emotion-sub", sub);
      btn.textContent = sub;
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        subLabel = subLabel === sub ? "" : sub;
        syncSubChips();
        emitChange();
      });
      chips.appendChild(btn);
    });
    subRow.appendChild(chips);
    syncSubChips();
  }

  function syncSubChips() {
    subRow.querySelectorAll("[data-emotion-sub]").forEach((btn) => {
      const sub = btn.getAttribute("data-emotion-sub") || "";
      lpTokenToggle(btn, "lp-choice-chip--on", subLabel === sub);
      btn.setAttribute("aria-pressed", subLabel === sub ? "true" : "false");
    });
  }

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
      opts.onChange({ categoryRating, subLabel });
    }
  }

  EMOTION_CATEGORIES.forEach((cat) => {
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
        if (!cat.subs.includes(subLabel)) subLabel = "";
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
    const inferred = findEmotionCategoryForSub(subLabel);
    if (inferred) categoryRating = inferred.rating;
  }
  syncCategoryButtons();
  syncSubRow();

  container._setEmotionState = (state) => {
    categoryRating = state?.categoryRating ?? null;
    subLabel = String(state?.subLabel || "").trim();
    if (subLabel && !categoryRating) {
      const inferred = findEmotionCategoryForSub(subLabel);
      if (inferred) categoryRating = inferred.rating;
    }
    syncCategoryButtons();
    syncSubRow();
  };

  container._getEmotionState = () => ({
    categoryRating,
    subLabel,
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
