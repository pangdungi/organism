/**
 * ensureCalendarSectionTaskIds 로 저장소의 taskId만 UUID로 바뀐 뒤,
 * DOM 카드/행은 옛 task-* id를 유지하는 불일치를 맞춤.
 * 전체 __lpRenderMain 없이 data-task-id 만 갱신 → 스크롤 위치 유지.
 */

import { readSectionTasksObject, readCustomSectionTasksObject } from "./todoSectionTasksModel.js";
import { todoSectionSyncLog } from "./todoSectionSyncDebug.js";

const TASK_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getTasksArrayForSection(sectionId) {
  const fixed = readSectionTasksObject();
  if (Array.isArray(fixed[sectionId])) return fixed[sectionId];
  const custom = readCustomSectionTasksObject();
  if (Array.isArray(custom[sectionId])) return custom[sectionId];
  return [];
}

/**
 * @param {string} sectionId
 * @param {HTMLElement} sec `.todo-section` 요소
 */
export function patchTodoDomTaskIdsForSectionElement(sectionId, sec) {
  if (!sec || !sectionId) return;
  try {
    const arr = getTasksArrayForSection(sectionId);
    if (!Array.isArray(arr)) return;
    const nameToUuid = new Map();
    arr.forEach((t) => {
      const n = (t.name || "").trim();
      const tid = String(t.taskId || "").trim();
      if (!n || !TASK_ID_UUID_RE.test(tid)) return;
      if (!nameToUuid.has(n)) nameToUuid.set(n, tid);
    });
    sec.querySelectorAll(".todo-card").forEach((card) => {
      const n = (card.dataset.name || "").trim();
      const uuid = nameToUuid.get(n);
      const cur = (card.dataset.taskId || "").trim();
      if (uuid && cur !== uuid) card.dataset.taskId = uuid;
    });
    sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").forEach((row) => {
      const nameInput = row.querySelector(".todo-task-name-field");
      const n = (nameInput?.value || "").trim();
      const uuid = nameToUuid.get(n);
      const cur = (row.dataset.taskId || "").trim();
      if (uuid && cur !== uuid) row.dataset.taskId = uuid;
    });
  } catch (_) {}
}

/** 현재 화면의 할일 목록 섹션 전부 — sync/hydrate 직후 UUID만 맞출 때 */
export function patchAllTodoDomTaskIdsFromStorage() {
  if (typeof document === "undefined") return;
  todoSectionSyncLog("patchDom:화면카드_taskId만동기");
  document.querySelectorAll(".todo-sections-wrap .todo-section[data-section]").forEach((sec) => {
    const sid = (sec.dataset.section || "").trim();
    if (!sid || sid === "overdue") return;
    patchTodoDomTaskIdsForSectionElement(sid, sec);
  });
}
