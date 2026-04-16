/**
 * 할 일 목록 - 토글 헤더 + Name, Due date + Add Task + 분류 드롭다운
 * KPI 할 일(꿈/부수입/행복/건강) 연동: 마감일 없음, 꿈 이름 자동, 분류=KPI이름
 */

import {
  getKpiTodosAsTasks,
  getKpiDisplayNameForTodo,
  syncKpiTodoCompleted,
  removeAllCompletedKpiTodos,
  removeKpiTodo,
  updateKpiTodo,
  moveKpiTodoToSection,
} from "../utils/kpiTodoSync.js";
import { createTodoSettingsModal } from "../utils/todoSettingsModal.js";
import {
  getTodoSettings,
  getCustomSections,
  addCustomSection,
  removeCustomSection,
  updateCustomSectionLabel,
  getSectionColor,
  snapRgbaToNearestPreset,
  pickRandomPresetRgba,
  readableTextForPresetRgbaBg,
} from "../utils/todoSettings.js";
import {
  getSubtasks,
  addSubtask,
  updateSubtask,
  removeSubtask,
  clearSubtasks,
  setSubtasks,
  removeAllCompletedSubtasksFromStore,
} from "../utils/todoSubtasks.js";
import { refreshEisenhowerQuadrantsIfActive } from "../utils/eisenhowerQuadrantsBridge.js";
import { createBraindumpContextMenu } from "../utils/braindumpContextMenu.js";
import { createTodoCheckboxTypeMenu } from "../utils/todoCheckboxTypeMenu.js";
import {
  persistSectionTasksAndSchedule,
  persistCustomSectionTasksAndSchedule,
  persistFixedSectionTasksAndSyncNow,
  persistCustomSectionTasksAndSyncNow,
  deleteCompletedCalendarSectionTasksFromSupabase,
  deleteCalendarSectionTaskRowById,
  cancelTodoSectionTasksSyncPushSchedule,
  syncTodoSectionTasksToSupabase,
} from "../utils/todoSectionTasksSupabase.js";
import { logLpRender } from "../utils/lpRenderDebugLog.js";
import {
  logTodoScheduleAddStep1,
  logTodoScheduleAddStep2,
  markTodoAddPendingServerLog,
} from "../utils/lpTabDataSourceLog.js";
import {
  readSectionTasksObject,
  readCustomSectionTasksObject,
  writeSectionTasksObject,
  writeCustomSectionTasksObject,
  purgeAllCompletedSectionAndCustomTasks,
  stripTodoTaskSyncMetaForCompare,
} from "../utils/todoSectionTasksModel.js";
import { patchTodoDomTaskIdsForSectionElement } from "../utils/todoDomTaskIdPatch.js";
export const DRAG_TYPE_TODO_TO_CALENDAR = "todo-task-to-calendar";
export const DRAG_TYPE_TODO_TO_EISENHOWER = "todo-task-to-eisenhower";

const TODO_DEBUG = false;
function todoDebug(...args) {
  if (TODO_DEBUG && typeof console !== "undefined" && console.log) console.log("[TODO-DEBUG]", ...args);
}

/** 모바일(≤48rem): 할일 계열 모달은 백드롭 탭으로 닫지 않음(취소·×만) — 데스크탑은 기존 유지 */
function isTodoListMobileModalViewport() {
  try {
    return window.matchMedia("(max-width: 48rem)").matches;
  } catch (_) {
    return false;
  }
}

/** 커스텀 리스트 탭 우클릭 메뉴: document dismiss 리스너 1회만 (render 반복 시 누적 방지) */
let todoListTabContextMenuActive = null;
let todoListTabContextTargetActive = null;
function ensureTodoListTabGlobalDismiss() {
  if (ensureTodoListTabGlobalDismiss._ok) return;
  ensureTodoListTabGlobalDismiss._ok = true;
  document.addEventListener("click", (e) => {
    const menu = todoListTabContextMenuActive;
    if (!menu || menu.hidden) return;
    if (menu.contains(e.target)) return;
    menu.hidden = true;
    todoListTabContextTargetActive = null;
  });
  document.addEventListener("contextmenu", (e) => {
    const menu = todoListTabContextMenuActive;
    if (!menu || menu.hidden) return;
    if (menu.contains(e.target)) return;
    menu.hidden = true;
    todoListTabContextTargetActive = null;
  });
}

// 나의 계정에서 리스트 색상 저장 시 탭 버튼 색상 즉시 반영
window.addEventListener("app-colors-changed", () => {
  const container = document.querySelector(".todo-category-tabs");
  if (!container) return;
  const sectionColors = getTodoSettings().sectionColors;
  container.querySelectorAll(".todo-category-tab[data-section]").forEach((btn) => {
    const c = sectionColors?.[btn.dataset.section];
    if (c) {
      btn.style.borderLeft = `0.0625rem solid ${c}`;
      btn.style.borderTop = `0.0625rem solid ${c}`;
      btn.style.borderRight = `0.0625rem solid ${c}`;
      btn.style.borderBottom = `0.0625rem solid ${c}`;
      btn.style.backgroundColor = "";
    } else {
      btn.style.borderLeft = "";
      btn.style.borderTop = "";
      btn.style.borderRight = "";
      btn.style.borderBottom = "";
    }
  });
});

function loadSectionTasks(sectionId) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (Array.isArray(arr)) {
      const sectionLabel = { dream: "꿈", sideincome: "부수입", health: "건강", happy: "행복", braindump: "브레인 덤프" }[sectionId] || sectionId;
      const out = arr
        .filter((t) => keepTaskInSectionStorage(t))
        .map((t) => ({
          ...t,
          sectionId,
          sectionLabel,
          itemType: t.itemType || "todo",
          isKpiTodo: false,
        }));
      todoDebug("loadSectionTasks", sectionId, "count", out.length);
      return out;
    }
  } catch (_) {}
  return [];
}

function updateSectionTaskDone(sectionId, taskId, done) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      t.done = !!done;
      persistSectionTasksAndSchedule(obj);
      return true;
    }
  } catch (_) {}
  return false;
}

function saveSectionTasks(sectionId, tasks) {
  try {
    const obj = readSectionTasksObject();
    const existingList = obj[sectionId] || [];
    const prevById = new Map(
      existingList.map((t) => [String(t.taskId || "").trim(), t]),
    );
    const domByTaskId = new Map(
      tasks
        .filter((t) => keepTaskInSectionStorage(t))
        .map((t) => [
          t.taskId || "",
          {
            taskId: t.taskId || "",
            name: (t.name || "").trim(),
            startDate: (t.startDate || "").trim(),
            dueDate: (t.dueDate || "").trim(),
            startTime: t.startTime || "",
            endTime: t.endTime || "",
            eisenhower: t.eisenhower || "",
            done: !!t.done,
            itemType: t.itemType || "todo",
            reminderDate: (t.reminderDate || "").trim(),
            reminderTime: (t.reminderTime || "").trim(),
          },
        ]),
    );
    const merged = [];
    existingList.forEach((ex) => {
      const tid = ex.taskId || "";
      const fromDom = domByTaskId.get(tid);
      if (fromDom) {
        merged.push({
          ...ex,
          name: fromDom.name,
          /* DOM이 비워도 빈 값이 저장되도록 (|| ex 는 "" 를 덮어써서 지우기가 반영 안 됨) */
          startDate: (fromDom.startDate || "").slice(0, 10) || "",
          dueDate: (fromDom.dueDate || "").slice(0, 10) || "",
          startTime: fromDom.startTime || "",
          endTime: fromDom.endTime || "",
          eisenhower: fromDom.eisenhower || "",
          done: fromDom.done,
          itemType: fromDom.itemType || ex.itemType || "todo",
          reminderDate: (fromDom.reminderDate || "").slice(0, 10) || "",
          reminderTime: (fromDom.reminderTime || "").trim() || "",
        });
        domByTaskId.delete(tid);
      } else {
        /* DOM에 아직 없을 때(지연 렌더) 기존 메모리 행 유지 */
        merged.push(ex);
      }
    });
    domByTaskId.forEach((t) => {
      merged.push({
        taskId: t.taskId,
        name: t.name,
        startDate: t.startDate || "",
        dueDate: t.dueDate || "",
        startTime: t.startTime || "",
        endTime: t.endTime || "",
        eisenhower: t.eisenhower || "",
        done: t.done,
        itemType: t.itemType || "todo",
        reminderDate: t.reminderDate || "",
        reminderTime: t.reminderTime || "",
      });
    });
    /* 동일 taskId 중복(저장소 UUID vs DOM task-… 불일치 등) 시 마지막 행만 유지 */
    const mergeDedup = new Map();
    merged.forEach((t, idx) => {
      const id = (t.taskId || "").trim();
      mergeDedup.set(id || `_noid_${idx}`, t);
    });
    const mergedUnique = dedupeMergedSectionTasksByNamePreferUuid([...mergeDedup.values()]);
    const toSave = mergedUnique
      .map(
        ({
          taskId,
          name,
          startDate,
          dueDate,
          startTime,
          endTime,
          eisenhower,
          done,
          itemType,
          reminderDate,
          reminderTime,
        }) => {
          const tid = String(taskId || "").trim();
          const candidate = {
            taskId: taskId || "",
            name: (name || "").trim(),
            startDate: (startDate || "").slice(0, 10) || "",
            dueDate: (dueDate || "").slice(0, 10) || "",
            startTime: startTime || "",
            endTime: endTime || "",
            eisenhower: eisenhower || "",
            done: !!done,
            itemType: itemType || "todo",
            reminderDate: (reminderDate || "").slice(0, 10) || "",
            reminderTime: reminderTime || "",
          };
          const prevRow = tid ? prevById.get(tid) : null;
          if (!prevRow) {
            return { ...candidate };
          }
          const same =
            stripTodoTaskSyncMetaForCompare(prevRow) ===
            stripTodoTaskSyncMetaForCompare(candidate);
          if (same) {
            return {
              ...candidate,
              serverUpdatedAt:
                prevRow.serverUpdatedAt !== undefined && prevRow.serverUpdatedAt !== ""
                  ? prevRow.serverUpdatedAt
                  : candidate.serverUpdatedAt,
            };
          }
          return { ...candidate };
        },
      )
      .filter((t) => keepTaskInSectionStorage(t));
    obj[sectionId] = toSave;
    /* DOM 수집 경로는 메모리만 — 서버 upsert는 sync에서 일괄 */
    writeSectionTasksObject(obj);
  } catch (_) {}
}

function moveSectionTaskToSection(fromSectionId, taskId, targetSectionId, taskData) {
  try {
    const obj = readSectionTasksObject();
    const fromArr = obj[fromSectionId];
    if (!Array.isArray(fromArr)) return false;
    const idx = fromArr.findIndex((x) => (x.taskId || "") === taskId);
    if (idx < 0) return false;
    fromArr.splice(idx, 1);
    if (!obj[targetSectionId]) obj[targetSectionId] = [];
    obj[targetSectionId].push({
      taskId: taskData.taskId || taskId,
      name: (taskData.name || "").trim(),
      startDate: taskData.startDate || "",
      dueDate: taskData.dueDate || "",
      startTime: taskData.startTime || "",
      endTime: taskData.endTime || "",
      eisenhower: taskData.eisenhower || "",
      done: !!taskData.done,
      itemType: taskData.itemType || "todo",
      reminderDate: (taskData.reminderDate || "").slice(0, 10) || "",
      reminderTime: taskData.reminderTime || "",
    });
    persistSectionTasksAndSchedule(obj);
    return true;
  } catch (_) {}
  return false;
}

function moveCustomSectionTaskToSection(fromSectionId, taskId, targetSectionId, taskData) {
  try {
    const obj = readCustomSectionTasksObject();
    const fromArr = obj[fromSectionId];
    if (!Array.isArray(fromArr)) return false;
    const idx = fromArr.findIndex((x) => (x.taskId || "") === taskId);
    if (idx < 0) return false;
    fromArr.splice(idx, 1);
    if (!obj[targetSectionId]) obj[targetSectionId] = [];
    obj[targetSectionId].push({
      taskId: taskData.taskId || taskId,
      name: (taskData.name || "").trim(),
      startDate: taskData.startDate || "",
      dueDate: taskData.dueDate || "",
      startTime: taskData.startTime || "",
      endTime: taskData.endTime || "",
      eisenhower: taskData.eisenhower || "",
      done: !!taskData.done,
      itemType: taskData.itemType || "todo",
      reminderDate: (taskData.reminderDate || "").slice(0, 10) || "",
      reminderTime: taskData.reminderTime || "",
    });
    persistCustomSectionTasksAndSchedule(obj);
    return true;
  } catch (_) {}
  return false;
}

function loadCustomSectionTasks(sectionId) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (Array.isArray(arr)) {
      return arr
        .filter((t) => keepTaskInSectionStorage(t))
        .map((t) => ({
          ...t,
          sectionId,
          sectionLabel: getCustomSections().find((s) => s.id === sectionId)?.label || sectionId,
          itemType: t.itemType || "todo",
        }));
    }
  } catch (_) {}
  return [];
}

function saveCustomSectionTasks(sectionId, tasks) {
  try {
    const obj = readCustomSectionTasksObject();
    const existingList = obj[sectionId] || [];
    const prevById = new Map(
      existingList.map((t) => [String(t.taskId || "").trim(), t]),
    );
    const toSave = tasks
      .map(
        ({
          taskId,
          name,
          startDate,
          dueDate,
          startTime,
          endTime,
          eisenhower,
          done,
          itemType,
        }) => {
          const candidate = {
            taskId,
            name: (name || "").trim(),
            startDate: startDate || "",
            dueDate: dueDate || "",
            startTime: startTime || "",
            endTime: endTime || "",
            eisenhower: eisenhower || "",
            done: !!done,
            itemType: itemType || "todo",
          };
          const tid = String(taskId || "").trim();
          const prevRow = tid ? prevById.get(tid) : null;
          if (!prevRow) {
            return { ...candidate };
          }
          const same =
            stripTodoTaskSyncMetaForCompare(prevRow) ===
            stripTodoTaskSyncMetaForCompare(candidate);
          if (same) {
            return {
              ...candidate,
              serverUpdatedAt:
                prevRow.serverUpdatedAt !== undefined && prevRow.serverUpdatedAt !== ""
                  ? prevRow.serverUpdatedAt
                  : candidate.serverUpdatedAt,
            };
          }
          return { ...candidate };
        },
      )
      .filter((t) => keepTaskInSectionStorage(t));
    obj[sectionId] = toSave;
    writeCustomSectionTasksObject(obj);
  } catch (_) {}
}

async function removeCustomSectionTasks(sectionId) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    const ids = Array.isArray(arr)
      ? arr.map((t) => String(t?.taskId || "").trim()).filter(Boolean)
      : [];
    delete obj[sectionId];
    /* 섹션 통째 삭제도 로컬 먼저 비움 — 루프 도중 sync가 옛 행을 다시 upsert 하는 것 방지 */
    writeCustomSectionTasksObject(obj);
    for (const tid of ids) {
      await deleteCalendarSectionTaskRowById(tid);
    }
    persistCustomSectionTasksAndSchedule(obj);
  } catch (_) {}
}

async function removeTaskFromSectionStorage(sectionId, taskId) {
  try {
    cancelScheduleSaveSectionTasksFromDOM();
    cancelTodoSectionTasksSyncPushSchedule();
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return { ok: false, serverDelete: null };
    const tid = String(taskId || "").trim();
    const snapshot = arr.find((t) => String(t.taskId || "").trim() === tid);
    obj[sectionId] = arr.filter((t) => (t.taskId || "") !== taskId);
    /*
     * 로컬을 먼저 지운 뒤 서버 DELETE(await) — 직렬 큐에서 대기하던 sync(메모리→upsert)가
     * 삭제 전 스냅샷으로 행을 서버에 다시 올려 부활시키는 레이스를 막음.
     */
    writeSectionTasksObject(obj);
    const del = await deleteCalendarSectionTaskRowById(taskId);
    if (!del.ok) {
      if (snapshot) {
        const o2 = readSectionTasksObject();
        const cur = Array.isArray(o2[sectionId]) ? o2[sectionId] : [];
        const has = cur.some((t) => String(t.taskId || "").trim() === tid);
        if (!has) o2[sectionId] = [...cur, { ...snapshot }];
        writeSectionTasksObject(o2);
      }
      return { ok: false, serverDelete: del };
    }
    return { ok: true, serverDelete: del };
  } catch (_) {}
  return { ok: false, serverDelete: null };
}

async function removeTaskFromCustomSectionStorage(sectionId, taskId) {
  try {
    cancelScheduleSaveSectionTasksFromDOM();
    cancelTodoSectionTasksSyncPushSchedule();
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return { ok: false, serverDelete: null };
    const tid = String(taskId || "").trim();
    const snapshot = arr.find((t) => String(t.taskId || "").trim() === tid);
    obj[sectionId] = arr.filter((t) => (t.taskId || "") !== taskId);
    writeCustomSectionTasksObject(obj);
    const del = await deleteCalendarSectionTaskRowById(taskId);
    if (!del.ok) {
      if (snapshot) {
        const o2 = readCustomSectionTasksObject();
        const cur = Array.isArray(o2[sectionId]) ? o2[sectionId] : [];
        const has = cur.some((t) => String(t.taskId || "").trim() === tid);
        if (!has) o2[sectionId] = [...cur, { ...snapshot }];
        writeCustomSectionTasksObject(o2);
      }
      return { ok: false, serverDelete: del };
    }
    return { ok: true, serverDelete: del };
  } catch (_) {}
  return { ok: false, serverDelete: null };
}

/** 섹션 변경(이동)만 — 서버 DELETE 없음, 같은 taskId로 다른 섹션에 다시 저장됨 */
function moveTaskOutOfSectionStorageOnly(sectionId, taskId) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    obj[sectionId] = arr.filter((t) => (t.taskId || "") !== taskId);
    cancelScheduleSaveSectionTasksFromDOM();
    void persistFixedSectionTasksAndSyncNow(obj).catch(() => {});
    return true;
  } catch (_) {}
  return false;
}

function moveTaskOutOfCustomSectionStorageOnly(sectionId, taskId) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    obj[sectionId] = arr.filter((t) => (t.taskId || "") !== taskId);
    cancelScheduleSaveSectionTasksFromDOM();
    void persistCustomSectionTasksAndSyncNow(obj).catch(() => {});
    return true;
  } catch (_) {}
  return false;
}

function collectCustomSectionFromDOM(sectionsEl, sectionId) {
  const tasks = [];
  const sec = sectionsEl?.querySelector(`.todo-section[data-section="${sectionId}"]`);
  sec?.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").forEach((row) => {
    const nameInput = row.querySelector(".todo-task-name-field");
    const startInput = row.querySelector(".todo-start-input-hidden");
    const dueInput = row.querySelector(".todo-due-input-hidden");
    const eisenhowerSelect = row.querySelector(".todo-eisenhower-select");
    const doneCheck = row.querySelector(".todo-done-check");
    const itemType = row.dataset.itemType || "todo";
    tasks.push({
      taskId: row.dataset.taskId || "",
      name: (nameInput?.value || "").trim(),
      startDate: startInput?.value || "",
      dueDate: dueInput?.value || "",
      startTime: row.dataset.startTime || "",
      endTime: row.dataset.endTime || "",
      eisenhower: eisenhowerSelect?.value || row.dataset.eisenhower || "",
      done: itemType === "todo" ? (doneCheck?.checked || false) : false,
      itemType,
      reminderDate: row.dataset.reminderDate || "",
      reminderTime: row.dataset.reminderTime || "",
    });
  });
  return tasks;
}

const KPI_SECTION_IDS = ["dream", "sideincome", "happy", "health"];
const FIXED_SECTION_IDS_FOR_STORAGE = ["braindump", ...KPI_SECTION_IDS];

/** ensureCalendarSectionTaskIds 등으로 저장소 taskId만 UUID로 바뀐 뒤 DOM은 task-* 인 불일치 방지 */
const TASK_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 제목 없는 새 줄(추가 직후)도 식별자가 있으면 저장·복원해 전체 리렌더 시 사라지지 않게 함(UUID 또는 getTaskId()의 task-타임스탬프-…) */
function keepTaskInSectionStorage(t) {
  const n = (t.name || "").trim();
  if (n !== "") return true;
  const tid = String(t.taskId || "").trim();
  if (!tid) return false;
  if (TASK_ID_UUID_RE.test(tid)) return true;
  return /^task-\d+-/.test(tid);
}

function syncSectionDomTaskIdsFromStorage(sectionId, sec) {
  patchTodoDomTaskIdsForSectionElement(sectionId, sec);
}

/**
 * 동일 섹션·동일 과제명으로 여러 행이 쌓인 경우(저장소 UUID vs DOM task-* 병합 실수)만 정리한다.
 * 과제명이 같아도 서로 다른 UUID 할 일은 그대로 둔다(이전 로직은 이름만 같으면 1개로 합쳐
 * 로컬에서 행이 사라지고, 다음 Supabase 동기화 시 wantIds 밖 id가 원격에서 삭제되는 문제가 있었음).
 */
function dedupeMergedSectionTasksByNamePreferUuid(merged) {
  const nameGroups = new Map();
  for (const t of merged) {
    const n = (t.name || "").trim();
    if (!n) continue;
    if (!nameGroups.has(n)) nameGroups.set(n, []);
    nameGroups.get(n).push(t);
  }

  const dropRef = new WeakSet();
  for (const [, list] of nameGroups) {
    if (list.length < 2) continue;
    const hasUuid = list.some((t) => TASK_ID_UUID_RE.test((t.taskId || "").trim()));
    if (hasUuid) {
      for (const t of list) {
        if (!TASK_ID_UUID_RE.test((t.taskId || "").trim())) dropRef.add(t);
      }
      continue;
    }
    for (let i = 1; i < list.length; i++) {
      dropRef.add(list[i]);
    }
  }

  return merged.filter((t) => !dropRef.has(t));
}

let _saveSectionTasksTimer = null;

/** 삭제 직전에 호출: 예약된 DOM→메모리(300ms)·즉시 동기화가 삭제·서버 SELECT보다 늦게 돌아 옛 목록을 올리지 않게 함 */
function cancelScheduleSaveSectionTasksFromDOM() {
  if (_saveSectionTasksTimer) {
    clearTimeout(_saveSectionTasksTimer);
    _saveSectionTasksTimer = null;
  }
}

function scheduleSaveSectionTasksFromDOM(sectionsWrap, extraOpts = {}) {
  todoDebug("scheduleSaveSectionTasksFromDOM", { hasWrap: !!sectionsWrap });
  if (!sectionsWrap) return;
  if (_saveSectionTasksTimer) clearTimeout(_saveSectionTasksTimer);
  _saveSectionTasksTimer = setTimeout(() => {
    _saveSectionTasksTimer = null;
    collectAndSaveKpiTasksFromDOM(sectionsWrap, {
      scheduleServerSync: true,
      addLog: extraOpts.addLog,
    });
  }, 300);
}

/** 추가 직후 초안 행이 저장소에 바로 들어가게 함(전체 리렌더·탭 전환과 경쟁) */
function flushSaveSectionTasksFromDOM(sectionsWrap) {
  if (!sectionsWrap) return;
  if (_saveSectionTasksTimer) {
    clearTimeout(_saveSectionTasksTimer);
    _saveSectionTasksTimer = null;
  }
  collectAndSaveKpiTasksFromDOM(sectionsWrap, { scheduleServerSync: true, withCustomSections: true });
}

/**
 * @param {{ scheduleServerSync?: boolean, withCustomSections?: boolean, addLog?: { taskId?: string, sectionId?: string } }} [opts]
 * - scheduleServerSync: 사용자 편집·저장 흐름에서만 true — DOM→메모리 후 즉시 서버 동기(일괄 upsert+SELECT)
 * - addLog: 「할 일 추가」모달 저장 직후 한 번만 — 콘솔 [할일일정·추가] ②·③
 */
function collectAndSaveKpiTasksFromDOM(sectionsWrap, opts = {}) {
  const { scheduleServerSync = false, withCustomSections = false, addLog } = opts;
  todoDebug("collectAndSaveKpiTasksFromDOM", { hasWrap: !!sectionsWrap, scheduleServerSync, withCustomSections });
  if (!sectionsWrap) return;
  FIXED_SECTION_IDS_FOR_STORAGE.forEach((sectionId) => {
    const sec = sectionsWrap.querySelector(`.todo-section[data-section="${sectionId}"]`);
    if (!sec) {
      todoDebug("collectAndSave: section not found", sectionId);
      return;
    }
    syncSectionDomTaskIdsFromStorage(sectionId, sec);
    const sectionTasks = [];
    const cardsWrap = sec.querySelector(".todo-cards-wrap");
    if (cardsWrap) {
      cardsWrap.querySelectorAll(".todo-card").forEach((card) => {
        const name = (card.dataset.name || "").trim();
        const kpiTodoId = card.dataset.kpiTodoId;
        const storageKey = card.dataset.kpiStorageKey;
        const done = card.dataset.done === "true";

        if (kpiTodoId && storageKey) {
          if (name === "") {
            removeKpiTodo(kpiTodoId, storageKey);
          } else {
            updateKpiTodo(kpiTodoId, storageKey, {
              text: name,
              startDate: card.dataset.startDate || "",
              dueDate: card.dataset.dueDate || "",
              startTime: "",
              endTime: "",
              eisenhower: card.dataset.eisenhower || "",
              completed: done,
              itemType: card.dataset.itemType || "todo",
            });
          }
        } else if (name !== "") {
          sectionTasks.push({
            taskId: card.dataset.taskId || "",
            name,
            startDate: card.dataset.startDate || "",
            dueDate: card.dataset.dueDate || "",
            startTime: "",
            endTime: "",
            eisenhower: card.dataset.eisenhower || "",
            done,
            itemType: card.dataset.itemType || "todo",
            reminderDate: card.dataset.reminderDate || "",
            reminderTime: card.dataset.reminderTime || "",
          });
        }
      });
    } else {
      sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").forEach((row) => {
        const nameInput = row.querySelector(".todo-task-name-field");
        const startInput = row.querySelector(".todo-start-input-hidden");
        const dueInput = row.querySelector(".todo-due-input-hidden");
        const eisenhowerSelect = row.querySelector(".todo-eisenhower-select");
        const doneCheck = row.querySelector(".todo-done-check");
        const name = (nameInput?.value || "").trim();
        const startDate = startInput?.value || "";
        const dueDate = dueInput?.value || "";
        const startTime = row.dataset.startTime || "";
        const endTime = row.dataset.endTime || "";
        const eisenhower = eisenhowerSelect?.value || row.dataset.eisenhower || "";
        const done = doneCheck?.checked || false;
        const itemType = row.dataset.itemType || "todo";
        const kpiTodoId = row.dataset.kpiTodoId;
        const storageKey = row.dataset.kpiStorageKey;

        if (kpiTodoId && storageKey) {
          if (name === "") {
            removeKpiTodo(kpiTodoId, storageKey);
          } else {
            updateKpiTodo(kpiTodoId, storageKey, { text: name, startDate, dueDate, startTime, endTime, eisenhower, completed: done, itemType });
          }
        } else if (name !== "") {
          sectionTasks.push({
            taskId: row.dataset.taskId || "",
            name,
            startDate,
            dueDate,
            startTime,
            endTime,
            eisenhower,
            done,
            itemType,
            reminderDate: row.dataset.reminderDate || "",
            reminderTime: row.dataset.reminderTime || "",
          });
        } else {
          const tid = String(row.dataset.taskId || "").trim();
          if (keepTaskInSectionStorage({ name: "", taskId: tid })) {
            sectionTasks.push({
              taskId: tid,
              name: "",
              startDate,
              dueDate,
              startTime,
              endTime,
              eisenhower,
              done,
              itemType,
              reminderDate: row.dataset.reminderDate || "",
              reminderTime: row.dataset.reminderTime || "",
            });
          }
        }
      });
    }
    const withDate = sectionTasks.filter((t) => (t.dueDate || "").trim()).length;
    todoDebug("collectAndSave: saving section", sectionId, "tasks", sectionTasks.length, "withDueDate", withDate, sectionTasks.map((t) => ({ name: (t.name || "").slice(0, 12), dueDate: (t.dueDate || "").slice(0, 10) })));
    saveSectionTasks(sectionId, sectionTasks);
  });
  try {
    const obj = readSectionTasksObject();
    const counts = {};
    Object.keys(obj || {}).forEach((k) => { counts[k] = (obj[k] || []).length; });
    todoDebug("collectAndSave: after save mem snapshot", counts);
  } catch (_) {}
  if (withCustomSections) {
    getCustomSections().forEach((s) => {
      const sec = sectionsWrap.querySelector(`.todo-section[data-section="${s.id}"]`);
      if (sec) saveCustomSectionTasks(s.id, collectCustomSectionFromDOM(sectionsWrap, s.id));
    });
  }
  if (addLog && scheduleServerSync) {
    const meta = {
      taskId: String(addLog.taskId || "").trim(),
      section: String(addLog.sectionId || "").trim(),
    };
    logTodoScheduleAddStep2(meta);
    markTodoAddPendingServerLog(meta);
  }
  if (scheduleServerSync) {
    void syncTodoSectionTasksToSupabase().catch(() => {});
  }
}

export function saveTodoListBeforeUnmount(container) {
  const hasContainer = !!container;
  const sectionsWrap = container?.querySelector(".todo-sections-wrap");
  todoDebug("saveTodoListBeforeUnmount", {
    hasContainer,
    hasSectionsWrap: !!sectionsWrap,
    containerClass: container?.className,
    containerChildren: container?.children?.length,
  });
  if (sectionsWrap) {
    collectAndSaveKpiTasksFromDOM(sectionsWrap, { scheduleServerSync: true, withCustomSections: true });
  } else {
    todoDebug("saveTodoListBeforeUnmount: no .todo-sections-wrap in container, save skipped");
  }
}

/** 할일/일정 메인 화면(탭 바 있는 전체 뷰)에서 마지막으로 본 고정 리스트 탭 — Supabase 동기 후 __lpRenderMain()으로 전체가 다시 그려질 때 브레인 덤프(0)로만 초기화되는 문제 방지 */
const SESSION_TODO_FIXED_TAB_INDEX = "lp-todo-main-fixed-tab-index";

const TODO_CATEGORY_OPTIONS_KEY = "todo_category_options";
const DEFAULT_CATEGORIES = ["학업", "잡무", "사이드프로젝트", "회사"];

function randomTodoCategoryChipPair() {
  const bg = pickRandomPresetRgba(0.55);
  return { bg, text: readableTextForPresetRgbaBg(bg) };
}

function migrateCategoryOptionsToPresetPalette(arr) {
  let changed = false;
  const out = arr.map((o) => {
    const bg =
      typeof o.bg === "string" ? snapRgbaToNearestPreset(o.bg) : o.bg;
    const text = readableTextForPresetRgbaBg(bg);
    if (bg !== o.bg || text !== o.text) changed = true;
    return { ...o, bg, text };
  });
  return { out, changed };
}

function getCategoryOptions() {
  try {
    const raw = localStorage.getItem(TODO_CATEGORY_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr) && arr.length > 0) {
        const { out, changed } = migrateCategoryOptionsToPresetPalette(arr);
        if (changed) {
          try {
            localStorage.setItem(TODO_CATEGORY_OPTIONS_KEY, JSON.stringify(out));
          } catch (_) {}
        }
        return out;
      }
    }
  } catch (_) {}
  const defaults = DEFAULT_CATEGORIES.map((name) => ({
    name,
    ...randomTodoCategoryChipPair(),
  }));
  try {
    localStorage.setItem(TODO_CATEGORY_OPTIONS_KEY, JSON.stringify(defaults));
  } catch (_) {}
  return defaults;
}

function addCategoryOption(name) {
  const opts = getCategoryOptions();
  const trimmed = (name || "").trim();
  if (!trimmed || opts.some((o) => o.name === trimmed)) return opts;
  const pair = randomTodoCategoryChipPair();
  opts.unshift({ name: trimmed, bg: pair.bg, text: pair.text });
  try {
    localStorage.setItem(TODO_CATEGORY_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

function removeCategoryOption(name) {
  const opts = getCategoryOptions().filter((o) => o.name !== name);
  try {
    localStorage.setItem(TODO_CATEGORY_OPTIONS_KEY, JSON.stringify(opts));
  } catch (_) {}
  return opts;
}

const DELETE_ICON =
  '<svg class="todo-category-delete-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

const TASK_DELETE_ICON =
  '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

const ADD_TASK_ICON =
  '<svg viewBox="0 0 24 24" width="24" height="24"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 8v8"/><path d="m8 12h8"/><path d="m18 22h-12c-2.209 0-4-1.791-4-4v-12c0-2.209 1.791-4 4-4h12c2.209 0 4 1.791 4 4v12c0 2.209-1.791 4-4 4z"/></g></svg>';

const LIST_ICON =
  '<img src="/toolbaricons/list.svg" alt="세부 할 일" class="todo-list-icon" width="20" height="20">';

/** @param {AbortSignal} [tabSignal] 할일 탭 이탈 시 document/window 리스너 정리 */
function createCategoryDropdown(initialValue, onUpdate, tabSignal) {
  const wrap = document.createElement("div");
  wrap.className = "todo-category-wrap";

  const inputWrap = document.createElement("div");
  inputWrap.className = "todo-category-input-wrap";

  const display = document.createElement("span");
  display.className = "todo-category-display";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "todo-category-input";
  input.placeholder = "";
  if (initialValue) input.value = initialValue;

  function getOpt(name) {
    return getCategoryOptions().find((o) => o.name === name);
  }

  function updateDisplay() {
    const val = (input.value || "").trim();
    display.textContent = val || "";
    display.className = "todo-category-display";
    if (val) {
      const opt = getOpt(val);
      if (opt) {
        display.style.background = opt.bg;
        display.style.color = opt.text;
      } else {
        display.style.background = "#f0f0f0";
        display.style.color = "#333";
      }
      display.classList.add("has-value");
    } else {
      display.style.background = "";
      display.style.color = "";
      display.classList.remove("has-value");
    }
  }

  function showInput() {
    wrap.classList.add("is-editing");
    wrap.classList.remove("has-value");
  }

  function showDisplay() {
    updateDisplay();
    if ((input.value || "").trim()) {
      wrap.classList.remove("is-editing");
      wrap.classList.add("has-value");
    } else {
      wrap.classList.add("is-editing");
      wrap.classList.remove("has-value");
    }
  }

  display.addEventListener("click", () => {
    showInput();
    input.focus();
    renderPanel(input.value);
  });

  input.addEventListener("focus", () => {
    showInput();
    renderPanel(input.value);
  });
  input.addEventListener("blur", () => {
    showDisplay();
    onUpdate?.();
    setTimeout(closePanel, 150);
  });
  input.addEventListener("input", () => {
    if (wrap.classList.contains("is-editing")) renderPanel(input.value);
  });

  inputWrap.appendChild(display);
  inputWrap.appendChild(input);
  if (initialValue) showDisplay();
  else wrap.classList.add("is-editing");

  const panel = document.createElement("div");
  panel.className = "todo-category-panel";
  panel.hidden = true;

  let highlightedIndex = -1;

  function updatePanelPosition() {
    const rect = input.getBoundingClientRect();
    panel.style.top = `${rect.bottom + 2}px`;
    panel.style.left = `${rect.left}px`;
    panel.style.width = "max-content";
    panel.style.minWidth = `${rect.width}px`;
  }

  function renderPanel(query) {
    const q = (query || "").trim().toLowerCase();
    const all = getCategoryOptions();
    const matches = q ? all.filter((o) => o.name.toLowerCase().includes(q)) : all;
    const exactMatch = q && matches.some((o) => o.name.toLowerCase() === q);
    const showCreate = q && !exactMatch;

    panel.innerHTML = "";
    highlightedIndex = -1;

    if (matches.length === 0 && !showCreate) {
      panel.hidden = true;
      return;
    }

    const sep = document.createElement("div");
    sep.className = "todo-category-separator";
    sep.textContent = "—";
    panel.appendChild(sep);

    matches.forEach((opt) => {
      const row = document.createElement("div");
      row.className = "todo-category-option";
      const tag = document.createElement("span");
      tag.className = "todo-category-tag";
      tag.style.background = opt.bg;
      tag.style.color = opt.text;
      tag.textContent = opt.name;
      row.innerHTML = "";
      row.appendChild(tag);
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "todo-category-delete-btn";
      delBtn.title = "삭제";
      delBtn.innerHTML = DELETE_ICON;
      row.appendChild(delBtn);
      row.dataset.value = opt.name;
      row.addEventListener("click", (e) => {
        if (e.target.closest(".todo-category-delete-btn")) return;
        input.value = opt.name;
        showDisplay();
        panel.hidden = true;
        input.blur();
        onUpdate?.();
      });
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeCategoryOption(opt.name);
        renderPanel(input.value);
      });
      panel.appendChild(row);
    });

    if (showCreate) {
      const createRow = document.createElement("div");
      createRow.className = "todo-category-option todo-category-create";
      createRow.innerHTML = `<span class="todo-category-create-label">Create</span><span class="todo-category-tag">${(query || "").trim()}</span>`;
      createRow.dataset.value = (query || "").trim();
      createRow.dataset.isCreate = "true";
      createRow.addEventListener("click", () => {
        const val = (query || "").trim();
        addCategoryOption(val);
        input.value = val;
        showDisplay();
        panel.hidden = true;
        input.blur();
        onUpdate?.();
      });
      panel.appendChild(createRow);
    }

    highlightedIndex = 0;
    const opts = panel.querySelectorAll(".todo-category-option");
    if (opts[0]) opts[0].classList.add("is-highlighted");
    updatePanelPosition();
    panel.hidden = false;
  }

  function closePanel() {
    panel.hidden = true;
    highlightedIndex = -1;
  }

  input.addEventListener("keydown", (e) => {
    if (panel.hidden) {
      if (e.key === "Enter") e.preventDefault();
      return;
    }
    const opts = panel.querySelectorAll(".todo-category-option");
    if (opts.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, opts.length - 1);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) => o.classList.toggle("is-highlighted", i === highlightedIndex));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) => o.classList.toggle("is-highlighted", i === highlightedIndex));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = opts[highlightedIndex >= 0 ? highlightedIndex : 0];
      if (sel) {
        const val = sel.dataset.value;
        if (sel.dataset.isCreate === "true") addCategoryOption(val);
        input.value = val;
        showDisplay();
        closePanel();
        input.blur();
        onUpdate?.();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      closePanel();
    }
  });

  const docClickClose = (e) => {
    if (!wrap.contains(e.target)) closePanel();
  };
  const scrollResizeHandler = () => {
    if (!panel.hidden) updatePanelPosition();
  };
  if (tabSignal) {
    document.addEventListener("click", docClickClose, { signal: tabSignal });
    window.addEventListener("scroll", scrollResizeHandler, {
      capture: true,
      signal: tabSignal,
    });
    window.addEventListener("resize", scrollResizeHandler, { signal: tabSignal });
  } else {
    document.addEventListener("click", docClickClose);
    window.addEventListener("scroll", scrollResizeHandler, true);
    window.addEventListener("resize", scrollResizeHandler);
  }

  wrap.appendChild(inputWrap);
  wrap.appendChild(panel);

  return { wrap, input };
}

const FIXED_SECTIONS = [
  { id: "braindump", label: "브레인 덤프" },
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
];

function showAddListModal(options = {}) {
  const { validate, onSuccess, title = "새 리스트 추가", label = "새 리스트 이름을 입력하세요", initialValue = "" } = options;
  const modal = document.createElement("div");
  modal.className = "todo-list-modal";
  modal.innerHTML = `
    <div class="todo-list-modal-backdrop"></div>
    <div class="todo-list-modal-panel">
      <div class="todo-list-modal-header">
        <h3 class="todo-list-modal-title">${title}</h3>
        <button type="button" class="todo-list-modal-close" aria-label="닫기">×</button>
      </div>
      <div class="todo-list-modal-body">
        <p class="todo-list-modal-label">${label}</p>
        <input type="text" name="todo-list-modal-name" class="todo-list-modal-input" placeholder="리스트 이름" maxlength="50" />
        <p class="todo-list-modal-error" role="alert"></p>
      </div>
      <div class="todo-list-modal-footer">
        <button type="button" class="todo-list-modal-cancel">취소</button>
        <button type="button" class="todo-list-modal-confirm">확인</button>
      </div>
    </div>
  `;

  const backdrop = modal.querySelector(".todo-list-modal-backdrop");
  const closeBtn = modal.querySelector(".todo-list-modal-close");
  const input = modal.querySelector(".todo-list-modal-input");
  const errorEl = modal.querySelector(".todo-list-modal-error");
  const cancelBtn = modal.querySelector(".todo-list-modal-cancel");
  const confirmBtn = modal.querySelector(".todo-list-modal-confirm");

  function close() {
    modal.remove();
    document.body.style.overflow = "";
  }

  function showError(msg) {
    errorEl.textContent = msg || "";
  }

  function doConfirm() {
    const val = (input.value || "").trim();
    const err = validate ? validate(val) : null;
    if (err) {
      showError(err);
      return;
    }
    showError("");
    close();
    onSuccess?.(val);
  }

  confirmBtn.addEventListener("click", doConfirm);
  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", () => {
    if (isTodoListMobileModalViewport()) return;
    close();
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doConfirm();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  if (initialValue) input.value = initialValue;
  input.focus();
}

function showEditListModal(options = {}) {
  const { sectionId, currentLabel, onSuccess } = options;
  showAddListModal({
    title: "리스트 이름 편집",
    label: "리스트 이름을 입력하세요",
    initialValue: currentLabel || "",
    validate: (name) => {
      if (!name || !name.trim()) return "리스트 이름을 입력하세요.";
      if (getCustomSections().some((s) => s.label === name.trim() && s.id !== sectionId)) return "같은 이름의 리스트가 이미 있습니다.";
      return null;
    },
    onSuccess: (name) => {
      const updated = updateCustomSectionLabel(sectionId, name.trim());
      if (updated) onSuccess?.(updated);
    },
  });
}

function escapeConfirmHtml(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function showConfirmModal(options = {}) {
  const {
    title = "확인",
    message,
    warnMessage,
    confirmText = "확인",
    cancelText = "취소",
    confirmDanger = false,
    onConfirm,
  } = options;
  const modal = document.createElement("div");
  modal.className = "todo-list-modal todo-list-confirm-modal";
  const confirmBtnClass = confirmDanger
    ? "todo-list-modal-confirm todo-list-confirm-btn--danger"
    : "todo-list-modal-confirm todo-list-confirm-delete";
  modal.innerHTML = `
    <div class="todo-list-modal-backdrop"></div>
    <div class="todo-list-modal-panel">
      <div class="todo-list-modal-header">
        <h3 class="todo-list-modal-title">${escapeConfirmHtml(title)}</h3>
        <button type="button" class="todo-list-modal-close" aria-label="닫기">×</button>
      </div>
      <div class="todo-list-modal-body todo-list-confirm-body">
        <p class="todo-list-confirm-message">${escapeConfirmHtml(message)}</p>
        ${warnMessage ? `<p class="todo-list-confirm-warn">${escapeConfirmHtml(warnMessage)}</p>` : ""}
      </div>
      <div class="todo-list-modal-footer">
        <button type="button" class="todo-list-modal-cancel">${escapeConfirmHtml(cancelText)}</button>
        <button type="button" class="${confirmBtnClass}">${escapeConfirmHtml(confirmText)}</button>
      </div>
    </div>
  `;

  const backdrop = modal.querySelector(".todo-list-modal-backdrop");
  const closeBtn = modal.querySelector(".todo-list-modal-close");
  const cancelBtn = modal.querySelector(".todo-list-modal-cancel");
  const confirmBtn = modal.querySelector(".todo-list-modal-confirm");

  function close() {
    modal.remove();
    document.body.style.overflow = "";
  }

  confirmBtn.addEventListener("click", () => {
    close();
    onConfirm?.();
  });
  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", close);
  backdrop.addEventListener("click", () => {
    if (isTodoListMobileModalViewport()) return;
    close();
  });

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
}

/** 모바일 전용: 날짜 선택 모달. 모달 안 input을 탭하면 네이티브 날짜 픽커가 열림 */
function showMobileDateModal(options) {
  const { title = "날짜 선택", value = "", min = "", max = "", onSelect } = options;
  const modal = document.createElement("div");
  modal.className = "todo-list-modal todo-mobile-date-modal";
  modal.innerHTML = `
    <div class="todo-list-modal-backdrop"></div>
    <div class="todo-list-modal-panel todo-mobile-date-panel">
      <div class="todo-list-modal-header">
        <h3 class="todo-list-modal-title">${title}</h3>
        <button type="button" class="todo-list-modal-close" aria-label="닫기">×</button>
      </div>
      <div class="todo-list-modal-body">
        <input type="date" class="todo-mobile-date-input" tabindex="-1" value="${(value || "").slice(0, 10)}" ${min ? `min="${min}"` : ""} ${max ? `max="${max}"` : ""} />
      </div>
      <div class="todo-list-modal-footer">
        <button type="button" class="todo-list-modal-cancel">취소</button>
        <button type="button" class="todo-list-modal-confirm">확인</button>
      </div>
    </div>
  `;
  const backdrop = modal.querySelector(".todo-list-modal-backdrop");
  const closeBtn = modal.querySelector(".todo-list-modal-close");
  const cancelBtn = modal.querySelector(".todo-list-modal-cancel");
  const confirmBtn = modal.querySelector(".todo-list-modal-confirm");
  const dateInput = modal.querySelector(".todo-mobile-date-input");

  function close() {
    modal.remove();
    document.body.style.overflow = "";
  }

  function apply() {
    const val = (dateInput.value || "").trim().slice(0, 10);
    if (val) onSelect?.(val);
    close();
  }

  dateInput.addEventListener("change", apply);
  confirmBtn.addEventListener("click", apply);
  cancelBtn.addEventListener("click", close);
  closeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    close();
  });
  closeBtn.addEventListener("touchend", (e) => {
    e.preventDefault();
    close();
  });
  backdrop.addEventListener("click", () => {
    if (isTodoListMobileModalViewport()) return;
    close();
  });
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
  // 모달만 보이게: 입력 포커스 시 날짜 피커가 같이 뜨지 않도록 X 버튼에 포커스
  requestAnimationFrame(() => {
    closeBtn.focus();
  });
}

const EISENHOWER_OPTIONS = [
  { value: "", label: "선택 안 함" },
  { value: "urgent-important", label: "긴급+중요" },
  { value: "important-not-urgent", label: "중요+여유" },
  { value: "urgent-not-important", label: "긴급+덜중요" },
  { value: "not-urgent-not-important", label: "여유+안중요" },
];

/** 할일 추가/수정 통합 모달. 카드 레이아웃에서 사용. onSave(폼값 객체), onDelete(수정 시만) */
function showTodoTaskModal(options) {
  const {
    taskData = {},
    sectionId = "",
    sectionLabel = "",
    mode = "add",
    onSave,
    onDelete,
  } = options;
  const {
    name = "",
    startDate = "",
    dueDate = "",
    reminderDate = "",
    reminderTime = "",
    eisenhower = "",
  } = taskData;

  const title = mode === "add" ? "할 일 추가" : "할 일 수정";
  const currentSectionId = (taskData.sectionId || sectionId || "").trim();
  const sections = getSections();
  const escapeHtml = (s) => {
    const d = document.createElement("div");
    d.textContent = s ?? "";
    return d.innerHTML;
  };

  const modal = document.createElement("div");
  modal.className = "todo-list-modal todo-task-edit-modal";
  modal.innerHTML = `
    <div class="todo-list-modal-backdrop"></div>
    <div class="todo-list-modal-panel todo-task-edit-panel">
      <div class="todo-list-modal-header">
        <h3 class="todo-list-modal-title">${title}</h3>
        <button type="button" class="todo-list-modal-close" aria-label="닫기">×</button>
      </div>
      <div class="todo-list-modal-body todo-task-edit-body">
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">할일 이름</label>
          <input type="text" class="todo-task-edit-name" placeholder="할 일 입력" value="${escapeHtml(name)}" maxlength="500" />
        </div>
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">시작일</label>
          <input type="date" class="todo-task-edit-start" value="${escapeHtml((startDate || "").slice(0, 10))}" />
        </div>
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">마감일</label>
          <input type="date" class="todo-task-edit-due" value="${escapeHtml((dueDate || "").slice(0, 10))}" />
        </div>
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">리마인더</label>
          <div class="todo-task-edit-reminder-row">
            <input type="date" class="todo-task-edit-reminder-date" value="${escapeHtml((reminderDate || "").slice(0, 10))}" />
            <div class="todo-task-edit-reminder-time-actions">
              <input type="text" class="todo-task-edit-reminder-time" placeholder="14:30" value="${escapeHtml(reminderTime)}" maxlength="5" />
              <button type="button" class="todo-task-edit-reminder-btn todo-task-edit-reminder-clear-date" aria-label="리마인더 날짜만 지우기">날짜 삭제</button>
              <button type="button" class="todo-task-edit-reminder-btn todo-task-edit-reminder-clear-all" aria-label="리마인더 날짜·시간 모두 지우기"><span class="todo-task-edit-reminder-clear-all-label todo-task-edit-reminder-clear-all-label--long">리마인더 삭제</span><span class="todo-task-edit-reminder-clear-all-label todo-task-edit-reminder-clear-all-label--short">삭제</span></button>
            </div>
          </div>
        </div>
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">우선순위</label>
          <select class="todo-task-edit-eisenhower">
            ${EISENHOWER_OPTIONS.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === eisenhower ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
          </select>
        </div>
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">리스트</label>
          <select class="todo-task-edit-section" aria-label="다른 리스트로 이동">
            ${sections.map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === currentSectionId ? "selected" : ""}>${escapeHtml(s.label)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="todo-list-modal-footer todo-task-edit-footer">
        ${mode === "edit" ? '<button type="button" class="todo-task-edit-delete">삭제</button>' : ""}
        <button type="button" class="todo-list-modal-cancel">취소</button>
        <button type="button" class="todo-list-modal-confirm">확인</button>
      </div>
    </div>
  `;

  const backdrop = modal.querySelector(".todo-list-modal-backdrop");
  const closeBtn = modal.querySelector(".todo-list-modal-close");
  const cancelBtn = modal.querySelector(".todo-list-modal-cancel");
  const confirmBtn = modal.querySelector(".todo-list-modal-confirm");
  const deleteBtn = modal.querySelector(".todo-task-edit-delete");
  const nameInput = modal.querySelector(".todo-task-edit-name");
  const startInput = modal.querySelector(".todo-task-edit-start");
  const dueInput = modal.querySelector(".todo-task-edit-due");
  const reminderDateInput = modal.querySelector(".todo-task-edit-reminder-date");
  const reminderTimeInput = modal.querySelector(".todo-task-edit-reminder-time");
  const reminderClearDateBtn = modal.querySelector(".todo-task-edit-reminder-clear-date");
  const reminderClearAllBtn = modal.querySelector(".todo-task-edit-reminder-clear-all");
  const eisenhowerSelect = modal.querySelector(".todo-task-edit-eisenhower");
  const sectionSelect = modal.querySelector(".todo-task-edit-section");

  function close() {
    modal.remove();
    document.body.style.overflow = "";
  }

  function formatTimeToHHMM(val) {
    const digits = String(val || "").replace(/\D/g, "");
    if (digits.length >= 4) return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    if (digits.length === 2) return digits;
    return digits;
  }
  function gatherForm() {
    const startVal = (startInput?.value || "").trim().slice(0, 10);
    const dueVal = (dueInput?.value || "").trim().slice(0, 10);
    if (startVal && dueVal) {
      startInput.min = "";
      startInput.max = dueVal;
      dueInput.min = startVal;
      dueInput.max = "";
    }
    let reminderTimeVal = (reminderTimeInput?.value || "").trim();
    const digits = reminderTimeVal.replace(/\D/g, "");
    if (digits.length >= 2) reminderTimeVal = formatTimeToHHMM(reminderTimeVal);
    const chosenSectionId = (sectionSelect?.value || "").trim() || sectionId;
    const chosenSection = sections.find((s) => s.id === chosenSectionId);
    return {
      name: (nameInput?.value || "").trim(),
      startDate: startVal,
      dueDate: dueVal,
      reminderDate: (reminderDateInput?.value || "").trim().slice(0, 10),
      reminderTime: reminderTimeVal,
      eisenhower: eisenhowerSelect?.value || "",
      sectionId: chosenSectionId,
      sectionLabel: chosenSection?.label ?? sectionLabel,
    };
  }

  confirmBtn?.addEventListener("click", () => {
    const payload = { ...taskData, ...gatherForm() };
    onSave?.(payload);
    close();
  });
  cancelBtn?.addEventListener("click", close);
  closeBtn?.addEventListener("click", close);
  /* 열린 직후 같은 탭이 백드롭에 전달되어 바로 닫히는 것 방지 */
  let allowBackdropClose = false;
  setTimeout(() => {
    allowBackdropClose = true;
  }, 100);
  backdrop?.addEventListener("click", (e) => {
    if (e.target !== backdrop || !allowBackdropClose) return;
    if (isTodoListMobileModalViewport()) return;
    close();
  });
  if (mode === "edit" && onDelete && deleteBtn) {
    deleteBtn.addEventListener("click", () => {
      onDelete?.();
      close();
    });
  }
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  function updateDateInputPlaceholderClass(input) {
    if (!input) return;
    if ((input.value || "").trim()) input.classList.add("has-value");
    else input.classList.remove("has-value");
  }
  [startInput, dueInput, reminderDateInput].forEach(updateDateInputPlaceholderClass);
  [startInput, dueInput, reminderDateInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => updateDateInputPlaceholderClass(input));
    input.addEventListener("change", () => updateDateInputPlaceholderClass(input));
  });

  reminderClearDateBtn?.addEventListener("click", () => {
    if (reminderDateInput) {
      reminderDateInput.value = "";
      updateDateInputPlaceholderClass(reminderDateInput);
    }
  });
  reminderClearAllBtn?.addEventListener("click", () => {
    if (reminderDateInput) {
      reminderDateInput.value = "";
      updateDateInputPlaceholderClass(reminderDateInput);
    }
    if (reminderTimeInput) reminderTimeInput.value = "";
  });

  if (reminderTimeInput) {
    const digitsInit = (reminderTimeInput.value || "").replace(/\D/g, "");
    if (digitsInit.length >= 2) reminderTimeInput.value = formatTimeToHHMM(reminderTimeInput.value);
    reminderTimeInput.addEventListener("input", () => {
      const raw = reminderTimeInput.value;
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 4) {
        reminderTimeInput.value = formatTimeToHHMM(raw);
        reminderTimeInput.setSelectionRange(5, 5);
      }
    });
    reminderTimeInput.addEventListener("blur", () => {
      const digits = (reminderTimeInput.value || "").replace(/\D/g, "");
      if (digits.length >= 2) reminderTimeInput.value = formatTimeToHHMM(reminderTimeInput.value);
    });
  }

  /* X에 포커스 두면 iOS PWA에서 파란 포커스 링이 생김 → 할일 이름 입력으로 */
  requestAnimationFrame(() => nameInput?.focus());
}

function getSections() {
  return [...FIXED_SECTIONS, ...getCustomSections()];
}

function getTaskId(taskData) {
  if (taskData.isKpiTodo && taskData.kpiTodoId && taskData.storageKey) {
    return `kpi-${taskData.kpiTodoId}-${taskData.storageKey}`;
  }
  return taskData.taskId || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function createSubtaskItem(parentTaskId, subtaskData, onRemove) {
  const { id: subtaskId, name = "", done = false } = subtaskData;
  const wrap = document.createElement("div");
  wrap.className = "todo-subtask-item";
  wrap.dataset.parentTaskId = parentTaskId;
  wrap.dataset.subtaskId = subtaskId;

  const nameWrap = document.createElement("div");
  nameWrap.className = "todo-subtask-name-wrap";
  const inputGroup = document.createElement("div");
  inputGroup.className = "todo-subtask-input-group";
  const doneCheck = document.createElement("input");
  doneCheck.type = "checkbox";
  doneCheck.className = "todo-done-check";
  doneCheck.checked = done;
  doneCheck.addEventListener("change", () => {
    updateSubtask(parentTaskId, subtaskId, { done: doneCheck.checked });
  });
  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.name = "todo-subtask-name";
  nameInput.className = "todo-subtask-input";
  nameInput.value = name;
  nameInput.placeholder = "세부 할 일 입력";
  nameInput.addEventListener("blur", () => {
    const val = (nameInput.value || "").trim();
    if (val === "") {
      removeSubtask(parentTaskId, subtaskId);
      wrap.remove();
      onRemove?.();
    } else {
      updateSubtask(parentTaskId, subtaskId, { name: val });
    }
  });
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      nameInput.blur();
    }
  });
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "todo-task-delete-btn todo-subtask-delete-btn";
  delBtn.title = "삭제";
  delBtn.innerHTML = TASK_DELETE_ICON;
  delBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeSubtask(parentTaskId, subtaskId);
    wrap.remove();
    onRemove?.();
  });
  inputGroup.appendChild(doneCheck);
  inputGroup.appendChild(nameInput);
  inputGroup.appendChild(delBtn);
  wrap.appendChild(nameWrap);
  nameWrap.appendChild(inputGroup);
  return wrap;
}

function createTaskRow(taskData = {}, options = {}) {
  const {
    name = "",
    startDate = "",
    dueDate = "",
    startTime = "",
    endTime = "",
    eisenhower = "",
    classification = "",
    sectionLabel = "",
    done = false,
    itemType = "todo",
    isKpiTodo = false,
    kpiTodoId = "",
    storageKey = "",
    reminderDate = "",
    reminderTime = "",
  } = taskData;
  const {
    showCategoryCol = false,
    isSubtask = false,
    taskId: optTaskId,
    showCheckboxTypeMenu = null,
    enableDragToCalendar = false,
    enableDragToEisenhower = false,
    enableDragOverdueToCalendar = false,
    overdueColumnOrder = false,
    eisenhowerSidebarFirst = false,
    categoryUiSignal,
  } = options;
  const taskId = optTaskId || getTaskId(taskData);

  const tr = document.createElement("tr");
  tr.className = "todo-task-row" + (isSubtask ? " todo-subtask-row" : "");
  tr.dataset.sectionId = taskData.sectionId || "";
  const hasDates = !!((startDate || "").trim() || (dueDate || "").trim());
  tr.dataset.hasDates = hasDates ? "true" : "false";
  if (!hasDates && (taskData.sectionId || "")) {
    tr.style.setProperty("--row-section-color", getSectionColor(taskData.sectionId));
  }
  if (!isSubtask) tr.dataset.taskId = taskId;
  tr.dataset.startTime = startTime || "";
  tr.dataset.endTime = endTime || "";
  tr.dataset.reminderDate = reminderDate || "";
  tr.dataset.reminderTime = reminderTime || "";
  if (dueDate && isOverdue(dueDate)) tr.classList.add("todo-row-overdue");
  if (isKpiTodo) {
    tr.classList.add("todo-task-row--kpi");
    tr.dataset.isKpiTodo = "true";
    tr.dataset.kpiTodoId = kpiTodoId;
    tr.dataset.kpiStorageKey = storageKey;
  }

  const doneTd = document.createElement("td");
  doneTd.className = "todo-cell-done";
  doneTd.dataset.itemType = itemType;
  tr.dataset.itemType = itemType;

  const doneCheck = document.createElement("input");
  doneCheck.type = "checkbox";
  doneCheck.className = "todo-done-check";
  doneCheck.checked = done;
  doneCheck.addEventListener("change", () => {
    if (isKpiTodo && kpiTodoId && storageKey) {
      syncKpiTodoCompleted(kpiTodoId, storageKey, doneCheck.checked);
    } else if (!isKpiTodo && (taskData.sectionId || "")) {
      const secId = taskData.sectionId || tr.closest(".todo-section")?.dataset?.section || "";
      if (FIXED_SECTION_IDS_FOR_STORAGE.includes(secId)) {
        updateSectionTaskDone(secId, taskId, doneCheck.checked);
      }
    }
    syncOverdueDisplay?.();
  });

  const scheduleIcon = document.createElement("img");
  scheduleIcon.src = "/toolbaricons/radio-button.svg";
  scheduleIcon.alt = "";
  scheduleIcon.className = "todo-schedule-icon";
  scheduleIcon.width = 18;
  scheduleIcon.height = 18;

  const doneWrap = document.createElement("div");
  doneWrap.className = "todo-done-wrap";
  if (itemType === "schedule") {
    doneWrap.classList.add("todo-done-wrap--schedule");
    doneCheck.hidden = true;
    doneWrap.appendChild(scheduleIcon);
  } else {
    doneWrap.appendChild(doneCheck);
  }
  doneTd.appendChild(doneWrap);

  const setItemType = (type) => {
    tr.dataset.itemType = type;
    doneTd.dataset.itemType = type;
    doneWrap.classList.toggle("todo-done-wrap--schedule", type === "schedule");
    if (type === "schedule") {
      doneCheck.hidden = true;
      doneCheck.checked = false;
      if (!doneWrap.contains(scheduleIcon)) doneWrap.appendChild(scheduleIcon);
      if (doneWrap.contains(doneCheck)) doneWrap.removeChild(doneCheck);
    } else {
      doneCheck.hidden = false;
      if (doneWrap.contains(scheduleIcon)) doneWrap.removeChild(scheduleIcon);
      if (!doneWrap.contains(doneCheck)) doneWrap.insertBefore(doneCheck, doneWrap.firstChild);
    }
  };

  const nameTd = document.createElement("td");
  nameTd.className = "todo-cell-name" + (isSubtask ? " todo-cell-name-subtask" : "");
  const nameWrap = document.createElement("div");
  nameWrap.className = "todo-cell-name-wrap";
  const nameInput = document.createElement("textarea");
  nameInput.name = "todo-task-name";
  nameInput.className = "todo-task-name-field";
  nameInput.rows = 1;
  nameInput.setAttribute("maxlength", "500");
  nameInput.spellcheck = false;
  nameInput.autocomplete = "off";
  nameInput.value = name;
  const fitTodoTaskNameHeight = () => {
    nameInput.style.height = "0";
    nameInput.style.height = `${nameInput.scrollHeight}px`;
  };
  nameInput.addEventListener("input", fitTodoTaskNameHeight);
  requestAnimationFrame(fitTodoTaskNameHeight);
  let dateAreaClicked = false;
  if (isKpiTodo && kpiTodoId && storageKey) {
    nameInput.addEventListener("blur", (e) => {
      const val = (nameInput.value || "").trim();
      const relatedTarget = e.relatedTarget;
      const focusStaysInRowSync = relatedTarget && tr.contains(relatedTarget);
      setTimeout(() => {
        const activeEl = document.activeElement;
        const hadDateAreaClick = dateAreaClicked;
        if (dateAreaClicked) dateAreaClicked = false;
        const focusStaysInRow = tr.contains(activeEl) || focusStaysInRowSync || hadDateAreaClick;
        if (val === "" && !focusStaysInRow) {
          if (removeKpiTodo(kpiTodoId, storageKey)) {
            clearSubtasks(taskId);
            tr.remove();
            const section = tr.closest(".todo-section");
            const tbody = tr.parentElement;
            const countEl = section?.querySelector(".todo-section-count");
            if (countEl && tbody) countEl.textContent = String(tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
          }
        } else if (val !== name) {
          updateKpiTodo(kpiTodoId, storageKey, { text: val });
        }
      }, 0);
    });
  } else {
    nameInput.addEventListener("blur", (e) => {
      const val = (nameInput.value || "").trim();
      const relatedTarget = e.relatedTarget;
      const focusStaysInRowSync = relatedTarget && tr.contains(relatedTarget);
      setTimeout(() => {
        const activeEl = document.activeElement;
        const hadDateAreaClick = dateAreaClicked;
        if (dateAreaClicked) dateAreaClicked = false;
        const focusStaysInRow = tr.contains(activeEl) || focusStaysInRowSync || hadDateAreaClick;
        if (val === "" && !focusStaysInRow) {
          clearSubtasks(taskId);
          tr.remove();
          const section = tr.closest(".todo-section");
          const tbody = tr.parentElement;
          const countEl = section?.querySelector(".todo-section-count");
          if (countEl && tbody) countEl.textContent = String(tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
        } else if (val !== "" && !isKpiTodo) {
          scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
        }
      }, 0);
    });
  }
  nameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      nameInput.blur();
    }
  });
  nameWrap.appendChild(nameInput);
  if (!isSubtask) {
    const listBtn = document.createElement("button");
    listBtn.type = "button";
    listBtn.className = "todo-list-btn";
    listBtn.title = "세부 할 일 추가";
    listBtn.innerHTML = LIST_ICON;
    listBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const section = tr.closest(".todo-section");
      const updateCount = () => {
        const countEl = section?.querySelector(".todo-section-count");
        if (countEl) countEl.textContent = String(tr.closest("tbody")?.querySelectorAll(".todo-task-row").length || 0);
      };
      const subs = addSubtask(taskId, { name: "", done: false });
      const newItem = createSubtaskItem(taskId, subs[subs.length - 1], updateCount);
      const container = nameTd.querySelector(".todo-subtasks-container");
      if (container) container.appendChild(newItem);
      updateCount();
      const subInput = newItem.querySelector(".todo-subtask-input");
      if (subInput) subInput.focus();
    });
    nameWrap.appendChild(listBtn);
  }
  const dateLineEl = document.createElement("div");
  dateLineEl.className = "todo-task-date-line";
  nameTd.appendChild(nameWrap);
  nameTd.appendChild(dateLineEl);
  if (!isSubtask) {
    const subtasksContainer = document.createElement("div");
    subtasksContainer.className = "todo-subtasks-container";
    nameTd.appendChild(subtasksContainer);
  }

  const startTd = document.createElement("td");
  startTd.className = "todo-cell-start";
  const startWrap = document.createElement("div");
  startWrap.className = "todo-due-wrap";
  const startDisplay = document.createElement("span");
  startDisplay.className = "todo-due-display";
  if (startDate && startDate.includes("-")) {
    const [y, m, d] = startDate.split("-");
    startDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  } else {
    startDisplay.innerHTML =
      '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  }
  const startInput = document.createElement("input");
  startInput.type = "date";
  startInput.className = "todo-start-input-hidden";
  startInput.name = "todo-start-date";
  startInput.value = startDate;
  const syncStartDisplay = () => {
    const val = startInput.value;
    if (val && val.includes("-")) {
      const [y, m, d] = val.split("-");
      startDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    } else {
      startDisplay.innerHTML =
        '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    }
  };
  const syncHasDates = () => {
    const hasDates = !!((startInput.value || "").trim() || (dueInput.value || "").trim());
    tr.dataset.hasDates = hasDates ? "true" : "false";
    if (!hasDates && (taskData.sectionId || "")) {
      tr.style.setProperty("--row-section-color", getSectionColor(taskData.sectionId));
    } else {
      tr.style.removeProperty("--row-section-color");
    }
  };
  startInput.addEventListener("change", () => {
    syncStartDisplay();
    syncHasDates();
    syncDateLine();
    if (isKpiTodo && kpiTodoId && storageKey) {
      updateKpiTodo(kpiTodoId, storageKey, { startDate: startInput.value });
    } else if (!isKpiTodo) {
      scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
    }
  });
  startWrap.addEventListener("mousedown", () => {
    dateAreaClicked = true;
  });
  startWrap.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 768px)").matches) {
      showMobileDateModal({
        title: "시작일",
        value: startInput.value,
        max: dueInput.value || "",
        onSelect(val) {
          startInput.value = val;
          syncStartDisplay();
          syncHasDates();
          syncDateLine();
          if (isKpiTodo && kpiTodoId && storageKey) {
            updateKpiTodo(kpiTodoId, storageKey, { startDate: val });
          } else if (!isKpiTodo) {
            scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
          }
        },
      });
      return;
    }
    startInput.focus();
    if (typeof startInput.showPicker === "function") startInput.showPicker();
    else startInput.click();
  });
  startWrap.style.cursor = "pointer";
  startWrap.appendChild(startDisplay);
  startWrap.appendChild(startInput);
  startTd.appendChild(startWrap);

  const dueTd = document.createElement("td");
  dueTd.className = "todo-cell-due";
  const dueWrap = document.createElement("div");
  dueWrap.className = "todo-due-wrap";
  const dueDisplay = document.createElement("span");
  dueDisplay.className = "todo-due-display";
  if (dueDate && dueDate.includes("-")) {
    const [y, m, d] = dueDate.split("-");
    dueDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  } else {
    dueDisplay.innerHTML =
      '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
  }
  const dueInput = document.createElement("input");
  dueInput.type = "date";
  dueInput.className = "todo-due-input-hidden";
  dueInput.name = "todo-due-date";
  dueInput.value = dueDate;
  const syncDueDisplay = () => {
    const val = dueInput.value;
    if (val && val.includes("-")) {
      const [y, m, d] = val.split("-");
      dueDisplay.innerHTML = y && m && d ? `<span class="todo-due-date-text">${m}/${d}</span>` : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    } else {
      dueDisplay.innerHTML =
        '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    }
  };
  const syncDateMinMax = () => {
    const s = startInput.value || "";
    const d = dueInput.value || "";
    startInput.max = d || "";
    dueInput.min = s || "";
  };
  syncDateMinMax();
  startInput.addEventListener("change", syncDateMinMax);
  dueInput.addEventListener("change", syncDateMinMax);
  dueInput.addEventListener("change", () => {
    syncDueDisplay();
    syncOverdueDisplay?.();
    syncHasDates();
    syncDateLine();
    if (isKpiTodo && kpiTodoId && storageKey) {
      updateKpiTodo(kpiTodoId, storageKey, { dueDate: dueInput.value });
    } else if (!isKpiTodo) {
      scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
    }
  });
  dueWrap.addEventListener("mousedown", () => {
    dateAreaClicked = true;
  });
  dueWrap.addEventListener("click", () => {
    if (window.matchMedia("(max-width: 768px)").matches) {
      showMobileDateModal({
        title: "마감일",
        value: dueInput.value,
        min: startInput.value || "",
        onSelect(val) {
          dueInput.value = val;
          syncDueDisplay();
          syncOverdueDisplay?.();
          syncHasDates();
          syncDateLine();
          if (isKpiTodo && kpiTodoId && storageKey) {
            updateKpiTodo(kpiTodoId, storageKey, { dueDate: val });
          } else if (!isKpiTodo) {
            scheduleSaveSectionTasksFromDOM(tr.closest(".todo-sections-wrap"));
          }
        },
      });
      return;
    }
    dueInput.focus();
    if (typeof dueInput.showPicker === "function") dueInput.showPicker();
    else dueInput.click();
  });
  dueWrap.style.cursor = "pointer";
  dueWrap.appendChild(dueDisplay);
  dueWrap.appendChild(dueInput);
  dueTd.appendChild(dueWrap);

  const reminderTd = document.createElement("td");
  reminderTd.className = "todo-cell-reminder";
  const reminderBtn = document.createElement("button");
  reminderBtn.type = "button";
  reminderBtn.className = "todo-reminder-btn";
  reminderBtn.title = "Reminder";
  reminderBtn.innerHTML = `<svg class="todo-reminder-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m8 19.001c0 2.209 1.791 4 4 4s4-1.791 4-4"/><path d="m12 5.999v6"/><path d="m9 8.999h6"/><path d="m22 19.001-3-5.25v-5.752c0-3.866-3.134-7-7-7s-7 3.134-7 7v5.751l-3 5.25h20z"/></svg>`;
  const reminderDisplaySpan = document.createElement("span");
  reminderDisplaySpan.className = "todo-reminder-display";
  function formatReminderDisplay(rDate, rTime) {
    if (!(rDate || "").trim()) return "";
    const parts = String(rDate).trim().split(/[-/]/);
    const dateStr = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : rDate;
    return (rTime || "").trim() ? `${dateStr} ${(rTime || "").trim()}` : dateStr;
  }
  const reminderDisplayVal = formatReminderDisplay(reminderDate, reminderTime);
  reminderDisplaySpan.textContent = reminderDisplayVal || "";
  reminderTd.classList.toggle("todo-cell-reminder-empty", !reminderDisplayVal);
  reminderBtn.hidden = !!reminderDisplayVal;

  function openReminderModal() {
    const taskName = (nameInput.value || "").trim() || "(과제명 없음)";
    const defaultDate = (tr.dataset.reminderDate || "").trim() || (dueInput.value || "").trim();
    const defaultTime = (tr.dataset.reminderTime || "").trim();
    const modal = document.createElement("div");
    modal.className = "dream-kpi-modal todo-reminder-modal";
    const escapeHtml = (s) => {
      const d = document.createElement("div");
      d.textContent = s;
      return d.innerHTML;
    };
    modal.innerHTML = `
      <div class="dream-kpi-backdrop"></div>
      <div class="dream-kpi-panel">
        <div class="dream-kpi-modal-header">
          <h3 class="dream-kpi-modal-title">리마인더</h3>
          <button type="button" class="dream-kpi-modal-close" title="닫기">×</button>
        </div>
        <div class="todo-reminder-form">
          <div class="todo-reminder-field">
            <label class="todo-reminder-label">과제명</label>
            <p class="todo-reminder-task-name">${escapeHtml(taskName)}</p>
          </div>
          <div class="todo-reminder-field">
            <label class="todo-reminder-label">날짜</label>
            <div class="todo-reminder-date-row">
              <input type="date" class="todo-reminder-date" name="todo-reminder-date" value="${escapeHtml(defaultDate)}" />
              <button type="button" class="todo-reminder-date-btn" data-offset="0">오늘</button>
              <button type="button" class="todo-reminder-date-btn" data-offset="1">내일</button>
            </div>
          </div>
          <div class="todo-reminder-field">
            <label class="todo-reminder-label">시간</label>
            <input type="text" class="todo-reminder-time" placeholder="14:30" autocomplete="off" value="${escapeHtml(defaultTime)}" />
            <span class="todo-reminder-time-error" aria-live="polite"></span>
          </div>
          <button type="button" class="dream-kpi-submit todo-reminder-save">설정</button>
        </div>
      </div>
    `;
    const close = () => modal.remove();
    modal.querySelector(".dream-kpi-backdrop").addEventListener("click", close);
    modal.querySelector(".dream-kpi-modal-close").addEventListener("click", close);
    const dateInput = modal.querySelector(".todo-reminder-date");
    function toYYYYMMDD(d) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    }
    modal.querySelectorAll(".todo-reminder-date-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const offset = parseInt(btn.dataset.offset, 10) || 0;
        const d = new Date();
        d.setDate(d.getDate() + offset);
        dateInput.value = toYYYYMMDD(d);
      });
    });
    const timeInput = modal.querySelector(".todo-reminder-time");
    function formatTimeInput(val) {
      const digits = String(val || "").replace(/\D/g, "");
      if (digits.length >= 4) {
        const h = digits.slice(0, 2);
        const m = digits.slice(2, 4);
        return `${h}:${m}`;
      }
      if (digits.length === 2) return digits;
      return digits;
    }
    timeInput.addEventListener("input", () => {
      const raw = timeInput.value;
      const digits = raw.replace(/\D/g, "");
      if (digits.length >= 4) {
        timeInput.value = formatTimeInput(raw);
        timeInput.setSelectionRange(5, 5);
      }
    });
    timeInput.addEventListener("blur", () => {
      const digits = (timeInput.value || "").replace(/\D/g, "");
      if (digits.length >= 2) timeInput.value = formatTimeInput(timeInput.value);
    });
    const timeErrorEl = modal.querySelector(".todo-reminder-time-error");
    timeInput.addEventListener("input", () => { timeErrorEl.textContent = ""; }, { capture: true });
    modal.querySelector(".todo-reminder-save").addEventListener("click", () => {
      const dateVal = (modal.querySelector(".todo-reminder-date").value || "").trim();
      let timeVal = (timeInput.value || "").trim();
      const digits = timeVal.replace(/\D/g, "");
      if (digits.length >= 2) timeVal = formatTimeInput(timeVal);
      if (!timeVal || digits.length < 2) {
        timeErrorEl.textContent = "시간을 입력하세요.";
        return;
      }
      timeErrorEl.textContent = "";
      tr.dataset.reminderDate = dateVal;
      tr.dataset.reminderTime = timeVal;
      const nextDisplay = formatReminderDisplay(dateVal, timeVal);
      reminderDisplaySpan.textContent = nextDisplay || "";
      reminderTd.classList.toggle("todo-cell-reminder-empty", !nextDisplay);
      reminderBtn.hidden = !!nextDisplay;
      reminderDisplaySpan.classList.toggle("todo-reminder-display--clickable", !!nextDisplay);
      const wrap = tr.closest(".todo-sections-wrap");
      if (wrap) scheduleSaveSectionTasksFromDOM(wrap);
      close();
    });
    document.body.appendChild(modal);
  }

  reminderBtn.addEventListener("click", openReminderModal);
  reminderDisplaySpan.addEventListener("click", (e) => {
    if (reminderDisplaySpan.textContent.trim()) openReminderModal();
  });
  if (reminderDisplayVal) reminderDisplaySpan.classList.add("todo-reminder-display--clickable");

  reminderTd.appendChild(reminderBtn);
  reminderTd.appendChild(reminderDisplaySpan);

  function formatOverdueText(dueStr) {
    if (!dueStr || !dueStr.trim()) return "";
    const parts = String(dueStr).trim().split(/[-/]/);
    if (parts.length < 3) return "";
    const dueY = parseInt(parts[0], 10);
    const dueM = parseInt(parts[1], 10) - 1;
    const dueD = parseInt(parts[2], 10);
    if (Number.isNaN(dueY) || Number.isNaN(dueM) || Number.isNaN(dueD)) return "";
    const due = new Date(dueY, dueM, dueD);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffMs = due.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));
    if (diffDays < 0) return `${Math.abs(diffDays)}일 초과`;
    if (diffDays === 0) return "오늘";
    return `${diffDays}일 남음`;
  }
  function formatOverdueDisplay(dueStr, isDone) {
    if (isDone && dueStr && isOverdue(dueStr)) return "과제 완료";
    return formatOverdueText(dueStr);
  }
  function toMMDD(dateStr) {
    if (!dateStr || !String(dateStr).trim()) return "";
    const parts = String(dateStr).trim().split(/[-/]/);
    if (parts.length < 3) return "";
    return `${parts[1]}/${parts[2]}`;
  }
  function syncDateLine() {
    const s = toMMDD(startInput.value);
    const d = toMMDD(dueInput.value);
    let t = "";
    if (s && d) t = `${s} - ${d}`;
    else if (d) t = d;
    else if (s) t = s;
    if (t && dueInput.value && isOverdue(dueInput.value)) t += " " + formatOverdueText(dueInput.value);
    dateLineEl.textContent = t;
  }

  const overdueTd = document.createElement("td");
  overdueTd.className = "todo-cell-overdue";
  const overdueSpan = document.createElement("span");
  overdueSpan.className = "todo-overdue-display";
  overdueSpan.textContent = formatOverdueDisplay(dueDate, done);
  overdueTd.appendChild(overdueSpan);
  const syncOverdueDisplay = () => {
    overdueSpan.textContent = formatOverdueDisplay(dueInput.value, doneCheck.checked);
    tr.classList.toggle("todo-row-overdue", !!(dueInput.value && isOverdue(dueInput.value)));
  };

  const EISENHOWER_LABELS = {
    "urgent-important": "긴급+중요",
    "important-not-urgent": "중요+여유",
    "urgent-not-important": "긴급+덜중요",
    "not-urgent-not-important": "여유+안중요",
    "not-urgent-": "여유+안중요",
  };
  const eisenhowerTd = document.createElement("td");
  eisenhowerTd.className = "todo-cell-eisenhower" + (!eisenhower ? " todo-cell-eisenhower--empty" : "");
  tr.dataset.eisenhower = eisenhower || "";
  const eisenhowerSpan = document.createElement("span");
  eisenhowerSpan.className = "todo-eisenhower-display";
  eisenhowerSpan.textContent = eisenhower ? (EISENHOWER_LABELS[eisenhower] || eisenhower) : "";
  eisenhowerTd.appendChild(eisenhowerSpan);

  const delTd = document.createElement("td");
  delTd.className = "todo-cell-delete";
  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "todo-task-delete-btn";
  delBtn.title = "삭제";
  delBtn.innerHTML = TASK_DELETE_ICON;
  delBtn.addEventListener("click", async (e) => {
    e.stopPropagation();
    const section = tr.closest(".todo-section");
    const tbody = tr.parentElement;
    const sectionId = section?.dataset?.section || tr.dataset.sectionId || "";
    const rowTaskId = tr.dataset.taskId || "";
    if (isKpiTodo && kpiTodoId && storageKey) {
      if (removeKpiTodo(kpiTodoId, storageKey)) tr.remove();
    } else if (sectionId && rowTaskId) {
      const out = sectionId.startsWith("custom-")
        ? await removeTaskFromCustomSectionStorage(sectionId, rowTaskId)
        : await removeTaskFromSectionStorage(sectionId, rowTaskId);
      if (!out?.ok) return;
      clearSubtasks(rowTaskId);
      tr.remove();
    } else {
      tr.remove();
    }
    section?.querySelector(".todo-section-count") &&
      (section.querySelector(".todo-section-count").textContent = tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
  });
  delTd.appendChild(delBtn);

  const kpiColText =
    isKpiTodo && kpiTodoId && storageKey
      ? (classification || "").trim() || getKpiDisplayNameForTodo(kpiTodoId, storageKey)
      : isKpiTodo && classification
        ? classification
        : "";
  const kpiTd = document.createElement("td");
  kpiTd.className = "todo-cell-kpi";
  kpiTd.textContent = kpiColText;

  tr.appendChild(doneTd);
  tr.appendChild(nameTd);
  if (eisenhowerSidebarFirst) {
    tr.appendChild(eisenhowerTd);
    tr.appendChild(kpiTd);
    tr.appendChild(startTd);
    tr.appendChild(dueTd);
    tr.appendChild(reminderTd);
    tr.appendChild(overdueTd);
  } else {
    if (overdueColumnOrder) {
      tr.appendChild(overdueTd);
    }
    tr.appendChild(kpiTd);
    tr.appendChild(startTd);
    tr.appendChild(dueTd);
    tr.appendChild(reminderTd);
    if (!overdueColumnOrder) {
      tr.appendChild(overdueTd);
    }
    tr.appendChild(eisenhowerTd);
  }
  if (!options.hideCategoryCol) {
    const lastColTd = document.createElement("td");
    lastColTd.className = "todo-cell-category";
    if (showCategoryCol) {
      lastColTd.textContent = sectionLabel;
      lastColTd.classList.add("todo-cell-category-readonly");
    } else if (isKpiTodo) {
      lastColTd.textContent = kpiColText;
      lastColTd.classList.add("todo-cell-category-readonly");
    } else {
      const categoryDropdown = createCategoryDropdown(
        classification,
        () => {},
        categoryUiSignal,
      );
      lastColTd.appendChild(categoryDropdown.wrap);
    }
    tr.appendChild(lastColTd);
  }
  tr.appendChild(delTd);

  syncDateLine();

  const canDragToCalendar =
    enableDragToCalendar &&
    (!hasDates ||
      (enableDragOverdueToCalendar &&
        !!(dueDate || "").trim() &&
        isOverdue(dueDate)));

  if (canDragToCalendar || enableDragToEisenhower) {
    if (!isSubtask) {
      tr.draggable = true;
      tr.addEventListener("dragstart", (e) => {
        const nameInput = tr.querySelector(".todo-task-name-field");
        const startInput = tr.querySelector(".todo-start-input-hidden");
        const dueInput = tr.querySelector(".todo-due-input-hidden");
        const doneCheck = tr.querySelector(".todo-done-check");
        const rowSectionId =
          (taskData.sourceSectionId ||
            taskData.sectionId ||
            tr.dataset.sectionId ||
            tr.closest(".todo-section")?.dataset?.section ||
            ""
          ).trim();
        const startTime = tr.dataset.startTime || "";
        const endTime = tr.dataset.endTime || "";
        const eisenhowerVal = tr.dataset.eisenhower || "";
        let durationMin = 30;
        if (startTime && endTime) {
          const [sh, sm] = startTime.split(":").map(Number);
          const [eh, em] = endTime.split(":").map(Number);
          durationMin = Math.max(30, (eh * 60 + em) - (sh * 60 + sm));
        }
        const payload = {
          taskId,
          sectionId: rowSectionId,
          name: (nameInput?.value || "").trim(),
          startDate: startInput?.value || "",
          dueDate: dueInput?.value || "",
          startTime,
          endTime,
          eisenhower: eisenhowerVal,
          done: doneCheck?.checked || false,
          itemType: tr.dataset.itemType || "todo",
          isKpiTodo: !!isKpiTodo,
          kpiTodoId: kpiTodoId || "",
          storageKey: storageKey || "",
          _durationMin: durationMin,
        };
        if (enableDragToEisenhower) {
          e.dataTransfer.setData(DRAG_TYPE_TODO_TO_EISENHOWER, JSON.stringify(payload));
        }
        if (canDragToCalendar) {
          window.__calendarDragDuration = durationMin;
          e.dataTransfer.setData(DRAG_TYPE_TODO_TO_CALENDAR, JSON.stringify(payload));
        }
        e.dataTransfer.effectAllowed = "move";
      });
    }
  }

  return tr;
}

/** 시작~마감: 라벨 없이 날짜만. 마감만 있으면 마감만. 기한 초과 시 "n일 초과" */
function formatCardDates(taskData) {
  const { startDate = "", dueDate = "" } = taskData;
  if (dueDate && isOverdue(dueDate)) {
    const parts = String(dueDate).trim().split(/[-/]/);
    if (parts.length >= 3) {
      const due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
      if (diffDays < 0) return `${Math.abs(diffDays)}일 초과`;
    }
  }
  const toMD = (str) => {
    if (!str || !String(str).includes("-")) return "";
    const [, m, d] = str.trim().split("-");
    return m && d ? `${m}/${d}` : "";
  };
  const start = toMD(startDate);
  const due = toMD(dueDate);
  if (start && due) return `${start} ~ ${due}`;
  if (due) return due;
  if (start) return start;
  return "";
}

/** 리마인더: 날짜 + 시간(있으면) */
function formatCardReminder(reminderDate = "", reminderTime = "") {
  if (!(reminderDate || "").trim()) return "";
  const parts = String(reminderDate).trim().split(/[-/]/);
  const dateStr = parts.length >= 3 ? `${parts[1]}/${parts[2]}` : reminderDate;
  return (reminderTime || "").trim() ? `${dateStr} ${(reminderTime || "").trim()}` : dateStr;
}

const EISENHOWER_LABELS = { "urgent-important": "긴급+중요", "important-not-urgent": "중요+여유", "urgent-not-important": "긴급+덜중요", "not-urgent-not-important": "여유+안중요" };

/** 카드 레이아웃용 할일 카드 한 개. 클릭 시 모달로 수정, 체크박스로 완료 토글 */
function createTaskCard(taskData, options = {}) {
  const {
    name = "",
    startDate = "",
    dueDate = "",
    reminderDate = "",
    reminderTime = "",
    eisenhower = "",
    classification = "",
    sectionId = "",
    sectionLabel = "",
    done = false,
    itemType = "todo",
    isKpiTodo = false,
    kpiTodoId = "",
    storageKey = "",
    kpiId = "",
    sourceSectionId = "",
  } = taskData;
  const storageSectionId =
    sectionId === "overdue" && (sourceSectionId || "").trim()
      ? String(sourceSectionId).trim()
      : sectionId;
  const {
    updateCount = () => {},
    sectionsWrap = null,
    scheduleSave = () => {},
    enableDragToEisenhower = false,
    enableDragToCalendar = false,
    enableDragOverdueToCalendar = false,
  } = options;
  const taskId = getTaskId(taskData);
  const kpiName =
    isKpiTodo && kpiTodoId && storageKey
      ? (classification || "").trim() || getKpiDisplayNameForTodo(kpiTodoId, storageKey)
      : "";
  const hasDueDate = (dueDate || startDate || "").trim() !== "";

  const card = document.createElement("div");
  card.className = "todo-card" + (done ? " is-done" : "");
  card.dataset.taskId = taskId;
  card.dataset.sectionId = sectionId;
  card.dataset.name = name;
  card.dataset.startDate = startDate;
  card.dataset.dueDate = dueDate;
  card.dataset.reminderDate = reminderDate;
  card.dataset.reminderTime = reminderTime;
  card.dataset.eisenhower = eisenhower;
  card.dataset.done = done ? "true" : "false";
  card.dataset.itemType = itemType;
  if (isKpiTodo) {
    card.dataset.isKpiTodo = "true";
    card.dataset.kpiTodoId = kpiTodoId;
    card.dataset.kpiStorageKey = storageKey;
    if (kpiId) card.dataset.kpiId = String(kpiId);
    if (kpiName) card.dataset.kpiLabel = kpiName;
  }

  const doneCheck = document.createElement("input");
  doneCheck.type = "checkbox";
  doneCheck.className = "todo-done-check todo-card-done";
  doneCheck.checked = done;
  doneCheck.addEventListener("change", (e) => {
    e.stopPropagation();
    const newDone = doneCheck.checked;
    card.dataset.done = newDone ? "true" : "false";
    card.classList.toggle("is-done", newDone);
    if (isKpiTodo && kpiTodoId && storageKey) syncKpiTodoCompleted(kpiTodoId, storageKey, newDone);
    else if (!isKpiTodo && storageSectionId && FIXED_SECTION_IDS_FOR_STORAGE.includes(storageSectionId)) {
      updateSectionTaskDone(storageSectionId, taskId, newDone);
    }
    scheduleSave();
    if (newDone && card.closest(".todo-list-eisenhower-sidebar, .todo-list-in-sidebar")) {
      refreshEisenhowerQuadrantsIfActive();
      card.remove();
    }
    updateCount();
  });

  const nameWrap = document.createElement("div");
  nameWrap.className = "todo-card-name-wrap";

  const nameEl = document.createElement("span");
  nameEl.className = "todo-card-name";
  nameEl.textContent = name || "(제목 없음)";

  const priorityEl = document.createElement("span");
  priorityEl.className = "todo-card-priority";
  priorityEl.textContent = eisenhower ? (EISENHOWER_LABELS[eisenhower] || eisenhower) : "";
  if (!eisenhower) priorityEl.hidden = true;

  nameWrap.appendChild(nameEl);
  nameWrap.appendChild(priorityEl);

  const kpiEl = document.createElement("div");
  kpiEl.className = "todo-card-kpi";
  kpiEl.textContent = kpiName;
  if (!kpiName) kpiEl.hidden = true;

  const datesEl = document.createElement("div");
  datesEl.className = "todo-card-dates";
  const initialDateStr = formatCardDates(taskData);
  datesEl.textContent = initialDateStr;
  datesEl.hidden = !initialDateStr || !String(initialDateStr).trim();

  const BELL_ICON = '<svg class="todo-card-reminder-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 19.001c0 2.209 1.791 4 4 4s4-1.791 4-4"/><path d="m12 5.999v6"/><path d="m9 8.999h6"/><path d="m22 19.001-3-5.25v-5.752c0-3.866-3.134-7-7-7s-7 3.134-7 7v5.751l-3 5.25h20z"/></svg>';
  const reminderEl = document.createElement("div");
  reminderEl.className = "todo-card-reminder";
  const reminderText = formatCardReminder(reminderDate, reminderTime);
  if (reminderText) {
    reminderEl.innerHTML = `${BELL_ICON}<span class="todo-card-reminder-text">${reminderText}</span>`;
    reminderEl.hidden = false;
  } else {
    reminderEl.hidden = true;
  }

  const metaRow = document.createElement("div");
  metaRow.className = "todo-card-meta-row";
  metaRow.appendChild(datesEl);
  metaRow.appendChild(reminderEl);
  metaRow.hidden = !!(datesEl.hidden && reminderEl.hidden);

  const doneWrap = document.createElement("div");
  doneWrap.className = "todo-card-done-wrap";
  doneWrap.appendChild(doneCheck);

  const detailStack = document.createElement("div");
  detailStack.className = "todo-card-detail-stack";
  detailStack.appendChild(kpiEl);
  detailStack.appendChild(metaRow);

  const titleRow = document.createElement("div");
  titleRow.className = "todo-card-title-row";
  titleRow.appendChild(doneWrap);
  titleRow.appendChild(nameWrap);
  titleRow.appendChild(detailStack);

  const contentCol = document.createElement("div");
  contentCol.className = "todo-card-content";
  contentCol.appendChild(titleRow);

  const inner = document.createElement("div");
  inner.className = "todo-card-inner";
  inner.appendChild(contentCol);
  card.appendChild(inner);

  if (enableDragToEisenhower) {
    const hasPriority = (eisenhower || "").trim() !== "";
    card.draggable = !hasPriority;
    if (hasPriority) card.classList.add("todo-card--priority-assigned");
    card.addEventListener("dragstart", (e) => {
      if (card.classList.contains("todo-card--priority-assigned")) {
        e.preventDefault();
        return;
      }
      e.stopPropagation();
      const payload = {
        taskId,
        sectionId: (sourceSectionId || sectionId || "").trim(),
        name: (name || "").trim(),
        startDate: startDate || "",
        dueDate: dueDate || "",
        isKpiTodo: !!isKpiTodo,
        kpiTodoId: kpiTodoId || "",
        storageKey: storageKey || "",
      };
      e.dataTransfer.setData(DRAG_TYPE_TODO_TO_EISENHOWER, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("todo-card-dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("todo-card-dragging");
    });
  }

  const allowCalendarDrag =
    !hasDueDate ||
    (enableDragOverdueToCalendar && (dueDate || "").trim() !== "" && isOverdue(dueDate));

  if (enableDragToCalendar) {
    if (enableDragToEisenhower) {
      const hasPriority = (eisenhower || "").trim() !== "";
      card.draggable = allowCalendarDrag || !hasPriority;
    } else {
      card.draggable = allowCalendarDrag;
    }
    if (hasDueDate) card.classList.add("todo-card--has-due");
    card.addEventListener("dragstart", (e) => {
      if (!allowCalendarDrag) return;
      e.stopPropagation();
      const payload = {
        taskId,
        sectionId: (sourceSectionId || sectionId || "").trim(),
        name: (name || "").trim(),
        startDate: startDate || "",
        dueDate: dueDate || "",
        done: done,
        itemType: itemType || "todo",
        isKpiTodo: !!isKpiTodo,
        kpiTodoId: kpiTodoId || "",
        storageKey: storageKey || "",
        _durationMin: 30,
      };
      e.dataTransfer.setData(DRAG_TYPE_TODO_TO_CALENDAR, JSON.stringify(payload));
      e.dataTransfer.effectAllowed = "move";
      if (typeof window !== "undefined") window.__calendarDragDuration = 30;
      card.classList.add("todo-card-dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("todo-card-dragging");
    });
  }

  function updateCardFromData(data) {
    const tid = (data.taskId || "").trim();
    if (tid) card.dataset.taskId = tid;
    const n = (data.name || "").trim() || "(제목 없음)";
    card.dataset.name = data.name || "";
    card.dataset.startDate = data.startDate || "";
    card.dataset.dueDate = data.dueDate || "";
    card.dataset.reminderDate = data.reminderDate || "";
    card.dataset.reminderTime = data.reminderTime || "";
    card.dataset.eisenhower = data.eisenhower || "";
    nameEl.textContent = n;
    const isKpiCard = card.dataset.isKpiTodo === "true";
    const kid = card.dataset.kpiTodoId || "";
    const sk = card.dataset.kpiStorageKey || "";
    let kpiLabel = "";
    if (isKpiCard && kid && sk) {
      kpiLabel = (data.classification || "").trim() || getKpiDisplayNameForTodo(kid, sk);
    }
    kpiEl.textContent = kpiLabel;
    kpiEl.hidden = !kpiLabel;
    if (kpiLabel) card.dataset.kpiLabel = kpiLabel;
    const ds = formatCardDates(data);
    datesEl.textContent = ds;
    datesEl.hidden = !ds || !String(ds).trim();
    const priorityText = data.eisenhower ? (EISENHOWER_LABELS[data.eisenhower] || data.eisenhower) : "";
    priorityEl.textContent = priorityText;
    priorityEl.hidden = !priorityText;
    if (card.closest(".todo-list-eisenhower-sidebar")) {
      const hasP = (data.eisenhower || "").trim() !== "";
      card.classList.toggle("todo-card--priority-assigned", hasP);
      card.draggable = !hasP;
    }
    if (card.closest(".todo-list-in-sidebar") && !card.closest(".todo-list-eisenhower-sidebar")) {
      const hasDue = (data.dueDate || data.startDate || "").trim() !== "";
      card.classList.toggle("todo-card--has-due", hasDue);
      card.draggable = !hasDue;
    }
    const remText = formatCardReminder(data.reminderDate, data.reminderTime);
    if (remText) {
      const bell = '<svg class="todo-card-reminder-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 19.001c0 2.209 1.791 4 4 4s4-1.791 4-4"/><path d="m12 5.999v6"/><path d="m9 8.999h6"/><path d="m22 19.001-3-5.25v-5.752c0-3.866-3.134-7-7-7s-7 3.134-7 7v5.751l-3 5.25h20z"/></svg>';
      reminderEl.innerHTML = `${bell}<span class="todo-card-reminder-text">${remText}</span>`;
      reminderEl.hidden = false;
    } else {
      reminderEl.innerHTML = "";
      reminderEl.hidden = true;
    }
    metaRow.hidden = !!(datesEl.hidden && reminderEl.hidden);
  }

  contentCol.addEventListener("click", (e) => {
    /* 체크박스(완료 토글)는 카드 편집과 분리 — preventDefault가 버블링되며 체크를 막고 모달만 열림 */
    if (e.target.closest(".todo-card-done-wrap")) return;
    e.preventDefault();
    e.stopPropagation();
    showTodoTaskModal({
      taskData: {
        taskId: card.dataset.taskId || "",
        name: card.dataset.name,
        startDate: card.dataset.startDate,
        dueDate: card.dataset.dueDate,
        reminderDate: card.dataset.reminderDate,
        reminderTime: card.dataset.reminderTime,
        eisenhower: card.dataset.eisenhower,
        sectionId: storageSectionId,
        sectionLabel,
        isKpiTodo: card.dataset.isKpiTodo === "true",
        classification: card.dataset.kpiLabel || "",
        kpiTodoId: card.dataset.kpiTodoId || "",
        storageKey: card.dataset.kpiStorageKey || "",
        kpiId: card.dataset.kpiId || "",
        itemType: card.dataset.itemType || "todo",
      },
      sectionId: storageSectionId,
      sectionLabel,
      mode: "edit",
      onSave: (payload) => {
        const newSectionId = (payload.sectionId || "").trim();
        if (newSectionId && newSectionId !== storageSectionId) {
          if (storageSectionId && storageSectionId.startsWith("custom-")) {
            moveTaskOutOfCustomSectionStorageOnly(storageSectionId, taskId);
          } else if (storageSectionId) {
            moveTaskOutOfSectionStorageOnly(storageSectionId, taskId);
          }
          clearSubtasks(taskId);
          const sectionEl = sectionsWrap?.querySelector(`.todo-section[data-section="${newSectionId}"]`);
          const targetWrap = sectionEl?.querySelector(".todo-cards-wrap");
          if (targetWrap) {
            card.remove();
            if (targetWrap.firstChild) {
              targetWrap.insertBefore(card, targetWrap.firstChild);
            } else {
              targetWrap.appendChild(card);
            }
          }
          card.dataset.sectionId = newSectionId;
        }
        updateCardFromData(payload);
        updateCount();
        scheduleSave();
      },
      onDelete: async () => {
        if (isKpiTodo && kpiTodoId && storageKey) {
          if (removeKpiTodo(kpiTodoId, storageKey)) card.remove();
          updateCount();
          scheduleSave();
          return;
        }
        if (storageSectionId && storageSectionId.startsWith("custom-")) {
          const out = await removeTaskFromCustomSectionStorage(storageSectionId, taskId);
          if (!out?.ok) return;
          clearSubtasks(taskId);
          card.remove();
          updateCount();
          /* 서버 DELETE + 목록 다시 읽기까지 끝남 — DOM 저장으로 전체 upsert 다시 돌리지 않음 */
          return;
        }
        if (storageSectionId) {
          const out = await removeTaskFromSectionStorage(storageSectionId, taskId);
          if (!out?.ok) return;
          clearSubtasks(taskId);
          card.remove();
          updateCount();
          return;
        }
        card.remove();
        updateCount();
        scheduleSave();
      },
    });
  });

  return card;
}

function createSection(section, options = {}) {
  const {
    lastColHeader = "분류",
    initialTasks = [],
    showCategoryCol = false,
    sectionIdForAdd = null,
    hideCategoryCol = true,
    tabMode = false,
    showCheckboxTypeMenu = null,
    enableDragToCalendar = false,
    enableDragToEisenhower = false,
    enableDragOverdueToCalendar = false,
    hideAddRow = false,
    overdueColumnOrder = false,
    eisenhowerSidebarFirst = false,
    cardLayout = false,
    categoryUiSignal,
  } = options;
  const sectionId = sectionIdForAdd ?? section.id;

  const wrap = document.createElement("div");
  wrap.className = "todo-section" + (tabMode ? " todo-section-tab-panel" : "");
  wrap.dataset.section = section.id;

  const isOverdueSection = section.id === "overdue";
  let header = null;
  if (!tabMode) {
    header = document.createElement("div");
    header.className = "todo-section-header" + (isOverdueSection ? " todo-section-header--no-collapse" : "");
    header.innerHTML = isOverdueSection
      ? `
      <span class="todo-section-label">${section.label}</span>
      <span class="todo-section-count">0</span>
    `
      : `
      <span class="todo-section-arrow">▼</span>
      <span class="todo-section-label">${section.label}</span>
      <span class="todo-section-count">0</span>
    `;
  } else {
    const countSpan = document.createElement("span");
    countSpan.className = "todo-section-count";
    countSpan.textContent = "0";
    countSpan.style.display = "none";
    wrap.appendChild(countSpan);
  }

  const countEl = () => (tabMode ? wrap.querySelector(".todo-section-count") : header?.querySelector(".todo-section-count"));

  if (cardLayout) {
    const cardsWrap = document.createElement("div");
    cardsWrap.className = "todo-cards-wrap";
    const sectionsWrap = options.sectionsWrap || wrap.closest(".todo-sections-wrap");
    function scheduleSave(opts) {
      if (!sectionsWrap) return;
      const addLog = opts && typeof opts === "object" && opts.addLog ? opts.addLog : undefined;
      scheduleSaveSectionTasksFromDOM(sectionsWrap, addLog ? { addLog } : {});
    }
    function updateCount() {
      const el = countEl();
      if (el) el.textContent = String(cardsWrap.querySelectorAll(".todo-card").length);
    }
    initialTasks.forEach((t) => {
      const taskId = t.taskId || getTaskId(t);
      t.taskId = taskId;
      const card = createTaskCard(t, { updateCount, sectionsWrap, scheduleSave, enableDragToEisenhower, enableDragToCalendar, enableDragOverdueToCalendar });
      cardsWrap.appendChild(card);
    });
    const addWrap = document.createElement("div");
    addWrap.className = "todo-cards-add-wrap";
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "todo-add-btn todo-cards-add-btn";
    addBtn.title = "할 일 추가";
    addBtn.innerHTML = ADD_TASK_ICON;
    addBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      showTodoTaskModal({
        taskData: { sectionId, sectionLabel: section.label },
        sectionId,
        sectionLabel: section.label,
        mode: "add",
        onSave: (payload) => {
          const taskId = getTaskId(payload);
          const newTask = { ...payload, taskId, done: false };
          const card = createTaskCard(newTask, { updateCount, sectionsWrap, scheduleSave, enableDragToEisenhower, enableDragToCalendar, enableDragOverdueToCalendar });
          cardsWrap.appendChild(card);
          updateCount();
          logTodoScheduleAddStep1({
            taskId,
            sectionId,
            title: (payload.name || newTask.name || "").trim(),
          });
          scheduleSave({
            addLog: { taskId, sectionId },
          });
        },
      });
    });
    addWrap.appendChild(addBtn);
    if (header) wrap.appendChild(header);
    wrap.appendChild(cardsWrap);
    /* + 버튼은 스크롤 박스(todo-cards-wrap) 밖에 둠 — 모바일에서 fixed가 overflow:auto에 잘리는 것 방지 */
    if (section.id !== "overdue") wrap.appendChild(addWrap);
    updateCount();
    return { wrap, updateCount };
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "todo-table-wrap";
  const table = document.createElement("table");
  table.className = "todo-table";
  const colgroupOverdue = overdueColumnOrder
    ? (hideCategoryCol
        ? `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`
        : `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-category" style="width: 5rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`)
    : null;
  const colgroupEisenhowerSidebarFirst = eisenhowerSidebarFirst
    ? (hideCategoryCol
        ? `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`
        : `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-category" style="width: 5rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`)
    : null;
  const colgroupDefault = hideCategoryCol
    ? `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`
    : `<colgroup>
      <col class="todo-col-done" style="width: 2rem">
      <col class="todo-col-name">
      <col class="todo-col-kpi" style="min-width: 8rem; width: 10rem">
      <col class="todo-col-start" style="width: 4.5rem">
      <col class="todo-col-due" style="width: 4.5rem">
      <col class="todo-col-reminder" style="width: 7.5rem">
      <col class="todo-col-overdue" style="width: 5rem">
      <col class="todo-col-eisenhower" style="width: 6rem">
      <col class="todo-col-category" style="width: 5rem">
      <col class="todo-col-delete" style="width: 2.5rem">
    </colgroup>`;
  const colgroupHtml = colgroupOverdue || colgroupEisenhowerSidebarFirst || colgroupDefault;
  const theadCategoryTh = hideCategoryCol ? "" : `<th class="todo-th-category">${lastColHeader}</th>`;
  const theadEisenhowerSidebarFirst = eisenhowerSidebarFirst
    ? `<tr>
        <th class="todo-th-done"></th>
        <th class="todo-th-name">할일 이름</th>
        <th class="todo-th-eisenhower">우선순위</th>
        <th class="todo-th-kpi">KPI</th>
        <th class="todo-th-start">시작일</th>
        <th class="todo-th-due">마감일</th>
        <th class="todo-th-reminder">리마인더</th>
        <th class="todo-th-overdue">기한</th>
        ${theadCategoryTh}
        <th class="todo-th-delete"></th>
      </tr>`
    : null;
  const theadOverdue = overdueColumnOrder
    ? `<tr>
        <th class="todo-th-done"></th>
        <th class="todo-th-name">할일 이름</th>
        <th class="todo-th-overdue">기한</th>
        <th class="todo-th-kpi">KPI</th>
        <th class="todo-th-start">시작일</th>
        <th class="todo-th-due">마감일</th>
        <th class="todo-th-reminder">리마인더</th>
        <th class="todo-th-eisenhower">우선순위</th>
        ${theadCategoryTh}
        <th class="todo-th-delete"></th>
      </tr>`
    : `<tr>
        <th class="todo-th-done"></th>
        <th class="todo-th-name">할일 이름</th>
        <th class="todo-th-kpi">KPI</th>
        <th class="todo-th-start">시작일</th>
        <th class="todo-th-due">마감일</th>
        <th class="todo-th-reminder">리마인더</th>
        <th class="todo-th-overdue">기한</th>
        <th class="todo-th-eisenhower">우선순위</th>
        ${theadCategoryTh}
        <th class="todo-th-delete"></th>
      </tr>`;
  const theadHtml = theadEisenhowerSidebarFirst || theadOverdue;
  table.innerHTML = `
    ${colgroupHtml}
    <thead>
      ${theadHtml}
    </thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector("tbody");

  initialTasks.forEach((t) => {
    const taskId = t.taskId || getTaskId(t);
    t.taskId = taskId;
    const tr = createTaskRow(t, {
      showCategoryCol,
      hideCategoryCol,
      isSubtask: false,
      taskId,
      showCheckboxTypeMenu,
      enableDragToCalendar,
      enableDragToEisenhower,
      enableDragOverdueToCalendar,
      overdueColumnOrder,
      eisenhowerSidebarFirst,
      categoryUiSignal,
    });
    tr.dataset.sectionId = t.sectionId || "";
    tbody.appendChild(tr);
    const container = tr.querySelector(".todo-subtasks-container");
    if (container) {
      getSubtasks(taskId).forEach((st) => {
        const item = createSubtaskItem(taskId, st, updateCount);
        container.appendChild(item);
      });
    }
  });

  const addRow = document.createElement("tr");
  addRow.className = "todo-add-row";
  const addColspan = hideCategoryCol ? 9 : 10;
  addRow.innerHTML = `
    <td class="todo-add-cell todo-add-cell-btn">
      <button type="button" class="todo-add-btn" title="할 일 추가">${ADD_TASK_ICON}</button>
    </td>
    <td colspan="${addColspan - 1}" class="todo-add-cell todo-add-cell-fill"></td>
  `;
  if (!hideAddRow) tbody.insertBefore(addRow, tbody.firstChild);

  function updateCount() {
    const el = countEl();
    if (el) el.textContent = String(tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
  }

  if (!hideAddRow) {
    addRow.querySelector(".todo-add-btn").addEventListener("click", () => {
      const taskData = showCategoryCol
        ? {
            sectionId: getSections()[0]?.id || "",
            sectionLabel: getSections()[0]?.label || "",
            classification: section.id,
          }
        : { sectionId };
      const taskId = getTaskId(taskData);
      taskData.taskId = taskId;
      const tr = createTaskRow(taskData, {
        showCategoryCol,
        hideCategoryCol,
        isSubtask: false,
        taskId,
        showCheckboxTypeMenu,
        enableDragToCalendar,
        enableDragToEisenhower,
        enableDragOverdueToCalendar,
        overdueColumnOrder,
        eisenhowerSidebarFirst,
        categoryUiSignal,
      });
      tbody.appendChild(tr);
      updateCount();
      const nameInput = tr.querySelector(".todo-task-name-field");
      if (nameInput) {
        nameInput.focus();
      }
      const sectionsWrap = tbody.closest(".todo-sections-wrap");
      if (sectionsWrap) flushSaveSectionTasksFromDOM(sectionsWrap);
    });
  }

  const arrowEl = header?.querySelector(".todo-section-arrow");
  if (arrowEl) {
    arrowEl.addEventListener("click", () => {
      wrap.classList.toggle("is-collapsed");
    });
  }

  tableWrap.appendChild(table);
  if (header) wrap.appendChild(header);
  wrap.appendChild(tableWrap);
  updateCount();
  return { wrap, updateCount };
}

function collectTasksFromDOM(sectionsEl) {
  const tasks = [];
  const sectionIds = new Set(getSections().map((s) => s.id));
  sectionsEl?.querySelectorAll(".todo-section").forEach((sec) => {
    const secId = sec.dataset.section;
    const isCategoryView = sectionIds.has(secId);
    const cardsWrap = sec.querySelector(".todo-cards-wrap");
    if (cardsWrap) {
      cardsWrap.querySelectorAll(".todo-card").forEach((card) => {
        const rowSectionId = card.dataset.sectionId || secId;
        const sectionLabel = getSections().find((s) => s.id === rowSectionId)?.label || "";
        const isKpiCard = card.dataset.isKpiTodo === "true";
        const kpiTid = card.dataset.kpiTodoId || "";
        const kpiSk = card.dataset.kpiStorageKey || "";
        let classificationVal = secId;
        if (isKpiCard && kpiTid && kpiSk) {
          classificationVal =
            (card.dataset.kpiLabel || "").trim() || getKpiDisplayNameForTodo(kpiTid, kpiSk);
        }
        const task = {
          taskId: card.dataset.taskId || "",
          name: card.dataset.name || "",
          startDate: card.dataset.startDate || "",
          dueDate: card.dataset.dueDate || "",
          startTime: "",
          endTime: "",
          eisenhower: card.dataset.eisenhower || "",
          classification: classificationVal,
          sectionId: rowSectionId,
          sectionLabel,
          done: card.dataset.done === "true",
          reminderDate: card.dataset.reminderDate || "",
          reminderTime: card.dataset.reminderTime || "",
        };
        if (isKpiCard) {
          task.isKpiTodo = true;
          task.kpiTodoId = kpiTid;
          task.storageKey = kpiSk;
        }
        tasks.push(task);
      });
      return;
    }
    sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").forEach((row) => {
      const nameInput = row.querySelector(".todo-task-name-field");
      const startInput = row.querySelector(".todo-start-input-hidden");
      const dueInput = row.querySelector(".todo-due-input-hidden");
      const eisenhowerSelect = row.querySelector(".todo-eisenhower-select");
      const catCell = row.querySelector(".todo-cell-category");
      const catInput = catCell?.querySelector(".todo-category-input");
      const doneCheck = row.querySelector(".todo-done-check");
      const rowSectionId = row.dataset.sectionId || secId;
      const sectionLabel = getSections().find((s) => s.id === rowSectionId)?.label || "";
      const classification = catCell
        ? (isCategoryView ? (catInput ? catInput.value : catCell?.textContent || "").trim() : secId)
        : secId;
      const task = {
        name: nameInput?.value || "",
        startDate: startInput?.value || "",
        dueDate: dueInput?.value || "",
        startTime: row.dataset.startTime || "",
        endTime: row.dataset.endTime || "",
        eisenhower: eisenhowerSelect?.value || row.dataset.eisenhower || "",
        classification,
        sectionId: rowSectionId,
        sectionLabel,
        done: doneCheck?.checked || false,
        reminderDate: row.dataset.reminderDate || "",
        reminderTime: row.dataset.reminderTime || "",
      };
      if (row.dataset.isKpiTodo === "true") {
        task.isKpiTodo = true;
        task.kpiTodoId = row.dataset.kpiTodoId || "";
        task.storageKey = row.dataset.kpiStorageKey || "";
      }
      tasks.push(task);
    });
  });
  return tasks;
}

function renderSections(container, tasksData = [], options = {}) {
  const {
    tabMode = false,
    showCheckboxTypeMenu = null,
    enableDragToCalendar = false,
    enableDragToEisenhower = false,
    sectionsOverride = null,
    eisenhowerSidebarFirst = false,
    cardLayout = false,
    categoryUiSignal,
  } = options;
  container.innerHTML = "";
  const results = [];
  const sections = sectionsOverride || getSections();
  sections.forEach((section) => {
    const sectionTasks = tasksData.filter((t) => t.sectionId === section.id);
    const sectionOpts = {
      lastColHeader: "분류",
      initialTasks: sectionTasks,
      showCategoryCol: false,
      sectionIdForAdd: section.id === "overdue" ? null : (section.id === "tasks" ? "braindump" : section.id),
      hideCategoryCol: true,
      tabMode,
      showCheckboxTypeMenu,
      enableDragToCalendar,
      enableDragToEisenhower,
      enableDragOverdueToCalendar: section.id === "overdue" && enableDragToCalendar,
      hideAddRow: true,
      overdueColumnOrder: section.id === "overdue",
      eisenhowerSidebarFirst: eisenhowerSidebarFirst && section.id !== "overdue",
      cardLayout: cardLayout || section.id === "overdue",
      sectionsWrap: container,
      categoryUiSignal,
    };
    const { wrap, updateCount } = createSection(section, sectionOpts);
    container.appendChild(wrap);
    results.push({ section, wrap, updateCount });
  });
  return results;
}

function isOverdue(dueStr) {
  if (!dueStr || !dueStr.trim()) return false;
  const parts = String(dueStr).trim().split(/[-/]/);
  if (parts.length < 3) return false;
  const due = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

export function render(options = {}) {
  const {
    hideToolbar = false,
    hideHeader = false,
    settingsSlot = null,
    enableDragToCalendar = false,
    enableDragToEisenhower = false,
    initialActiveTabIndex: initialActiveTabIndexOpt,
    eisenhowerFilter = "",
    eisenhowerSidebarFirst = false,
    /** 우선순위 정렬·날짜 정하기 등: 완료된 할일은 목록에 넣지 않음 */
    hideDoneTasks = false,
    /** true: KPI에서 만든 할일을 이 목록에 넣지 않음(기본). KPI 할일은 KPI 화면에서만 다룸 */
    omitKpiTodos = true,
  } = options;
  const hasExplicitInitialTab = Object.prototype.hasOwnProperty.call(options, "initialActiveTabIndex");
  /** 사이드바 등 hideToolbar 임베드는 탭 세션과 분리(메인 할일 탭이 꿈인데 캘린더 옆바가 브레인 덤프로 열리는 혼선 방지) */
  const persistFixedListTabToSession = !hideToolbar && !hasExplicitInitialTab;
  const el = document.createElement("div");
  el.className = "app-tab-panel-content todo-list-view";
  const listTabAbort = new AbortController();
  el._lpTabAbortController = listTabAbort;
  const listUiSignal = listTabAbort.signal;

  const header = document.createElement("div");
  header.className = "todo-list-header";
  header.hidden = hideToolbar || hideHeader;
  const titleEl = document.createElement("h2");
  titleEl.className = "todo-list-title";
  titleEl.textContent = "할 일/일정";
  header.appendChild(titleEl);
  el.appendChild(header);

  const toolbar = document.createElement("div");
  toolbar.className = "todo-list-toolbar";
  toolbar.hidden = hideToolbar;
  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "todo-list-toolbar-btn todo-list-settings-btn";
  settingsBtn.title = "할 일 환경 설정";
  settingsBtn.innerHTML = '<img src="/toolbaricons/settings.svg" alt="" class="todo-list-settings-icon" width="20" height="20">';

  const initialSettings = getTodoSettings();
  let hideCompleted = initialSettings.hideCompleted;
  el.classList.toggle("hide-completed", hideCompleted);

  async function runClearCompletedConfirmed() {
    /* 완료 표시가 저장소와 어긋나도 DOM 기준으로 잡기 위해 먼저 한 번 저장 */
    try {
      const panel = document.querySelector(".app-tab-panel");
      if (panel) saveTodoListBeforeUnmount(panel);
    } catch (_) {}
    /* KPI 할 일: 화면에서 완료된 카드는 즉시 KPI JSON에서 제거 + JSON 상 completed 일괄 제거 */
    try {
      document.querySelectorAll('.todo-card[data-is-kpi-todo="true"]').forEach((card) => {
        if (card.dataset.done !== "true") return;
        const id = (card.dataset.kpiTodoId || "").trim();
        const sk = (card.dataset.kpiStorageKey || "").trim();
        if (id && sk) removeKpiTodo(id, sk);
      });
    } catch (_) {}
    removeAllCompletedKpiTodos();
    removeAllCompletedSubtasksFromStore();
    const { fixed, custom, changed } = purgeAllCompletedSectionAndCustomTasks();
    if (changed) {
      persistSectionTasksAndSchedule(fixed);
      persistCustomSectionTasksAndSchedule(custom);
    }
    try {
      await deleteCompletedCalendarSectionTasksFromSupabase();
      await syncTodoSectionTasksToSupabase();
    } catch (_) {}
    try {
      /* DOM은 아직 완료 카드가 남아 있음; save 생략하지 않으면 renderMain이 그 DOM으로 localStorage를 다시 덮어씀 */
      logLpRender("TodoList:완료 일괄 제거 후 __lpRenderMain", {});
      window.__lpRenderMain?.({ skipTodoSaveBeforeUnmount: true });
    } catch (_) {}
  }

  function promptClearCompleted() {
    showConfirmModal({
      title: "완료 항목 모두 제거",
      message: "삭제 후에는 복구할 수 없습니다.",
      confirmText: "제거",
      cancelText: "취소",
      confirmDanger: true,
      onConfirm: () => void runClearCompletedConfirmed(),
    });
  }

  settingsBtn.addEventListener("click", () => {
    createTodoSettingsModal({
      onHideCompletedChange: (v) => {
        hideCompleted = v;
        el.classList.toggle("hide-completed", hideCompleted);
      },
      onClearCompleted: promptClearCompleted,
      onColorsChange: () => {
        applyTabColors();
      },
    });
  });

  if (settingsSlot) {
    settingsSlot.appendChild(settingsBtn);
  } else {
    toolbar.appendChild(settingsBtn);
  }

  const toolbarRow = document.createElement("div");
  toolbarRow.className = "todo-list-toolbar-row";
  el.appendChild(toolbarRow);

  const categoryTabs = document.createElement("div");
  categoryTabs.className = "todo-category-tabs";
  const tabButtons = [];

  function applyTabColors() {
    /* 리스트 탭 컬러 테두리 제거 - 탭 스타일은 CSS로 통일 */
  }

  /* 할일/일정: 고정 5개 탭만 표시 (브레인덤프, 꿈, 부수입, 건강, 행복), 리스트 추가 비노출 */
  FIXED_SECTIONS.forEach((section) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "todo-category-tab";
    btn.dataset.section = section.id;
    btn.innerHTML = `<span class="todo-category-tab-label">${section.label}</span> <span class="todo-category-tab-count">0</span>`;
    tabButtons.push(btn);
    categoryTabs.appendChild(btn);
  });

  toolbarRow.appendChild(categoryTabs);
  if (!settingsSlot) {
    toolbarRow.appendChild(toolbar);
  }

  const listTabContextMenu = document.createElement("div");
  listTabContextMenu.className = "todo-list-tab-context-menu";
  listTabContextMenu.hidden = true;
  listTabContextMenu.innerHTML = `
    <button type="button" class="todo-list-tab-context-menu-item" data-action="edit">편집</button>
    <button type="button" class="todo-list-tab-context-menu-item" data-action="delete">삭제</button>
  `;
  el.appendChild(listTabContextMenu);
  todoListTabContextMenuActive = listTabContextMenu;
  ensureTodoListTabGlobalDismiss();

  const hideListTabMenu = () => {
    listTabContextMenu.hidden = true;
    todoListTabContextTargetActive = null;
  };
  listTabContextMenu.querySelector('[data-action="edit"]').addEventListener("click", () => {
    if (!todoListTabContextTargetActive) return;
    const tabEl = todoListTabContextTargetActive;
    const sectionId = tabEl.dataset.section;
    const section = getCustomSections().find((s) => s.id === sectionId);
    if (!section) return;
    hideListTabMenu();
    showEditListModal({
      sectionId,
      currentLabel: section.label,
      onSuccess: (updated) => {
        const labelEl = tabEl.querySelector(".todo-category-tab-label");
        if (labelEl) labelEl.textContent = updated.label;
      },
    });
  });
  listTabContextMenu.querySelector('[data-action="delete"]').addEventListener("click", () => {
    if (!todoListTabContextTargetActive) return;
    const tabToRemove = todoListTabContextTargetActive;
    const sectionId = tabToRemove.dataset.section;
    const section = getCustomSections().find((s) => s.id === sectionId);
    if (!section) return;
    hideListTabMenu();
    showConfirmModal({
      title: "리스트 삭제",
      message: `"${section.label}" 리스트를 삭제하시겠습니까?`,
      confirmText: "삭제",
      cancelText: "취소",
      onConfirm: async () => {
        const tabIndex = tabButtons.indexOf(tabToRemove);
        removeCustomSection(sectionId);
        await removeCustomSectionTasks(sectionId);
        const panelResult = sectionResults.find((r) => r.wrap.dataset.section === sectionId);
        if (panelResult) {
          panelResult.wrap.remove();
          sectionResults.splice(sectionResults.indexOf(panelResult), 1);
        }
        tabToRemove.remove();
        tabButtons.splice(tabIndex, 1);
        if (activeSectionIndex >= tabIndex) activeSectionIndex = Math.max(0, activeSectionIndex - 1);
        if (activeSectionIndex >= tabButtons.length) activeSectionIndex = tabButtons.length - 1;
        tabButtons.forEach((b, i) => b.classList.toggle("active", i === activeSectionIndex));
        sectionResults.forEach((r, i) => r.wrap.classList.toggle("is-active", i === activeSectionIndex));
        updateTabLabels();
      },
    });
  });
  categoryTabs.addEventListener("contextmenu", (e) => {
    const tab = e.target.closest(".todo-category-tab:not(.todo-category-tab-add)");
    if (!tab) return;
    const sectionId = tab.dataset.section;
    if (!sectionId || !sectionId.startsWith("custom-")) return;
    e.preventDefault();
    e.stopPropagation();
    todoListTabContextTargetActive = tab;
    listTabContextMenu.hidden = false;
    listTabContextMenu.style.left = `${e.clientX}px`;
    listTabContextMenu.style.top = `${e.clientY}px`;
  });

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "todo-sections-wrap todo-tab-panels";

  const { menu: checkboxTypeMenu, show: showCheckboxTypeMenu } = createTodoCheckboxTypeMenu();
  checkboxTypeMenu.hidden = true;
  el.appendChild(checkboxTypeMenu);

  const kpiTasks = omitKpiTodos ? [] : getKpiTodosAsTasks();
  const sectionTasks = FIXED_SECTION_IDS_FOR_STORAGE.flatMap((sid) => loadSectionTasks(sid));
  const customTasks = getCustomSections().flatMap((s) => loadCustomSectionTasks(s.id));
  let allTasks = [...kpiTasks, ...sectionTasks, ...customTasks];
  if ((eisenhowerFilter || "").trim()) {
    const q = (eisenhowerFilter || "").trim();
    const EISENHOWER_LABELS = { "urgent-important": "긴급+중요", "important-not-urgent": "중요+여유", "urgent-not-important": "긴급+덜중요", "not-urgent-not-important": "여유+안중요" };
    const labelForQ = EISENHOWER_LABELS[q];
    allTasks = allTasks.filter((t) => {
      const v = (t.eisenhower || "").trim();
      return v === q || (labelForQ && v === labelForQ);
    });
  }
  if (hideDoneTasks) {
    allTasks = allTasks.filter((t) => !t.done);
  }
  const sectionResults = renderSections(sectionsWrap, allTasks, {
    tabMode: true,
    showCheckboxTypeMenu,
    enableDragToCalendar,
    enableDragToEisenhower,
    eisenhowerSidebarFirst,
    sectionsOverride: FIXED_SECTIONS,
    cardLayout: true,
    categoryUiSignal: listUiSignal,
  });

  function updateTabLabels() {
    tabButtons.forEach((btn, i) => {
      const sec = sectionResults[i]?.wrap;
      if (!sec) {
        btn.querySelector(".todo-category-tab-count").textContent = "0";
        return;
      }
      const cardsWrap = sec.querySelector(".todo-cards-wrap");
      const count = cardsWrap
        ? cardsWrap.querySelectorAll(".todo-card").length
        : sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length;
      btn.querySelector(".todo-category-tab-count").textContent = String(count);
    });
  }
  updateTabLabels();

  let initialActiveTabIndex = 0;
  if (hasExplicitInitialTab) {
    initialActiveTabIndex = Math.max(0, Math.min(Number(initialActiveTabIndexOpt) || 0, tabButtons.length - 1));
  } else if (persistFixedListTabToSession) {
    try {
      const raw = sessionStorage.getItem(SESSION_TODO_FIXED_TAB_INDEX);
      if (raw != null) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 0 && n < tabButtons.length) initialActiveTabIndex = n;
      }
    } catch (_) {}
  }

  const safeIndex = Math.max(0, Math.min(initialActiveTabIndex, tabButtons.length - 1));
  let activeSectionIndex = safeIndex;
  sectionResults.forEach((r, i) => {
    r.wrap.classList.toggle("is-active", i === safeIndex);
  });

  tabButtons.forEach((btn, i) => {
    btn.addEventListener("click", () => {
      activeSectionIndex = i;
      if (persistFixedListTabToSession) {
        try {
          sessionStorage.setItem(SESSION_TODO_FIXED_TAB_INDEX, String(i));
        } catch (_) {}
      }
      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      sectionResults.forEach((r, idx) => {
        r.wrap.classList.toggle("is-active", idx === i);
      });
    });
  });
  tabButtons.forEach((b, i) => b.classList.toggle("active", i === safeIndex));

  el.appendChild(sectionsWrap);

  const observer = new MutationObserver(() => {
    updateTabLabels();
  });
  sectionResults.forEach(({ wrap }) => {
    const target = wrap.querySelector(".todo-cards-wrap") || wrap.querySelector("tbody");
    if (target) observer.observe(target, { childList: true });
  });
  listUiSignal.addEventListener("abort", () => {
    try {
      observer.disconnect();
    } catch (_) {}
  });

  // 우클릭 컨텍스트 메뉴: 태스크를 다른 리스트로 이동 (테이블 행 + 카드 모두)
  let contextMenuTargetRow = null;
  let contextMenuTargetCard = null;
  const { menu, show: showContextMenu, hide: hideContextMenu } = createBraindumpContextMenu((targetSectionId) => {
    const row = contextMenuTargetRow;
    const card = contextMenuTargetCard;
    const fromEl = row || card;
    if (!fromEl) return;
    const section = fromEl.closest(".todo-section");
    const fromSectionId = section?.dataset.section || fromEl.dataset.sectionId || "";
    if (fromSectionId === targetSectionId) return;

    const oldTaskId = fromEl.dataset.taskId || "";
    const subtasksToMove = getSubtasks(oldTaskId);

    let name, startDate, dueDate, startTime, endTime, eisenhower, done, itemType, reminderDate, reminderTime, kpiTodoId, storageKey;
    if (row) {
      const nameInput = row.querySelector(".todo-task-name-field");
      const startInput = row.querySelector(".todo-start-input-hidden");
      const dueInput = row.querySelector(".todo-due-input-hidden");
      const doneCheck = row.querySelector(".todo-done-check");
      const eisenhowerSelect = row.querySelector(".todo-eisenhower-select");
      name = (nameInput?.value || "").trim();
      startDate = startInput?.value || "";
      dueDate = dueInput?.value || "";
      startTime = row.dataset.startTime || "";
      endTime = row.dataset.endTime || "";
      eisenhower = eisenhowerSelect?.value || row.dataset.eisenhower || "";
      done = doneCheck?.checked || false;
      itemType = row.dataset.itemType || "todo";
      reminderDate = row.dataset.reminderDate || "";
      reminderTime = row.dataset.reminderTime || "";
      kpiTodoId = row.dataset.kpiTodoId;
      storageKey = row.dataset.kpiStorageKey;
    } else {
      name = (card.dataset.name || "").trim();
      startDate = card.dataset.startDate || "";
      dueDate = card.dataset.dueDate || "";
      startTime = "";
      endTime = "";
      eisenhower = card.dataset.eisenhower || "";
      done = card.dataset.done === "true";
      itemType = card.dataset.itemType || "todo";
      reminderDate = card.dataset.reminderDate || "";
      reminderTime = card.dataset.reminderTime || "";
      kpiTodoId = card.dataset.kpiTodoId;
      storageKey = card.dataset.kpiStorageKey;
    }

    let result = { success: false };
    const taskPayload = { taskId: oldTaskId, name, startDate, dueDate, startTime, endTime, eisenhower, done, itemType, reminderDate, reminderTime };
    const sectionLabelMap = { dream: "꿈", sideincome: "부수입", health: "건강", happy: "행복", braindump: "브레인 덤프" };
    const getTargetLabel = (id) => sectionLabelMap[id] || getCustomSections().find((s) => s.id === id)?.label || id;

    if (kpiTodoId && storageKey) {
      if (targetSectionId.startsWith("custom-")) {
        const moved = removeKpiTodo(kpiTodoId, storageKey);
        if (moved) {
          try {
            const customObj = readCustomSectionTasksObject();
            if (!customObj[targetSectionId]) customObj[targetSectionId] = [];
            customObj[targetSectionId].push({
              ...taskPayload,
              taskId: oldTaskId,
            });
            persistCustomSectionTasksAndSchedule(customObj);
            result = { success: true, task: { name, startDate, dueDate, startTime, endTime, eisenhower, done, sectionId: targetSectionId, sectionLabel: getTargetLabel(targetSectionId), itemType, isKpiTodo: false, taskId: oldTaskId, reminderDate, reminderTime } };
          } catch (_) {}
        }
      } else {
        result = moveKpiTodoToSection(kpiTodoId, storageKey, targetSectionId);
      }
    } else if (name) {
      let moved = false;
      const fromIsKpi = KPI_SECTION_IDS.includes(fromSectionId);
      const targetIsKpi = KPI_SECTION_IDS.includes(targetSectionId);
      const fromUsesSectionStorage = fromIsKpi || fromSectionId === "braindump";
      const targetUsesSectionStorage = targetIsKpi || targetSectionId === "braindump";
      const fromIsCustom = fromSectionId.startsWith("custom-");
      const targetIsCustom = targetSectionId.startsWith("custom-");

      if (fromUsesSectionStorage && targetUsesSectionStorage) {
        moved = moveSectionTaskToSection(fromSectionId, oldTaskId, targetSectionId, taskPayload);
      } else if (fromIsCustom && targetIsCustom) {
        moved = moveCustomSectionTaskToSection(fromSectionId, oldTaskId, targetSectionId, taskPayload);
      } else if (fromUsesSectionStorage && targetIsCustom) {
        moved = (() => {
          try {
            const obj = readSectionTasksObject();
            const fromArr = obj[fromSectionId];
            if (!Array.isArray(fromArr)) return false;
            const idx = fromArr.findIndex((x) => (x.taskId || "") === oldTaskId);
            if (idx < 0) return false;
            fromArr.splice(idx, 1);
            persistSectionTasksAndSchedule(obj);
            const customObj = readCustomSectionTasksObject();
            if (!customObj[targetSectionId]) customObj[targetSectionId] = [];
            customObj[targetSectionId].push({
              ...taskPayload,
              taskId: oldTaskId,
            });
            persistCustomSectionTasksAndSchedule(customObj);
            return true;
          } catch (_) {}
          return false;
        })();
      } else if (fromIsCustom && targetUsesSectionStorage) {
        moved = (() => {
          try {
            const obj = readCustomSectionTasksObject();
            const fromArr = obj[fromSectionId];
            if (!Array.isArray(fromArr)) return false;
            const idx = fromArr.findIndex((x) => (x.taskId || "") === oldTaskId);
            if (idx < 0) return false;
            fromArr.splice(idx, 1);
            persistCustomSectionTasksAndSchedule(obj);
            const sectionObj = readSectionTasksObject();
            if (!sectionObj[targetSectionId]) sectionObj[targetSectionId] = [];
            sectionObj[targetSectionId].push({
              ...taskPayload,
              taskId: oldTaskId,
            });
            persistSectionTasksAndSchedule(sectionObj);
            return true;
          } catch (_) {}
          return false;
        })();
      }

      if (moved) {
        result = { success: true, task: { name, startDate, dueDate, startTime, endTime, eisenhower, done, sectionId: targetSectionId, sectionLabel: getTargetLabel(targetSectionId), itemType, isKpiTodo: false, taskId: oldTaskId, reminderDate, reminderTime } };
      }
    }

    if (result.success && result.task) {
      const targetResult = sectionResults.find((r) => r.wrap.dataset.section === targetSectionId);
      if (targetResult) {
        const taskData = result.task;
        const taskId = getTaskId(taskData);
        taskData.taskId = taskId;
        const targetCardsWrap = targetResult.wrap.querySelector(".todo-cards-wrap");
        const targetTbody = targetResult.wrap.querySelector("tbody");

        if (targetCardsWrap) {
          const scheduleSave = () => scheduleSaveSectionTasksFromDOM(sectionsWrap);
          const updateCount = targetResult.updateCount || (() => {});
          const card = createTaskCard(taskData, { updateCount, sectionsWrap, scheduleSave });
          if (targetCardsWrap.firstChild) {
            targetCardsWrap.insertBefore(card, targetCardsWrap.firstChild);
          } else {
            targetCardsWrap.appendChild(card);
          }
          updateCount();
          scheduleSave();
        } else if (targetTbody) {
          const newTr = createTaskRow(taskData, {
            hideCategoryCol: true,
            isSubtask: false,
            taskId,
            showCheckboxTypeMenu,
          });
          newTr.dataset.sectionId = targetSectionId;
          if (targetTbody.firstChild) {
            targetTbody.insertBefore(newTr, targetTbody.firstChild);
          } else {
            targetTbody.appendChild(newTr);
          }
          const container = newTr.querySelector(".todo-subtasks-container");
          const updateCount = () => {
            const countEl = targetResult.wrap?.querySelector(".todo-section-count");
            if (countEl) countEl.textContent = String(targetTbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length || 0);
          };
          subtasksToMove.forEach((st) => {
            const item = createSubtaskItem(taskId, st, updateCount);
            if (container) container.appendChild(item);
          });
        }

        setSubtasks(taskId, subtasksToMove);
        clearSubtasks(oldTaskId);
        if (targetResult.updateCount) targetResult.updateCount();
      }
      fromEl.remove();
      sectionResults.find((r) => r.wrap === section)?.updateCount();
      updateTabLabels();
    }
  });
  document.body.appendChild(menu);

  sectionsWrap.addEventListener("contextmenu", (e) => {
    const row = e.target.closest(".todo-task-row:not(.todo-subtask-row)");
    const card = e.target.closest(".todo-card");
    if (row && e.target.closest(".todo-cell-name")) {
      e.preventDefault();
      e.stopPropagation();
      contextMenuTargetRow = row;
      contextMenuTargetCard = null;
      const section = row.closest(".todo-section");
      const sectionId = section?.dataset.section || "";
      showContextMenu(e.clientX, e.clientY, sectionId || null);
      return;
    }
    if (card && !e.target.closest(".todo-card-done-wrap")) {
      e.preventDefault();
      e.stopPropagation();
      contextMenuTargetRow = null;
      contextMenuTargetCard = card;
      const section = card.closest(".todo-section");
      const sectionId = section?.dataset.section || card.dataset.sectionId || "";
      showContextMenu(e.clientX, e.clientY, sectionId || null);
    }
  });

  return el;
}

/** 아이젠하워 사이드바용: 할일(탭) + 기한 초과 섹션 */
export function renderTodoListForEisenhowerSidebar(options = {}) {
  const { enableDragToEisenhower = true } = options;
  const mainList = render({
    hideToolbar: true,
    enableDragToEisenhower,
    eisenhowerSidebarFirst: true,
    hideDoneTasks: true,
  });
  mainList.classList.add("todo-list-eisenhower-sidebar");

  const sectionTasks = FIXED_SECTION_IDS_FOR_STORAGE.flatMap((sid) => loadSectionTasks(sid));
  const customTasks = getCustomSections().flatMap((s) => loadCustomSectionTasks(s.id));
  const allTasks = [...sectionTasks, ...customTasks];
  const overdueTasks = allTasks
    .filter((t) => isOverdue(t.dueDate) && !t.done)
    .map((t) => ({ ...t, sourceSectionId: t.sectionId, sectionId: "overdue" }));

  const overdueWrap = document.createElement("div");
  overdueWrap.className = "todo-eisenhower-overdue-section";
  renderSections(overdueWrap, overdueTasks, {
    tabMode: false,
    showCheckboxTypeMenu: null,
    enableDragToCalendar: false,
    enableDragToEisenhower,
    sectionsOverride: [{ id: "overdue", label: "기한 초과" }],
  });

  mainList.appendChild(overdueWrap);
  return mainList;
}

/** 날짜 정하기 사이드바용: 기한 초과 섹션만 반환 (할일 목록 60% / 기한 초과 40% 분할 시 아래 40%에 넣음) */
export function renderOverdueSection(options = {}) {
  const { enableDragToCalendar = true } = options;
  const sectionTasks = FIXED_SECTION_IDS_FOR_STORAGE.flatMap((sid) => loadSectionTasks(sid));
  const customTasks = getCustomSections().flatMap((s) => loadCustomSectionTasks(s.id));
  const allTasks = [...sectionTasks, ...customTasks];
  const overdueTasks = allTasks
    .filter((t) => isOverdue(t.dueDate) && !t.done)
    .map((t) => ({ ...t, sourceSectionId: t.sectionId, sectionId: "overdue" }));

  const overdueWrap = document.createElement("div");
  overdueWrap.className = "todo-eisenhower-overdue-section todo-overdue-in-date-sidebar";
  renderSections(overdueWrap, overdueTasks, {
    tabMode: false,
    showCheckboxTypeMenu: null,
    enableDragToCalendar,
    enableDragToEisenhower: false,
    sectionsOverride: [{ id: "overdue", label: "기한 초과" }],
  });
  return overdueWrap;
}
