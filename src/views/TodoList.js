/**
 * 할 일 목록 - 토글 헤더 + Name, Due date + Add Task + 분류 드롭다운
 * KPI 할 일(꿈/부수입/행복/건강) 연동: 마감일 없음, 꿈 이름 자동, 분류=KPI이름
 */

import {
  getKpiTodosAsTasks,
  getKpiDisplayNameForTodo,
  syncKpiTodoCompleted,
  moveKpiTodoToSection,
  updateKpiTodo,
  removeKpiTodo,
} from "../utils/kpiTodoSync.js";
import { createTodoSettingsModal } from "../utils/todoSettingsModal.js";
import {
  getTodoSettings,
  getCustomSections,
  getSectionColor,
  getSectionMarkerColor,
  normalizeSectionTaskListFilter,
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
import { createTodoCheckboxTypeMenu } from "../utils/todoCheckboxTypeMenu.js";
import {
  persistSectionTasksAndSchedule,
  persistCustomSectionTasksAndSchedule,
  persistFixedSectionTasksToSessionMemOnly,
  persistCustomSectionTasksToSessionMemOnly,
  deleteCalendarSectionTaskRowById,
  deleteCompletedCalendarSectionTasksFromSupabase,
  pullCalendarSectionTasksFromSupabase,
  cancelTodoSectionTasksSyncPushSchedule,
  upsertCalendarSectionTaskDirectFromModal,
  upsertCalendarSectionTaskRowFromSessionMemory,
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
import {
  patchTodoDomTaskIdsForSectionElement,
  patchAllTodoDomTaskIdsFromStorage,
} from "../utils/todoDomTaskIdPatch.js";
export const DRAG_TYPE_TODO_TO_CALENDAR = "todo-task-to-calendar";
export const DRAG_TYPE_TODO_TO_EISENHOWER = "todo-task-to-eisenhower";

const TODO_DEBUG = false;
function todoDebug(..._args) {
  void TODO_DEBUG;
}

/** 모바일(≤48rem): 할일 계열 모달은 백드롭 탭으로 닫지 않음(취소·×만) — 데스크탑은 기존 유지 */
function isTodoListMobileModalViewport() {
  try {
    return window.matchMedia("(max-width: 48rem)").matches;
  } catch (_) {
    return false;
  }
}

// 나의 계정·환경설정에서 색 저장 시 탭 버튼·행 배경 즉시 반영
window.addEventListener("app-colors-changed", () => {
  const container = document.querySelector(".todo-category-tabs");
  if (container) {
    container
      .querySelectorAll(".todo-category-tab[data-section]")
      .forEach((btn) => {
        const c = getSectionColor(btn.dataset.section);
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
  }

  document.querySelectorAll(".todo-task-row").forEach((tr) => {
    const sid = (tr.dataset.sectionId || "").trim();
    const hasDates = tr.dataset.hasDates === "true";
    if (!sid) return;
    if (!hasDates) {
      tr.style.setProperty("--row-section-color", getSectionColor(sid));
    }
    const dot = tr.querySelector(".todo-schedule-dot");
    if (dot) {
      dot.style.backgroundColor = getSectionMarkerColor(sid);
    }
  });
});

function loadSectionTasks(sectionId) {
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (Array.isArray(arr)) {
      const sectionLabel =
        {
          dream: "꿈",
          sideincome: "부수입",
          health: "건강",
          happy: "행복",
        }[sectionId] || sectionId;
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
      if (String(t.itemType || "todo").toLowerCase() === "schedule")
        return false;
      t.done = !!done;
      persistSectionTasksAndSchedule(obj);
      upsertCalendarSectionTaskRowFromSessionMemory(sectionId, taskId, null);
      return true;
    }
  } catch (_) {}
  return false;
}

function updateCustomSectionTaskDone(sectionId, taskId, done) {
  try {
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return false;
    const t = arr.find((x) => (x.taskId || "") === taskId);
    if (t) {
      if (String(t.itemType || "todo").toLowerCase() === "schedule")
        return false;
      t.done = !!done;
      persistCustomSectionTasksAndSchedule(obj);
      upsertCalendarSectionTaskRowFromSessionMemory(sectionId, taskId, null);
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
    const mergedUnique = dedupeMergedSectionTasksByNamePreferUuid([
      ...mergeDedup.values(),
    ]);
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
                prevRow.serverUpdatedAt !== undefined &&
                prevRow.serverUpdatedAt !== ""
                  ? prevRow.serverUpdatedAt
                  : candidate.serverUpdatedAt,
            };
          }
          return { ...candidate };
        },
      )
      .filter((t) => keepTaskInSectionStorage(t));
    obj[sectionId] = toSave;
    /* DOM 수집 → 세션 메모리만. 서버 upsert는 모달 확정 경로에서만 */
    writeSectionTasksObject(obj);
  } catch (_) {}
}

/** 로컬·세션에서만 제거(동기). 수정 모달은 UI를 즉시 갱신한 뒤 서버 DELETE는 백그라운드로 분리할 때 사용 */
function beginRemoveTaskFromSectionStorageLocal(sectionId, taskId) {
  try {
    cancelScheduleSaveSectionTasksFromDOM();
    cancelTodoSectionTasksSyncPushSchedule();
    const obj = readSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return { ok: false, snapshot: null };
    const tid = String(taskId || "").trim();
    const snapshot = arr.find((t) => String(t.taskId || "").trim() === tid);
    obj[sectionId] = arr.filter((t) => (t.taskId || "") !== taskId);
    writeSectionTasksObject(obj);
    return { ok: true, snapshot: snapshot || null };
  } catch (_) {}
  return { ok: false, snapshot: null };
}

function rollbackRemoveTaskFromSectionStorage(sectionId, taskId, snapshot) {
  if (!snapshot) return;
  try {
    const tid = String(taskId || "").trim();
    const o2 = readSectionTasksObject();
    const cur = Array.isArray(o2[sectionId]) ? o2[sectionId] : [];
    const has = cur.some((t) => String(t.taskId || "").trim() === tid);
    if (!has) o2[sectionId] = [...cur, { ...snapshot }];
    writeSectionTasksObject(o2);
  } catch (_) {}
}

async function completeRemoveTaskFromSectionStorageServer(
  sectionId,
  taskId,
  snapshot,
) {
  const tid = String(taskId || "").trim();
  const del = await deleteCalendarSectionTaskRowById(taskId);
  if (!del.ok) {
    rollbackRemoveTaskFromSectionStorage(sectionId, tid, snapshot);
  }
  return del;
}

/** 로컬·세션에서만 제거(동기) — 커스텀 섹션 */
function beginRemoveTaskFromCustomSectionStorageLocal(sectionId, taskId) {
  try {
    cancelScheduleSaveSectionTasksFromDOM();
    cancelTodoSectionTasksSyncPushSchedule();
    const obj = readCustomSectionTasksObject();
    const arr = obj[sectionId];
    if (!Array.isArray(arr)) return { ok: false, snapshot: null };
    const tid = String(taskId || "").trim();
    const snapshot = arr.find((t) => String(t.taskId || "").trim() === tid);
    obj[sectionId] = arr.filter((t) => (t.taskId || "") !== taskId);
    writeCustomSectionTasksObject(obj);
    return { ok: true, snapshot: snapshot || null };
  } catch (_) {}
  return { ok: false, snapshot: null };
}

function rollbackRemoveTaskFromCustomSectionStorage(sectionId, taskId, snapshot) {
  if (!snapshot) return;
  try {
    const tid = String(taskId || "").trim();
    const o2 = readCustomSectionTasksObject();
    const cur = Array.isArray(o2[sectionId]) ? o2[sectionId] : [];
    const has = cur.some((t) => String(t.taskId || "").trim() === tid);
    if (!has) o2[sectionId] = [...cur, { ...snapshot }];
    writeCustomSectionTasksObject(o2);
  } catch (_) {}
}

async function completeRemoveTaskFromCustomSectionStorageServer(
  sectionId,
  taskId,
  snapshot,
) {
  const tid = String(taskId || "").trim();
  const del = await deleteCalendarSectionTaskRowById(taskId);
  if (!del.ok) {
    rollbackRemoveTaskFromCustomSectionStorage(sectionId, tid, snapshot);
  }
  return del;
}

/** @param {string} [via] 콘솔 구분용: 수정모달_삭제 | 표_삭제버튼 */
async function removeTaskFromSectionStorage(sectionId, taskId, via = "") {
  try {
    const begun = beginRemoveTaskFromSectionStorageLocal(sectionId, taskId);
    if (!begun.ok) return { ok: false, serverDelete: null };
    const del = await completeRemoveTaskFromSectionStorageServer(
      sectionId,
      taskId,
      begun.snapshot,
    );
    return {
      ok: !!del.ok,
      serverDelete: del,
    };
  } catch (_) {}
  return { ok: false, serverDelete: null };
}

/** @param {string} [via] 콘솔 구분용: 수정모달_삭제 | 표_삭제버튼 */
async function removeTaskFromCustomSectionStorage(sectionId, taskId, via = "") {
  try {
    const begun = beginRemoveTaskFromCustomSectionStorageLocal(sectionId, taskId);
    if (!begun.ok) return { ok: false, serverDelete: null };
    const del = await completeRemoveTaskFromCustomSectionStorageServer(
      sectionId,
      taskId,
      begun.snapshot,
    );
    return {
      ok: !!del.ok,
      serverDelete: del,
    };
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
    void persistFixedSectionTasksToSessionMemOnly(obj).catch(() => {});
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
    void persistCustomSectionTasksToSessionMemOnly(obj).catch(() => {});
    return true;
  } catch (_) {}
  return false;
}

const KPI_SECTION_IDS = ["dream", "sideincome", "health", "happy"];
const FIXED_SECTION_IDS_FOR_STORAGE = [...KPI_SECTION_IDS];

/** 할일 고정 탭 「우선순위」— 집계 전용(calendar_section_tasks.section_key 아님) */
const TODO_PRIORITY_TAB_SECTION_ID = "priority";
/** 할일 고정 탭 「날짜」— 마감·시작일 기준 묶음 표시 전용 */
const TODO_DATE_TAB_SECTION_ID = "by-date";

const TODO_AGGREGATION_TAB_IDS = [
  TODO_PRIORITY_TAB_SECTION_ID,
  TODO_DATE_TAB_SECTION_ID,
];

function todoListStorageSectionIdFromEl(el) {
  const panel = el?.closest(".todo-section");
  const pid = (panel?.dataset?.section || "").trim();
  if (
    pid === TODO_PRIORITY_TAB_SECTION_ID ||
    pid === TODO_DATE_TAB_SECTION_ID ||
    pid === "overdue"
  ) {
    return (el.dataset.sectionId || "").trim() || pid;
  }
  return pid || (el.dataset.sectionId || "").trim();
}

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

/** 모달에서 확정한 task 한 건을 세션 메모리를 거치지 않고 Supabase에 바로 upsert */
function taskRecordFromCardForServer(card) {
  return {
    taskId: card.dataset.taskId || "",
    name: card.dataset.name || "",
    startDate: card.dataset.startDate || "",
    dueDate: card.dataset.dueDate || "",
    startTime: "",
    endTime: "",
    eisenhower: card.dataset.eisenhower || "",
    done: card.dataset.done === "true",
    itemType: card.dataset.itemType || "todo",
    reminderDate: card.dataset.reminderDate || "",
    reminderTime: card.dataset.reminderTime || "",
  };
}

function calendarSectionTaskCardSortOrder(card, sectionKey) {
  const wrap = card.closest(".todo-sections-wrap");
  const panel = card.closest(".todo-section");
  const panelId = (panel?.dataset?.section || "").trim();
  if (
    !wrap ||
    (panelId !== TODO_PRIORITY_TAB_SECTION_ID &&
      panelId !== TODO_DATE_TAB_SECTION_ID &&
      panelId !== "overdue")
  ) {
    const cardsWrap = card.closest(".todo-cards-wrap");
    return cardsWrap
      ? Array.from(cardsWrap.querySelectorAll(".todo-card")).indexOf(card)
      : 0;
  }
  const homeSec = wrap.querySelector(
    `.todo-section[data-section="${sectionKey}"]`,
  );
  const homeWrap = homeSec?.querySelector(".todo-cards-wrap");
  if (!homeWrap) return 0;
  const tid = (card.dataset.taskId || "").trim();
  const idx = Array.from(homeWrap.querySelectorAll(".todo-card")).findIndex(
    (c) => (c.dataset.taskId || "").trim() === tid,
  );
  return idx < 0 ? 0 : idx;
}

/** @param {string} [via] 콘솔 구분용: 할일추가_확인 | 수정모달_저장 */
function pushCalendarSectionTaskDirectToServer(
  sectionId,
  card,
  taskRecord,
  via = "",
) {
  if (!card || card.dataset.isKpiTodo === "true") return;
  const sid = String(sectionId || "").trim();
  if (!sid || sid === "overdue") return;
  const isCustom = sid.startsWith("custom-");
  if (!isCustom && !FIXED_SECTION_IDS_FOR_STORAGE.includes(sid)) return;
  const sortOrder = calendarSectionTaskCardSortOrder(card, sid);
  void upsertCalendarSectionTaskDirectFromModal({
    task: taskRecord,
    sectionKey: sid,
    isCustom,
    sortOrder: sortOrder < 0 ? 0 : sortOrder,
  }).catch(() => {});
}

/**
 * 「기한 초과」블록에만 있는 카드는 탭 섹션 DOM에 없어 collectAndSave가 해당 행을 못 읽음 → 원본 섹션 메모리를 직접 갱신
 */
function persistOverdueListCardEditToStorage(
  sourceSecId,
  taskId,
  payload,
  card,
  hadSectionMove,
) {
  const tid = String(taskId || "").trim();
  if (!tid || !card) return;
  if (hadSectionMove) return;
  if (card.dataset.isKpiTodo === "true") {
    const kid = card.dataset.kpiTodoId || "";
    const sk = card.dataset.kpiStorageKey || "";
    if (!kid || !sk) return;
    updateKpiTodo(kid, sk, {
      text: (payload.name ?? card.dataset.name ?? "").trim(),
      startDate:
        (payload.startDate ?? card.dataset.startDate ?? "").slice(0, 10) || "",
      dueDate:
        (payload.dueDate ?? card.dataset.dueDate ?? "").slice(0, 10) || "",
      eisenhower: payload.eisenhower ?? card.dataset.eisenhower ?? "",
      itemType: card.dataset.itemType || "todo",
      completed: card.dataset.done === "true",
    });
    return;
  }
  const sid = String(sourceSecId || "").trim();
  if (!sid || sid === "overdue") return;
  const name = (payload.name ?? card.dataset.name ?? "").trim();
  const startDate =
    (payload.startDate ?? card.dataset.startDate ?? "").slice(0, 10) || "";
  const dueDate =
    (payload.dueDate ?? card.dataset.dueDate ?? "").slice(0, 10) || "";
  const eisenhower = payload.eisenhower ?? card.dataset.eisenhower ?? "";
  const reminderDate =
    (payload.reminderDate ?? card.dataset.reminderDate ?? "").slice(0, 10) ||
    "";
  const reminderTime =
    (payload.reminderTime ?? card.dataset.reminderTime ?? "").trim() || "";

  if (sid.startsWith("custom-")) {
    try {
      const obj = readCustomSectionTasksObject();
      const arr = obj[sid];
      if (!Array.isArray(arr)) return;
    const t = arr.find((x) => String(x.taskId || "").trim() === tid);
    if (!t) return;
    t.name = name;
    t.startDate = startDate;
    t.dueDate = dueDate;
    t.eisenhower = eisenhower;
    t.reminderDate = reminderDate;
    t.reminderTime = reminderTime;
    const it = String(payload.itemType ?? t.itemType ?? "todo")
      .trim()
      .toLowerCase();
    if (payload.itemType != null) t.itemType = it === "schedule" ? "schedule" : "todo";
    if (String(t.itemType || "todo").toLowerCase() === "schedule") t.done = false;
    persistCustomSectionTasksAndSchedule(obj);
    } catch (_) {}
    return;
  }
  if (!FIXED_SECTION_IDS_FOR_STORAGE.includes(sid)) return;
  try {
    const obj = readSectionTasksObject();
    const arr = obj[sid];
    if (!Array.isArray(arr)) return;
    const t = arr.find((x) => String(x.taskId || "").trim() === tid);
    if (!t) return;
    t.name = name;
    t.startDate = startDate;
    t.dueDate = dueDate;
    t.eisenhower = eisenhower;
    t.reminderDate = reminderDate;
    t.reminderTime = reminderTime;
    const it = String(payload.itemType ?? t.itemType ?? "todo")
      .trim()
      .toLowerCase();
    if (payload.itemType != null) t.itemType = it === "schedule" ? "schedule" : "todo";
    if (String(t.itemType || "todo").toLowerCase() === "schedule") t.done = false;
    persistSectionTasksAndSchedule(obj);
  } catch (_) {}
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
    const hasUuid = list.some((t) =>
      TASK_ID_UUID_RE.test((t.taskId || "").trim()),
    );
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

/** DOM → 세션 메모리만(디바운스). 서버에는 쓰지 않음 */
function scheduleSaveSectionTasksFromDOM(sectionsWrap) {
  todoDebug("scheduleSaveSectionTasksFromDOM", { hasWrap: !!sectionsWrap });
  if (!sectionsWrap) return;
  if (_saveSectionTasksTimer) clearTimeout(_saveSectionTasksTimer);
  _saveSectionTasksTimer = setTimeout(() => {
    _saveSectionTasksTimer = null;
    collectAndSaveKpiTasksFromDOM(sectionsWrap);
  }, 300);
}

/** 추가 직후 초안 행이 저장소에 바로 들어가게 함(전체 리렌더·탭 전환과 경쟁) */
function flushSaveSectionTasksFromDOM(sectionsWrap) {
  if (!sectionsWrap) return;
  if (_saveSectionTasksTimer) {
    clearTimeout(_saveSectionTasksTimer);
    _saveSectionTasksTimer = null;
  }
  collectAndSaveKpiTasksFromDOM(sectionsWrap);
}

/** KPI 저장소 + 고정 섹션 카드/행을 DOM에서 읽어 세션 메모리만 갱신. 서버 호출 없음. */
function collectAndSaveKpiTasksFromDOM(sectionsWrap) {
  todoDebug("collectAndSaveKpiTasksFromDOM", { hasWrap: !!sectionsWrap });
  if (!sectionsWrap) return;
  const excludesKpi = sectionsWrap.dataset.lpExcludesKpi === "1";
  const aggregationOverlayByTaskId = (() => {
    const m = new Map();
    for (const sid of TODO_AGGREGATION_TAB_IDS) {
      const panel = sectionsWrap.querySelector(
        `.todo-section[data-section="${sid}"]`,
      );
      if (!panel) continue;
      panel.querySelectorAll(".todo-cards-wrap .todo-card").forEach((c) => {
        const tid = (c.dataset.taskId || "").trim();
        if (tid && !m.has(tid)) m.set(tid, c);
      });
    }
    return m;
  })();
  FIXED_SECTION_IDS_FOR_STORAGE.forEach((sectionId) => {
    const sec = sectionsWrap.querySelector(
      `.todo-section[data-section="${sectionId}"]`,
    );
    if (!sec) {
      todoDebug("collectAndSave: section not found", sectionId);
      return;
    }
    syncSectionDomTaskIdsFromStorage(sectionId, sec);
    const sectionTasks = [];
    const cardsWrap = sec.querySelector(".todo-cards-wrap");
    if (cardsWrap) {
      cardsWrap.querySelectorAll(".todo-card").forEach((card) => {
        const sourceCard =
          aggregationOverlayByTaskId.get((card.dataset.taskId || "").trim()) ||
          card;
        const name = (sourceCard.dataset.name || "").trim();
        const kpiTodoId = sourceCard.dataset.kpiTodoId;
        const storageKey = sourceCard.dataset.kpiStorageKey;
        const done = sourceCard.dataset.done === "true";

        if (!excludesKpi && kpiTodoId && storageKey) {
          if (name === "") {
            removeKpiTodo(kpiTodoId, storageKey);
          } else {
            updateKpiTodo(kpiTodoId, storageKey, {
              text: name,
              startDate: sourceCard.dataset.startDate || "",
              dueDate: sourceCard.dataset.dueDate || "",
              startTime: "",
              endTime: "",
              eisenhower: sourceCard.dataset.eisenhower || "",
              completed: done,
              itemType: sourceCard.dataset.itemType || "todo",
            });
          }
        } else if (name !== "") {
          const it = sourceCard.dataset.itemType || "todo";
          const rowDone =
            String(it || "todo").toLowerCase() === "schedule"
              ? false
              : sourceCard.dataset.done === "true";
          sectionTasks.push({
            taskId: sourceCard.dataset.taskId || "",
            name,
            startDate: sourceCard.dataset.startDate || "",
            dueDate: sourceCard.dataset.dueDate || "",
            startTime: "",
            endTime: "",
            eisenhower: sourceCard.dataset.eisenhower || "",
            done: rowDone,
            itemType: it,
            reminderDate: sourceCard.dataset.reminderDate || "",
            reminderTime: sourceCard.dataset.reminderTime || "",
          });
        }
      });
    } else {
      sec
        .querySelectorAll(".todo-task-row:not(.todo-subtask-row)")
        .forEach((row) => {
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
          const eisenhower =
            eisenhowerSelect?.value || row.dataset.eisenhower || "";
          const itemType = row.dataset.itemType || "todo";
          const done =
            String(itemType || "todo").toLowerCase() === "schedule"
              ? false
              : !!doneCheck?.checked;
          const kpiTodoId = row.dataset.kpiTodoId;
          const storageKey = row.dataset.kpiStorageKey;

          if (!excludesKpi && kpiTodoId && storageKey) {
            if (name === "") {
              removeKpiTodo(kpiTodoId, storageKey);
            } else {
              updateKpiTodo(kpiTodoId, storageKey, {
                text: name,
                startDate,
                dueDate,
                startTime,
                endTime,
                eisenhower,
                completed: done,
                itemType,
              });
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
    const withDate = sectionTasks.filter((t) =>
      (t.dueDate || "").trim(),
    ).length;
    todoDebug(
      "collectAndSave: saving section",
      sectionId,
      "tasks",
      sectionTasks.length,
      "withDueDate",
      withDate,
      sectionTasks.map((t) => ({
        name: (t.name || "").slice(0, 12),
        dueDate: (t.dueDate || "").slice(0, 10),
      })),
    );
    saveSectionTasks(sectionId, sectionTasks);
  });
  try {
    const obj = readSectionTasksObject();
    const counts = {};
    Object.keys(obj || {}).forEach((k) => {
      counts[k] = (obj[k] || []).length;
    });
    todoDebug("collectAndSave: after save mem snapshot", counts);
  } catch (_) {}
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
    /* 디바운스 저장과 겹치면 탭 전환 직후 pull 이 옛 DOM 스냅샷을 올릴 수 있음 → 즉시 플러시 */
    flushSaveSectionTasksFromDOM(sectionsWrap);
  } else {
    todoDebug(
      "saveTodoListBeforeUnmount: no .todo-sections-wrap in container, save skipped",
    );
  }
}

/** 할일/일정 메인 화면(탭 바 있는 전체 뷰)에서 마지막으로 본 고정 리스트 탭 — Supabase 동기 후 __lpRenderMain()으로 전체가 다시 그려질 때 첫 탭(꿈)으로만 초기화되는 문제 방지 */
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
    const bg = typeof o.bg === "string" ? snapRgbaToNearestPreset(o.bg) : o.bg;
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
            localStorage.setItem(
              TODO_CATEGORY_OPTIONS_KEY,
              JSON.stringify(out),
            );
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

/** 할일/일정 카테고리 줄 우측 — 빠른 추가(+) (시간가계부 TIME_LEDGER_ADD_PLUS_ICON_SVG 와 동일) */
const CALENDAR_TOOLBAR_QUICK_ADD_ICON =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" d="M12 5v14M5 12h14"/></svg>';

/** 툴바 설정(톱니): img 필터 대신 +와 동일 currentColor → CSS로 #dc2626 통일 */
const TODO_TOOLBAR_SETTINGS_ICON =
  '<svg class="todo-list-settings-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m19.845 13.561c.1-.505.155-1.027.155-1.561s-.055-1.056-.155-1.561l1.806-1.489c.502-.414.632-1.132.307-1.696l-.869-1.508c-.325-.564-1.011-.811-1.62-.582l-2.198.825c-.779-.684-1.689-1.218-2.691-1.559l-.385-2.316c-.108-.643-.663-1.114-1.314-1.114h-1.738c-.651 0-1.206.471-1.313 1.114l-.386 2.316c-1.002.341-1.912.875-2.691 1.559l-2.198-.825c-.61-.228-1.295.018-1.62.582l-.87 1.508c-.325.564-.195 1.282.307 1.696l1.806 1.489c-.1.505-.155 1.026-.155 1.561s.055 1.056.155 1.561l-1.806 1.489c-.502.414-.632 1.132-.307 1.696l.869 1.508c.325.564 1.011.811 1.62.582l2.198-.825c.779.684 1.689 1.218 2.691 1.559l.385 2.316c.109.643.664 1.114 1.315 1.114h1.738c.651 0 1.206-.471 1.313-1.114l.385-2.316c1.002-.341 1.913-.875 2.691-1.559l2.198.825c.609.229 1.295-.017 1.62-.582l.869-1.508c.325-.564.196-1.282-.307-1.696z"/><circle cx="12.012" cy="12" r="3"/></g></svg>';

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
    const matches = q
      ? all.filter((o) => o.name.toLowerCase().includes(q))
      : all;
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
      opts.forEach((o, i) =>
        o.classList.toggle("is-highlighted", i === highlightedIndex),
      );
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      opts[highlightedIndex]?.scrollIntoView({ block: "nearest" });
      opts.forEach((o, i) =>
        o.classList.toggle("is-highlighted", i === highlightedIndex),
      );
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
    window.addEventListener("resize", scrollResizeHandler, {
      signal: tabSignal,
    });
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
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "health", label: "건강" },
  { id: "happy", label: "행복" },
  { id: TODO_PRIORITY_TAB_SECTION_ID, label: "우선순위" },
  { id: TODO_DATE_TAB_SECTION_ID, label: "날짜" },
];

/** 고정 할일 탭 모바일 아이콘(public 경로) — 레이블은 aria-label·title 유지 */
const TODO_LIST_TAB_ICON_BY_SECTION_ID = {
  dream: "/todo-tab-icons/creature.svg",
  sideincome: "/todo-tab-icons/income_coin.svg",
  health: "/todo-tab-icons/running.svg",
  happy: "/todo-tab-icons/smile.svg",
  priority: "/todo-tab-icons/priority_flag.svg",
  "by-date": "/todo-tab-icons/date_calendar.svg",
};

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

  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";
}

/** 모바일 전용: 날짜 선택 모달. 모달 안 input을 탭하면 네이티브 날짜 픽커가 열림 */
function showMobileDateModal(options) {
  const {
    title = "날짜 선택",
    value = "",
    min = "",
    max = "",
    onSelect,
  } = options;
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

const EISENHOWER_SORT_KEYS = [
  "urgent-important",
  "important-not-urgent",
  "urgent-not-important",
  "not-urgent-not-important",
];

const EISENHOWER_KR_LABEL_TO_SORT_KEY = {
  "긴급+중요": "urgent-important",
  "중요+여유": "important-not-urgent",
  "긴급+덜중요": "urgent-not-important",
  "여유+안중요": "not-urgent-not-important",
};

function normalizeEisenhowerSortKey(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  if (EISENHOWER_SORT_KEYS.includes(s)) return s;
  return EISENHOWER_KR_LABEL_TO_SORT_KEY[s] || "";
}

/** 수정 모달이 열려 있을 때 목록에서 해당 할일 카드·행 강조 */
const TODO_ITEM_MODAL_ACTIVE_CLASS = "todo-item-modal-active";

function clearTodoItemModalSelection() {
  try {
    document
      .querySelectorAll("." + TODO_ITEM_MODAL_ACTIVE_CLASS)
      .forEach((el) => {
        el.classList.remove(TODO_ITEM_MODAL_ACTIVE_CLASS);
      });
  } catch (_) {}
}

/** 달력·시계 영역 탭 시에도 시스템 date/time 픽커가 열리게 (입력창은 동일 외형으로 통일) */
function wireTodoTaskModalNativeSlot(slotEl, inputEl) {
  if (!(slotEl instanceof HTMLElement) || !inputEl) return;
  slotEl.addEventListener("click", (e) => {
    const t = e.target;
    if (t === inputEl || (inputEl.contains && t instanceof Node && inputEl.contains(t)))
      return;
    try {
      inputEl.focus({ preventScroll: true });
    } catch (_) {
      inputEl.focus();
    }
    try {
      if (typeof inputEl.showPicker === "function") inputEl.showPicker();
      else inputEl.click();
    } catch (_) {
      inputEl.click();
    }
  });
}

/** 할일 추가/수정 통합 모달. 카드 레이아웃에서 사용. onSave(폼값 객체), onDelete(수정 시만) */
function showTodoTaskModal(options) {
  const {
    taskData = {},
    sectionId = "",
    sectionLabel = "",
    mode = "add",
    onSave,
    onDelete,
    selectionEl = null,
  } = options;
  const {
    name = "",
    startDate = "",
    dueDate = "",
    reminderDate = "",
    reminderTime = "",
    eisenhower = "",
    itemType: taskItemType = "todo",
  } = taskData;
  const initialAsSchedule =
    String(taskItemType || "todo").toLowerCase() === "schedule";

  const title = mode === "add" ? "할 일 추가" : "할 일 수정";
  const currentSectionId = (taskData.sectionId || sectionId || "").trim();
  const sections = getSections();
  const hideScheduleToggle = !!taskData.isKpiTodo;
  const escapeHtml = (s) => {
    const d = document.createElement("div");
    d.textContent = s ?? "";
    return d.innerHTML;
  };

  clearTodoItemModalSelection();
  if (selectionEl?.classList) {
    selectionEl.classList.add(TODO_ITEM_MODAL_ACTIVE_CLASS);
  }

  const modal = document.createElement("div");
  modal.className = "todo-list-modal todo-task-edit-modal";
  modal.innerHTML = `
    <div class="todo-list-modal-backdrop"></div>
    <div class="todo-list-modal-panel todo-task-edit-panel">
      <div class="todo-list-modal-header">
        <h3 class="todo-list-modal-title">${title}</h3>
        <div class="todo-task-edit-header-actions">
          <button type="button" class="todo-list-modal-close" aria-label="닫기">×</button>
        </div>
      </div>
      <div class="todo-list-modal-body todo-task-edit-body">
        <div class="todo-task-edit-row-name-priority">
          <div class="todo-task-edit-field todo-task-edit-field--name">
            <label class="todo-task-edit-label">할 일 이름</label>
            <div class="todo-task-edit-input-shell">
              <input type="text" class="todo-task-edit-name" placeholder="할 일 입력" value="${escapeHtml(name)}" maxlength="500" />
            </div>
          </div>
          <div class="todo-task-edit-field todo-task-edit-field--eisenhower">
            <label class="todo-task-edit-label">우선순위</label>
            <div class="todo-task-edit-input-shell todo-task-edit-input-shell--select">
              <select class="todo-task-edit-eisenhower">
              ${EISENHOWER_OPTIONS.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === eisenhower ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}
              </select>
            </div>
          </div>
        </div>
        ${
          hideScheduleToggle
            ? ""
            : `<div class="todo-task-edit-row-schedule">
            <div class="todo-task-edit-inline-schedule">
              <label class="todo-task-edit-inline-schedule-label">
                <input type="checkbox" class="todo-task-edit-as-schedule"${initialAsSchedule ? " checked" : ""} />
                일정으로 변경
              </label>
            </div>
          </div>`
        }
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">시작일</label>
          <div class="todo-task-edit-input-shell todo-task-edit-native-shell">
            <div class="todo-task-edit-native-slot todo-task-edit-native-slot--calendar">
              <input type="date" class="todo-task-edit-start todo-task-edit-native-dt-input" aria-label="시작일" value="${escapeHtml((startDate || "").slice(0, 10))}" /><span class="todo-task-edit-native-date-overlay" aria-hidden="true"></span>
            </div>
          </div>
        </div>
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">마감일</label>
          <div class="todo-task-edit-input-shell todo-task-edit-native-shell">
            <div class="todo-task-edit-native-slot todo-task-edit-native-slot--calendar">
              <input type="date" class="todo-task-edit-due todo-task-edit-native-dt-input" aria-label="마감일" value="${escapeHtml((dueDate || "").slice(0, 10))}" /><span class="todo-task-edit-native-date-overlay" aria-hidden="true"></span>
            </div>
          </div>
        </div>
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">리마인더</label>
          <div class="todo-task-edit-reminder-box">
            <div class="todo-task-edit-input-shell todo-task-edit-native-shell">
              <div class="todo-task-edit-reminder-native-stack">
                <div class="todo-task-edit-native-slot todo-task-edit-native-slot--calendar">
                  <input type="date" class="todo-task-edit-reminder-date todo-task-edit-native-dt-input" aria-label="리마인더 날짜" value="${escapeHtml((reminderDate || "").slice(0, 10))}" /><span class="todo-task-edit-native-date-overlay" aria-hidden="true"></span>
                </div>
                <div class="todo-task-edit-native-slot todo-task-edit-native-slot--clock">
                  <input type="time" step="300" class="todo-task-edit-reminder-time todo-task-edit-native-time-input" aria-label="리마인더 시간" value="${escapeHtml((reminderTime || "").trim().slice(0, 5))}" />
                </div>
              </div>
            </div>
            <button type="button" class="todo-task-edit-reminder-btn todo-task-edit-reminder-delete" aria-label="리마인더 삭제">리마인더 삭제</button>
          </div>
        </div>
        <div class="todo-task-edit-field">
          <label class="todo-task-edit-label">리스트</label>
          <div class="todo-task-edit-input-shell todo-task-edit-input-shell--select">
            <select class="todo-task-edit-section" aria-label="다른 리스트로 이동">
            ${sections.map((s) => `<option value="${escapeHtml(s.id)}" ${s.id === currentSectionId ? "selected" : ""}>${escapeHtml(s.label)}</option>`).join("")}
            </select>
          </div>
        </div>
      </div>
      ${
        mode === "edit"
          ? `<div class="todo-task-edit-delete-below">
        <button type="button" class="todo-task-edit-footer-delete" aria-label="할 일 삭제">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.75" stroke="currentColor" aria-hidden="true" class="todo-task-edit-footer-delete-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          <span class="todo-task-edit-footer-delete-label">할 일 삭제</span>
        </button>
      </div>`
          : ""
      }
      <div class="todo-list-modal-footer todo-task-edit-footer todo-task-edit-footer--actions">
        <button type="button" class="todo-list-modal-confirm todo-task-edit-footer-confirm">확인</button>
      </div>
    </div>
  `;

  const closeBtn = modal.querySelector(".todo-list-modal-close");
  const confirmBtn = modal.querySelector(".todo-list-modal-confirm");
  const deleteBtn = modal.querySelector(".todo-task-edit-footer-delete");
  const nameInput = modal.querySelector(".todo-task-edit-name");
  const startInput = modal.querySelector(".todo-task-edit-start");
  const dueInput = modal.querySelector(".todo-task-edit-due");
  const reminderDateInput = modal.querySelector(
    ".todo-task-edit-reminder-date",
  );
  const reminderTimeInput = modal.querySelector(
    ".todo-task-edit-reminder-time",
  );
  const reminderDeleteBtn = modal.querySelector(
    ".todo-task-edit-reminder-delete",
  );
  const startSlot = startInput?.closest(".todo-task-edit-native-slot");
  const dueSlot = dueInput?.closest(".todo-task-edit-native-slot");
  const reminderDateSlot = reminderDateInput?.closest(
    ".todo-task-edit-native-slot",
  );
  const reminderTimeSlot = reminderTimeInput?.closest(
    ".todo-task-edit-native-slot",
  );
  const eisenhowerSelect = modal.querySelector(".todo-task-edit-eisenhower");
  const sectionSelect = modal.querySelector(".todo-task-edit-section");
  const asScheduleInput = modal.querySelector(".todo-task-edit-as-schedule");

  function formatTodoModalNativeOverlayYmd(isoTen) {
    const m = String(isoTen || "")
      .trim()
      .match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return "";
    const y = m[1];
    const mo = String(parseInt(m[2], 10));
    const da = String(parseInt(m[3], 10));
    return `${y}. ${mo}. ${da}`;
  }

  function syncNativeDateFilled(inp) {
    if (!inp) return;
    const v = (inp.value || "").trim().slice(0, 10);
    const has = !!v;
    inp.classList.toggle("has-value", has);
    const slot = inp.closest(".todo-task-edit-native-slot");
    if (slot?.classList.contains("todo-task-edit-native-slot--calendar")) {
      slot.classList.toggle(
        "todo-task-edit-native-slot--has-date-shown",
        has,
      );
    }
    const ov = slot?.querySelector(".todo-task-edit-native-date-overlay");
    if (ov) ov.textContent = has ? formatTodoModalNativeOverlayYmd(v) : "";
  }

  function syncNativeTimeFilled(inp) {
    if (!inp) return;
    const v = (inp.value || "").trim();
    inp.classList.toggle("has-value", !!v);
  }

  function syncStartDueMinMax() {
    const s = (startInput?.value || "").trim().slice(0, 10);
    const d = (dueInput?.value || "").trim().slice(0, 10);
    if (startInput) startInput.max = d || "";
    if (dueInput) dueInput.min = s || "";
  }

  function close() {
    try {
      if (selectionEl?.classList && selectionEl.isConnected) {
        selectionEl.classList.remove(TODO_ITEM_MODAL_ACTIVE_CLASS);
      }
    } catch (_) {}
    modal.remove();
    document.body.style.overflow = "";
  }

  function formatTimeToHHMM(val) {
    const digits = String(val || "").replace(/\D/g, "");
    if (digits.length >= 4)
      return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
    if (digits.length === 2) return digits;
    return digits;
  }
  function gatherForm() {
    const startVal = (startInput?.value || "").trim().slice(0, 10);
    const dueVal = (dueInput?.value || "").trim().slice(0, 10);
    let reminderTimeVal = (reminderTimeInput?.value || "").trim();
    const digits = reminderTimeVal.replace(/\D/g, "");
    if (digits.length >= 2) reminderTimeVal = formatTimeToHHMM(reminderTimeVal);
    const chosenSectionId = (sectionSelect?.value || "").trim() || sectionId;
    const chosenSection = sections.find((s) => s.id === chosenSectionId);
    const asSched = hideScheduleToggle
      ? false
      : !!asScheduleInput?.checked;
    const itemTypeResolved = hideScheduleToggle
      ? "todo"
      : asSched
        ? "schedule"
        : "todo";
    return {
      name: (nameInput?.value || "").trim(),
      startDate: startVal,
      dueDate: dueVal,
      reminderDate: (reminderDateInput?.value || "").trim().slice(0, 10),
      reminderTime: reminderTimeVal,
      eisenhower: eisenhowerSelect?.value || "",
      sectionId: chosenSectionId,
      sectionLabel: chosenSection?.label ?? sectionLabel,
      itemType: itemTypeResolved,
      ...(itemTypeResolved === "schedule" ? { done: false } : {}),
    };
  }

  confirmBtn?.addEventListener("click", () => {
    try {
      const payload = { ...taskData, ...gatherForm() };
      onSave?.(payload);
    } catch (err) {
      console.error("todo task modal onSave", err);
      alert("저장 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    close();
  });
  closeBtn?.addEventListener("click", close);
  if (mode === "edit" && onDelete && deleteBtn) {
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      onDelete?.();
      close();
    });
  }
  modal.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });

  document.body.appendChild(modal);
  document.body.style.overflow = "hidden";

  if (reminderTimeInput) {
    const d0 = (reminderTimeInput.value || "").replace(/\D/g, "");
    if (d0.length >= 2)
      reminderTimeInput.value = formatTimeToHHMM(reminderTimeInput.value);
  }
  [startInput, dueInput, reminderDateInput].forEach((inp) => {
    if (!inp) return;
    syncNativeDateFilled(inp);
    const bump = () => {
      syncNativeDateFilled(inp);
      if (inp === startInput || inp === dueInput) syncStartDueMinMax();
    };
    inp.addEventListener("input", bump);
    inp.addEventListener("change", bump);
  });
  syncNativeTimeFilled(reminderTimeInput);
  if (reminderTimeInput) {
    const bumpT = () => syncNativeTimeFilled(reminderTimeInput);
    reminderTimeInput.addEventListener("input", bumpT);
    reminderTimeInput.addEventListener("change", bumpT);
  }
  syncStartDueMinMax();

  wireTodoTaskModalNativeSlot(startSlot, startInput);
  wireTodoTaskModalNativeSlot(dueSlot, dueInput);
  wireTodoTaskModalNativeSlot(reminderDateSlot, reminderDateInput);
  wireTodoTaskModalNativeSlot(reminderTimeSlot, reminderTimeInput);

  reminderDeleteBtn?.addEventListener("click", () => {
    if (reminderDateInput) {
      reminderDateInput.value = "";
      syncNativeDateFilled(reminderDateInput);
    }
    if (reminderTimeInput) {
      reminderTimeInput.value = "";
      syncNativeTimeFilled(reminderTimeInput);
    }
  });

  /* X에 포커스 두면 iOS PWA에서 파란 포커스 링이 생김 → 할일 이름 입력으로 */
  requestAnimationFrame(() => nameInput?.focus());
}

function todoModalSectionLabel(sectionId) {
  const sid = String(sectionId || "").trim();
  if (!sid) return "";
  const hit = FIXED_SECTIONS.find((s) => s.id === sid);
  if (hit) return hit.label;
  if (sid.startsWith("custom-")) {
    try {
      const list = getCustomSections();
      const c = list.find((x) => (x.id || "").trim() === sid);
      if (c?.label) return c.label;
    } catch (_) {}
  }
  return sid;
}

/**
 * 캘린더 막대 메타(b)로 할일 목록과 동일한 수정 모달을 연다.
 * @param {object} barModel
 * @param {{ selectionEl?: HTMLElement|null, onAfterApply?: () => void }} [options]
 */
export function openTodoTaskEditFromCalendarBarModel(barModel, options = {}) {
  const { selectionEl = null, onAfterApply } = options || {};
  const b = barModel || {};
  const kpiTodoId = String(b.kpiTodoId || "").trim();
  const storageKey = String(b.storageKey || "").trim();
  const taskId = String(b.taskId || "").trim();
  const sectionId = String(b.sectionId || "").trim();
  const runAfter = () => {
    try {
      onAfterApply?.();
    } catch (_) {}
  };

  if (kpiTodoId && storageKey) {
    let todo = null;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const data = JSON.parse(raw);
        const arr = data.kpiTodos || [];
        todo = arr.find((t) => String(t.id) === String(kpiTodoId));
      }
    } catch (_) {}
    if (!todo) return;
    const completed = !!todo.completed;
    const itemTypeInit =
      (todo.itemType || "todo").toLowerCase() === "schedule"
        ? "schedule"
        : "todo";
    showTodoTaskModal({
      taskData: {
        taskId: `kpi-${kpiTodoId}-${storageKey}`,
        name: (todo.text || "").trim(),
        startDate: (todo.startDate || "").toString().slice(0, 10),
        dueDate: (todo.dueDate || "").toString().slice(0, 10),
        reminderDate: "",
        reminderTime: "",
        eisenhower: String(todo.eisenhower || "").trim(),
        sectionId,
        sectionLabel: todoModalSectionLabel(sectionId),
        isKpiTodo: true,
        classification: getKpiDisplayNameForTodo(kpiTodoId, storageKey),
        kpiTodoId,
        storageKey,
        kpiId: String(todo.kpiId || "").trim(),
        itemType: itemTypeInit,
      },
      sectionId,
      sectionLabel: todoModalSectionLabel(sectionId),
      mode: "edit",
      selectionEl,
      onSave: (payload) => {
        const newSectionId = (payload.sectionId || "").trim();
        updateKpiTodo(kpiTodoId, storageKey, {
          text: (payload.name || "").trim(),
          startDate: (payload.startDate || "").trim().slice(0, 10) || "",
          dueDate: (payload.dueDate || "").trim().slice(0, 10) || "",
          eisenhower: (payload.eisenhower || "").trim(),
          itemType: payload.itemType,
          completed,
        });
        if (newSectionId && newSectionId !== sectionId) {
          if (newSectionId.startsWith("custom-")) {
            if (removeKpiTodo(kpiTodoId, storageKey)) {
              try {
                const it = String(payload.itemType || itemTypeInit)
                  .trim()
                  .toLowerCase();
                const rowItemType = it === "schedule" ? "schedule" : "todo";
                const newTid =
                  typeof crypto !== "undefined" &&
                  typeof crypto.randomUUID === "function"
                    ? crypto.randomUUID()
                    : taskId || getTaskId({ ...payload, taskId });
                const customObj = readCustomSectionTasksObject();
                if (!customObj[newSectionId]) customObj[newSectionId] = [];
                customObj[newSectionId] = [
                  {
                    taskId: newTid,
                    name: (payload.name || "").trim(),
                    startDate:
                      (payload.startDate || "").trim().slice(0, 10) || "",
                    dueDate: (payload.dueDate || "").trim().slice(0, 10) || "",
                    startTime: "",
                    endTime: "",
                    eisenhower: (payload.eisenhower || "").trim() || "",
                    done: rowItemType === "schedule" ? false : completed,
                    itemType: rowItemType,
                    reminderDate:
                      (payload.reminderDate || "").trim().slice(0, 10) || "",
                    reminderTime:
                      (payload.reminderTime || "").trim().slice(0, 5) || "",
                  },
                  ...(Array.isArray(customObj[newSectionId])
                    ? customObj[newSectionId]
                    : []),
                ];
                writeCustomSectionTasksObject(customObj);
                void persistCustomSectionTasksAndSchedule(customObj).catch(
                  () => {},
                );
                void upsertCalendarSectionTaskDirectFromModal({
                  task: {
                    taskId: newTid,
                    name: (payload.name || "").trim(),
                    startDate:
                      (payload.startDate || "").trim().slice(0, 10) || "",
                    dueDate: (payload.dueDate || "").trim().slice(0, 10) || "",
                    startTime: "",
                    endTime: "",
                    eisenhower: (payload.eisenhower || "").trim() || "",
                    done: rowItemType === "schedule" ? false : !!completed,
                    itemType: rowItemType,
                    reminderDate:
                      (payload.reminderDate || "").trim().slice(0, 10) || "",
                    reminderTime:
                      (payload.reminderTime || "").trim().slice(0, 5) || "",
                  },
                  sectionKey: newSectionId,
                  isCustom: true,
                  sortOrder: 0,
                }).catch(() => {});
              } catch (_) {}
            }
          } else if (KPI_SECTION_IDS.includes(newSectionId)) {
            void moveKpiTodoToSection(kpiTodoId, storageKey, newSectionId);
          }
        }
        runAfter();
      },
      onDelete: async () => {
        if (removeKpiTodo(kpiTodoId, storageKey)) runAfter();
      },
    });
    return;
  }

  if (!taskId || !sectionId) return;

  const isCustom = sectionId.startsWith("custom-");
  let row = null;
  try {
    if (isCustom) {
      const obj = readCustomSectionTasksObject();
      const arr = obj[sectionId];
      if (Array.isArray(arr))
        row = arr.find((t) => String(t.taskId || "").trim() === taskId);
    } else {
      const obj = readSectionTasksObject();
      const arr = obj[sectionId];
      if (Array.isArray(arr))
        row = arr.find((t) => String(t.taskId || "").trim() === taskId);
    }
  } catch (_) {}
  if (!row) return;

  const storageSectionId = sectionId;
  const sectionLabel = todoModalSectionLabel(storageSectionId);
  const baseDone = !!row.done;

  showTodoTaskModal({
    taskData: {
      taskId,
      name: row.name || "",
      startDate: (row.startDate || "").toString().slice(0, 10),
      dueDate: (row.dueDate || "").toString().slice(0, 10),
      reminderDate: (row.reminderDate || "").toString().slice(0, 10),
      reminderTime: String(row.reminderTime || "").trim(),
      eisenhower: String(row.eisenhower || "").trim(),
      sectionId: storageSectionId,
      sectionLabel,
      isKpiTodo: false,
      itemType:
        (row.itemType || "todo").toLowerCase() === "schedule"
          ? "schedule"
          : "todo",
    },
    sectionId: storageSectionId,
    sectionLabel,
    mode: "edit",
    selectionEl,
    onSave: (payload) => {
      const newSectionId = (payload.sectionId || "").trim();
      const hadSectionMove =
        !!newSectionId && newSectionId !== storageSectionId;
      const buildMerged = () => {
        const it = String(payload.itemType || row.itemType || "todo")
          .trim()
          .toLowerCase();
        const itemTypeResolved = it === "schedule" ? "schedule" : "todo";
        return {
          ...row,
          name: (payload.name || "").trim(),
          startDate: (payload.startDate || "").trim().slice(0, 10) || "",
          dueDate: (payload.dueDate || "").trim().slice(0, 10) || "",
          reminderDate: (payload.reminderDate || "").trim().slice(0, 10) || "",
          reminderTime: (payload.reminderTime || "").trim() || "",
          eisenhower: (payload.eisenhower || "").trim() || "",
          itemType: itemTypeResolved,
          done: itemTypeResolved === "schedule" ? false : baseDone,
        };
      };

      if (hadSectionMove) {
        if (storageSectionId.startsWith("custom-")) {
          moveTaskOutOfCustomSectionStorageOnly(storageSectionId, taskId);
        } else {
          moveTaskOutOfSectionStorageOnly(storageSectionId, taskId);
        }
        clearSubtasks(taskId);
        const moved = buildMerged();
        const targetCustom = newSectionId.startsWith("custom-");
        if (targetCustom) {
          const obj = readCustomSectionTasksObject();
          const cur = Array.isArray(obj[newSectionId]) ? obj[newSectionId] : [];
          obj[newSectionId] = [moved, ...cur];
          writeCustomSectionTasksObject(obj);
          void persistCustomSectionTasksAndSchedule(obj).catch(() => {});
        } else {
          const obj = readSectionTasksObject();
          const cur = Array.isArray(obj[newSectionId]) ? obj[newSectionId] : [];
          obj[newSectionId] = [moved, ...cur];
          writeSectionTasksObject(obj);
          void persistSectionTasksAndSchedule(obj).catch(() => {});
        }
        const sidForPush = newSectionId;
        void upsertCalendarSectionTaskDirectFromModal({
          task: {
            taskId,
            name: moved.name,
            startDate: moved.startDate,
            dueDate: moved.dueDate,
            startTime: String(moved.startTime || "").trim(),
            endTime: String(moved.endTime || "").trim(),
            eisenhower: moved.eisenhower,
            done: !!moved.done,
            itemType: moved.itemType || "todo",
            reminderDate: moved.reminderDate,
            reminderTime: moved.reminderTime,
          },
          sectionKey: sidForPush,
          isCustom: sidForPush.startsWith("custom-"),
          sortOrder: 0,
        }).catch(() => {});
      } else {
        const merged = buildMerged();
        if (isCustom) {
          const obj = readCustomSectionTasksObject();
          const arr = obj[storageSectionId];
          if (!Array.isArray(arr)) return;
          const idx = arr.findIndex(
            (t) => String(t.taskId || "").trim() === taskId,
          );
          if (idx < 0) return;
          arr[idx] = merged;
          writeCustomSectionTasksObject(obj);
          void persistCustomSectionTasksAndSchedule(obj).catch(() => {});
        } else {
          const obj = readSectionTasksObject();
          const arr = obj[storageSectionId];
          if (!Array.isArray(arr)) return;
          const idx = arr.findIndex(
            (t) => String(t.taskId || "").trim() === taskId,
          );
          if (idx < 0) return;
          arr[idx] = merged;
          writeSectionTasksObject(obj);
          void persistSectionTasksAndSchedule(obj).catch(() => {});
        }
        void upsertCalendarSectionTaskDirectFromModal({
          task: {
            taskId,
            name: merged.name,
            startDate: merged.startDate,
            dueDate: merged.dueDate,
            startTime: String(merged.startTime || "").trim(),
            endTime: String(merged.endTime || "").trim(),
            eisenhower: merged.eisenhower,
            done: !!merged.done,
            itemType: merged.itemType || "todo",
            reminderDate: merged.reminderDate,
            reminderTime: merged.reminderTime,
          },
          sectionKey: storageSectionId,
          isCustom,
          sortOrder: 0,
        }).catch(() => {});
      }
      runAfter();
    },
    onDelete: () => {
      if (storageSectionId.startsWith("custom-")) {
        const begun = beginRemoveTaskFromCustomSectionStorageLocal(
          storageSectionId,
          taskId,
        );
        if (!begun.ok) return;
        clearSubtasks(taskId);
        runAfter();
        void completeRemoveTaskFromCustomSectionStorageServer(
          storageSectionId,
          taskId,
          begun.snapshot,
        ).catch(() => {});
        return;
      }
      const begun = beginRemoveTaskFromSectionStorageLocal(
        storageSectionId,
        taskId,
      );
      if (!begun.ok) return;
      clearSubtasks(taskId);
      runAfter();
      void completeRemoveTaskFromSectionStorageServer(
        storageSectionId,
        taskId,
        begun.snapshot,
      ).catch(() => {});
    },
  });
}

function getSections() {
  return [...FIXED_SECTIONS];
}

function getTaskId(taskData) {
  if (taskData.isKpiTodo && taskData.kpiTodoId && taskData.storageKey) {
    return `kpi-${taskData.kpiTodoId}-${taskData.storageKey}`;
  }
  return (
    taskData.taskId ||
    `task-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
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

/** 캘린더 드롭: 일정(schedule)은 항상 허용, 할 일(todo)은 완료 체크된 것만 제외 */
function taskAllowsCalendarDrag(itemType, doneFlag) {
  if (String(itemType || "todo").toLowerCase() === "schedule") return true;
  return !doneFlag;
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
    isKpiTodo: isKpiTodoFromData = false,
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
    listExcludesKpi = false,
  } = options;
  const isKpiTodo = listExcludesKpi ? false : !!isKpiTodoFromData;
  const taskId = optTaskId || getTaskId(taskData);

  const tr = document.createElement("tr");
  tr.className = "todo-task-row" + (isSubtask ? " todo-subtask-row" : "");
  tr.dataset.sectionId = taskData.sectionId || "";
  const hasDates = !!((startDate || "").trim() || (dueDate || "").trim());
  tr.dataset.hasDates = hasDates ? "true" : "false";
  if (!hasDates && (taskData.sectionId || "")) {
    tr.style.setProperty(
      "--row-section-color",
      getSectionColor(taskData.sectionId),
    );
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
      const secId =
        taskData.sectionId ||
        tr.closest(".todo-section")?.dataset?.section ||
        "";
      let persisted = false;
      if (secId.startsWith("custom-")) {
        persisted = updateCustomSectionTaskDone(
          secId,
          taskId,
          doneCheck.checked,
        );
      } else if (FIXED_SECTION_IDS_FOR_STORAGE.includes(secId)) {
        persisted = updateSectionTaskDone(secId, taskId, doneCheck.checked);
      }
      if (persisted) {
        upsertCalendarSectionTaskRowFromSessionMemory(
          secId,
          taskId,
          tr.closest(".todo-sections-wrap"),
        );
      }
    }
    syncOverdueDisplay?.();
    if (!isSubtask && (enableDragToCalendar || enableDragToEisenhower)) {
      const calDrag =
        enableDragToCalendar &&
        taskAllowsCalendarDrag(tr.dataset.itemType, doneCheck.checked);
      tr.draggable = calDrag || enableDragToEisenhower;
    }
  });

  const scheduleDot = document.createElement("span");
  scheduleDot.className = "todo-schedule-dot";
  scheduleDot.setAttribute("aria-hidden", "true");
  function refreshScheduleDotColor() {
    const sid = (
      taskData.sectionId ||
      tr.closest(".todo-section")?.dataset?.section ||
      ""
    ).trim();
    scheduleDot.style.backgroundColor = getSectionMarkerColor(sid);
  }

  const doneWrap = document.createElement("div");
  doneWrap.className = "todo-done-wrap";
  if (itemType === "schedule") {
    doneWrap.classList.add("todo-done-wrap--schedule");
    doneCheck.hidden = true;
    refreshScheduleDotColor();
    doneWrap.appendChild(scheduleDot);
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
      refreshScheduleDotColor();
      if (!doneWrap.contains(scheduleDot)) doneWrap.appendChild(scheduleDot);
      if (doneWrap.contains(doneCheck)) doneWrap.removeChild(doneCheck);
    } else {
      doneCheck.hidden = false;
      if (doneWrap.contains(scheduleDot)) doneWrap.removeChild(scheduleDot);
      if (!doneWrap.contains(doneCheck))
        doneWrap.insertBefore(doneCheck, doneWrap.firstChild);
    }
  };

  const nameTd = document.createElement("td");
  nameTd.className =
    "todo-cell-name" + (isSubtask ? " todo-cell-name-subtask" : "");
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
        const focusStaysInRow =
          tr.contains(activeEl) || focusStaysInRowSync || hadDateAreaClick;
        if (val === "" && !focusStaysInRow) {
          if (removeKpiTodo(kpiTodoId, storageKey)) {
            clearSubtasks(taskId);
            tr.remove();
            const section = tr.closest(".todo-section");
            const tbody = tr.parentElement;
            const countEl = section?.querySelector(".todo-section-count");
            if (countEl && tbody)
              countEl.textContent = String(
                tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)")
                  .length,
              );
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
        const focusStaysInRow =
          tr.contains(activeEl) || focusStaysInRowSync || hadDateAreaClick;
        if (val === "" && !focusStaysInRow) {
          clearSubtasks(taskId);
          tr.remove();
          const section = tr.closest(".todo-section");
          const tbody = tr.parentElement;
          const countEl = section?.querySelector(".todo-section-count");
          if (countEl && tbody)
            countEl.textContent = String(
              tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)")
                .length,
            );
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
        if (countEl)
          countEl.textContent = String(
            tr.closest("tbody")?.querySelectorAll(".todo-task-row").length || 0,
          );
      };
      const subs = addSubtask(taskId, { name: "", done: false });
      const newItem = createSubtaskItem(
        taskId,
        subs[subs.length - 1],
        updateCount,
      );
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
    startDisplay.innerHTML =
      y && m && d
        ? `<span class="todo-due-date-text">${m}/${d}</span>`
        : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
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
      startDisplay.innerHTML =
        y && m && d
          ? `<span class="todo-due-date-text">${m}/${d}</span>`
          : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    } else {
      startDisplay.innerHTML =
        '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
    }
  };
  const syncHasDates = () => {
    const hasDates = !!(
      (startInput.value || "").trim() || (dueInput.value || "").trim()
    );
    tr.dataset.hasDates = hasDates ? "true" : "false";
    if (!hasDates && (taskData.sectionId || "")) {
      tr.style.setProperty(
        "--row-section-color",
        getSectionColor(taskData.sectionId),
      );
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
    dueDisplay.innerHTML =
      y && m && d
        ? `<span class="todo-due-date-text">${m}/${d}</span>`
        : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
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
      dueDisplay.innerHTML =
        y && m && d
          ? `<span class="todo-due-date-text">${m}/${d}</span>`
          : '<span class="todo-due-empty"></span><span class="todo-due-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="4" width="12" height="10" rx="1"/><path d="M2 7h12M5 2v3M11 2v3"/></svg></span>';
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
    return (rTime || "").trim()
      ? `${dateStr} ${(rTime || "").trim()}`
      : dateStr;
  }
  const reminderDisplayVal = formatReminderDisplay(reminderDate, reminderTime);
  reminderDisplaySpan.textContent = reminderDisplayVal || "";
  reminderTd.classList.toggle("todo-cell-reminder-empty", !reminderDisplayVal);
  reminderBtn.hidden = !!reminderDisplayVal;

  function openReminderModal() {
    const taskName = (nameInput.value || "").trim() || "(과제명 없음)";
    const defaultDate =
      (tr.dataset.reminderDate || "").trim() || (dueInput.value || "").trim();
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
    modal
      .querySelector(".dream-kpi-modal-close")
      .addEventListener("click", close);
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
      if (digits.length >= 2)
        timeInput.value = formatTimeInput(timeInput.value);
    });
    const timeErrorEl = modal.querySelector(".todo-reminder-time-error");
    timeInput.addEventListener(
      "input",
      () => {
        timeErrorEl.textContent = "";
      },
      { capture: true },
    );
    modal.querySelector(".todo-reminder-save").addEventListener("click", () => {
      const dateVal = (
        modal.querySelector(".todo-reminder-date").value || ""
      ).trim();
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
      reminderDisplaySpan.classList.toggle(
        "todo-reminder-display--clickable",
        !!nextDisplay,
      );
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
  if (reminderDisplayVal)
    reminderDisplaySpan.classList.add("todo-reminder-display--clickable");

  reminderTd.appendChild(reminderBtn);
  reminderTd.appendChild(reminderDisplaySpan);

  function formatOverdueText(dueStr) {
    if (!dueStr || !dueStr.trim()) return "";
    const parts = String(dueStr).trim().split(/[-/]/);
    if (parts.length < 3) return "";
    const dueY = parseInt(parts[0], 10);
    const dueM = parseInt(parts[1], 10) - 1;
    const dueD = parseInt(parts[2], 10);
    if (Number.isNaN(dueY) || Number.isNaN(dueM) || Number.isNaN(dueD))
      return "";
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
    if (t && dueInput.value && isOverdue(dueInput.value))
      t += " " + formatOverdueText(dueInput.value);
    dateLineEl.textContent = t;
  }

  const overdueTd = document.createElement("td");
  overdueTd.className = "todo-cell-overdue";
  const overdueSpan = document.createElement("span");
  overdueSpan.className = "todo-overdue-display";
  overdueSpan.textContent = formatOverdueDisplay(dueDate, done);
  overdueTd.appendChild(overdueSpan);
  const syncOverdueDisplay = () => {
    overdueSpan.textContent = formatOverdueDisplay(
      dueInput.value,
      doneCheck.checked,
    );
    tr.classList.toggle(
      "todo-row-overdue",
      !!(dueInput.value && isOverdue(dueInput.value)),
    );
  };

  const EISENHOWER_LABELS = {
    "urgent-important": "긴급+중요",
    "important-not-urgent": "중요+여유",
    "urgent-not-important": "긴급+덜중요",
    "not-urgent-not-important": "여유+안중요",
    "not-urgent-": "여유+안중요",
  };
  const eisenhowerTd = document.createElement("td");
  eisenhowerTd.className =
    "todo-cell-eisenhower" +
    (!eisenhower ? " todo-cell-eisenhower--empty" : "");
  tr.dataset.eisenhower = eisenhower || "";
  const eisenhowerSpan = document.createElement("span");
  eisenhowerSpan.className = "todo-eisenhower-display";
  eisenhowerSpan.textContent = eisenhower
    ? EISENHOWER_LABELS[eisenhower] || eisenhower
    : "";
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
        ? await removeTaskFromCustomSectionStorage(
            sectionId,
            rowTaskId,
            "표_삭제버튼",
          )
        : await removeTaskFromSectionStorage(
            sectionId,
            rowTaskId,
            "표_삭제버튼",
          );
      if (!out?.ok) return;
      clearSubtasks(rowTaskId);
      tr.remove();
    } else {
      tr.remove();
    }
    section?.querySelector(".todo-section-count") &&
      (section.querySelector(".todo-section-count").textContent =
        tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length);
  });
  delTd.appendChild(delBtn);

  const kpiColText =
    isKpiTodo && kpiTodoId && storageKey
      ? (classification || "").trim() ||
        getKpiDisplayNameForTodo(kpiTodoId, storageKey)
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
    enableDragToCalendar && taskAllowsCalendarDrag(itemType, done);

  if (canDragToCalendar || enableDragToEisenhower) {
    if (!isSubtask) {
      tr.draggable = canDragToCalendar || enableDragToEisenhower;
      tr.addEventListener("dragstart", (e) => {
        const nameInput = tr.querySelector(".todo-task-name-field");
        const startInput = tr.querySelector(".todo-start-input-hidden");
        const dueInput = tr.querySelector(".todo-due-input-hidden");
        const doneCheck = tr.querySelector(".todo-done-check");
        const rowSectionId = (
          taskData.sourceSectionId ||
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
          durationMin = Math.max(30, eh * 60 + em - (sh * 60 + sm));
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
          done:
            (tr.dataset.itemType || "todo").toLowerCase() === "schedule"
              ? false
              : !!doneCheck?.checked,
          itemType: tr.dataset.itemType || "todo",
          isKpiTodo: !!isKpiTodo,
          kpiTodoId: kpiTodoId || "",
          storageKey: storageKey || "",
          _durationMin: durationMin,
        };
        if (enableDragToEisenhower) {
          e.dataTransfer.setData(
            DRAG_TYPE_TODO_TO_EISENHOWER,
            JSON.stringify(payload),
          );
        }
        const liveAllowCal =
          enableDragToCalendar &&
          taskAllowsCalendarDrag(tr.dataset.itemType, !!doneCheck?.checked);
        if (liveAllowCal) {
          window.__calendarDragDuration = durationMin;
          e.dataTransfer.setData(
            DRAG_TYPE_TODO_TO_CALENDAR,
            JSON.stringify(payload),
          );
          try {
            e.dataTransfer.setData(
              "text/plain",
              ((nameInput?.value || "").trim() || "(할 일)").slice(0, 400),
            );
          } catch (_) {}
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
      const due = new Date(
        parseInt(parts[0], 10),
        parseInt(parts[1], 10) - 1,
        parseInt(parts[2], 10),
      );
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      due.setHours(0, 0, 0, 0);
      const diffDays = Math.round(
        (due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
      );
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
  return (reminderTime || "").trim()
    ? `${dateStr} ${(reminderTime || "").trim()}`
    : dateStr;
}

const EISENHOWER_LABELS = {
  "urgent-important": "긴급+중요",
  "important-not-urgent": "중요+여유",
  "urgent-not-important": "긴급+덜중요",
  "not-urgent-not-important": "여유+안중요",
};

/** 우선순위 탭과 동일 할 일이 꿈/행복 등에도 있을 때 표시만 맞춤 */
function mirrorTodoCardElementFromPrimary(duplicateCard, primaryCard) {
  const p = primaryCard;
  const d = duplicateCard;
  if (!p || !d) return;
  d.dataset.taskId = p.dataset.taskId || "";
  d.dataset.sectionId = p.dataset.sectionId || "";
  d.dataset.name = p.dataset.name || "";
  d.dataset.startDate = p.dataset.startDate || "";
  d.dataset.dueDate = p.dataset.dueDate || "";
  d.dataset.reminderDate = p.dataset.reminderDate || "";
  d.dataset.reminderTime = p.dataset.reminderTime || "";
  d.dataset.eisenhower = p.dataset.eisenhower || "";
  if (p.dataset.itemType !== undefined) d.dataset.itemType = p.dataset.itemType;
  d.dataset.done = p.dataset.done || "false";
  d.classList.toggle("is-done", p.dataset.done === "true");
  const nameEl = d.querySelector(".todo-card-name");
  if (nameEl) {
    nameEl.textContent = (p.dataset.name || "").trim() || "(제목 없음)";
  }
  const priorityEl = d.querySelector(".todo-card-priority");
  const eis = (p.dataset.eisenhower || "").trim();
  if (priorityEl) {
    const pt = eis ? EISENHOWER_LABELS[eis] || eis : "";
    priorityEl.textContent = pt;
    priorityEl.hidden = !pt;
  }
  const isKpi = d.dataset.isKpiTodo === "true";
  const kid = d.dataset.kpiTodoId || "";
  const sk = d.dataset.kpiStorageKey || "";
  const kpiEl = d.querySelector(".todo-card-kpi");
  if (kpiEl) {
    let kpiLabel = "";
    if (isKpi && kid && sk) {
      kpiLabel =
        (p.dataset.kpiLabel || "").trim() ||
        getKpiDisplayNameForTodo(kid, sk);
    }
    kpiEl.textContent = kpiLabel;
    kpiEl.hidden = !kpiLabel;
    if (kpiLabel) d.dataset.kpiLabel = kpiLabel;
  }
  const datesEl = d.querySelector(".todo-card-dates");
  if (datesEl) {
    const ds = formatCardDates({
      name: p.dataset.name,
      startDate: p.dataset.startDate,
      dueDate: p.dataset.dueDate,
    });
    datesEl.textContent = ds;
    datesEl.hidden = !ds || !String(ds).trim();
  }
  const reminderEl = d.querySelector(".todo-card-reminder");
  if (reminderEl) {
    const remText = formatCardReminder(
      p.dataset.reminderDate || "",
      p.dataset.reminderTime || "",
    );
    const bell =
      '<svg class="todo-card-reminder-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 19.001c0 2.209 1.791 4 4 4s4-1.791 4-4"/><path d="m12 5.999v6"/><path d="m9 8.999h6"/><path d="m22 19.001-3-5.25v-5.752c0-3.866-3.134-7-7-7s-7 3.134-7 7v5.751l-3 5.25h20z"/></svg>';
    if (remText) {
      reminderEl.innerHTML = `${bell}<span class="todo-card-reminder-text">${remText}</span>`;
      reminderEl.hidden = false;
    } else {
      reminderEl.innerHTML = "";
      reminderEl.hidden = true;
    }
  }
  const metaRow = d.querySelector(".todo-card-meta-row");
  const dEl = d.querySelector(".todo-card-dates");
  const rEl = d.querySelector(".todo-card-reminder");
  if (metaRow && dEl && rEl) {
    metaRow.hidden = !!(dEl.hidden && rEl.hidden);
  }
  const cb = d.querySelector(".todo-done-check");
  if (cb) cb.checked = p.dataset.done === "true";
}

function syncDuplicateTodoCardsWithSameTaskId(sectionsWrap, primaryCard) {
  if (!sectionsWrap || !primaryCard) return;
  const tid = (primaryCard.dataset.taskId || "").trim();
  if (!tid) return;
  sectionsWrap.querySelectorAll(".todo-card").forEach((dup) => {
    if (dup === primaryCard) return;
    if ((dup.dataset.taskId || "").trim() !== tid) return;
    mirrorTodoCardElementFromPrimary(dup, primaryCard);
  });
}

function removeAllTodoCardsWithTaskIdInWrap(sectionsWrap, taskId) {
  const tid = String(taskId || "").trim();
  if (!tid || !sectionsWrap) return;
  sectionsWrap.querySelectorAll(".todo-card").forEach((c) => {
    if ((c.dataset.taskId || "").trim() === tid) c.remove();
  });
}

/** 캘린더 할일 사이드바: 마감·삭제 등 후 탭/기한초과 목록을 다시 그리도록 알림 */
function requestCalendarTodoSidebarRebuildFromCard(card) {
  if (
    !card ||
    typeof card.dispatchEvent !== "function" ||
    (!card.closest(".todo-list-eisenhower-sidebar") &&
      !card.closest(".todo-list-in-sidebar"))
  ) {
    return;
  }
  requestAnimationFrame(() => {
    try {
      card.dispatchEvent(
        new CustomEvent("lp-todo-dates-changed", { bubbles: true }),
      );
    } catch (_) {}
  });
}

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
    isKpiTodo: isKpiTodoFromData = false,
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
    listExcludesKpi = false,
  } = options;
  const isKpiTodo = listExcludesKpi ? false : !!isKpiTodoFromData;
  const taskId = getTaskId(taskData);
  const kpiName =
    isKpiTodo && kpiTodoId && storageKey
      ? (classification || "").trim() ||
        getKpiDisplayNameForTodo(kpiTodoId, storageKey)
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
    if (isKpiTodo && kpiTodoId && storageKey)
      syncKpiTodoCompleted(kpiTodoId, storageKey, newDone);
    else if (!isKpiTodo && storageSectionId) {
      let persisted = false;
      if (storageSectionId.startsWith("custom-")) {
        persisted = updateCustomSectionTaskDone(
          storageSectionId,
          taskId,
          newDone,
        );
      } else if (FIXED_SECTION_IDS_FOR_STORAGE.includes(storageSectionId)) {
        persisted = updateSectionTaskDone(storageSectionId, taskId, newDone);
      }
      if (persisted) {
        upsertCalendarSectionTaskRowFromSessionMemory(
          storageSectionId,
          taskId,
          card.closest(".todo-sections-wrap"),
        );
      }
    }
    if (sectionsWrap) syncDuplicateTodoCardsWithSameTaskId(sectionsWrap, card);
    scheduleSave();
    const listRoot = card.closest(".todo-list-view");
    const hideCompletedUi = listRoot?.classList.contains("hide-completed");
    if (enableDragToCalendar) {
      const allow = taskAllowsCalendarDrag(card.dataset.itemType, newDone);
      if (enableDragToEisenhower) {
        const hasP = (card.dataset.eisenhower || "").trim() !== "";
        card.draggable = allow || !hasP;
      } else {
        card.draggable = allow;
      }
    }
    if (
      newDone &&
      card.closest(".todo-list-eisenhower-sidebar, .todo-list-in-sidebar")
    ) {
      refreshEisenhowerQuadrantsIfActive();
      requestCalendarTodoSidebarRebuildFromCard(card);
      if (hideCompletedUi) {
        if (sectionsWrap)
          removeAllTodoCardsWithTaskIdInWrap(
            sectionsWrap,
            card.dataset.taskId || taskId,
          );
        else card.remove();
      }
    }
    updateCount();
    if (sectionsWrap) {
      refreshTodoDateTabSectionDom(sectionsWrap);
      refreshTodoPriorityTabSectionDom(sectionsWrap);
    }
  });

  const scheduleDot = document.createElement("span");
  scheduleDot.className = "todo-card-schedule-dot";
  scheduleDot.setAttribute("aria-hidden", "true");

  function syncScheduleCardUi() {
    if (isKpiTodo) return;
    const isSched =
      (card.dataset.itemType || "todo").toLowerCase() === "schedule";
    const sid = (card.dataset.sectionId || storageSectionId || "").trim();
    if (isSched) {
      doneWrap.classList.add("todo-card-done-wrap--schedule");
      scheduleDot.style.backgroundColor = getSectionMarkerColor(
        sid === "overdue" ? (sourceSectionId || "").trim() : sid,
      );
      doneCheck.hidden = true;
      doneCheck.checked = false;
      card.dataset.done = "false";
      card.classList.remove("is-done");
      if (!doneWrap.contains(scheduleDot)) doneWrap.appendChild(scheduleDot);
      if (doneWrap.contains(doneCheck)) doneWrap.removeChild(doneCheck);
    } else {
      doneWrap.classList.remove("todo-card-done-wrap--schedule");
      doneCheck.hidden = false;
      if (doneWrap.contains(scheduleDot)) doneWrap.removeChild(scheduleDot);
      if (!doneWrap.contains(doneCheck)) {
        doneWrap.insertBefore(doneCheck, doneWrap.firstChild);
      }
    }
  }

  const nameWrap = document.createElement("div");
  nameWrap.className = "todo-card-name-wrap";

  const nameEl = document.createElement("span");
  nameEl.className = "todo-card-name";
  nameEl.textContent = name || "(제목 없음)";

  const priorityEl = document.createElement("span");
  priorityEl.className = "todo-card-priority";
  priorityEl.textContent = eisenhower
    ? EISENHOWER_LABELS[eisenhower] || eisenhower
    : "";
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

  const BELL_ICON =
    '<svg class="todo-card-reminder-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 19.001c0 2.209 1.791 4 4 4s4-1.791 4-4"/><path d="m12 5.999v6"/><path d="m9 8.999h6"/><path d="m22 19.001-3-5.25v-5.752c0-3.866-3.134-7-7-7s-7 3.134-7 7v5.751l-3 5.25h20z"/></svg>';
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
  syncScheduleCardUi();

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
      e.dataTransfer.setData(
        DRAG_TYPE_TODO_TO_EISENHOWER,
        JSON.stringify(payload),
      );
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("todo-card-dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("todo-card-dragging");
    });
  }

  const allowCalendarDrag = taskAllowsCalendarDrag(itemType, done);

  if (enableDragToCalendar) {
    if (enableDragToEisenhower) {
      const hasPriority = (eisenhower || "").trim() !== "";
      card.draggable = allowCalendarDrag || !hasPriority;
    } else {
      card.draggable = allowCalendarDrag;
    }
    if (hasDueDate) card.classList.add("todo-card--has-due");
    card.addEventListener("dragstart", (e) => {
      const liveAllowCal = taskAllowsCalendarDrag(
        card.dataset.itemType,
        card.dataset.done === "true",
      );
      if (!liveAllowCal) return;
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
      e.dataTransfer.setData(
        DRAG_TYPE_TODO_TO_CALENDAR,
        JSON.stringify(payload),
      );
      try {
        e.dataTransfer.setData(
          "text/plain",
          ((name || "").trim() || "(할 일)").slice(0, 400),
        );
      } catch (_) {}
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
    if (data.itemType !== undefined) {
      card.dataset.itemType = data.itemType;
      syncScheduleCardUi();
    }
    nameEl.textContent = n;
    const kid = card.dataset.kpiTodoId || "";
    const sk = card.dataset.kpiStorageKey || "";
    let kpiLabel = "";
    if (isKpiTodo && kid && sk) {
      kpiLabel =
        (data.classification || "").trim() || getKpiDisplayNameForTodo(kid, sk);
    }
    kpiEl.textContent = kpiLabel;
    kpiEl.hidden = !kpiLabel;
    if (kpiLabel) card.dataset.kpiLabel = kpiLabel;
    const ds = formatCardDates(data);
    datesEl.textContent = ds;
    datesEl.hidden = !ds || !String(ds).trim();
    const priorityText = data.eisenhower
      ? EISENHOWER_LABELS[data.eisenhower] || data.eisenhower
      : "";
    priorityEl.textContent = priorityText;
    priorityEl.hidden = !priorityText;
    if (card.closest(".todo-list-eisenhower-sidebar")) {
      const hasP = (data.eisenhower || "").trim() !== "";
      card.classList.toggle("todo-card--priority-assigned", hasP);
      card.draggable = !hasP;
    }
    if (
      card.closest(".todo-list-in-sidebar") &&
      !card.closest(".todo-list-eisenhower-sidebar")
    ) {
      const hasDueDate =
        (data.dueDate || data.startDate || "").trim() !== "";
      card.classList.toggle("todo-card--has-due", hasDueDate);
      const allowCalendarDragSidebar = taskAllowsCalendarDrag(
        data.itemType,
        !!data.done,
      );
      if (enableDragToCalendar) {
        if (enableDragToEisenhower) {
          const hasP = (data.eisenhower || "").trim() !== "";
          card.draggable = allowCalendarDragSidebar || !hasP;
        } else {
          card.draggable = !!allowCalendarDragSidebar;
        }
      } else {
        card.draggable = !hasDueDate;
      }
    }
    const remText = formatCardReminder(data.reminderDate, data.reminderTime);
    if (remText) {
      const bell =
        '<svg class="todo-card-reminder-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8 19.001c0 2.209 1.791 4 4 4s4-1.791 4-4"/><path d="m12 5.999v6"/><path d="m9 8.999h6"/><path d="m22 19.001-3-5.25v-5.752c0-3.866-3.134-7-7-7s-7 3.134-7 7v5.751l-3 5.25h20z"/></svg>';
      reminderEl.innerHTML = `${bell}<span class="todo-card-reminder-text">${remText}</span>`;
      reminderEl.hidden = false;
    } else {
      reminderEl.innerHTML = "";
      reminderEl.hidden = true;
    }
    metaRow.hidden = !!(datesEl.hidden && reminderEl.hidden);
  }

  contentCol.addEventListener("click", (e) => {
    /* 할 일: 체크박스만 편집 모달과 분리. 일정은 doneWrap에 점만 있어 전체 막으면 모달이 안 열림 */
    if (e.target.closest("input.todo-done-check")) return;
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
      selectionEl: card,
      onSave: (payload) => {
        const prevStart = (card.dataset.startDate || "").trim().slice(0, 10);
        const prevDue = (card.dataset.dueDate || "").trim().slice(0, 10);
        const prevSid = (card.dataset.sectionId || "").trim();
        const prevEisenKey = normalizeEisenhowerSortKey(
          (card.dataset.eisenhower || "").trim(),
        );
        const newSectionId = (payload.sectionId || "").trim();
        let hadSectionMove = false;
        if (newSectionId && newSectionId !== storageSectionId) {
          hadSectionMove = true;
          if (storageSectionId && storageSectionId.startsWith("custom-")) {
            moveTaskOutOfCustomSectionStorageOnly(storageSectionId, taskId);
          } else if (storageSectionId) {
            moveTaskOutOfSectionStorageOnly(storageSectionId, taskId);
          }
          clearSubtasks(taskId);
          const sectionEl = sectionsWrap?.querySelector(
            `.todo-section[data-section="${newSectionId}"]`,
          );
          const targetWrap = sectionEl?.querySelector(".todo-cards-wrap");
          if (targetWrap) {
            const tidMove = (taskId || "").trim();
            if (sectionsWrap && tidMove) {
              sectionsWrap.querySelectorAll(".todo-card").forEach((c) => {
                if (c !== card && (c.dataset.taskId || "").trim() === tidMove)
                  c.remove();
              });
            }
            card.remove();
            card.dataset.sectionId = newSectionId;
            if (targetWrap.firstChild) {
              targetWrap.insertBefore(card, targetWrap.firstChild);
            } else {
              targetWrap.appendChild(card);
            }
          }
        }
        updateCardFromData(payload);
        if (sectionsWrap)
          syncDuplicateTodoCardsWithSameTaskId(sectionsWrap, card);
        updateCount();
        if (sectionId === "overdue") {
          persistOverdueListCardEditToStorage(
            storageSectionId,
            taskId,
            payload,
            card,
            hadSectionMove,
          );
        } else if (sectionsWrap) {
          /* 디바운스 저장(300ms)보다 그리드 갱신이 먼저 돌면 세션은 옛 날짜 → 즉시 DOM→메모리 동기화 */
          flushSaveSectionTasksFromDOM(sectionsWrap);
        }
        if (!(isKpiTodo && kpiTodoId && storageKey)) {
          const domSid = (card.dataset.sectionId || "").trim();
          const sidForPush =
            domSid === "overdue"
              ? storageSectionId
              : (domSid || storageSectionId || "").trim();
          pushCalendarSectionTaskDirectToServer(
            sidForPush,
            card,
            taskRecordFromCardForServer(card),
            "수정모달_저장",
          );
        }
        requestCalendarTodoSidebarRebuildFromCard(card);
        if (sectionsWrap) {
          const pStart = (card.dataset.startDate || "").trim().slice(0, 10);
          const pDue = (card.dataset.dueDate || "").trim().slice(0, 10);
          const pSid = (card.dataset.sectionId || "").trim();
          const pEisenKey = normalizeEisenhowerSortKey(
            (card.dataset.eisenhower || "").trim(),
          );
          if (
            pStart !== prevStart ||
            pDue !== prevDue ||
            pSid !== prevSid ||
            hadSectionMove
          ) {
            refreshTodoDateTabSectionDom(sectionsWrap);
          }
          if (
            pEisenKey !== prevEisenKey ||
            pSid !== prevSid ||
            hadSectionMove
          ) {
            refreshTodoPriorityTabSectionDom(sectionsWrap);
          }
        }
      },
      onDelete: () => {
        cancelScheduleSaveSectionTasksFromDOM();
        if (isKpiTodo && kpiTodoId && storageKey) {
          if (removeKpiTodo(kpiTodoId, storageKey)) {
            requestCalendarTodoSidebarRebuildFromCard(card);
            if (sectionsWrap) {
              removeAllTodoCardsWithTaskIdInWrap(sectionsWrap, taskId);
              flushSaveSectionTasksFromDOM(sectionsWrap);
              refreshTodoDateTabSectionDom(sectionsWrap);
              refreshTodoPriorityTabSectionDom(sectionsWrap);
            } else card.remove();
            updateCount();
          }
          return;
        }
        if (storageSectionId && storageSectionId.startsWith("custom-")) {
          const begun = beginRemoveTaskFromCustomSectionStorageLocal(
            storageSectionId,
            taskId,
          );
          if (!begun.ok) return;
          clearSubtasks(taskId);
          requestCalendarTodoSidebarRebuildFromCard(card);
          if (sectionsWrap) {
            removeAllTodoCardsWithTaskIdInWrap(sectionsWrap, taskId);
            flushSaveSectionTasksFromDOM(sectionsWrap);
            refreshTodoDateTabSectionDom(sectionsWrap);
            refreshTodoPriorityTabSectionDom(sectionsWrap);
          } else card.remove();
          updateCount();
          void completeRemoveTaskFromCustomSectionStorageServer(
            storageSectionId,
            taskId,
            begun.snapshot,
          ).catch(() => {});
          return;
        }
        if (storageSectionId) {
          const begun = beginRemoveTaskFromSectionStorageLocal(
            storageSectionId,
            taskId,
          );
          if (!begun.ok) return;
          clearSubtasks(taskId);
          requestCalendarTodoSidebarRebuildFromCard(card);
          if (sectionsWrap) {
            removeAllTodoCardsWithTaskIdInWrap(sectionsWrap, taskId);
            flushSaveSectionTasksFromDOM(sectionsWrap);
            refreshTodoDateTabSectionDom(sectionsWrap);
            refreshTodoPriorityTabSectionDom(sectionsWrap);
          } else card.remove();
          updateCount();
          void completeRemoveTaskFromSectionStorageServer(
            storageSectionId,
            taskId,
            begun.snapshot,
          ).catch(() => {});
          return;
        }
        requestCalendarTodoSidebarRebuildFromCard(card);
        if (sectionsWrap) {
          removeAllTodoCardsWithTaskIdInWrap(sectionsWrap, taskId);
          flushSaveSectionTasksFromDOM(sectionsWrap);
          refreshTodoDateTabSectionDom(sectionsWrap);
          refreshTodoPriorityTabSectionDom(sectionsWrap);
        } else card.remove();
        updateCount();
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
    listExcludesKpi = false,
  } = options;
  const sectionId = sectionIdForAdd ?? section.id;

  const wrap = document.createElement("div");
  wrap.className = "todo-section" + (tabMode ? " todo-section-tab-panel" : "");
  wrap.dataset.section = section.id;

  const isOverdueSection = section.id === "overdue";
  let header = null;
  if (!tabMode) {
    header = document.createElement("div");
    header.className =
      "todo-section-header" +
      (isOverdueSection ? " todo-section-header--no-collapse" : "");
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

  const countEl = () =>
    tabMode
      ? wrap.querySelector(".todo-section-count")
      : header?.querySelector(".todo-section-count");

  if (cardLayout) {
    const cardsWrap = document.createElement("div");
    cardsWrap.className = "todo-cards-wrap";
    const sectionsWrap =
      options.sectionsWrap || wrap.closest(".todo-sections-wrap");
    function scheduleSave() {
      if (!sectionsWrap) return;
      scheduleSaveSectionTasksFromDOM(sectionsWrap);
    }
    function updateCount() {
      const el = countEl();
      if (el)
        el.textContent = String(
          cardsWrap.querySelectorAll(".todo-card").length,
        );
    }
    initialTasks.forEach((t) => {
      const taskId = t.taskId || getTaskId(t);
      t.taskId = taskId;
      const card = createTaskCard(t, {
        updateCount,
        sectionsWrap,
        scheduleSave,
        enableDragToEisenhower,
        enableDragToCalendar,
        enableDragOverdueToCalendar,
        listExcludesKpi,
      });
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
          const taskId =
            typeof crypto !== "undefined" &&
            typeof crypto.randomUUID === "function"
              ? crypto.randomUUID()
              : getTaskId(payload);
          const newTask = { ...payload, taskId, done: false };
          const card = createTaskCard(newTask, {
            updateCount,
            sectionsWrap,
            scheduleSave,
            enableDragToEisenhower,
            enableDragToCalendar,
            enableDragOverdueToCalendar,
            listExcludesKpi,
          });
          cardsWrap.appendChild(card);
          updateCount();
          logTodoScheduleAddStep1({
            taskId,
            sectionId,
            title: (payload.name || newTask.name || "").trim(),
          });
          const addMeta = { taskId, section: String(sectionId || "").trim() };
          logTodoScheduleAddStep2(addMeta);
          markTodoAddPendingServerLog({ taskId, sectionId });
          pushCalendarSectionTaskDirectToServer(
            sectionId,
            card,
            newTask,
            "할일추가_확인",
          );
          scheduleSave();
          requestCalendarTodoSidebarRebuildFromCard(card);
        },
      });
    });
    addWrap.appendChild(addBtn);
    if (header) wrap.appendChild(header);
    wrap.appendChild(cardsWrap);
    /* + 버튼은 스크롤 박스(todo-cards-wrap) 밖에 둠 — 모바일에서 fixed가 overflow:auto에 잘리는 것 방지 */
    if (
      section.id !== "overdue" &&
      section.id !== TODO_PRIORITY_TAB_SECTION_ID &&
      section.id !== TODO_DATE_TAB_SECTION_ID
    )
      wrap.appendChild(addWrap);
    updateCount();
    return { wrap, updateCount };
  }

  const tableWrap = document.createElement("div");
  tableWrap.className = "todo-table-wrap";
  const table = document.createElement("table");
  table.className = "todo-table";
  const colgroupOverdue = overdueColumnOrder
    ? hideCategoryCol
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
    </colgroup>`
    : null;
  const colgroupEisenhowerSidebarFirst = eisenhowerSidebarFirst
    ? hideCategoryCol
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
    </colgroup>`
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
  const colgroupHtml =
    colgroupOverdue || colgroupEisenhowerSidebarFirst || colgroupDefault;
  const theadCategoryTh = hideCategoryCol
    ? ""
    : `<th class="todo-th-category">${lastColHeader}</th>`;
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
      listExcludesKpi,
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
    if (el)
      el.textContent = String(
        tbody.querySelectorAll(".todo-task-row:not(.todo-subtask-row)").length,
      );
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
        listExcludesKpi,
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
    if (
      secId === TODO_PRIORITY_TAB_SECTION_ID ||
      secId === TODO_DATE_TAB_SECTION_ID
    )
      return;
    const isCategoryView = sectionIds.has(secId);
    const cardsWrap = sec.querySelector(".todo-cards-wrap");
    if (cardsWrap) {
      cardsWrap.querySelectorAll(".todo-card").forEach((card) => {
        const rowSectionId = card.dataset.sectionId || secId;
        const sectionLabel =
          getSections().find((s) => s.id === rowSectionId)?.label || "";
        const isKpiCard = card.dataset.isKpiTodo === "true";
        const kpiTid = card.dataset.kpiTodoId || "";
        const kpiSk = card.dataset.kpiStorageKey || "";
        let classificationVal = secId;
        if (isKpiCard && kpiTid && kpiSk) {
          classificationVal =
            (card.dataset.kpiLabel || "").trim() ||
            getKpiDisplayNameForTodo(kpiTid, kpiSk);
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
          itemType: card.dataset.itemType || "todo",
          done:
            (card.dataset.itemType || "todo").toLowerCase() === "schedule"
              ? false
              : card.dataset.done === "true",
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
    sec
      .querySelectorAll(".todo-task-row:not(.todo-subtask-row)")
      .forEach((row) => {
        const nameInput = row.querySelector(".todo-task-name-field");
        const startInput = row.querySelector(".todo-start-input-hidden");
        const dueInput = row.querySelector(".todo-due-input-hidden");
        const eisenhowerSelect = row.querySelector(".todo-eisenhower-select");
        const catCell = row.querySelector(".todo-cell-category");
        const catInput = catCell?.querySelector(".todo-category-input");
        const doneCheck = row.querySelector(".todo-done-check");
        const rowSectionId = row.dataset.sectionId || secId;
        const sectionLabel =
          getSections().find((s) => s.id === rowSectionId)?.label || "";
        const classification = catCell
          ? isCategoryView
            ? (catInput ? catInput.value : catCell?.textContent || "").trim()
            : secId
          : secId;
        const itemType = row.dataset.itemType || "todo";
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
          itemType,
          done:
            String(itemType || "todo").toLowerCase() === "schedule"
              ? false
              : !!doneCheck?.checked,
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

/** YYYY-MM-DD만 인정 */
function parseTaskDateYmd(raw) {
  const s = String(raw || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function localYmd(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const y = x.getFullYear();
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 날짜 탭: 과거·오늘·내일·이후·날짜 없음
 * - 과거: 시작만 있으면 시작일 기준, 마감만 있으면 마감일 기준, 둘 다 있으면 마감일만 보고 과거 여부 판단.
 * - 오늘/내일: 한쪽만 있으면 그날짜 기준, 둘 다 있으면 시작·마감 중 하나라도 해당일이면 해당 묶음.
 * - 그 이후(미래): 한쪽만 있으면 그날짜, 둘 다 있으면 마감일로 묶음(과거 규칙과 대칭).
 */
function partitionTasksForDateBuckets(tasks, now = new Date()) {
  const today0 = new Date(now);
  today0.setHours(0, 0, 0, 0);
  const tomorrow0 = new Date(today0);
  tomorrow0.setDate(tomorrow0.getDate() + 1);
  const todayStr = localYmd(today0);
  const tomorrowStr = localYmd(tomorrow0);
  const past = [];
  const todayList = [];
  const tomorrowList = [];
  const futureMap = new Map();
  const noDate = [];
  for (const t of tasks || []) {
    const startY = parseTaskDateYmd(t?.startDate);
    const dueY = parseTaskDateYmd(t?.dueDate);
    if (!startY && !dueY) {
      noDate.push(t);
      continue;
    }

    const isPast =
      dueY && startY
        ? dueY < todayStr
        : dueY
          ? dueY < todayStr
          : startY < todayStr;
    if (isPast) {
      past.push(t);
      continue;
    }

    const isToday =
      dueY && startY
        ? startY === todayStr || dueY === todayStr
        : dueY
          ? dueY === todayStr
          : startY === todayStr;
    if (isToday) {
      todayList.push(t);
      continue;
    }

    const isTomorrow =
      dueY && startY
        ? startY === tomorrowStr || dueY === tomorrowStr
        : dueY
          ? dueY === tomorrowStr
          : startY === tomorrowStr;
    if (isTomorrow) {
      tomorrowList.push(t);
      continue;
    }

    const futureAnchor = dueY && startY ? dueY : dueY || startY;
    if (futureAnchor > tomorrowStr) {
      if (!futureMap.has(futureAnchor)) futureMap.set(futureAnchor, []);
      futureMap.get(futureAnchor).push(t);
    }
  }
  const futureKeys = [...futureMap.keys()].sort();
  return { past, today: todayList, tomorrow: tomorrowList, futureMap, futureKeys, noDate };
}

function formatDateBucketTitleYmd(ymd, todayYear) {
  const parts = String(ymd || "").split("-");
  if (parts.length !== 3) return ymd;
  const y = parseInt(parts[0], 10);
  const mo = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(y, mo, d);
  if (Number.isNaN(date.getTime())) return ymd;
  const opts = {
    weekday: "short",
    month: "long",
    day: "numeric",
  };
  if (y !== todayYear) opts.year = "numeric";
  try {
    return new Intl.DateTimeFormat("ko-KR", opts).format(date);
  } catch (_) {
    return ymd;
  }
}

/** 우선순위 탭: 아이젠하워 4칸 (+ 미지정 있으면 한 줄) */
const PRIORITY_TAB_QUADRANT_DEFS = [
  { key: "urgent-important", label: "긴급+중요" },
  { key: "important-not-urgent", label: "중요+여유" },
  { key: "urgent-not-important", label: "긴급+덜중요" },
  { key: "not-urgent-not-important", label: "여유+안중요" },
];

function sortTasksInPriorityBucket(arr) {
  const a = (arr || []).slice();
  a.sort((x, y) => {
    const da = (x.dueDate || "").trim();
    const db = (y.dueDate || "").trim();
    if (da && db && da !== db) return da.localeCompare(db);
    if (da && !db) return -1;
    if (!da && db) return 1;
    return String(x.name || "").localeCompare(String(y.name || ""), "ko");
  });
  return a;
}

function wirePriorityQuadrantAccordion(head, bodyEl, cell) {
  head.addEventListener("click", () => {
    const open = head.getAttribute("aria-expanded") === "true";
    const next = !open;
    head.setAttribute("aria-expanded", String(next));
    bodyEl.hidden = !next;
    cell.classList.toggle("todo-priority-quadrant--open", next);
  });
}

function buildPriorityQuadrantBlock(
  root,
  {
    quadrantKey,
    label,
    bucketTasks,
    updateCount,
    sectionsWrap,
    scheduleSave,
    enableDragToEisenhower,
    enableDragToCalendar,
    listExcludesKpi,
  },
) {
  const cell = document.createElement("div");
  cell.className = quadrantKey
    ? "todo-priority-quadrant"
    : "todo-priority-quadrant todo-priority-quadrant--unassigned";
  if (quadrantKey) cell.dataset.eisenhowerKey = quadrantKey;

  const idSuffix =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : String(Date.now());
  const bodyId = `todo-priority-body-${quadrantKey || "na"}-${idSuffix}`;

  const head = document.createElement("button");
  head.type = "button";
  head.className = "todo-priority-quadrant-head";
  head.setAttribute("aria-expanded", "false");
  head.setAttribute("aria-controls", bodyId);

  const title = document.createElement("span");
  title.className = "todo-priority-quadrant-title";
  title.textContent = label;

  const cnt = document.createElement("span");
  cnt.className = "todo-priority-quadrant-count";
  cnt.textContent = String(bucketTasks.length);

  const chev = document.createElement("span");
  chev.className = "todo-priority-quadrant-chevron";
  chev.setAttribute("aria-hidden", "true");

  head.appendChild(title);
  head.appendChild(cnt);
  head.appendChild(chev);

  const bodyEl = document.createElement("div");
  bodyEl.className = "todo-priority-quadrant-body";
  bodyEl.id = bodyId;
  bodyEl.hidden = true;

  const cardsWrap = document.createElement("div");
  cardsWrap.className = "todo-cards-wrap todo-priority-quadrant-cards";

  bucketTasks.forEach((t) => {
    const taskId = t.taskId || getTaskId(t);
    t.taskId = taskId;
    const card = createTaskCard(t, {
      updateCount,
      sectionsWrap,
      scheduleSave,
      enableDragToEisenhower,
      enableDragToCalendar,
      enableDragOverdueToCalendar: false,
      listExcludesKpi,
    });
    cardsWrap.appendChild(card);
  });

  bodyEl.appendChild(cardsWrap);
  cell.appendChild(head);
  cell.appendChild(bodyEl);
  wirePriorityQuadrantAccordion(head, bodyEl, cell);
  root.appendChild(cell);
}

/** 날짜 탭: 과거·오늘·내일·이후 일자별(아이젠하워 키는 쓰지 않음) */
function buildDateBucketBlock(
  root,
  {
    bucketKey,
    label,
    bucketTasks,
    updateCount,
    sectionsWrap,
    scheduleSave,
    enableDragToEisenhower,
    enableDragToCalendar,
    listExcludesKpi,
  },
) {
  const cell = document.createElement("div");
  cell.className = "todo-priority-quadrant";
  if (bucketKey) cell.dataset.dateBucket = String(bucketKey);

  const idSuffix =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : String(Date.now());
  const safeIdKey = String(bucketKey || "na").replace(/[^a-zA-Z0-9_-]/g, "");
  const bodyId = `todo-date-body-${safeIdKey}-${idSuffix}`;

  const head = document.createElement("button");
  head.type = "button";
  head.className = "todo-priority-quadrant-head";
  head.setAttribute("aria-expanded", "false");
  head.setAttribute("aria-controls", bodyId);

  const title = document.createElement("span");
  title.className = "todo-priority-quadrant-title";
  title.textContent = label;

  const cnt = document.createElement("span");
  cnt.className = "todo-priority-quadrant-count";
  cnt.textContent = String(bucketTasks.length);

  const chev = document.createElement("span");
  chev.className = "todo-priority-quadrant-chevron";
  chev.setAttribute("aria-hidden", "true");

  head.appendChild(title);
  head.appendChild(cnt);
  head.appendChild(chev);

  const bodyEl = document.createElement("div");
  bodyEl.className = "todo-priority-quadrant-body";
  bodyEl.id = bodyId;
  bodyEl.hidden = true;

  const cardsWrap = document.createElement("div");
  cardsWrap.className = "todo-cards-wrap todo-priority-quadrant-cards";

  bucketTasks.forEach((t) => {
    const taskId = t.taskId || getTaskId(t);
    t.taskId = taskId;
    const card = createTaskCard(t, {
      updateCount,
      sectionsWrap,
      scheduleSave,
      enableDragToEisenhower,
      enableDragToCalendar,
      enableDragOverdueToCalendar: false,
      listExcludesKpi,
    });
    cardsWrap.appendChild(card);
  });

  bodyEl.appendChild(cardsWrap);
  cell.appendChild(head);
  cell.appendChild(bodyEl);
  wirePriorityQuadrantAccordion(head, bodyEl, cell);
  root.appendChild(cell);
}

/** 날짜·우선순위 집계 탭용: 저장소에서 할 일 목록을 메인 뷰 필터와 동일하게 고름 */
function gatherFilteredTasksForTodoAggregation(sectionsWrap) {
  const root = sectionsWrap?.closest(".todo-list-view");
  if (!root || !sectionsWrap) return [];
  const omitKpi = sectionsWrap.dataset.lpExcludesKpi === "1";
  const kpiTasks = omitKpi ? [] : getKpiTodosAsTasks();
  const sectionTasks = FIXED_SECTION_IDS_FOR_STORAGE.flatMap((sid) =>
    loadSectionTasks(sid),
  );
  let allTasks = [...kpiTasks, ...sectionTasks];
  const q = (sectionsWrap.dataset.lpEisenhowerFilter || "").trim();
  if (q) {
    const EISENHOWER_LABELS = {
      "urgent-important": "긴급+중요",
      "important-not-urgent": "중요+여유",
      "urgent-not-important": "긴급+덜중요",
      "not-urgent-not-important": "여유+안중요",
    };
    const labelForQ = EISENHOWER_LABELS[q];
    allTasks = allTasks.filter((t) => {
      const v = (t.eisenhower || "").trim();
      return v === q || (labelForQ && v === labelForQ);
    });
  }
  if (sectionsWrap.dataset.lpHideDoneTasks === "1") {
    allTasks = allTasks.filter((t) => !t.done);
  }
  if (root.classList.contains("hide-completed")) {
    allTasks = allTasks.filter((t) => !t.done);
  }
  if (sectionsWrap.dataset.lpHideOverdueTabs === "1") {
    allTasks = allTasks.filter((t) => !(isOverdue(t.dueDate) && !t.done));
  }
  if (root.classList.contains("section-task-filter-todo-only")) {
    allTasks = allTasks.filter(
      (t) => String(t.itemType || "todo").toLowerCase() !== "schedule",
    );
  }
  if (root.classList.contains("section-task-filter-schedule-only")) {
    allTasks = allTasks.filter(
      (t) => String(t.itemType || "todo").toLowerCase() === "schedule",
    );
  }
  return allTasks;
}

/** 마감·시작일 저장 후 날짜 탭 버킷만 서버/메모리 기준으로 다시 구성(카드가 옛 묶음에 남는 문제 방지) */
function refreshTodoDateTabSectionDom(sectionsWrap) {
  const panel = sectionsWrap?.querySelector(
    `.todo-section[data-section="${TODO_DATE_TAB_SECTION_ID}"]`,
  );
  if (!panel) return;
  const root = panel.querySelector(".todo-priority-quadrants");
  if (!root) return;

  const openBuckets = new Map();
  panel.querySelectorAll(".todo-priority-quadrant[data-date-bucket]").forEach(
    (cell) => {
      const key = cell.dataset.dateBucket;
      const head = cell.querySelector(".todo-priority-quadrant-head");
      if (key && head)
        openBuckets.set(key, head.getAttribute("aria-expanded") === "true");
    },
  );

  const listExcludesKpi = sectionsWrap.dataset.lpExcludesKpi === "1";
  const enableDragToCalendar = sectionsWrap.dataset.lpDragCal === "1";
  const enableDragToEisenhower = sectionsWrap.dataset.lpDragEisen === "1";

  function scheduleSave() {
    scheduleSaveSectionTasksFromDOM(sectionsWrap);
  }
  function updateCount() {
    panel.querySelectorAll(".todo-priority-quadrant").forEach((cell) => {
      const cq = cell.querySelector(".todo-priority-quadrant-cards");
      const cntEl = cell.querySelector(".todo-priority-quadrant-count");
      if (cq && cntEl) {
        cntEl.textContent = String(cq.querySelectorAll(".todo-card").length);
      }
    });
    const countSpan = panel.querySelector(".todo-section-count");
    if (countSpan) {
      countSpan.textContent = String(panel.querySelectorAll(".todo-card").length);
    }
  }

  const shared = {
    updateCount,
    sectionsWrap,
    scheduleSave,
    enableDragToEisenhower,
    enableDragToCalendar,
    listExcludesKpi,
  };

  const allTasksForList = gatherFilteredTasksForTodoAggregation(sectionsWrap);
  const now = new Date();
  const partitioned = partitionTasksForDateBuckets(allTasksForList || [], now);
  const todayYear = now.getFullYear();

  root.replaceChildren();

  const ordered = [];
  ordered.push({ key: "past", label: "과거", tasks: partitioned.past });
  ordered.push({ key: "today", label: "오늘", tasks: partitioned.today });
  ordered.push({ key: "tomorrow", label: "내일", tasks: partitioned.tomorrow });
  for (const ymd of partitioned.futureKeys) {
    const arr = partitioned.futureMap.get(ymd);
    if (arr?.length) {
      ordered.push({
        key: ymd,
        label: formatDateBucketTitleYmd(ymd, todayYear),
        tasks: arr,
      });
    }
  }
  if (partitioned.noDate.length) {
    ordered.push({
      key: "none",
      label: "날짜 없음",
      tasks: partitioned.noDate,
    });
  }

  for (const { key, label, tasks: bucketTasks } of ordered) {
    buildDateBucketBlock(root, {
      bucketKey: key,
      label,
      bucketTasks: sortTasksInPriorityBucket(bucketTasks),
      ...shared,
    });
  }

  panel.querySelectorAll(".todo-priority-quadrant[data-date-bucket]").forEach(
    (cell) => {
      const key = cell.dataset.dateBucket;
      const head = cell.querySelector(".todo-priority-quadrant-head");
      const bodyEl = cell.querySelector(".todo-priority-quadrant-body");
      if (!key || !head || !bodyEl) return;
      if (openBuckets.get(key) === true) {
        head.setAttribute("aria-expanded", "true");
        bodyEl.hidden = false;
        cell.classList.add("todo-priority-quadrant--open");
      }
    },
  );
  updateCount();
}

/** 우선순위 탭: 아이젠하워 변경 후 카드가 옛 사분면에 남는 문제 방지 */
function refreshTodoPriorityTabSectionDom(sectionsWrap) {
  const panel = sectionsWrap?.querySelector(
    `.todo-section[data-section="${TODO_PRIORITY_TAB_SECTION_ID}"]`,
  );
  if (!panel) return;
  const root = panel.querySelector(".todo-priority-quadrants");
  if (!root) return;

  const openBuckets = new Map();
  panel.querySelectorAll(".todo-priority-quadrant").forEach((cell) => {
    const key =
      cell.dataset.eisenhowerKey ||
      (cell.classList.contains("todo-priority-quadrant--unassigned")
        ? "__unassigned"
        : "");
    const head = cell.querySelector(".todo-priority-quadrant-head");
    if (key && head)
      openBuckets.set(key, head.getAttribute("aria-expanded") === "true");
  });

  const listExcludesKpi = sectionsWrap.dataset.lpExcludesKpi === "1";
  const enableDragToCalendar = sectionsWrap.dataset.lpDragCal === "1";
  const enableDragToEisenhower = sectionsWrap.dataset.lpDragEisen === "1";

  function scheduleSave() {
    scheduleSaveSectionTasksFromDOM(sectionsWrap);
  }
  function updateCount() {
    panel.querySelectorAll(".todo-priority-quadrant").forEach((cell) => {
      const cq = cell.querySelector(".todo-priority-quadrant-cards");
      const cntEl = cell.querySelector(".todo-priority-quadrant-count");
      if (cq && cntEl) {
        cntEl.textContent = String(cq.querySelectorAll(".todo-card").length);
      }
    });
    const countSpan = panel.querySelector(".todo-section-count");
    if (countSpan) {
      countSpan.textContent = String(panel.querySelectorAll(".todo-card").length);
    }
  }

  const shared = {
    updateCount,
    sectionsWrap,
    scheduleSave,
    enableDragToEisenhower,
    enableDragToCalendar,
    listExcludesKpi,
  };

  const allTasksForList = gatherFilteredTasksForTodoAggregation(sectionsWrap);
  root.replaceChildren();

  for (const { key, label } of PRIORITY_TAB_QUADRANT_DEFS) {
    const bucketTasks = sortTasksInPriorityBucket(
      (allTasksForList || []).filter(
        (t) => normalizeEisenhowerSortKey(t.eisenhower) === key,
      ),
    );
    buildPriorityQuadrantBlock(root, {
      quadrantKey: key,
      label,
      bucketTasks,
      ...shared,
    });
  }

  const unassigned = sortTasksInPriorityBucket(
    (allTasksForList || []).filter(
      (t) => !normalizeEisenhowerSortKey(t.eisenhower),
    ),
  );
  if (unassigned.length > 0) {
    buildPriorityQuadrantBlock(root, {
      quadrantKey: null,
      label: "미지정",
      bucketTasks: unassigned,
      ...shared,
    });
  }

  panel.querySelectorAll(".todo-priority-quadrant").forEach((cell) => {
    const key =
      cell.dataset.eisenhowerKey ||
      (cell.classList.contains("todo-priority-quadrant--unassigned")
        ? "__unassigned"
        : "");
    const head = cell.querySelector(".todo-priority-quadrant-head");
    const bodyEl = cell.querySelector(".todo-priority-quadrant-body");
    if (!key || !head || !bodyEl) return;
    if (openBuckets.get(key) === true) {
      head.setAttribute("aria-expanded", "true");
      bodyEl.hidden = false;
      cell.classList.add("todo-priority-quadrant--open");
    }
  });
  updateCount();
}

function createPriorityTabSection(section, allTasksForList, options) {
  const {
    enableDragToCalendar = false,
    enableDragToEisenhower = false,
    listExcludesKpi = false,
    sectionsWrap: sectionsWrapOpt,
  } = options;

  const wrap = document.createElement("div");
  wrap.className =
    "todo-section todo-section-tab-panel todo-section--priority-board";
  wrap.dataset.section = section.id;

  const countSpan = document.createElement("span");
  countSpan.className = "todo-section-count";
  countSpan.textContent = "0";
  countSpan.style.display = "none";
  wrap.appendChild(countSpan);

  const sectionsWrap = sectionsWrapOpt || wrap.closest(".todo-sections-wrap");

  function scheduleSave() {
    if (!sectionsWrap) return;
    scheduleSaveSectionTasksFromDOM(sectionsWrap);
  }

  function updateCount() {
    wrap.querySelectorAll(".todo-priority-quadrant").forEach((cell) => {
      const cq = cell.querySelector(".todo-priority-quadrant-cards");
      const cntEl = cell.querySelector(".todo-priority-quadrant-count");
      if (cq && cntEl) {
        cntEl.textContent = String(cq.querySelectorAll(".todo-card").length);
      }
    });
    countSpan.textContent = String(wrap.querySelectorAll(".todo-card").length);
  }

  const root = document.createElement("div");
  root.className = "todo-priority-quadrants";
  wrap.appendChild(root);

  const shared = {
    updateCount,
    sectionsWrap,
    scheduleSave,
    enableDragToEisenhower,
    enableDragToCalendar,
    listExcludesKpi,
  };

  for (const { key, label } of PRIORITY_TAB_QUADRANT_DEFS) {
    const bucketTasks = sortTasksInPriorityBucket(
      (allTasksForList || []).filter(
        (t) => normalizeEisenhowerSortKey(t.eisenhower) === key,
      ),
    );
    buildPriorityQuadrantBlock(root, {
      quadrantKey: key,
      label,
      bucketTasks,
      ...shared,
    });
  }

  const unassigned = sortTasksInPriorityBucket(
    (allTasksForList || []).filter(
      (t) => !normalizeEisenhowerSortKey(t.eisenhower),
    ),
  );
  if (unassigned.length > 0) {
    buildPriorityQuadrantBlock(root, {
      quadrantKey: null,
      label: "미지정",
      bucketTasks: unassigned,
      ...shared,
    });
  }

  updateCount();
  return { wrap, updateCount };
}

function createDateBucketsTabSection(section, allTasksForList, options) {
  const {
    enableDragToCalendar = false,
    enableDragToEisenhower = false,
    listExcludesKpi = false,
    sectionsWrap: sectionsWrapOpt,
  } = options;

  const wrap = document.createElement("div");
  wrap.className =
    "todo-section todo-section-tab-panel todo-section--priority-board todo-section--date-board";
  wrap.dataset.section = section.id;

  const countSpan = document.createElement("span");
  countSpan.className = "todo-section-count";
  countSpan.textContent = "0";
  countSpan.style.display = "none";
  wrap.appendChild(countSpan);

  const sectionsWrap = sectionsWrapOpt || wrap.closest(".todo-sections-wrap");

  function scheduleSave() {
    if (!sectionsWrap) return;
    scheduleSaveSectionTasksFromDOM(sectionsWrap);
  }

  function updateCount() {
    wrap.querySelectorAll(".todo-priority-quadrant").forEach((cell) => {
      const cq = cell.querySelector(".todo-priority-quadrant-cards");
      const cntEl = cell.querySelector(".todo-priority-quadrant-count");
      if (cq && cntEl) {
        cntEl.textContent = String(cq.querySelectorAll(".todo-card").length);
      }
    });
    countSpan.textContent = String(wrap.querySelectorAll(".todo-card").length);
  }

  const root = document.createElement("div");
  root.className = "todo-priority-quadrants";
  wrap.appendChild(root);

  const shared = {
    updateCount,
    sectionsWrap,
    scheduleSave,
    enableDragToEisenhower,
    enableDragToCalendar,
    listExcludesKpi,
  };

  const now = new Date();
  const partitioned = partitionTasksForDateBuckets(allTasksForList || [], now);
  const todayYear = now.getFullYear();
  const ordered = [];
  ordered.push({ key: "past", label: "과거", tasks: partitioned.past });
  ordered.push({ key: "today", label: "오늘", tasks: partitioned.today });
  ordered.push({ key: "tomorrow", label: "내일", tasks: partitioned.tomorrow });
  for (const ymd of partitioned.futureKeys) {
    const arr = partitioned.futureMap.get(ymd);
    if (arr?.length) {
      ordered.push({
        key: ymd,
        label: formatDateBucketTitleYmd(ymd, todayYear),
        tasks: arr,
      });
    }
  }
  if (partitioned.noDate.length) {
    ordered.push({
      key: "none",
      label: "날짜 없음",
      tasks: partitioned.noDate,
    });
  }

  for (const { key, label, tasks: bucketTasks } of ordered) {
    buildDateBucketBlock(root, {
      bucketKey: key,
      label,
      bucketTasks: sortTasksInPriorityBucket(bucketTasks),
      ...shared,
    });
  }

  updateCount();
  return { wrap, updateCount };
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
    listExcludesKpi = false,
  } = options;
  container.innerHTML = "";
  const results = [];
  const sections = sectionsOverride || getSections();
  sections.forEach((section) => {
    const sectionTasks =
      section.id === TODO_PRIORITY_TAB_SECTION_ID ||
      section.id === TODO_DATE_TAB_SECTION_ID
        ? tasksData
        : tasksData.filter((t) => t.sectionId === section.id);
    const sectionOpts = {
      lastColHeader: "분류",
      initialTasks: sectionTasks,
      showCategoryCol: false,
      sectionIdForAdd:
        section.id === "overdue" ||
        section.id === TODO_PRIORITY_TAB_SECTION_ID ||
        section.id === TODO_DATE_TAB_SECTION_ID
          ? null
          : section.id === "tasks"
            ? "dream"
            : section.id,
      hideCategoryCol: true,
      tabMode,
      showCheckboxTypeMenu,
      enableDragToCalendar,
      enableDragToEisenhower,
      enableDragOverdueToCalendar:
        section.id === "overdue" && enableDragToCalendar,
      hideAddRow: true,
      overdueColumnOrder: section.id === "overdue",
      eisenhowerSidebarFirst:
        eisenhowerSidebarFirst && section.id !== "overdue",
      cardLayout:
        cardLayout ||
        section.id === "overdue" ||
        section.id === TODO_PRIORITY_TAB_SECTION_ID ||
        section.id === TODO_DATE_TAB_SECTION_ID,
      sectionsWrap: container,
      categoryUiSignal,
      listExcludesKpi,
    };
    const { wrap, updateCount } =
      section.id === TODO_PRIORITY_TAB_SECTION_ID
        ? createPriorityTabSection(section, sectionTasks, sectionOpts)
        : section.id === TODO_DATE_TAB_SECTION_ID
          ? createDateBucketsTabSection(section, sectionTasks, sectionOpts)
          : createSection(section, sectionOpts);
    container.appendChild(wrap);
    results.push({ section, wrap, updateCount });
  });
  return results;
}

/** 사이드바 「기한 초과」: 고정 섹션 메모리만 (KPI 할 일 제외 — KPI 화면 전용) */
function buildOverdueTasksForSidebar() {
  const sectionTasks = FIXED_SECTION_IDS_FOR_STORAGE.flatMap((sid) =>
    loadSectionTasks(sid),
  );
  return sectionTasks
    .filter((t) => isOverdue(t.dueDate) && !t.done)
    .map((t) => ({ ...t, sourceSectionId: t.sectionId, sectionId: "overdue" }));
}

function isOverdue(dueStr) {
  if (!dueStr || !dueStr.trim()) return false;
  const parts = String(dueStr).trim().split(/[-/]/);
  if (parts.length < 3) return false;
  const due = new Date(
    parseInt(parts[0], 10),
    parseInt(parts[1], 10) - 1,
    parseInt(parts[2], 10),
  );
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

export function render(options = {}) {
  const {
    hideToolbar = false,
    hideHeader = false,
    /** null 이어도 됨 — categoryToolbarRightActions 면 카테고리 줄 우측에 설정 배치 */
    settingsSlot = null,
    enableDragToCalendar = false,
    enableDragToEisenhower = false,
    initialActiveTabIndex: initialActiveTabIndexOpt,
    eisenhowerFilter = "",
    eisenhowerSidebarFirst = false,
    /** 우선순위 정렬·날짜 정하기 등: 완료된 할일은 목록에 넣지 않음 */
    hideDoneTasks = false,
    /**
     * 캘린더·아이젠하워 사이드바: 마감 지난 미완료는 카테고리 탭에서 빼고 아래 「기한 초과」에만 표시
     */
    hideOverdueFromCategoryTabs = false,
    /** true: KPI에서 만든 할일을 이 목록에 넣지 않음(기본). KPI 할일은 KPI 화면에서만 다룸 */
    omitKpiTodos = true,
    /** 할일/일정 상단 줄(settingsSlot)의 설정 버튼 DOM을 그대로 쓰고 새로 만들지 않음(탭 진입 후 pull 소프트 갱신 시 아이콘 깜빡임 방지) */
    reuseSettingsButtonEl = null,
    /** 할일/일정: 꿈·부수입 탭 줄 우측에 + / 설정 */
    categoryToolbarRightActions = false,
    /** 캘린더 사이드바: +·설정을 헤더(.calendar-todo-sidebar-toolbar-actions)에 붙일 때 */
    categoryToolbarActionsSlot = null,
    /** 캘린더 **할일 사이드바**에만 true — 메인 할일 탭과 탭 인덱스 sessionStorage 공유 시 날짜 탭으로 강제 전환·스크롤되는 문제 방지 */
    calendarSidebarEmbed = false,
  } = options;
  const hasExplicitInitialTab = Object.prototype.hasOwnProperty.call(
    options,
    "initialActiveTabIndex",
  );
  const useSidebarHeaderToolbarActions =
    categoryToolbarRightActions &&
    categoryToolbarActionsSlot &&
    typeof categoryToolbarActionsSlot.replaceChildren === "function";

  /** 메인 할일 탭만 마지막 본 탭 유지. 캘린더 사이드바는 메인과 키를 공유하지 않음 */
  const persistFixedListTabToSession =
    !hideToolbar && !hasExplicitInitialTab && !calendarSidebarEmbed;
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
  const reusedSettings =
    reuseSettingsButtonEl &&
    reuseSettingsButtonEl.isConnected &&
    reuseSettingsButtonEl.classList?.contains("todo-list-settings-btn");
  const settingsBtn = reusedSettings
    ? reuseSettingsButtonEl
    : (() => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "todo-list-toolbar-btn todo-list-settings-btn";
        b.title = "할 일 환경 설정";
        b.innerHTML = TODO_TOOLBAR_SETTINGS_ICON;
        return b;
      })();

  const initialSettings = getTodoSettings();
  let hideCompleted = initialSettings.hideCompleted;
  el.classList.toggle("hide-completed", hideCompleted);
  const initialListFilter = normalizeSectionTaskListFilter(
    initialSettings.sectionTaskListFilter,
  );
  el.classList.toggle(
    "section-task-filter-todo-only",
    initialListFilter === "todo_only",
  );
  el.classList.toggle(
    "section-task-filter-schedule-only",
    initialListFilter === "schedule_only",
  );

  async function runClearCompletedConfirmed() {
    /* 완료 표시가 저장소와 어긋나도 DOM 기준으로 잡기 위해 먼저 한 번 저장 */
    try {
      const panel = document.querySelector(".app-tab-panel");
      if (panel) saveTodoListBeforeUnmount(panel);
    } catch (_) {}
    removeAllCompletedSubtasksFromStore();
    /* calendar_section_tasks: 서버에서 done=true 행만 DELETE → SELECT 로 세션 메모리 일치. 실패 시 기존 로컬 제거 */
    let syncedFromServer = false;
    try {
      const del = await deleteCompletedCalendarSectionTasksFromSupabase();
      if (del?.ok) {
        await pullCalendarSectionTasksFromSupabase({ reason: "clear_completed" });
        syncedFromServer = true;
      }
    } catch (_) {}
    if (!syncedFromServer) {
      const { fixed, custom, changed } = purgeAllCompletedSectionAndCustomTasks();
      if (changed) {
        persistSectionTasksAndSchedule(fixed);
        persistCustomSectionTasksAndSchedule(custom);
      }
    }
    try {
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

  settingsBtn.addEventListener(
    "click",
    () => {
      createTodoSettingsModal({
        onHideCompletedChange: (v) => {
          hideCompleted = v;
          el.classList.toggle("hide-completed", hideCompleted);
        },
        onSectionTaskListFilterChange: (mode) => {
          const m = normalizeSectionTaskListFilter(mode);
          el.classList.toggle("section-task-filter-todo-only", m === "todo_only");
          el.classList.toggle(
            "section-task-filter-schedule-only",
            m === "schedule_only",
          );
          updateTabLabels();
        },
        onClearCompleted: promptClearCompleted,
      });
    },
    { signal: listUiSignal },
  );

  if (settingsSlot && !categoryToolbarRightActions) {
    if (!settingsSlot.contains(settingsBtn)) {
      settingsSlot.appendChild(settingsBtn);
    }
  } else if (!settingsSlot && !categoryToolbarRightActions) {
    toolbar.appendChild(settingsBtn);
  }

  if (categoryToolbarRightActions) {
    settingsBtn.classList.add("time-ledger-toolbar-icon-btn");
  }

  const categoryTabs = document.createElement("div");
  categoryTabs.className = "todo-category-tabs";
  const tabButtons = [];

  function syncTodoListSegmentThumb() {
    if (!categoryTabs.classList.contains("time-view-tabs--segmented")) return;
    const btns = [...categoryTabs.querySelectorAll(".time-view-tab")];
    const n = Math.max(1, btns.length);
    const idx = Math.max(
      0,
      btns.findIndex((b) => b.classList.contains("active")),
    );
    categoryTabs.style.setProperty("--time-segment-count", String(n));
    categoryTabs.style.setProperty("--thumb-col-start", String(idx + 1));
  }

  if (categoryToolbarRightActions) {
    categoryTabs.classList.add(
      "time-view-tabs",
      "time-view-tabs--segmented",
      "todo-list-segment-tabs",
    );
    const thumb = document.createElement("span");
    thumb.className = "time-view-tabs-thumb";
    thumb.setAttribute("aria-hidden", "true");
    categoryTabs.appendChild(thumb);
  }

  /* 할일/일정: 고정 5개 탭(꿈, 부수입, 건강, 행복, 우선순위), 리스트 추가 비노출 */
  FIXED_SECTIONS.forEach((section) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = categoryToolbarRightActions
      ? "todo-category-tab time-view-tab"
      : "todo-category-tab";
    btn.dataset.section = section.id;
    btn.setAttribute("aria-label", section.label);
    btn.title = section.label;
    const iconSrc = TODO_LIST_TAB_ICON_BY_SECTION_ID[section.id] || "";
    const iconHtml = iconSrc
      ? `<img class="todo-category-tab-icon" src="${iconSrc}" alt="" aria-hidden="true" decoding="async" loading="lazy" style="display:none" />`
      : "";
    btn.innerHTML = `${iconHtml}<span class="todo-category-tab-label">${section.label}</span> <span class="todo-category-tab-count">0</span>`;
    tabButtons.push(btn);
    categoryTabs.appendChild(btn);
  });

  let quickAddBtn = null;
  if (categoryToolbarRightActions) {
    syncTodoListSegmentThumb();
    quickAddBtn = document.createElement("button");
    quickAddBtn.type = "button";
    quickAddBtn.className =
      "todo-list-toolbar-quick-add todo-add-btn time-ledger-add-plus-btn";
    quickAddBtn.title = "할 일 추가";
    quickAddBtn.innerHTML = CALENDAR_TOOLBAR_QUICK_ADD_ICON;
    quickAddBtn.addEventListener("click", () => {
      const panel = el.querySelector(
        ".todo-section.todo-section-tab-panel.is-active",
      );
      const innerAdd = panel?.querySelector(
        ".todo-cards-add-wrap .todo-cards-add-btn",
      );
      if (innerAdd) {
        innerAdd.click();
        return;
      }
      /* 우선순위·날짜 탭에는 카드열 + 버튼 없음 → 꿈 탭과 동일하게 추가 모달(기본 저장 섹션 dream) */
      const fallbackAdd = el.querySelector(
        `.todo-section.todo-section-tab-panel[data-section="dream"] .todo-cards-add-btn`,
      );
      fallbackAdd?.click();
    });
  }

  const toolbarRow = document.createElement("div");
  if (categoryToolbarRightActions) {
    toolbarRow.className = "todo-list-tabs-filter-row";
    const tabsTopMargin = document.createElement("div");
    tabsTopMargin.className = "todo-list-tabs-top-margin";
    const tabHeaderRow = document.createElement("div");
    tabHeaderRow.className = "todo-list-tab-header-row";
    const leftStrip = document.createElement("div");
    leftStrip.className = "todo-list-top-strip__left";
    const leftIcons = document.createElement("div");
    leftIcons.className = "time-ledger-toolbar-icons";
    leftIcons.appendChild(settingsBtn);
    leftStrip.appendChild(leftIcons);
    const centerStrip = document.createElement("div");
    centerStrip.className = "todo-list-top-strip__center";
    centerStrip.appendChild(categoryTabs);
    const rightStrip = document.createElement("div");
    rightStrip.className = "todo-list-top-strip__right";
    const rightIcons = document.createElement("div");
    rightIcons.className = "time-ledger-toolbar-icons";
    if (quickAddBtn) rightIcons.appendChild(quickAddBtn);
    rightStrip.appendChild(rightIcons);
    tabHeaderRow.appendChild(leftStrip);
    tabHeaderRow.appendChild(centerStrip);
    tabHeaderRow.appendChild(rightStrip);
    toolbarRow.appendChild(tabsTopMargin);
    toolbarRow.appendChild(tabHeaderRow);
    if (useSidebarHeaderToolbarActions && categoryToolbarActionsSlot) {
      try {
        categoryToolbarActionsSlot.replaceChildren();
      } catch (_) {}
    }
  } else {
    toolbarRow.className = "todo-list-toolbar-row";
    toolbarRow.appendChild(categoryTabs);
    if (!settingsSlot) {
      toolbarRow.appendChild(toolbar);
    }
  }
  el.appendChild(toolbarRow);

  const sectionsWrap = document.createElement("div");
  sectionsWrap.className = "todo-sections-wrap todo-tab-panels";
  if (omitKpiTodos) sectionsWrap.dataset.lpExcludesKpi = "1";
  sectionsWrap.dataset.lpDragCal = enableDragToCalendar ? "1" : "0";
  sectionsWrap.dataset.lpDragEisen = enableDragToEisenhower ? "1" : "0";
  sectionsWrap.dataset.lpHideOverdueTabs = hideOverdueFromCategoryTabs ? "1" : "0";
  sectionsWrap.dataset.lpHideDoneTasks = hideDoneTasks ? "1" : "0";
  sectionsWrap.dataset.lpEisenhowerFilter = (eisenhowerFilter || "").trim();

  const { menu: checkboxTypeMenu, show: showCheckboxTypeMenu } =
    createTodoCheckboxTypeMenu();
  checkboxTypeMenu.hidden = true;
  el.appendChild(checkboxTypeMenu);

  const kpiTasks = omitKpiTodos ? [] : getKpiTodosAsTasks();
  const sectionTasks = FIXED_SECTION_IDS_FOR_STORAGE.flatMap((sid) =>
    loadSectionTasks(sid),
  );
  let allTasks = [...kpiTasks, ...sectionTasks];
  if ((eisenhowerFilter || "").trim()) {
    const q = (eisenhowerFilter || "").trim();
    const EISENHOWER_LABELS = {
      "urgent-important": "긴급+중요",
      "important-not-urgent": "중요+여유",
      "urgent-not-important": "긴급+덜중요",
      "not-urgent-not-important": "여유+안중요",
    };
    const labelForQ = EISENHOWER_LABELS[q];
    allTasks = allTasks.filter((t) => {
      const v = (t.eisenhower || "").trim();
      return v === q || (labelForQ && v === labelForQ);
    });
  }
  if (hideDoneTasks) {
    allTasks = allTasks.filter((t) => !t.done);
  }
  if (hideOverdueFromCategoryTabs) {
    allTasks = allTasks.filter((t) => !(isOverdue(t.dueDate) && !t.done));
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
    listExcludesKpi: omitKpiTodos,
  });

  function taskItemPassesSectionListFilter(domEl) {
    const t = String(domEl?.dataset?.itemType || "todo").toLowerCase();
    if (el.classList.contains("section-task-filter-todo-only") && t === "schedule") {
      return false;
    }
    if (
      el.classList.contains("section-task-filter-schedule-only") &&
      t !== "schedule"
    ) {
      return false;
    }
    return true;
  }

  function updateTabLabels() {
    tabButtons.forEach((btn, i) => {
      const sec = sectionResults[i]?.wrap;
      if (!sec) {
        btn.querySelector(".todo-category-tab-count").textContent = "0";
        return;
      }
      const isAggregationBoard = TODO_AGGREGATION_TAB_IDS.includes(
        sec.dataset.section || "",
      );
      const cardsWrap = sec.querySelector(".todo-cards-wrap");
      let count;
      if (isAggregationBoard) {
        count = [...sec.querySelectorAll(".todo-card")].filter((c) =>
          taskItemPassesSectionListFilter(c),
        ).length;
      } else if (cardsWrap) {
        count = [...cardsWrap.querySelectorAll(".todo-card")].filter((c) =>
          taskItemPassesSectionListFilter(c),
        ).length;
      } else {
        count = [
          ...sec.querySelectorAll(".todo-task-row:not(.todo-subtask-row)"),
        ].filter((r) => taskItemPassesSectionListFilter(r)).length;
      }
      btn.querySelector(".todo-category-tab-count").textContent = String(count);
    });
    syncTodoListSegmentThumb();
  }
  updateTabLabels();

  let initialActiveTabIndex = 0;
  if (hasExplicitInitialTab) {
    initialActiveTabIndex = Math.max(
      0,
      Math.min(Number(initialActiveTabIndexOpt) || 0, tabButtons.length - 1),
    );
  } else if (persistFixedListTabToSession) {
    try {
      const raw = sessionStorage.getItem(SESSION_TODO_FIXED_TAB_INDEX);
      if (raw != null) {
        const n = parseInt(raw, 10);
        if (!Number.isNaN(n) && n >= 0 && n < tabButtons.length)
          initialActiveTabIndex = n;
      }
    } catch (_) {}
  }

  const safeIndex = Math.max(
    0,
    Math.min(initialActiveTabIndex, tabButtons.length - 1),
  );
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
      syncTodoListSegmentThumb();

      const subView = (btn.dataset.section || "").trim();
      void (async () => {
        try {
          const saveRoot = el.closest(".app-tab-panel") || el;
          if (saveRoot) saveTodoListBeforeUnmount(saveRoot);
        } catch (_) {}
        try {
          await pullCalendarSectionTasksFromSupabase({
            reason: "todo_list_category_tab",
            subView: subView || "unknown",
          });
        } catch (_) {}
        const inCalendarTodoSidebar = !!el.closest(".todo-list-in-sidebar");
        if (inCalendarTodoSidebar) {
          const layout = el.closest(".calendar-monthly-layout");
          try {
            layout?._lpRefreshCalendarView?.();
          } catch (_) {}
          try {
            layout?._lpRefreshDateTodoSidebar?.();
          } catch (_) {}
        } else {
          try {
            if (typeof window !== "undefined" && window.__lpRenderMain) {
              window.__lpRenderMain({ skipTodoSaveBeforeUnmount: true });
            }
          } catch (_) {}
        }
      })();
    });
  });
  tabButtons.forEach((b, i) => b.classList.toggle("active", i === safeIndex));
  syncTodoListSegmentThumb();

  el.appendChild(sectionsWrap);

  const observer = new MutationObserver(() => {
    updateTabLabels();
  });
  sectionResults.forEach(({ wrap }) => {
    if (TODO_AGGREGATION_TAB_IDS.includes(wrap.dataset.section || "")) {
      observer.observe(wrap, { childList: true, subtree: true });
    } else {
      const target =
        wrap.querySelector(".todo-cards-wrap") || wrap.querySelector("tbody");
      if (target) observer.observe(target, { childList: true });
    }
  });
  listUiSignal.addEventListener("abort", () => {
    try {
      observer.disconnect();
    } catch (_) {}
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
    hideOverdueFromCategoryTabs: true,
  });
  mainList.classList.add("todo-list-eisenhower-sidebar");

  const overdueTasks = buildOverdueTasksForSidebar();

  const overdueWrap = document.createElement("div");
  overdueWrap.className = "todo-eisenhower-overdue-section";
  renderSections(overdueWrap, overdueTasks, {
    tabMode: false,
    showCheckboxTypeMenu: null,
    enableDragToCalendar: false,
    enableDragToEisenhower,
    sectionsOverride: [{ id: "overdue", label: "기한 초과" }],
    listExcludesKpi: true,
  });

  mainList.appendChild(overdueWrap);
  return mainList;
}

/** 날짜 정하기 사이드바용: 기한 초과 섹션만 반환 (할일 목록 60% / 기한 초과 40% 분할 시 아래 40%에 넣음) */
export function renderOverdueSection(options = {}) {
  const { enableDragToCalendar = true } = options;
  const overdueTasks = buildOverdueTasksForSidebar();

  const overdueWrap = document.createElement("div");
  overdueWrap.className =
    "todo-eisenhower-overdue-section todo-overdue-in-date-sidebar";
  renderSections(overdueWrap, overdueTasks, {
    tabMode: false,
    showCheckboxTypeMenu: null,
    enableDragToCalendar,
    enableDragToEisenhower: false,
    sectionsOverride: [{ id: "overdue", label: "기한 초과" }],
    listExcludesKpi: true,
  });
  return overdueWrap;
}
