/**
 * 브레인덤프 태스크 우클릭 컨텍스트 메뉴
 * - 꿈, 부수입, 건강, 행복으로 이동
 */

const MOVE_OPTIONS = [
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
];

export function createBraindumpContextMenu(onSelect) {
  const menu = document.createElement("div");
  menu.className = "todo-braindump-context-menu";
  menu.hidden = true;

  MOVE_OPTIONS.forEach((opt) => {
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

  function show(x, y) {
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
