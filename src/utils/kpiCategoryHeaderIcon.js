import { applyStaticAppIconImg } from "./staticAppIconImg.js";
import { getTimeTaskIconSrcBySlug } from "./timeTaskIconUrls.js";

/** 탭 최상단(꿈·부수입·행복·건강) 헤더 전용 — 목표/KPI drill-down 에서는 숨김 */
const KPI_CATEGORY_ICON_SLUG = {
  dream: "prod-cat-dream",
  sideincome: "prod-cat-sideincome",
  happiness: "prod-cat-happiness",
  health: "prod-cat-health",
};

/**
 * @param {HTMLElement} titleRow
 * @param {"dream"|"sideincome"|"happiness"|"health"} categoryKey
 */
export function setupKpiCategoryHeaderIcon(titleRow, categoryKey) {
  if (!titleRow) return;
  if (titleRow.querySelector(".dream-view-header-category-icon")) return;
  const slug = KPI_CATEGORY_ICON_SLUG[categoryKey];
  if (!slug) return;
  const img = document.createElement("img");
  img.className = "dream-view-header-category-icon";
  img.src = getTimeTaskIconSrcBySlug(slug);
  img.alt = "";
  img.width = 28;
  img.height = 28;
  img.decoding = "async";
  applyStaticAppIconImg(img);
  titleRow.insertBefore(img, titleRow.firstChild);
}

/** @param {HTMLElement} titleRow @param {boolean} visible */
export function setKpiCategoryHeaderIconVisible(titleRow, visible) {
  const icon = titleRow?.querySelector?.(".dream-view-header-category-icon");
  if (!icon) return;
  icon.hidden = !visible;
}
