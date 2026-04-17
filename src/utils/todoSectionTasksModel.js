/**
 * 할일/일정 섹션 할 일 — 이 탭 세션 안에서만 쓰는 메모리 객체 + DB 행 모양(`localTaskToDbPayload`).
 *
 * 서버(Supabase)가 저장의 단일 원본이다. 이 메모리는 화면/탭 동안의 스냅샷일 뿐이며,
 * 여기서 모아서 서버에 올리는 일괄 동기화는 하지 않는다. 서버 쓰기는 사용자 확정
 * 경로(모달 저장·삭제 등)에서만 수행한다.
 * 디스크(localStorage)에는 섹션 할 일 행을 쓰지 않음(구버전 키만 제거).
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

let _legacyMigrated = false;
/** @type {Record<string, unknown>} */
let _sectionTasksMem = {};
/** @type {Record<string, unknown>} */
let _customSectionTasksMem = {};

function cloneDeep(obj) {
  try {
    return JSON.parse(JSON.stringify(obj == null ? {} : obj));
  } catch (_) {
    return {};
  }
}

function migrateLegacyLocalStorageOnce() {
  if (_legacyMigrated) return;
  _legacyMigrated = true;
  _sectionTasksMem = {};
  _customSectionTasksMem = {};
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    _sectionTasksMem[k] = [];
  });
  try {
    localStorage.removeItem(SECTION_TASKS_KEY);
    localStorage.removeItem(CUSTOM_SECTION_TASKS_KEY);
    localStorage.removeItem("todo-section-task-deletion-tombstones");
  } catch (_) {}
}

function newTaskId() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "";
}

export function readSectionTasksObject() {
  migrateLegacyLocalStorageOnce();
  const o = cloneDeep(_sectionTasksMem);
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    if (!Array.isArray(o[k])) o[k] = [];
  });
  return o;
}

export function readCustomSectionTasksObject() {
  migrateLegacyLocalStorageOnce();
  return cloneDeep(_customSectionTasksMem);
}

export function countTodoSectionTasksInStorage() {
  const fixed = readSectionTasksObject();
  const custom = readCustomSectionTasksObject();
  let n = 0;
  Object.values(fixed).forEach((arr) => {
    if (Array.isArray(arr)) n += arr.length;
  });
  Object.values(custom).forEach((arr) => {
    if (Array.isArray(arr)) n += arr.length;
  });
  return n;
}

export function writeSectionTasksObject(obj) {
  migrateLegacyLocalStorageOnce();
  const next = cloneDeep(obj || {});
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    if (!Array.isArray(next[k])) next[k] = [];
  });
  _sectionTasksMem = next;
}

export function writeCustomSectionTasksObject(obj) {
  migrateLegacyLocalStorageOnce();
  _customSectionTasksMem = cloneDeep(obj || {});
}

export function snapshotSectionTasksForPullCompare() {
  migrateLegacyLocalStorageOnce();
  return `${JSON.stringify(_sectionTasksMem)}\n${JSON.stringify(_customSectionTasksMem)}`;
}

export function snapshotSectionTasksSemanticForCompare() {
  const fixed = readSectionTasksObject();
  const custom = readCustomSectionTasksObject();
  function stripContainer(container) {
    const out = {};
    for (const k of Object.keys(container || {})) {
      const arr = container[k];
      out[k] = Array.isArray(arr)
        ? arr.map((t) => {
            if (!t || typeof t !== "object") return t;
            const { serverUpdatedAt, ...rest } = t;
            return rest;
          })
        : arr;
    }
    return out;
  }
  return `${JSON.stringify(stripContainer(fixed))}\n${JSON.stringify(stripContainer(custom))}`;
}

export function clearTodoSectionTasksMemAndLegacy() {
  try {
    localStorage.removeItem(SECTION_TASKS_KEY);
    localStorage.removeItem(CUSTOM_SECTION_TASKS_KEY);
    localStorage.removeItem("todo-section-task-deletion-tombstones");
  } catch (_) {}
  _legacyMigrated = true;
  _sectionTasksMem = {};
  _customSectionTasksMem = {};
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    _sectionTasksMem[k] = [];
  });
}

function normalizeDate(val) {
  const s = String(val || "").trim().slice(0, 10);
  return s || null;
}

function taskRowIsSubstantive(t) {
  const id = String(t.taskId || t.id || "").trim();
  return !!(t && String(t.name || "").trim() && UUID_RE.test(id));
}

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

export function stripTodoTaskSyncMetaForCompare(t) {
  if (!t || typeof t !== "object") return "";
  const { serverUpdatedAt, ...rest } = t;
  try {
    return JSON.stringify(rest);
  } catch (_) {
    return "";
  }
}

/**
 * 서버 `calendar_section_tasks` SELECT 결과만으로 세션 메모리를 덮어씀(병합·로컬 우선 없음).
 * @param {unknown[]} rows
 * @param {string[]} knownCustomSectionIds `getCustomSections()`의 id 목록(빈 리스트도 유지)
 */
export function applyCalendarSectionTasksServerSnapshot(rows, knownCustomSectionIds = []) {
  migrateLegacyLocalStorageOnce();
  const list = Array.isArray(rows) ? rows : [];

  /** @type {Record<string, { sort: number, task: Record<string, unknown> }[]>} */
  const tempFixed = {};
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    tempFixed[k] = [];
  });
  /** @type {Record<string, { sort: number, task: Record<string, unknown> }[]>} */
  const tempCustom = {};
  const known = new Set((knownCustomSectionIds || []).map((id) => String(id).trim()).filter(Boolean));

  for (const id of known) {
    tempCustom[id] = [];
  }

  function rowToTask(row) {
    const r = row && typeof row === "object" ? row : {};
    const id = String(r.id || "").trim();
    return {
      taskId: id,
      name: String(r.name != null ? r.name : "").trim(),
      startDate: r.start_date ? String(r.start_date).slice(0, 10) : "",
      dueDate: r.due_date ? String(r.due_date).slice(0, 10) : "",
      startTime: String(r.start_time != null ? r.start_time : "").trim(),
      endTime: String(r.end_time != null ? r.end_time : "").trim(),
      reminderDate: r.reminder_date ? String(r.reminder_date).slice(0, 10) : "",
      reminderTime: String(r.reminder_time != null ? r.reminder_time : "").trim(),
      eisenhower: String(r.eisenhower != null ? r.eisenhower : "").trim(),
      done: !!r.done,
      itemType: String(r.item_type != null ? r.item_type : "todo").trim() || "todo",
      serverUpdatedAt: r.updated_at != null ? String(r.updated_at) : "",
    };
  }

  for (const row of list) {
    const r = row && typeof row === "object" ? row : {};
    const sk = String(r.section_key || "").trim();
    if (!sk) continue;
    const sort = typeof r.sort_order === "number" ? r.sort_order : Number(r.sort_order) || 0;
    const task = rowToTask(r);
    const isCustom = !!r.is_custom_section || sk.startsWith("custom-");
    if (isCustom) {
      if (!tempCustom[sk]) tempCustom[sk] = [];
      tempCustom[sk].push({ sort, task });
    } else if (Object.prototype.hasOwnProperty.call(tempFixed, sk)) {
      tempFixed[sk].push({ sort, task });
    }
  }

  const fixedOut = {};
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    const arr = (tempFixed[k] || []).slice().sort((a, b) => a.sort - b.sort);
    fixedOut[k] = arr.map((x) => x.task);
  });

  const customOut = {};
  for (const k of Object.keys(tempCustom)) {
    const arr = tempCustom[k].slice().sort((a, b) => a.sort - b.sort);
    customOut[k] = arr.map((x) => x.task);
  }

  writeSectionTasksObject(fixedOut);
  writeCustomSectionTasksObject(customOut);
}

/** @deprecated applyCalendarSectionTasksServerSnapshot 사용 */
export function replaceSectionTasksFromServerRows(rows, _caller = "") {
  applyCalendarSectionTasksServerSnapshot(rows, []);
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
