/**
 * 할일/일정 localStorage (todo-section-tasks / todo-custom-section-tasks) — KPI 제외
 */

import { clearSubtasks } from "./todoSubtasks.js";

export const SECTION_TASKS_KEY = "todo-section-tasks";
export const CUSTOM_SECTION_TASKS_KEY = "todo-custom-section-tasks";

export const CALENDAR_FIXED_SECTION_IDS = [
  "braindump",
  "dream",
  "sideincome",
  "health",
  "happy",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newTaskId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "";
}

export function readSectionTasksObject() {
  try {
    const raw = localStorage.getItem(SECTION_TASKS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch (_) {
    return {};
  }
}

export function readCustomSectionTasksObject() {
  try {
    const raw = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch (_) {
    return {};
  }
}

export function writeSectionTasksObject(obj) {
  try {
    localStorage.setItem(SECTION_TASKS_KEY, JSON.stringify(obj || {}));
  } catch (_) {}
}

export function writeCustomSectionTasksObject(obj) {
  try {
    localStorage.setItem(CUSTOM_SECTION_TASKS_KEY, JSON.stringify(obj || {}));
  } catch (_) {}
}

function normalizeDate(val) {
  const s = String(val || "").trim().slice(0, 10);
  return s || null;
}

function taskRowIsSubstantive(t) {
  const id = String(t.taskId || t.id || "").trim();
  return !!(t && String(t.name || "").trim() && UUID_RE.test(id));
}

/** 로컬 task → DB upsert payload (id는 클라이언트 생성 UUID) */
export function localTaskToDbPayload(userId, sectionKey, isCustom, sortOrder, t) {
  const id = String(t.taskId || t.id || "").trim();
  if (!UUID_RE.test(id)) return null;
  return {
    id,
    user_id: userId,
    section_key: String(sectionKey || "").trim(),
    is_custom_section: !!isCustom,
    sort_order: sortOrder,
    name: String(t.name || "").trim(),
    start_date: normalizeDate(t.startDate),
    due_date: normalizeDate(t.dueDate),
    start_time: String(t.startTime || "").trim(),
    end_time: String(t.endTime || "").trim(),
    reminder_date: normalizeDate(t.reminderDate),
    reminder_time: String(t.reminderTime || "").trim(),
    eisenhower: String(t.eisenhower || "").trim(),
    done: !!t.done,
    item_type: String(t.itemType || "todo").trim() || "todo",
  };
}

function dbRowToLocalTask(row) {
  return {
    taskId: row.id,
    name: row.name ?? "",
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : "",
    dueDate: row.due_date ? String(row.due_date).slice(0, 10) : "",
    startTime: row.start_time ?? "",
    endTime: row.end_time ?? "",
    eisenhower: row.eisenhower ?? "",
    done: !!row.done,
    itemType: row.item_type ?? "todo",
    reminderDate: row.reminder_date ? String(row.reminder_date).slice(0, 10) : "",
    reminderTime: row.reminder_time ?? "",
  };
}

/** 서버 행 목록 → 두 개의 localStorage 객체 */
export function mergeCalendarSectionTasksFromServer(rows) {
  const fixed = {};
  const custom = {};
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    fixed[k] = [];
  });

  const sorted = [...(rows || [])].sort((a, b) => {
    const sk = String(a.section_key || "").localeCompare(String(b.section_key || ""));
    if (sk !== 0) return sk;
    const o = (a.sort_order || 0) - (b.sort_order || 0);
    return o;
  });

  sorted.forEach((row) => {
    const task = dbRowToLocalTask(row);
    const key = String(row.section_key || "").trim();
    const isCustom = !!row.is_custom_section;
    if (!key) return;
    if (isCustom) {
      if (!custom[key]) custom[key] = [];
      custom[key].push(task);
    } else {
      if (!fixed[key]) fixed[key] = [];
      fixed[key].push(task);
    }
  });

  writeSectionTasksObject(fixed);
  writeCustomSectionTasksObject(custom);
}

function ensureTaskIdsInList(arr) {
  let dirty = false;
  const out = (Array.isArray(arr) ? arr : []).map((t) => {
    if (!t || typeof t !== "object") return t;
    const tid = String(t.taskId || "").trim();
    if (tid && UUID_RE.test(tid)) return t;
    const nid = newTaskId();
    if (!nid) return t;
    dirty = true;
    return { ...t, taskId: nid };
  });
  return { list: out, dirty };
}

/** 모든 섹션 taskId를 UUID로 보정 @returns {{ dirty: boolean }} */
export function ensureCalendarSectionTaskIds() {
  const fixed = readSectionTasksObject();
  const custom = readCustomSectionTasksObject();
  let dirty = false;

  Object.keys(fixed).forEach((k) => {
    const { list, dirty: d } = ensureTaskIdsInList(fixed[k]);
    fixed[k] = list;
    if (d) dirty = true;
  });
  Object.keys(custom).forEach((k) => {
    const { list, dirty: d } = ensureTaskIdsInList(custom[k]);
    custom[k] = list;
    if (d) dirty = true;
  });

  if (dirty) {
    writeSectionTasksObject(fixed);
    writeCustomSectionTasksObject(custom);
  }
  return { dirty };
}

export function flattenCalendarTasksForSync(userId) {
  const fixed = readSectionTasksObject();
  const custom = readCustomSectionTasksObject();
  const payloads = [];

  Object.keys(fixed).forEach((sectionKey) => {
    const arr = Array.isArray(fixed[sectionKey]) ? fixed[sectionKey] : [];
    arr.forEach((t, idx) => {
      const p = localTaskToDbPayload(userId, sectionKey, false, idx, t);
      if (p && taskRowIsSubstantive({ ...t, taskId: p.id })) payloads.push(p);
    });
  });

  Object.keys(custom).forEach((sectionKey) => {
    const arr = Array.isArray(custom[sectionKey]) ? custom[sectionKey] : [];
    arr.forEach((t, idx) => {
      const p = localTaskToDbPayload(userId, sectionKey, true, idx, t);
      if (p && taskRowIsSubstantive({ ...t, taskId: p.id })) payloads.push(p);
    });
  });

  return payloads;
}

function taskRowMarkedDone(t) {
  if (!t || typeof t !== "object") return false;
  if (t.done === true || t.done === 1) return true;
  const s = t.done;
  if (typeof s === "string" && s.toLowerCase() === "true") return true;
  return false;
}

/**
 * 고정·커스텀 섹션 저장소에서 완료된 할 일을 모두 제거 후 Supabase 동기 시 삭제되도록 반환.
 * - 화면: 카드 data-done / 테이블 todo 행 체크 기준 taskId 제거(저장소 done 과 불일치해도 삭제)
 * - 저장소: done 플래그 true 인 행 제거(다른 기기·탭에만 있던 완료분)
 */
export function purgeAllCompletedSectionAndCustomTasks() {
  const fixed = readSectionTasksObject();
  const custom = readCustomSectionTasksObject();
  const beforeSnap = JSON.stringify({ fixed, custom });
  const removedParentIds = [];
  const calKeys = new Set(CALENDAR_FIXED_SECTION_IDS);

  function applyRemoveIds(arr, idSet) {
    const a = Array.isArray(arr) ? arr : [];
    const next = [];
    for (const t of a) {
      const tid = String(t.taskId || "").trim();
      if (tid && idSet.has(tid)) {
        removedParentIds.push(tid);
        continue;
      }
      next.push(t);
    }
    return next;
  }

  if (typeof document !== "undefined") {
    document.querySelectorAll(".todo-section[data-section]").forEach((sec) => {
      const sid = (sec.dataset.section || "").trim();
      if (!sid || sid === "overdue") return;
      const idSet = new Set();
      sec.querySelectorAll(".todo-card").forEach((card) => {
        if (card.dataset.done !== "true") return;
        const id = (card.dataset.taskId || "").trim();
        if (id) idSet.add(id);
      });
      sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").forEach((row) => {
        const it = (row.dataset.itemType || "todo").toLowerCase();
        if (it !== "todo") return;
        if (!row.querySelector(".todo-done-check")?.checked) return;
        const id = (row.dataset.taskId || "").trim();
        if (id) idSet.add(id);
      });
      if (idSet.size === 0) return;
      if (calKeys.has(sid)) {
        fixed[sid] = applyRemoveIds(fixed[sid], idSet);
      } else if (sid.startsWith("custom-")) {
        custom[sid] = applyRemoveIds(custom[sid], idSet);
      }
    });
  }

  function stripDoneRows(obj) {
    for (const k of Object.keys(obj)) {
      const arr = Array.isArray(obj[k]) ? obj[k] : [];
      const next = [];
      for (const t of arr) {
        if (taskRowMarkedDone(t)) {
          const id = String(t.taskId || "").trim();
          if (id) removedParentIds.push(id);
        } else {
          next.push(t);
        }
      }
      obj[k] = next;
    }
  }
  stripDoneRows(fixed);
  stripDoneRows(custom);

  for (const id of new Set(removedParentIds)) {
    clearSubtasks(id);
  }

  const changed = beforeSnap !== JSON.stringify({ fixed, custom });
  return { fixed, custom, changed };
}
