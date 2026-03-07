/**
 * 체크박스 영역 우클릭 메뉴: 할일 / 일정
 * - 할일: 네모 체크박스, 체크 시 취소선
 * - 일정: 동그라미, 클릭해도 완료 안됨
 */

export function createTodoCheckboxTypeMenu() {
  const menu = document.createElement("div");
  menu.className = "todo-checkbox-type-menu";
  let currentOnSelect = null;

  const options = [
    { id: "todo", label: "할일" },
    { id: "schedule", label: "일정" },
  ];

  options.forEach((opt) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "todo-checkbox-type-menu-item";
    item.textContent = opt.label;
    item.dataset.type = opt.id;
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentOnSelect) currentOnSelect(opt.id);
      hide();
    });
    menu.appendChild(item);
  });

  /**
   * @param {number} x
   * @param {number} y
   * @param {Function} onSelect - (type: "todo" | "schedule") => void
   */
  function show(x, y, onSelect) {
    currentOnSelect = onSelect;
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
