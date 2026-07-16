/**
 * KPI 매일할일 목록 — 드래그로 순서 변경 (sortOrder → 서버 sync)
 */

import { reorderKpiDailyRepeatTodosForKpi } from "./kpiMapTodoListOrder.js";

const DRAG_HANDLE_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="7" r="1.4"/><circle cx="15" cy="7" r="1.4"/><circle cx="9" cy="12" r="1.4"/><circle cx="15" cy="12" r="1.4"/><circle cx="9" cy="17" r="1.4"/><circle cx="15" cy="17" r="1.4"/></svg>';

/**
 * @param {HTMLElement} listEl
 * @param {{
 *   kpiId: string,
 *   loadMap: () => object,
 *   saveMap: (data: object, opts?: { pushServer?: boolean }) => void,
 *   onAfterReorder?: () => void,
 * }} options
 */
export function wireKpiDailyTodoListDragReorder(listEl, options) {
  const { kpiId, loadMap, saveMap, onAfterReorder } = options;
  if (!(listEl instanceof HTMLElement)) return;

  const items = [...listEl.querySelectorAll(".dream-kpi-todo-item[data-todo-id]")];
  if (items.length < 2) return;

  listEl.classList.add("dream-kpi-todo-list--daily-reorder");

  let draggedId = null;
  let suppressClickUntil = 0;

  items.forEach((item) => {
    let handle = item.querySelector(".dream-kpi-todo-drag-handle");
    if (!(handle instanceof HTMLElement)) {
      handle = document.createElement("button");
      handle.type = "button";
      handle.className = "dream-kpi-todo-drag-handle";
      handle.setAttribute("aria-label", "순서 변경");
      handle.title = "잡고 드래그해 순서 변경";
      handle.innerHTML = DRAG_HANDLE_SVG;
      item.prepend(handle);
    }
    handle.draggable = true;

    handle.addEventListener("click", (e) => {
      e.stopPropagation();
    });

    handle.addEventListener("dragstart", (e) => {
      draggedId = String(item.dataset.todoId || "");
      if (!draggedId) return;
      item.classList.add("dream-kpi-todo-item--dragging");
      e.dataTransfer?.setData("text/plain", draggedId);
      if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    });

    handle.addEventListener("dragend", () => {
      item.classList.remove("dream-kpi-todo-item--dragging");
      listEl
        .querySelectorAll(".dream-kpi-todo-item--drag-over")
        .forEach((el) => el.classList.remove("dream-kpi-todo-item--drag-over"));
      suppressClickUntil = Date.now() + 280;
      draggedId = null;
    });

    item.addEventListener("click", (e) => {
      if (Date.now() < suppressClickUntil) {
        e.preventDefault();
        e.stopPropagation();
      }
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      const fromId = draggedId || e.dataTransfer?.getData("text/plain");
      const toId = String(item.dataset.todoId || "");
      if (!fromId || !toId || fromId === toId) return;
      item.classList.add("dream-kpi-todo-item--drag-over");
    });

    item.addEventListener("dragleave", (e) => {
      if (e.currentTarget === item) {
        item.classList.remove("dream-kpi-todo-item--drag-over");
      }
    });

    item.addEventListener("drop", (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.classList.remove("dream-kpi-todo-item--drag-over");
      const fromId = draggedId || e.dataTransfer?.getData("text/plain");
      const toId = String(item.dataset.todoId || "");
      if (!fromId || !toId || fromId === toId) return;

      const rowEls = [...listEl.querySelectorAll(".dream-kpi-todo-item[data-todo-id]")];
      const ids = rowEls.map((el) => String(el.dataset.todoId || ""));
      const fromIdx = ids.indexOf(fromId);
      const toIdx = ids.indexOf(toId);
      if (fromIdx < 0 || toIdx < 0) return;

      ids.splice(fromIdx, 1);
      ids.splice(toIdx, 0, fromId);

      const byId = new Map(rowEls.map((el) => [String(el.dataset.todoId), el]));
      ids.forEach((id) => {
        const el = byId.get(id);
        if (el) listEl.appendChild(el);
      });

      const data = loadMap();
      reorderKpiDailyRepeatTodosForKpi(data, kpiId, ids);
      saveMap(data, { pushServer: true });
      suppressClickUntil = Date.now() + 280;
      onAfterReorder?.();
    });
  });
}
