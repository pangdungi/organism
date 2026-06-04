/**
 * 모달 확인 직후 Supabase upsert — 실패 시 사용자 알림 없이 백그라운드 재시도.
 * pull 로 세션 메모리를 덮기 전·후에 대기 중 행을 병합해 연속 추가 유실 방지.
 */

import {
  readSectionTasksObject,
  readCustomSectionTasksObject,
  writeSectionTasksObject,
  writeCustomSectionTasksObject,
  CALENDAR_FIXED_SECTION_IDS,
} from "./todoSectionTasksModel.js";

const RETRY_DELAYS_MS = [400, 800, 1600, 3200, 6000, 12000, 30000];

/** @type {Map<string, { task: object, sectionKey: string, isCustom: boolean, sortOrder: number, attempts: number, retryTimer: ReturnType<typeof setTimeout> | null }>} */
const _pending = new Map();

function modalTaskToSessionRow(task) {
  const t = task && typeof task === "object" ? task : {};
  return {
    taskId: String(t.taskId || "").trim(),
    name: String(t.name || "").trim(),
    startDate: (t.startDate || "").slice(0, 10) || "",
    dueDate: (t.dueDate || "").slice(0, 10) || "",
    startTime: String(t.startTime || "").trim(),
    endTime: String(t.endTime || "").trim(),
    eisenhower: String(t.eisenhower || "").trim(),
    done: !!t.done,
    itemType: String(t.itemType || "todo").trim() || "todo",
    reminderDate: (t.reminderDate || "").slice(0, 10) || "",
    reminderTime: String(t.reminderTime || "").trim(),
  };
}

/** @param {{ task: object, sectionKey: string, isCustom: boolean, sortOrder: number }} params */
export function trackPendingCalendarSectionTaskUpsert(params) {
  const taskId = String(params?.task?.taskId || "").trim();
  if (!taskId) return;
  const prev = _pending.get(taskId);
  if (prev?.retryTimer != null) clearTimeout(prev.retryTimer);
  _pending.set(taskId, {
    task: params.task,
    sectionKey: String(params.sectionKey || "").trim(),
    isCustom: !!params.isCustom,
    sortOrder:
      typeof params.sortOrder === "number" && params.sortOrder >= 0
        ? params.sortOrder
        : 0,
    attempts: prev?.attempts ?? 0,
    retryTimer: null,
  });
}

export function clearPendingCalendarSectionTaskUpsert(taskId) {
  const id = String(taskId || "").trim();
  if (!id) return;
  const entry = _pending.get(id);
  if (entry?.retryTimer != null) clearTimeout(entry.retryTimer);
  _pending.delete(id);
}

export function hasPendingCalendarSectionTaskUpserts() {
  return _pending.size > 0;
}

export function isPendingCalendarSectionTaskUpsert(taskId) {
  const id = String(taskId || "").trim();
  return id ? _pending.has(id) : false;
}

/** @returns {{ task: object, sectionKey: string, isCustom: boolean, sortOrder: number } | null} */
export function getPendingCalendarSectionTaskUpsertParams(taskId) {
  const id = String(taskId || "").trim();
  const entry = _pending.get(id);
  if (!entry) return null;
  return {
    task: entry.task,
    sectionKey: entry.sectionKey,
    isCustom: entry.isCustom,
    sortOrder: entry.sortOrder,
  };
}

/** pull 직후·덮어쓰기 유실 방지 — 아직 서버에 없을 수 있는 확인 직후 행을 세션에 다시 합침 */
export function mergePendingCalendarSectionTasksIntoSessionMemory() {
  if (!_pending.size) return;
  const fixed = readSectionTasksObject();
  const custom = readCustomSectionTasksObject();

  _pending.forEach((entry) => {
    const sk = entry.sectionKey;
    if (!sk) return;
    const row = modalTaskToSessionRow(entry.task);
    if (!row.taskId || !row.name) return;

    if (entry.isCustom) {
      if (!Array.isArray(custom[sk])) custom[sk] = [];
      const arr = custom[sk];
      const idx = arr.findIndex((x) => String(x?.taskId || "") === row.taskId);
      if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
      else arr.push(row);
    } else if (CALENDAR_FIXED_SECTION_IDS.includes(sk)) {
      if (!Array.isArray(fixed[sk])) fixed[sk] = [];
      const arr = fixed[sk];
      const idx = arr.findIndex((x) => String(x?.taskId || "") === row.taskId);
      if (idx >= 0) arr[idx] = { ...arr[idx], ...row };
      else arr.push(row);
    }
  });

  writeSectionTasksObject(fixed);
  writeCustomSectionTasksObject(custom);
}

/** @param {string} reason */
export function shouldRetryCalendarSectionTaskUpsert(reason) {
  const r = String(reason || "").trim();
  if (!r) return true;
  if (r === "payload_null" || r === "no_id") return false;
  return true;
}

/**
 * @param {string} taskId
 * @param {() => Promise<{ ok?: boolean, reason?: string }>} runUpsert
 */
export function schedulePendingCalendarSectionTaskUpsertRetry(taskId, runUpsert) {
  const id = String(taskId || "").trim();
  const entry = _pending.get(id);
  if (!id || !entry) return;

  entry.attempts += 1;
  const delay =
    RETRY_DELAYS_MS[Math.min(entry.attempts - 1, RETRY_DELAYS_MS.length - 1)] ??
    30000;

  if (entry.retryTimer != null) clearTimeout(entry.retryTimer);
  entry.retryTimer = setTimeout(() => {
    entry.retryTimer = null;
    if (!_pending.has(id)) return;
    void runUpsert();
  }, delay);
}
