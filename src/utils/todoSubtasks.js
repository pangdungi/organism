/**
 * 할일목록 세부(하위) 태스크 — 세션 메모리. 구버전 LS는 최초 접근 시 이관 후 제거.
 * 최상위 → 하위 2단계만 지원
 */

const TODO_SUBTASKS_KEY = "todo-subtasks";

let _legacyMigrated = false;
/** @type {Record<string, unknown[]>} */
let _subtasksMem = {};

function migrateLegacyOnce() {
  if (_legacyMigrated) return;
  _legacyMigrated = true;
  _subtasksMem = {};
  try {
    const raw = localStorage.getItem(TODO_SUBTASKS_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      if (o && typeof o === "object") _subtasksMem = o;
    }
  } catch (_) {}
  try {
    localStorage.removeItem(TODO_SUBTASKS_KEY);
  } catch (_) {}
}

function cloneDeep(obj) {
  try {
    return JSON.parse(JSON.stringify(obj == null ? {} : obj));
  } catch (_) {
    return {};
  }
}

function loadAll() {
  migrateLegacyOnce();
  return cloneDeep(_subtasksMem);
}

function persistAll(all) {
  migrateLegacyOnce();
  _subtasksMem = cloneDeep(all || {});
}

export function getSubtasks(taskId) {
  const all = loadAll();
  const items = Array.isArray(all[taskId]) ? all[taskId] : [];
  return items.filter((it) => (it.name || "").trim() !== "");
}

export function setSubtasks(taskId, items) {
  const all = loadAll();
  const valid = (items || []).filter((it) => (it.name || "").trim() !== "");
  if (valid.length === 0) {
    delete all[taskId];
  } else {
    all[taskId] = valid;
  }
  persistAll(all);
}

function genId() {
  return `st-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function addSubtask(taskId, item = { name: "", done: false }) {
  const items = getSubtasks(taskId);
  const newItem = { id: genId(), name: item.name ?? "", done: !!item.done };
  items.push(newItem);
  if ((newItem.name || "").trim() !== "") {
    setSubtasks(taskId, items);
  }
  return items;
}

export function updateSubtask(taskId, subtaskId, updates) {
  let items = getSubtasks(taskId);
  const idx = items.findIndex((it) => it.id === subtaskId);
  if (idx >= 0) {
    items = items.map((it) =>
      it.id === subtaskId ? { ...it, ...updates } : it,
    );
  } else if ((updates.name || "").trim()) {
    items = [
      ...items,
      {
        id: subtaskId,
        name: (updates.name || "").trim(),
        done: !!updates.done,
      },
    ];
  }
  setSubtasks(taskId, items);
  return items;
}

export function removeSubtask(taskId, subtaskId) {
  const items = getSubtasks(taskId).filter((it) => it.id !== subtaskId);
  setSubtasks(taskId, items);
  return items;
}

export function clearSubtasks(taskId) {
  setSubtasks(taskId, []);
}

/** 완료 체크된 세부 항목만 제거 (부모 할 일은 유지) */
export function removeAllCompletedSubtasksFromStore() {
  const all = loadAll();
  let changed = false;
  for (const taskId of Object.keys(all)) {
    const items = Array.isArray(all[taskId]) ? all[taskId] : [];
    const next = items.filter((it) => !it.done);
    if (next.length !== items.length) {
      changed = true;
      if (next.length === 0) delete all[taskId];
      else all[taskId] = next;
    }
  }
  if (changed) persistAll(all);
  return changed;
}

/**
 * 로그아웃·계정 전환 시
 */
export function clearTodoSubtasksMemAndLegacy() {
  try {
    localStorage.removeItem(TODO_SUBTASKS_KEY);
  } catch (_) {}
  _legacyMigrated = true;
  _subtasksMem = {};
}
