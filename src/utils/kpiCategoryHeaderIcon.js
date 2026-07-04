import { applyStaticAppIconImg } from "./staticAppIconImg.js";
import { KPI_CATEGORY_ICON_SRC } from "./timeTaskIconUrls.js";
import { attachIconPngFallback } from "./toolbarIconUrl.js";

/**
 * @param {HTMLElement} titleRow
 * @param {"dream"|"sideincome"|"happiness"|"health"|"habittracker"} categoryKey
 */
export function setupKpiCategoryHeaderIcon(titleRow, categoryKey) {
  if (!titleRow) return;
  if (titleRow.querySelector(".dream-view-header-category-icon")) return;
  const src = KPI_CATEGORY_ICON_SRC[categoryKey];
  if (!src) return;
  const img = document.createElement("img");
  img.className = "dream-view-header-category-icon";
  attachIconPngFallback(img, src);
  img.src = src;
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
