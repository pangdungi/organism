/**
 * 할일/일정 섹션 할 일 — 진실 원천은 Supabase(calendar_section_tasks).
 * 아래 메모리는 서버 SELECT 직후에만 채워지는 표시용 버퍼이며, tombstone·localModifiedAt 같은
 * 별도 “로컬 진실” 메타는 두지 않는다. 동기화 시 upsert는 메모리에 있는 전 실질 행 일괄 반영 후
 * 다시 서버 스냅샷으로 덮는다.
 * 구버전 localStorage 키는 읽지 않고 제거만(예전 디스크 데이터는 채택하지 않음).
 */

import { clearSubtasks } from "./todoSubtasks.js";
import { logTodoResurrection } from "./todoResurrectionDebug.js";

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
  /* 디스크에서 할 일 목록을 읽어 오지 않음 — 키만 제거(서버 pull로만 채움) */
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

/** 고정·커스텀 섹션 할 일 행 개수(콘솔 디버그용) */
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

/** pull 전후 변경 감지(무한 리렌더 방지) */
export function snapshotSectionTasksForPullCompare() {
  migrateLegacyLocalStorageOnce();
  return `${JSON.stringify(_sectionTasksMem)}\n${JSON.stringify(_customSectionTasksMem)}`;
}

/**
 * sync/pull 직후 비교용 — serverUpdatedAt 만 바뀐 경우는 동일로 본다.
 * (서버 round-trip 후 타임스탬프만 갱신돼도 전체 리렌더·hydrate 연쇄가 나지 않게)
 */
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

/**
 * 로그아웃·계정 전환 시: 섹션 할 일 메모리 초기화 및 구버전 LS 제거
 */
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
    serverUpdatedAt:
      row.updated_at != null && row.updated_at !== ""
        ? String(row.updated_at)
        : "",
  };
}

/** 동기화 메타 제외 후 비교 (serverUpdatedAt) */
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
 * 서버 SELECT 결과만으로 섹션 할 일 메모리를 통째로 덮어씀(서버 = 진실, 화면은 서버 스냅샷 반영).
 * pull 직후·sync 성공 후에 호출한다.
 * @param {unknown[]} rows
 * @param {string} [caller] 콘솔 출처 표시용 — "pull" | "sync" 등
 */
export function replaceSectionTasksFromServerRows(rows, caller = "") {
  migrateLegacyLocalStorageOnce();
  const fixed = {};
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    fixed[k] = [];
  });
  const custom = {};

  const sorted = [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const sk = String(a.section_key || "").localeCompare(String(b.section_key || ""));
    if (sk !== 0) return sk;
    const ic = (a.is_custom_section ? 1 : 0) - (b.is_custom_section ? 1 : 0);
    if (ic !== 0) return ic;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  let _dbgApplied = 0;
  for (const row of sorted) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    const task = dbRowToLocalTask(row);
    const key = String(row.section_key || "").trim();
    const isCustom = !!row.is_custom_section;
    if (!key) continue;
    _dbgApplied++;
    if (isCustom) {
      if (!custom[key]) custom[key] = [];
      custom[key].push(task);
    } else {
      if (!fixed[key]) fixed[key] = [];
      fixed[key].push(task);
    }
  }
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    if (!fixed[k]) fixed[k] = [];
  });
  writeSectionTasksObject(fixed);
  writeCustomSectionTasksObject(custom);
  logTodoResurrection("replaceSectionTasksFromServerRows_끝", {
    서버행_총: sorted.length,
    로컬에_쓴_행수: _dbgApplied,
  });
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
