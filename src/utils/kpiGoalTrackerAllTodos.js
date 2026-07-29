/**
 * 진행 상황 — 전체 할일 (잡무 + 태스크완료형 KPI 할일)
 */

import { DEFAULT_CHORE_TASK_KPI_ID } from "./defaultKpiIconIds.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { sortNormalizedKpiTodoRows } from "./kpiMapTodoListOrder.js";
import { syncKpiTaskCompletionEventOnTodoToggle } from "./kpiTaskCompletionEvents.js";
import {
  isKpiTaskCompletionGoalType,
  stampAndPersistKpiMap,
} from "./kpiTodoSync.js";

const DOMAINS = [
  {
    storageKey: "kpi-happiness-map",
    domain: "happiness",
    label: "행복",
  },
  {
    storageKey: "kpi-sideincome-paths",
    domain: "sideincome",
    label: "시급",
  },
  {
    storageKey: "kpi-health-map",
    domain: "health",
    label: "건강",
  },
  {
    storageKey: "kpi-dream-map",
    domain: "dream",
    label: "꿈",
  },
];

function loadMap(storageKey) {
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @returns {{
 *   storageKey: string,
 *   domain: string,
 *   domainLabel: string,
 *   kpiId: string,
 *   kpiName: string,
 *   isChore: boolean,
 *   open: Array<{ id: string, text: string, completed: boolean }>,
 *   done: Array<{ id: string, text: string, completed: boolean }>,
 * }[]}
 */
export function collectTaskCompletionTodoGroups() {
  /** @type {ReturnType<typeof collectTaskCompletionTodoGroups>} */
  const groups = [];

  for (const d of DOMAINS) {
    const data = loadMap(d.storageKey);
    const kpis = Array.isArray(data.kpis) ? data.kpis : [];
    const todos = Array.isArray(data.kpiTodos) ? data.kpiTodos : [];

    for (const kpi of kpis) {
      if (!isKpiTaskCompletionGoalType(kpi)) continue;
      const kpiId = String(kpi.id || "").trim();
      if (!kpiId) continue;
      const rows = sortNormalizedKpiTodoRows(
        todos.filter(
          (t) =>
            String(t?.kpiId || "").trim() === kpiId &&
            String(t?.text || "").trim() !== "",
        ),
      ).map((t) => ({
        id: String(t.id),
        text: String(t.text || "").trim(),
        completed: !!t.completed,
      }));
      if (!rows.length) continue;
      groups.push({
        storageKey: d.storageKey,
        domain: d.domain,
        domainLabel: d.label,
        kpiId,
        kpiName: String(kpi.name || "").trim() || "KPI",
        isChore: kpiId === DEFAULT_CHORE_TASK_KPI_ID,
        open: rows.filter((r) => !r.completed),
        done: rows.filter((r) => r.completed),
      });
    }
  }

  groups.sort((a, b) => {
    if (a.isChore !== b.isChore) return a.isChore ? -1 : 1;
    const domainRank = (g) =>
      DOMAINS.findIndex((x) => x.storageKey === g.storageKey);
    const dr = domainRank(a) - domainRank(b);
    if (dr) return dr;
    return a.kpiName.localeCompare(b.kpiName, "ko");
  });

  return groups;
}

/**
 * @param {string} storageKey
 * @param {string} todoId
 * @param {boolean} completed
 */
function toggleTodoCompleted(storageKey, todoId, completed) {
  const raw = readKpiMapScopedStorageRaw(storageKey);
  if (!raw) return false;
  let prevSnapshot;
  try {
    prevSnapshot = JSON.parse(raw);
  } catch (_) {
    return false;
  }
  const data = JSON.parse(raw);
  data.kpiTodos = Array.isArray(data.kpiTodos) ? data.kpiTodos : [];
  const todo = data.kpiTodos.find((t) => String(t.id) === String(todoId));
  if (!todo) return false;
  const wasCompleted = !!todo.completed;
  todo.completed = !!completed;
  const kpi = (data.kpis || []).find(
    (k) => String(k.id || "").trim() === String(todo.kpiId || "").trim(),
  );
  syncKpiTaskCompletionEventOnTodoToggle(
    data,
    kpi,
    String(todoId),
    !!completed,
    wasCompleted,
  );
  stampAndPersistKpiMap(storageKey, prevSnapshot, data, { pushServer: true });
  return true;
}

/**
 * @param {HTMLElement} container
 * @param {{ boardScrollLeft?: number }} [opts]
 */
export function mountKpiGoalAllTodosSection(container, opts = {}) {
  if (!container) return;
  const keepScrollLeft = Number(opts.boardScrollLeft);
  container.replaceChildren();

  const root = document.createElement("section");
  root.className = "habit-tracker-all-todos";
  root.setAttribute("aria-label", "전체 할일");

  const groups = collectTaskCompletionTodoGroups();
  const openTotal = groups.reduce((n, g) => n + g.open.length, 0);

  const summary = document.createElement("p");
  summary.className = "habit-tracker-all-todos-summary";
  summary.textContent = groups.length
    ? `남은 할일 ${openTotal}개 · KPI ${groups.length}개`
    : "";
  root.appendChild(summary);

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "dream-goals-empty habit-tracker-all-todos-empty";
    empty.textContent =
      "잡무·태스크완료형 KPI에 등록된 할일이 없습니다.";
    root.appendChild(empty);
    container.appendChild(root);
    return;
  }

  const board = document.createElement("div");
  board.className = "habit-tracker-all-todos-board";
  board.setAttribute("role", "list");

  for (const g of groups) {
    const col = document.createElement("article");
    col.className = "habit-tracker-all-todos-col";
    col.setAttribute("role", "listitem");
    if (g.isChore) col.classList.add("is-chore");

    const head = document.createElement("header");
    head.className = "habit-tracker-all-todos-col-head";
    head.innerHTML = `
      <h3 class="habit-tracker-all-todos-card-name">${escapeHtml(g.kpiName)}</h3>
      <span class="habit-tracker-all-todos-card-meta">${escapeHtml(g.domainLabel)} · 남음 ${g.open.length}</span>
    `;
    col.appendChild(head);

    const list = document.createElement("div");
    list.className = "dream-kpi-todo-list habit-tracker-all-todos-list";

    const renderRow = (todo) => {
      const item = document.createElement("div");
      item.className = "dream-kpi-todo-item";
      if (todo.completed) item.classList.add("is-completed");

      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "dream-kpi-todo-check";
      check.checked = !!todo.completed;
      check.setAttribute("aria-label", `${todo.text} 완료`);

      const preview = document.createElement("span");
      preview.className = "dream-kpi-todo-list-preview";
      preview.textContent = todo.text;

      check.addEventListener("change", () => {
        const ok = toggleTodoCompleted(
          g.storageKey,
          todo.id,
          !!check.checked,
        );
        if (!ok) {
          check.checked = !check.checked;
          return;
        }
        mountKpiGoalAllTodosSection(container, {
          boardScrollLeft: board.scrollLeft,
        });
      });

      item.appendChild(check);
      item.appendChild(preview);
      list.appendChild(item);
    };

    if (!g.open.length && !g.done.length) {
      const none = document.createElement("p");
      none.className = "habit-tracker-all-todos-none";
      none.textContent = "할일 없음";
      list.appendChild(none);
    } else {
      for (const t of g.open) renderRow(t);
      for (const t of g.done) renderRow(t);
    }

    col.appendChild(list);
    board.appendChild(col);
  }

  root.appendChild(board);
  container.appendChild(root);

  if (Number.isFinite(keepScrollLeft) && keepScrollLeft > 0) {
    board.scrollLeft = keepScrollLeft;
  }
}
