/**
 * 할일목록 태스크 우클릭 컨텍스트 메뉴
 * - 현재 리스트 제외한 전체 리스트(꿈/부수입/건강/행복 + 커스텀)로 이동
 */

import { getCustomSections } from "./todoSettings.js";

const KPI_OPTIONS = [
  { id: "braindump", label: "브레인 덤프" },
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
];

function getAllSectionOptions() {
  const custom = getCustomSections().map((s) => ({ id: s.id, label: s.label }));
  return [...KPI_OPTIONS, ...custom];
}

/**
 * @param {Function} onSelect - (targetSectionId) => void
 */
export function createBraindumpContextMenu(onSelect) {
  const menu = document.createElement("div");
  menu.className = "todo-braindump-context-menu";
  menu.hidden = true;

  function renderItems(excludeSectionId) {
    menu.innerHTML = "";
    const allOptions = getAllSectionOptions();
    const options = excludeSectionId ? allOptions.filter((opt) => opt.id !== excludeSectionId) : allOptions;

    options.forEach((opt) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "todo-braindump-context-menu-item";
      item.textContent = opt.label;
      item.dataset.sectionId = opt.id;
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect(opt.id);
        hide();
      });
      menu.appendChild(item);
    });
  }

  /**
   * @param {number} x - 화면 x 좌표
   * @param {number} y - 화면 y 좌표
   * @param {string} [excludeSectionId] - 현재 섹션 ID (꿈/부수입/건강/행복일 때 해당 리스트 제외)
   */
  function show(x, y, excludeSectionId = null) {
    renderItems(excludeSectionId);
    menu.hidden = false;
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
  }

  function hide() {
    menu.hidden = true;
  }

  const closeHandler = (e) => {
    if (!menu.contains(e.target)) hide();
  };

  menu.addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", closeHandler);
  document.addEventListener("contextmenu", closeHandler);

  return { menu, show, hide };
}
