/**
 * 할일/일정 섹션 할 일 — 세션 메모리가 본진. 영속 복구는 Supabase(calendar_section_tasks).
 * 구버전 localStorage는 최초 접근 시 한 번 읽은 뒤 제거합니다.
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

/** 구버전 tombstone 키 — 마이그레이션 후 제거 */
const SECTION_TASK_TOMBSTONES_KEY = "todo-section-task-deletion-tombstones";

let _legacyMigrated = false;
/** @type {Record<string, unknown>} */
let _sectionTasksMem = {};
/** @type {Record<string, unknown>} */
let _customSectionTasksMem = {};
/** @type {Record<string, number>} */
let _todoDeletionTombstonesMem = {};

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
  _todoDeletionTombstonesMem = {};
  try {
    const rawS = localStorage.getItem(SECTION_TASKS_KEY);
    if (rawS) {
      const o = JSON.parse(rawS);
      if (o && typeof o === "object") _sectionTasksMem = o;
    }
    const rawC = localStorage.getItem(CUSTOM_SECTION_TASKS_KEY);
    if (rawC) {
      const o = JSON.parse(rawC);
      if (o && typeof o === "object") _customSectionTasksMem = o;
    }
    const rawT = localStorage.getItem(SECTION_TASK_TOMBSTONES_KEY);
    if (rawT) {
      const o = JSON.parse(rawT);
      if (o && typeof o === "object") _todoDeletionTombstonesMem = o;
    }
  } catch (_) {}
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    if (!Array.isArray(_sectionTasksMem[k])) _sectionTasksMem[k] = [];
  });
  try {
    localStorage.removeItem(SECTION_TASKS_KEY);
    localStorage.removeItem(CUSTOM_SECTION_TASKS_KEY);
    localStorage.removeItem(SECTION_TASK_TOMBSTONES_KEY);
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
 * 로그아웃·계정 전환 시: 섹션 할 일·tombstone 메모리 초기화 및 구버전 LS 제거
 */
export function clearTodoSectionTasksMemAndLegacy() {
  try {
    localStorage.removeItem(SECTION_TASKS_KEY);
    localStorage.removeItem(CUSTOM_SECTION_TASKS_KEY);
    localStorage.removeItem(SECTION_TASK_TOMBSTONES_KEY);
  } catch (_) {}
  _legacyMigrated = true;
  _sectionTasksMem = {};
  _customSectionTasksMem = {};
  _todoDeletionTombstonesMem = {};
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

/** 동기화 메타 제외 후 비교 (localModifiedAt·serverUpdatedAt) */
export function stripTodoTaskSyncMetaForCompare(t) {
  if (!t || typeof t !== "object") return "";
  const { localModifiedAt, serverUpdatedAt, ...rest } = t;
  try {
    return JSON.stringify(rest);
  } catch (_) {
    return "";
  }
}

function readTodoDeletionTombstones() {
  migrateLegacyLocalStorageOnce();
  return cloneDeep(_todoDeletionTombstonesMem);
}

function writeTodoDeletionTombstones(obj) {
  migrateLegacyLocalStorageOnce();
  _todoDeletionTombstonesMem = cloneDeep(obj || {});
}

/** 할 일 행 삭제 시 호출 — 서버 반영 전까지 동일 id는 pull에서 무시 */
export function recordTodoSectionTaskDeletion(taskId) {
  const id = String(taskId || "").trim();
  if (!id || !UUID_RE.test(id)) return;
  const tomb = readTodoDeletionTombstones();
  tomb[id] = Date.now();
  writeTodoDeletionTombstones(tomb);
}

/** 서버 스냅샷에 해당 id가 없으면(삭제 확인) tombstone 제거 */
export function pruneTodoDeletionTombstones(serverIdsPresent) {
  const set =
    serverIdsPresent instanceof Set
      ? serverIdsPresent
      : new Set(Array.isArray(serverIdsPresent) ? serverIdsPresent : []);
  const tomb = readTodoDeletionTombstones();
  let changed = false;
  for (const id of Object.keys(tomb)) {
    if (!set.has(id)) {
      delete tomb[id];
      changed = true;
    }
  }
  if (changed) writeTodoDeletionTombstones(tomb);
}

function parseIsoMs(iso) {
  if (iso == null || iso === "") return 0;
  const t = Date.parse(String(iso));
  return Number.isFinite(t) ? t : 0;
}

function pickTodoTaskByLastWrite(localTask, serverRow) {
  const serverT = parseIsoMs(serverRow.updated_at);
  const localMod =
    typeof localTask.localModifiedAt === "number" &&
    Number.isFinite(localTask.localModifiedAt)
      ? localTask.localModifiedAt
      : 0;
  if (localMod > serverT) {
    return { ...localTask };
  }
  return dbRowToLocalTask(serverRow);
}

function collectLocalTasksFlat(fixedIn, customIn) {
  const map = new Map();
  function visit(obj, isCustom) {
    if (!obj) return;
    Object.keys(obj).forEach((sectionKey) => {
      const arr = Array.isArray(obj[sectionKey]) ? obj[sectionKey] : [];
      arr.forEach((t, idx) => {
        const id = String(t?.taskId || t?.id || "").trim();
        if (!id) return;
        map.set(id, {
          task: { ...t },
          sectionKey,
          isCustom,
          sortOrder: idx,
        });
      });
    });
  }
  visit(fixedIn, false);
  visit(customIn, true);
  return map;
}

function rebuildMergedMapsFromFlatMap(map, fixed, custom) {
  const byKey = new Map();
  for (const { task, sectionKey, isCustom, sortOrder } of map.values()) {
    const key = `${isCustom ? "c" : "f"}:${sectionKey}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key).push({ task, sortOrder: sortOrder ?? 0 });
  }
  for (const [key, items] of byKey) {
    items.sort((a, b) => a.sortOrder - b.sortOrder);
    const sep = key.indexOf(":");
    const type = key.slice(0, sep);
    const sk = key.slice(sep + 1);
    const arr = items.map((i) => i.task);
    if (type === "f") {
      fixed[sk] = arr;
    } else {
      custom[sk] = arr;
    }
  }
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    if (!fixed[k]) fixed[k] = [];
  });
}

/**
 * 서버 SELECT 결과만으로 섹션 할 일 메모리를 통째로 덮어씀(서버 = 진실, 화면은 서버 스냅샷 반영).
 * pull 직후·sync(upsert+고아삭제) 성공 후에 호출한다.
 */
export function replaceSectionTasksFromServerRows(rows) {
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

  const serverIds = new Set();
  for (const row of sorted) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    serverIds.add(id);
    const task = dbRowToLocalTask(row);
    const key = String(row.section_key || "").trim();
    const isCustom = !!row.is_custom_section;
    if (!key) continue;
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
  pruneTodoDeletionTombstones(serverIds);
  writeSectionTasksObject(fixed);
  writeCustomSectionTasksObject(custom);
}

/**
 * 서버 스냅샷을 로컬과 병합 (통째 덮어쓰기 아님).
 * - 로컬만 있는 행(아직 push 안 됨) 유지
 * - 동일 id: localModifiedAt vs 서버 updated_at last-write-wins
 * - 로컬에서 삭제한 id는 tombstone 동안 서버 행을 적용하지 않음(부활 방지)
 */
export function mergeCalendarSectionTasksFromServer(rows) {
  const fixed = {};
  const custom = {};
  CALENDAR_FIXED_SECTION_IDS.forEach((k) => {
    fixed[k] = [];
  });

  const localFixed = readSectionTasksObject();
  const localCustom = readCustomSectionTasksObject();
  const map = collectLocalTasksFlat(localFixed, localCustom);
  const tomb = readTodoDeletionTombstones();
  const serverRows = Array.isArray(rows) ? rows : [];
  const serverIds = new Set(
    serverRows.map((r) => String(r.id || "").trim()).filter(Boolean),
  );

  for (const row of serverRows) {
    const id = String(row.id || "").trim();
    if (!id) continue;
    if (tomb[id]) continue;
    const localEntry = map.get(id);
    const mergedTask = localEntry
      ? pickTodoTaskByLastWrite(localEntry.task, row)
      : dbRowToLocalTask(row);
    const sectionKey = String(row.section_key || "").trim();
    const isCustom = !!row.is_custom_section;
    const sortOrder = row.sort_order ?? 0;
    if (!sectionKey) continue;
    map.set(id, {
      task: mergedTask,
      sectionKey,
      isCustom,
      sortOrder,
    });
  }

  pruneTodoDeletionTombstones(serverIds);
  rebuildMergedMapsFromFlatMap(map, fixed, custom);
  for (const k of Object.keys(localCustom)) {
    if (!custom[k]) custom[k] = [];
  }
  writeSectionTasksObject(fixed);
  writeCustomSectionTasksObject(custom);
}

/**
 * 다른 기기에서 추가된 행만 로컬에 합친다(덮어쓰기 아님).
 * 오래된 브라우저가 sync 시 서버 id를 모른 채 고아 삭제로 지우는 것을 막기 위해 sync 직전에 호출한다.
 */
export function mergeAdditiveServerRowsIntoLocal(serverRows) {
  const fixed = readSectionTasksObject();
  const custom = readCustomSectionTasksObject();
  const seen = new Set();

  function collectIds(obj) {
    Object.keys(obj || {}).forEach((k) => {
      const arr = Array.isArray(obj[k]) ? obj[k] : [];
      arr.forEach((t) => {
        const id = String(t?.taskId || t?.id || "").trim();
        if (id) seen.add(id);
      });
    });
  }
  collectIds(fixed);
  collectIds(custom);

  const tomb = readTodoDeletionTombstones();

  const sorted = [...(serverRows || [])].sort((a, b) => {
    const sk = String(a.section_key || "").localeCompare(String(b.section_key || ""));
    if (sk !== 0) return sk;
    return (a.sort_order || 0) - (b.sort_order || 0);
  });

  sorted.forEach((row) => {
    const id = String(row.id || "").trim();
    if (!id || seen.has(id)) return;
    if (tomb[id]) return;
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
    seen.add(id);
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
