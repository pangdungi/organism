import { applyStaticAppIconImg } from "./staticAppIconImg.js";
import { getTimeTaskIconSrcBySlug } from "./timeTaskIconUrls.js";

/** 생산 KPI 탭 — time-task 카테고리 fallback PNG */
const KPI_CATEGORY_ICON_SLUG = {
  dream: "prod-cat-dream",
  sideincome: "prod-cat-sideincome",
  happiness: "prod-cat-happiness",
  health: "prod-cat-health",
};

/**
 * @param {"dream"|"sideincome"|"happiness"|"health"} categoryKey
 */
export function createKpiCategoryHeaderIcon(categoryKey) {
  const slug = KPI_CATEGORY_ICON_SLUG[categoryKey];
  if (!slug) return null;
  const img = document.createElement("img");
  img.className = "dream-view-header-category-icon";
  img.src = getTimeTaskIconSrcBySlug(slug);
  img.alt = "";
  img.width = 28;
  img.height = 28;
  img.decoding = "async";
  applyStaticAppIconImg(img);
  return img;
}

/** 제목(h1) 왼쪽에 KPI 카테고리 아이콘 삽입 */
export function prependKpiCategoryHeaderIcon(titleRow, categoryKey) {
  const icon = createKpiCategoryHeaderIcon(categoryKey);
  if (!icon || !titleRow) return;
  titleRow.insertBefore(icon, titleRow.firstChild);
}
