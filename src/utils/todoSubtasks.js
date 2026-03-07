/**
 * 할일목록 세부(하위) 태스크 저장
 * 최상위 → 하위 2단계만 지원
 */
const TODO_SUBTASKS_KEY = "todo-subtasks";

function loadAll() {
  try {
    const raw = localStorage.getItem(TODO_SUBTASKS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return {};
}

export function getSubtasks(taskId) {
  const all = loadAll();
  return Array.isArray(all[taskId]) ? all[taskId] : [];
}

export function setSubtasks(taskId, items) {
  const all = loadAll();
  if (!items || items.length === 0) {
    delete all[taskId];
  } else {
    all[taskId] = items;
  }
  try {
    localStorage.setItem(TODO_SUBTASKS_KEY, JSON.stringify(all));
  } catch (_) {}
}

function genId() {
  return `st-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function addSubtask(taskId, item = { name: "", done: false }) {
  const items = getSubtasks(taskId);
  const newItem = { id: genId(), name: item.name ?? "", done: !!item.done };
  items.push(newItem);
  setSubtasks(taskId, items);
  return items;
}

export function updateSubtask(taskId, subtaskId, updates) {
  const items = getSubtasks(taskId).map((it) =>
    it.id === subtaskId ? { ...it, ...updates } : it
  );
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
