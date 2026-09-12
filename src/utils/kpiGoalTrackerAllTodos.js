/**
 * 진행 상황 — 전체 할일 (잡무 + 태스크완료형 KPI 할일)
 */

import { DEFAULT_CHORE_TASK_KPI_ID } from "./defaultKpiIconIds.js";
import { persistHappinessKpiTodoCompleted } from "./happinessKpiMapSupabase.js";
import { persistKpiCompletionEventOnly } from "./kpiCompletionEventPersist.js";
import { persistKpiTodoRowOnly } from "./kpiTodoOneRowPersist.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { sortNormalizedKpiTodoRows } from "./kpiMapTodoListOrder.js";
import {
  applyKpiTodoCompletedStamp,
  syncKpiTaskCompletionEventOnTodoToggle,
} from "./kpiTaskCompletionEvents.js";
import {
  addKpiTodo,
  kpiShowsTaskCompletionTodos,
  removeKpiTodo,
  stampAndPersistKpiMap,
  updateKpiTodo,
} from "./kpiTodoSync.js";
import { showKpiTodoAddModal } from "./kpiTodoAddModal.js";
import { showKpiTodoEditModal } from "./kpiTodoEditModal.js";
import {
  confirmAndPurgeCompletedKpiTodos,
  KPI_SEG_CLEAR_COMPLETED_TRASH_ICON,
} from "./kpiTodoBulkDeleteUi.js";
import { showAlertModal, showConfirmModal } from "./confirmModal.js";
import { stripKpiTodoFromTimeLedgerIfUncompleted } from "./kpiTodoStripFromTimeLedger.js";
import { isKpiTwoPaneSplitViewport } from "./kpiTwoPaneSplit.js";
import {
  ALL_TODOS_BUILTIN_STORAGE_KEY,
  addBuiltinAllTodo,
  collectBuiltinAllTodoGroups,
  getBuiltinTodoTextById,
  purgeCompletedBuiltinAllTodos,
  removeBuiltinAllTodo,
  toggleBuiltinAllTodo,
  updateBuiltinAllTodo,
} from "./allTodosBuiltinLists.js";

const SELECTED_KEY = "lp_habit_all_todos_selected";

const ALL_TODOS_ADD_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';

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
 *   rows: Array<{ id: string, text: string, completed: boolean }>,
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
      if (!kpiShowsTaskCompletionTodos(kpi)) continue;
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
        rows,
        open: rows.filter((r) => !r.completed),
        done: rows.filter((r) => r.completed),
      });
    }
  }

  const all = [...collectBuiltinAllTodoGroups(), ...groups];
  all.sort((a, b) => {
    if (a.isChore !== b.isChore) return a.isChore ? -1 : 1;
    return a.kpiName.localeCompare(b.kpiName, "ko");
  });
  return all;
}

/**
 * @param {string} storageKey
 * @param {string} todoId
 * @param {boolean} completed
 */
function toggleTodoCompleted(storageKey, todoId, completed, listId) {
  if (storageKey === ALL_TODOS_BUILTIN_STORAGE_KEY) {
    const ok = toggleBuiltinAllTodo(listId, todoId, completed);
    if (ok) {
      stripKpiTodoFromTimeLedgerIfUncompleted(
        !!completed,
        todoId,
        getBuiltinTodoTextById(todoId),
      );
    }
    return ok;
  }
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
  applyKpiTodoCompletedStamp(todo, !!completed);
  const kpi = (data.kpis || []).find(
    (k) => String(k.id || "").trim() === String(todo.kpiId || "").trim(),
  );
  syncKpiTaskCompletionEventOnTodoToggle(
    data,
    kpi || { id: todo.kpiId },
    String(todoId),
    !!completed,
    wasCompleted,
  );
  stampAndPersistKpiMap(storageKey, prevSnapshot, data, {
    pushServer: false,
  });
  if (storageKey === "kpi-happiness-map") {
    void persistHappinessKpiTodoCompleted(String(todoId), !!completed);
  } else {
    void persistKpiTodoRowOnly(storageKey, todo);
    void persistKpiCompletionEventOnly(storageKey, String(todoId), !!completed);
  }
  stripKpiTodoFromTimeLedgerIfUncompleted(
    !!completed,
    todoId,
    todo.text,
  );
  return true;
}

/**
 * @param {string} storageKey
 * @param {string} kpiId
 * @param {string} text
 * @returns {boolean}
 */
function addTodoToKpi(storageKey, kpiId, text) {
  if (storageKey === ALL_TODOS_BUILTIN_STORAGE_KEY) {
    return !!addBuiltinAllTodo(kpiId, text);
  }
  return !!addKpiTodo(kpiId, storageKey, text)?.success;
}

function updateTodoInGroup(storageKey, listId, todoId, text) {
  if (storageKey === ALL_TODOS_BUILTIN_STORAGE_KEY) {
    return updateBuiltinAllTodo(listId, todoId, text);
  }
  return !!updateKpiTodo(todoId, storageKey, { text });
}

function removeTodoInGroup(storageKey, listId, todoId) {
  if (storageKey === ALL_TODOS_BUILTIN_STORAGE_KEY) {
    return removeBuiltinAllTodo(listId, todoId);
  }
  return !!removeKpiTodo(todoId, storageKey);
}

function appendDeletedKpiTodoRefLocal(data, kind, id) {
  if (!id) return;
  if (!data.deletedRefs || typeof data.deletedRefs !== "object") {
    data.deletedRefs = {};
  }
  const arr = Array.isArray(data.deletedRefs[kind])
    ? data.deletedRefs[kind]
    : [];
  const s = String(id);
  if (!arr.includes(s)) arr.push(s);
  data.deletedRefs[kind] = arr;
}

async function confirmAndPurgeCompletedForGroup(g) {
  const latest =
    collectTaskCompletionTodoGroups().find((x) => groupKey(x) === groupKey(g)) ||
    g;
  if (latest.storageKey === ALL_TODOS_BUILTIN_STORAGE_KEY) {
    const n = (latest.done || []).length;
    if (n === 0) {
      await showAlertModal({
        title: "완료한 할 일 삭제",
        message: "삭제할 완료한 할 일이 없습니다.",
      });
      return false;
    }
    const ok = await showConfirmModal({
      title: "완료한 할 일 삭제",
      message: `완료한 할 일 ${n}개를 삭제할까요?`,
      warnMessage: "삭제 후에는 복구할 수 없습니다.",
      confirmText: "삭제",
      cancelText: "취소",
      confirmDanger: true,
    });
    if (!ok) return false;
    await purgeCompletedBuiltinAllTodos(latest.kpiId);
    return true;
  }
  return confirmAndPurgeCompletedKpiTodos({
    kpiId: g.kpiId,
    loadMap: () => loadMap(g.storageKey),
    saveMap: (data, opts) => {
      stampAndPersistKpiMap(g.storageKey, loadMap(g.storageKey), data, {
        pushServer: !!opts?.pushServer,
      });
    },
    storageKey: g.storageKey,
    appendDeletedRef: appendDeletedKpiTodoRefLocal,
    title: "완료한 할 일 삭제",
    emptyMessage: "삭제할 완료한 할 일이 없습니다.",
  });
}

function groupKey(g) {
  return `${g.storageKey}::${g.kpiId}`;
}

function readSelectedKey() {
  try {
    return String(sessionStorage.getItem(SELECTED_KEY) || "").trim();
  } catch (_) {
    return "";
  }
}

/** @param {string} key */
function writeSelectedKey(key) {
  try {
    if (key) sessionStorage.setItem(SELECTED_KEY, key);
    else sessionStorage.removeItem(SELECTED_KEY);
  } catch (_) {}
}

/**
 * @param {ParentNode | null | undefined} root
 * @returns {{
 *   boardScrollLeft: number,
 *   navScrollTop: number,
 *   listScrollByKpi: Record<string, number>,
 * }}
 */
export function captureAllTodosBoardScrollState(root) {
  const nav =
    root instanceof Element
      ? root.querySelector(".habit-tracker-all-todos-nav")
      : null;
  /** @type {Record<string, number>} */
  const listScrollByKpi = {};
  if (root instanceof Element) {
    root.querySelectorAll("[data-all-todos-kpi-id]").forEach((col) => {
      const id = String(col.getAttribute("data-all-todos-kpi-id") || "").trim();
      const list = col.querySelector(".habit-tracker-all-todos-list");
      if (!id || !(list instanceof HTMLElement)) return;
      listScrollByKpi[id] = list.scrollTop;
    });
  }
  return {
    boardScrollLeft: 0,
    navScrollTop: nav instanceof HTMLElement ? nav.scrollTop : 0,
    listScrollByKpi,
  };
}

/**
 * @param {HTMLElement} container
 * @param {{
 *   navScrollTop?: number,
 *   listScrollByKpi?: Record<string, number>,
 * }} [opts]
 */
export function mountKpiGoalAllTodosSection(container, opts = {}) {
  if (!container) return;
  const keepNavScroll = Number(
    opts.navScrollTop ?? container._lpAllTodosNavScrollTop,
  );
  const keepListScroll =
    opts.listScrollByKpi && typeof opts.listScrollByKpi === "object"
      ? opts.listScrollByKpi
      : container._lpAllTodosListScrollByKpi &&
          typeof container._lpAllTodosListScrollByKpi === "object"
        ? container._lpAllTodosListScrollByKpi
        : {};
  container.replaceChildren();

  const root = document.createElement("section");
  root.className = "habit-tracker-all-todos";
  root.setAttribute("aria-label", "전체 할일");

  const groups = collectTaskCompletionTodoGroups();
  const openTotal = groups.reduce((n, g) => n + g.open.length, 0);

  const summary = document.createElement("p");
  summary.className = "habit-tracker-all-todos-summary";
  summary.textContent = groups.length
    ? `남은 할일 ${openTotal}개 · 목록 ${groups.length}개`
    : "";
  root.appendChild(summary);

  if (!groups.length) {
    const empty = document.createElement("p");
    empty.className = "dream-goals-empty habit-tracker-all-todos-empty";
    empty.textContent =
      "잡무·태스크완료형 KPI에 등록된 할일이 없습니다.";
    root.appendChild(empty);
    container.appendChild(root);
    container._lpAllTodosOpenAdd = null;
    container._lpAllTodosClearCompleted = null;
    container._lpAllTodosSyncAddChrome = null;
    return;
  }

  const savedKey = readSelectedKey();
  /** @type {(typeof groups)[number] | null} */
  let selected =
    groups.find((g) => groupKey(g) === savedKey) || groups[0] || null;
  if (selected) writeSelectedKey(groupKey(selected));

  const split = document.createElement("div");
  split.className = "habit-tracker-all-todos-split";

  const nav = document.createElement("nav");
  nav.className = "habit-tracker-all-todos-nav";
  nav.setAttribute("aria-label", "할일 목록");

  const detail = document.createElement("section");
  detail.className = "habit-tracker-all-todos-detail";
  detail.setAttribute("aria-label", "할일");

  const remountBoard = () => {
    const snap = captureAllTodosBoardScrollState(container);
    container._lpAllTodosNavScrollTop = snap.navScrollTop;
    container._lpAllTodosListScrollByKpi = snap.listScrollByKpi;
    mountKpiGoalAllTodosSection(container, snap);
  };

  const freshGroup = (key) =>
    collectTaskCompletionTodoGroups().find((x) => groupKey(x) === key) ||
    null;

  const metaText = (g, openN) => `${g.domainLabel} · 남음 ${openN}`;

  const syncAddChrome = () => {
    const wide = isKpiTwoPaneSplitViewport();
    const addBtn = root.querySelector("[data-all-todos-add-icon]");
    const trashBtn = root.querySelector("[data-all-todos-clear-completed]");
    if (addBtn instanceof HTMLElement) {
      addBtn.hidden = !wide || !selected;
    }
    if (trashBtn instanceof HTMLElement) {
      trashBtn.hidden = !wide || !selected;
    }
  };

  const openAddForSelected = async () => {
    if (!selected) return;
    const g = selected;
    const text = await showKpiTodoAddModal({
      kpiName: g.kpiName,
      title: "할 일 추가",
      placeholder: "할 일 입력",
    });
    if (!text) return;
    if (!addTodoToKpi(g.storageKey, g.kpiId, text)) return;
    remountBoard();
  };

  const openClearCompletedForSelected = async () => {
    if (!selected) return;
    const g = selected;
    const ok = await confirmAndPurgeCompletedForGroup(g);
    if (!ok) return;
    remountBoard();
  };

  const refreshOpenCounts = (g, listEl) => {
    const openN = listEl
      ? [...listEl.querySelectorAll(".dream-kpi-todo-item")].filter(
          (el) => !el.classList.contains("is-completed"),
        ).length
      : 0;
    const key = groupKey(g);
    nav.querySelectorAll("[data-all-todos-nav-key]").forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (el.getAttribute("data-all-todos-nav-key") !== key) return;
      el.dataset.openCount = String(openN);
    });
    const detailMeta = detail.querySelector(".habit-tracker-all-todos-card-meta");
    if (detailMeta instanceof HTMLElement) {
      detailMeta.textContent = metaText(g, openN);
    }
    let totalOpen = 0;
    nav.querySelectorAll("[data-all-todos-nav-key]").forEach((el) => {
      totalOpen += Number(el.dataset.openCount) || 0;
    });
    summary.textContent = `남은 할일 ${totalOpen}개 · 목록 ${groups.length}개`;
  };

  const paintDetail = (gIn) => {
    const g = freshGroup(groupKey(gIn)) || gIn;
    selected = g;
    writeSelectedKey(groupKey(g));
    nav.querySelectorAll("[data-all-todos-nav-key]").forEach((btn) => {
      const on = btn.getAttribute("data-all-todos-nav-key") === groupKey(g);
      btn.classList.toggle("is-selected", on);
      btn.setAttribute("aria-current", on ? "true" : "false");
    });

    detail.replaceChildren();
    const col = document.createElement("article");
    col.className = "habit-tracker-all-todos-col";
    col.setAttribute("data-all-todos-kpi-id", g.kpiId);
    if (g.isChore) col.classList.add("is-chore");

    const head = document.createElement("header");
    head.className = "habit-tracker-all-todos-col-head";
    const titleRow = document.createElement("div");
    titleRow.className = "habit-tracker-all-todos-col-head-row";
    titleRow.innerHTML = `<h3 class="habit-tracker-all-todos-card-name">${escapeHtml(g.kpiName)}</h3>`;
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "habit-tracker-all-todos-add-icon";
    addBtn.setAttribute("data-all-todos-add-icon", "");
    addBtn.innerHTML = ALL_TODOS_ADD_ICON;
    addBtn.title = `${g.kpiName}에 할일 추가`;
    addBtn.setAttribute("aria-label", `${g.kpiName}에 할일 추가`);
    addBtn.addEventListener("click", () => {
      void openAddForSelected();
    });
    const trashBtn = document.createElement("button");
    trashBtn.type = "button";
    trashBtn.className = "habit-tracker-all-todos-clear-completed";
    trashBtn.setAttribute("data-all-todos-clear-completed", "");
    trashBtn.innerHTML = KPI_SEG_CLEAR_COMPLETED_TRASH_ICON;
    trashBtn.title = `${g.kpiName} 완료한 할 일 삭제`;
    trashBtn.setAttribute("aria-label", `${g.kpiName} 완료한 할 일 삭제`);
    trashBtn.addEventListener("click", () => {
      void openClearCompletedForSelected();
    });
    titleRow.appendChild(trashBtn);
    titleRow.appendChild(addBtn);
    const meta = document.createElement("span");
    meta.className = "habit-tracker-all-todos-card-meta";
    meta.textContent = metaText(g, g.open.length);
    head.appendChild(titleRow);
    head.appendChild(meta);
    col.appendChild(head);

    const list = document.createElement("div");
    list.className = "dream-kpi-todo-list habit-tracker-all-todos-list";

    const renderRow = (todo) => {
      const item = document.createElement("div");
      item.className = "dream-kpi-todo-item";
      if (todo.completed) item.classList.add("is-completed");
      item.dataset.todoId = todo.id;

      const label = document.createElement("label");
      label.className = "dream-kpi-todo-check-wrap";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "dream-kpi-todo-check";
      check.checked = !!todo.completed;
      check.setAttribute("aria-label", `${todo.text} 완료`);
      label.appendChild(check);

      const preview = document.createElement("div");
      preview.className = "dream-kpi-todo-list-preview";
      preview.textContent = todo.text;

      const openTodoEdit = async () => {
        const result = await showKpiTodoEditModal({
          kpiName: g.kpiName,
          initialText: todo.text || "",
          title: "할 일 수정",
        });
        if (!result) return;
        if (result.action === "delete") {
          if (!removeTodoInGroup(g.storageKey, g.kpiId, todo.id)) return;
          remountBoard();
          return;
        }
        if (!updateTodoInGroup(g.storageKey, g.kpiId, todo.id, result.text)) {
          return;
        }
        remountBoard();
      };

      item.addEventListener("click", async (e) => {
        if (e.target.closest(".dream-kpi-todo-check-wrap")) return;
        await openTodoEdit();
      });

      check.addEventListener("change", () => {
        const ok = toggleTodoCompleted(
          g.storageKey,
          todo.id,
          !!check.checked,
          g.kpiId,
        );
        if (!ok) {
          check.checked = !check.checked;
          return;
        }
        item.classList.toggle("is-completed", !!check.checked);
        refreshOpenCounts(g, list);
      });

      item.appendChild(label);
      item.appendChild(preview);
      list.appendChild(item);
    };

    if (!g.rows.length) {
      const none = document.createElement("p");
      none.className = "habit-tracker-all-todos-none";
      none.textContent = "할일 없음";
      list.appendChild(none);
    } else {
      for (const t of g.rows) renderRow(t);
    }

    list.addEventListener(
      "scroll",
      () => {
        if (!container._lpAllTodosListScrollByKpi) {
          container._lpAllTodosListScrollByKpi = {};
        }
        container._lpAllTodosListScrollByKpi[g.kpiId] = list.scrollTop;
      },
      { passive: true },
    );

    col.appendChild(list);
    detail.appendChild(col);
    syncAddChrome();

    const keepTop = Number(keepListScroll[g.kpiId]);
    const restoreList = () => {
      if (Number.isFinite(keepTop) && keepTop > 0) list.scrollTop = keepTop;
    };
    restoreList();
    requestAnimationFrame(() => {
      restoreList();
      requestAnimationFrame(restoreList);
    });
  };

  for (const g of groups) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "habit-tracker-all-todos-nav-item";
    btn.setAttribute("data-all-todos-nav-key", groupKey(g));
    btn.dataset.openCount = String(g.open.length);
    if (g.isChore) btn.classList.add("is-chore");
    btn.innerHTML = `<span class="habit-tracker-all-todos-nav-name">${escapeHtml(g.kpiName)}</span>`;
    btn.addEventListener("click", () => {
      if (selected && groupKey(selected) === groupKey(g)) return;
      paintDetail(g);
    });
    nav.appendChild(btn);
  }

  nav.addEventListener(
    "scroll",
    () => {
      container._lpAllTodosNavScrollTop = nav.scrollTop;
    },
    { passive: true },
  );

  split.appendChild(nav);
  split.appendChild(detail);
  root.appendChild(split);
  container.appendChild(root);

  container._lpAllTodosOpenAdd = openAddForSelected;
  container._lpAllTodosClearCompleted = openClearCompletedForSelected;
  container._lpAllTodosSyncAddChrome = syncAddChrome;

  if (selected) paintDetail(selected);

  const restoreNav = () => {
    if (Number.isFinite(keepNavScroll) && keepNavScroll > 0) {
      nav.scrollTop = keepNavScroll;
    }
  };
  restoreNav();
  requestAnimationFrame(() => {
    restoreNav();
    requestAnimationFrame(restoreNav);
  });
}
