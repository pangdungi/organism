import { applyStaticAppIconImg } from "./staticAppIconImg.js";
import { takeDisplayIconImg } from "./reuseDisplayIconImg.js";
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
  const img = takeDisplayIconImg(src, {
    className: "dream-view-header-category-icon",
    width: 28,
    height: 28,
  });
  attachIconPngFallback(img, src);
  applyStaticAppIconImg(img);
  titleRow.insertBefore(img, titleRow.firstChild);
}

/** @param {HTMLElement} titleRow @param {boolean} visible */
export function setKpiCategoryHeaderIconVisible(titleRow, visible) {
  const icon = titleRow?.querySelector?.(".dream-view-header-category-icon");
  if (!icon) return;
  icon.hidden = !visible;
}
