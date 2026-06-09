/**
 * 행복 KPI 맵 ↔ Supabase 정규화 테이블 (happiness_map_*)
 * 로컬 키 kpi-happiness-map (happinesses, kpis, kpiLogs, …)
 */

import { supabase } from "../supabase.js";
import { kpiSyncDebugLog, kpiSyncDebugEnabled, kpiSyncPayloadSummary, kpiSyncTrace } from "./kpiSyncDebug.js";
import { logKpiServerSnapshot } from "./kpiServerAuditLog.js";
import { bumpEntityArrayLocalModified, serverUpdatedAtFromRow } from "./kpiMapLwwMerge.js";
import { lpPullDebug } from "./lpPullDebug.js";
import {
  deletedRefsKpiTodosLen,
  kpiTodoLifecycleLog,
  kpiTodoLifecyclePullCompare,
  kpiTodoSnapshotBrief,
  kpiTodosCompletionBrief,
} from "./kpiTodoLifecycleDebug.js";
import {
  mapDbRowToKpiDailyTodo,
  normalizeKpiDailyTodoIdentity,
  scrubKpiIdsFromDailyTodoDeletedRefs,
  sortNormalizedKpiTodoRows,
} from "./kpiMapTodoListOrder.js";
import { KPI_LOG_SOURCE_MANUAL, KPI_LOG_SOURCE_TIME_LEDGER, kpiLogMetaFromDbRow } from "./kpiLogFields.js";
import {
  readKpiMapScopedStorageRaw,
  writeKpiMapScopedStorageRaw,
} from "./kpiMapLocalStorage.js";

export const HAPPINESS_KPI_MAP_STORAGE_KEY = "kpi-happiness-map";

/** 행복 탭 — 상위 「행복 목표」 없이 KPI만 (건강 KPI global scope 와 동일) */
export const HAPPINESS_KPI_GLOBAL_SCOPE_ID = "__happiness_global__";

/** @deprecated flattenHappinessMapForKpiOnlyTab 로 이전됨 */
export const DEFAULT_HAPPINESS_CATEGORY_ID = "__lp_default_happiness__";

function happinessKpiBelongsToTabScope(kpi) {
  const hid = String(kpi?.happinessId ?? "").trim();
  return !hid || hid === HAPPINESS_KPI_GLOBAL_SCOPE_ID;
}

/**
 * happinesses(행복 목표) 제거 · 모든 KPI를 global scope 로 통합
 */
export function flattenHappinessMapForKpiOnlyTab(payload) {
  const p = payload && typeof payload === "object" ? payload : emptyPayload();
  const happinesses = Array.isArray(p.happinesses) ? p.happinesses : [];
  const kpis = Array.isArray(p.kpis) ? [...p.kpis] : [];
  const kpiOrderIn = p.kpiOrder && typeof p.kpiOrder === "object" ? { ...p.kpiOrder } : {};
  const deletedRefs = normalizeDeletedRefs(p.deletedRefs);

  const mergedOrder = [
    ...(Array.isArray(kpiOrderIn[HAPPINESS_KPI_GLOBAL_SCOPE_ID])
      ? kpiOrderIn[HAPPINESS_KPI_GLOBAL_SCOPE_ID]
      : []),
  ];
  const seenOrder = new Set(mergedOrder.map(String));

  for (const h of happinesses) {
    const hid = String(h?.id ?? "").trim();
    if (
      hid &&
      hid !== HAPPINESS_KPI_GLOBAL_SCOPE_ID &&
      !deletedRefs.categories.includes(hid)
    ) {
      deletedRefs.categories.push(hid);
    }
    const ord = kpiOrderIn[hid];
    if (Array.isArray(ord)) {
      for (const kid of ord) {
        const id = String(kid ?? "").trim();
        if (id && !seenOrder.has(id)) {
          mergedOrder.push(id);
          seenOrder.add(id);
        }
      }
    }
  }

  let kpisChanged = false;
  const nextKpis = kpis.map((k) => {
    if (happinessKpiBelongsToTabScope(k) && String(k.happinessId ?? "") === HAPPINESS_KPI_GLOBAL_SCOPE_ID) {
      return k;
    }
    kpisChanged = true;
    return { ...k, happinessId: HAPPINESS_KPI_GLOBAL_SCOPE_ID };
  });
  for (const k of nextKpis) {
    const id = String(k?.id ?? "").trim();
    if (id && !seenOrder.has(id)) {
      mergedOrder.push(id);
      seenOrder.add(id);
    }
  }

  let logsChanged = false;
  const nextLogs = (Array.isArray(p.kpiLogs) ? p.kpiLogs : []).map((l) => {
    const hid = String(l?.happinessId ?? "").trim();
    if (!hid || hid === HAPPINESS_KPI_GLOBAL_SCOPE_ID) return l;
    logsChanged = true;
    return { ...l, happinessId: HAPPINESS_KPI_GLOBAL_SCOPE_ID };
  });

  const kpiOrder = { [HAPPINESS_KPI_GLOBAL_SCOPE_ID]: mergedOrder };
  const catsRemoved = happinesses.length > 0;
  if (!kpisChanged && !logsChanged && !catsRemoved && mergedOrder.length === (kpiOrderIn[HAPPINESS_KPI_GLOBAL_SCOPE_ID]?.length || 0)) {
    const onlyGlobal =
      Object.keys(kpiOrderIn).length <= 1 &&
      (!Object.keys(kpiOrderIn).length ||
        (Object.keys(kpiOrderIn).length === 1 &&
          HAPPINESS_KPI_GLOBAL_SCOPE_ID in kpiOrderIn));
    if (onlyGlobal && !deletedRefs.categories.length) return p;
  }

  return {
    ...p,
    happinesses: [],
    kpis: nextKpis,
    kpiLogs: nextLogs,
    kpiOrder,
    deletedRefs,
  };
}

/** 기본 행복 KPI — 삭제 불가, 수정 가능 */
export const DEFAULT_CHORE_TASK_KPI_ID = "__lp_default_kpi_chore_tasks__";
export const DEFAULT_MORNING_ROUTINE_KPI_ID = "__lp_default_kpi_morning_routine__";
export const DEFAULT_MOVE_ROUTINE_KPI_ID = "__lp_default_kpi_move_routine__";
export const DEFAULT_TIDY_ROUTINE_KPI_ID = "__lp_default_kpi_tidy_routine__";
export const DEFAULT_OUT_PREP_ROUTINE_KPI_ID = "__lp_default_kpi_out_prep_routine__";
export const DEFAULT_OUT_AFTER_ROUTINE_KPI_ID = "__lp_default_kpi_out_after_routine__";
export const DEFAULT_BEDTIME_ROUTINE_KPI_ID = "__lp_default_kpi_bedtime_routine__";

const PROTECTED_DEFAULT_HAPPINESS_KPI_IDS = new Set([
  DEFAULT_CHORE_TASK_KPI_ID,
  DEFAULT_MORNING_ROUTINE_KPI_ID,
  DEFAULT_MOVE_ROUTINE_KPI_ID,
  DEFAULT_TIDY_ROUTINE_KPI_ID,
  DEFAULT_OUT_PREP_ROUTINE_KPI_ID,
  DEFAULT_OUT_AFTER_ROUTINE_KPI_ID,
  DEFAULT_BEDTIME_ROUTINE_KPI_ID,
]);

export function isProtectedDefaultHappinessKpiId(id) {
  return PROTECTED_DEFAULT_HAPPINESS_KPI_IDS.has(String(id ?? ""));
}

function createDefaultHappinessKpi(overrides) {
  return {
    happinessId: HAPPINESS_KPI_GLOBAL_SCOPE_ID,
    direction: "higher",
    useTimeAsUnit: false,
    needHabitTracker: false,
    useTaskCompletionGoal: false,
    unit: "",
    targetValue: "",
    targetStartDate: "",
    targetDeadline: "",
    targetTimeRequired: "",
    ...overrides,
  };
}

/** 태스크 완료형 — 고정 KPI 맨 위 */
export function createDefaultChoreTaskKpi() {
  return createDefaultHappinessKpi({
    id: DEFAULT_CHORE_TASK_KPI_ID,
    name: "잡무 처리하기",
    useTaskCompletionGoal: true,
  });
}

/** 매일 반복 · 목표값·단위는 선택(시간 기록 «오늘의 수행값» 연동) */
export function createDefaultMorningRoutineKpi() {
  return createDefaultHappinessKpi({
    id: DEFAULT_MORNING_ROUTINE_KPI_ID,
    name: "모닝 루틴",
    needHabitTracker: true,
  });
}

export function createDefaultMoveRoutineKpi() {
  return createDefaultHappinessKpi({
    id: DEFAULT_MOVE_ROUTINE_KPI_ID,
    name: "이동 루틴",
    needHabitTracker: true,
  });
}

export function createDefaultTidyRoutineKpi() {
  return createDefaultHappinessKpi({
    id: DEFAULT_TIDY_ROUTINE_KPI_ID,
    name: "정리루틴",
    needHabitTracker: true,
  });
}

export function createDefaultOutPrepRoutineKpi() {
  return createDefaultHappinessKpi({
    id: DEFAULT_OUT_PREP_ROUTINE_KPI_ID,
    name: "외출 준비 루틴",
    needHabitTracker: true,
  });
}

export function createDefaultOutAfterRoutineKpi() {
  return createDefaultHappinessKpi({
    id: DEFAULT_OUT_AFTER_ROUTINE_KPI_ID,
    name: "외출 후 루틴",
    needHabitTracker: true,
  });
}

export function createDefaultBedtimeRoutineKpi() {
  return createDefaultHappinessKpi({
    id: DEFAULT_BEDTIME_ROUTINE_KPI_ID,
    name: "취침 루틴",
    needHabitTracker: true,
  });
}

/** 고정 KPI 목록 순서(맨 위 → 아래) */
const DEFAULT_HAPPINESS_KPI_ORDER = [
  DEFAULT_CHORE_TASK_KPI_ID,
  DEFAULT_MORNING_ROUTINE_KPI_ID,
  DEFAULT_MOVE_ROUTINE_KPI_ID,
  DEFAULT_TIDY_ROUTINE_KPI_ID,
  DEFAULT_OUT_PREP_ROUTINE_KPI_ID,
  DEFAULT_OUT_AFTER_ROUTINE_KPI_ID,
  DEFAULT_BEDTIME_ROUTINE_KPI_ID,
];

const DEFAULT_HAPPINESS_KPI_FACTORIES = [
  createDefaultChoreTaskKpi,
  createDefaultMorningRoutineKpi,
  createDefaultMoveRoutineKpi,
  createDefaultTidyRoutineKpi,
  createDefaultOutPrepRoutineKpi,
  createDefaultOutAfterRoutineKpi,
  createDefaultBedtimeRoutineKpi,
];

const DEFAULT_HAPPINESS_HABIT_KPI_MIGRATIONS = [
  { id: DEFAULT_MORNING_ROUTINE_KPI_ID, name: "모닝 루틴" },
  { id: DEFAULT_MOVE_ROUTINE_KPI_ID, name: "이동 루틴" },
  { id: DEFAULT_TIDY_ROUTINE_KPI_ID, name: "정리루틴" },
  { id: DEFAULT_OUT_PREP_ROUTINE_KPI_ID, name: "외출 준비 루틴" },
  { id: DEFAULT_OUT_AFTER_ROUTINE_KPI_ID, name: "외출 후 루틴" },
  { id: DEFAULT_BEDTIME_ROUTINE_KPI_ID, name: "취침 루틴" },
];

/** 기본 루틴 KPI — 매일하기 유지, 사용자가 넣은 목표값·단위는 지우지 않음 */
function migrateDefaultHappinessHabitKpis(kpis) {
  let changed = false;
  let next = kpis || [];
  for (const { id, name } of DEFAULT_HAPPINESS_HABIT_KPI_MIGRATIONS) {
    next = next.map((k) => {
      if (String(k?.id ?? "") !== id) return k;
      const displayName = String(k.name || "").trim() || name;
      const alreadyHabitMode =
        !!k.needHabitTracker &&
        !k.useTimeAsUnit &&
        !k.useTaskCompletionGoal;
      if (alreadyHabitMode && displayName === String(k.name || "").trim()) {
        return k;
      }
      changed = true;
      return {
        ...k,
        name: displayName,
        needHabitTracker: true,
        useTimeAsUnit: false,
        useTaskCompletionGoal: false,
        unit: String(k.unit ?? "").trim(),
        targetValue: String(k.targetValue ?? "").trim(),
        targetStartDate: "",
        targetDeadline: "",
        targetTimeRequired: "",
      };
    });
  }
  return { kpis: changed ? next : kpis, changed };
}

const DEFAULT_HAPPINESS_TASK_COMPLETION_KPI_MIGRATIONS = [
  { id: DEFAULT_CHORE_TASK_KPI_ID, name: "잡무 처리하기" },
];

/** 기본 태스크 완료형 KPI — 과제 완료 목표 유지 */
function migrateDefaultHappinessTaskCompletionKpis(kpis) {
  let changed = false;
  let next = kpis || [];
  for (const { id, name } of DEFAULT_HAPPINESS_TASK_COMPLETION_KPI_MIGRATIONS) {
    next = next.map((k) => {
      if (String(k?.id ?? "") !== id) return k;
      const displayName = String(k.name || "").trim() || name;
      if (
        k.useTaskCompletionGoal &&
        !k.needHabitTracker &&
        !k.useTimeAsUnit &&
        displayName === (k.name || "").trim()
      ) {
        return k;
      }
      changed = true;
      return {
        ...k,
        name: displayName,
        needHabitTracker: false,
        useTimeAsUnit: false,
        useTaskCompletionGoal: true,
        unit: "",
        targetValue: "",
        targetStartDate: "",
        targetDeadline: "",
        targetTimeRequired: "",
      };
    });
  }
  return { kpis: changed ? next : kpis, changed };
}

/** @param {string[]} orderIds @param {string[]} allKpiIds */
function applyDefaultHappinessKpiOrder(orderIds, allKpiIds) {
  const prev = Array.isArray(orderIds) ? [...orderIds] : [];
  const allSet = new Set(allKpiIds.map(String));
  const pinned = DEFAULT_HAPPINESS_KPI_ORDER.filter((id) => allSet.has(id));
  const rest = [];
  for (const id of prev) {
    if (allSet.has(id) && !DEFAULT_HAPPINESS_KPI_ORDER.includes(id)) rest.push(id);
  }
  for (const id of allSet) {
    if (!DEFAULT_HAPPINESS_KPI_ORDER.includes(id) && !prev.includes(id)) {
      rest.push(id);
    }
  }
  return [...pinned, ...rest];
}

export function ensureDefaultHappinessKpis(payload) {
  const p = payload && typeof payload === "object" ? payload : emptyPayload();
  const kpis = Array.isArray(p.kpis) ? [...p.kpis] : [];
  const existingIds = new Set(kpis.map((k) => String(k.id)));

  const toPrepend = [];
  for (const create of DEFAULT_HAPPINESS_KPI_FACTORIES) {
    const def = create();
    if (existingIds.has(def.id)) continue;
    toPrepend.push(def);
    existingIds.add(def.id);
  }

  const deletedRefs = normalizeDeletedRefs(p.deletedRefs);
  const nextDeletedKpis = (deletedRefs.kpis || []).filter(
    (id) => !isProtectedDefaultHappinessKpiId(id),
  );
  const deletedRefsChanged =
    nextDeletedKpis.length !== (deletedRefs.kpis || []).length;

  const mergedKpis = [...toPrepend, ...kpis];
  const { kpis: afterHabit, changed: habitMigrated } =
    migrateDefaultHappinessHabitKpis(mergedKpis);
  const { kpis: migratedKpis, changed: taskMigrated } =
    migrateDefaultHappinessTaskCompletionKpis(afterHabit);

  const kpiOrder = { ...(p.kpiOrder && typeof p.kpiOrder === "object" ? p.kpiOrder : {}) };
  const scopeId = HAPPINESS_KPI_GLOBAL_SCOPE_ID;
  const allKpiIds = migratedKpis.map((k) => String(k?.id ?? "")).filter(Boolean);
  let prevOrder = Array.isArray(kpiOrder[scopeId]) ? [...kpiOrder[scopeId]] : [];
  if (toPrepend.length) {
    const newIds = toPrepend.map((k) => k.id);
    prevOrder = [...newIds, ...prevOrder.filter((id) => !newIds.includes(id))];
  }
  const ordered = applyDefaultHappinessKpiOrder(prevOrder, allKpiIds);
  const orderChanged =
    ordered.length !== prevOrder.length ||
    ordered.some((id, i) => id !== prevOrder[i]);
  if (orderChanged) kpiOrder[scopeId] = ordered;

  if (
    !toPrepend.length &&
    !deletedRefsChanged &&
    !habitMigrated &&
    !taskMigrated &&
    !orderChanged
  ) {
    return p;
  }

  return {
    ...p,
    deletedRefs: deletedRefsChanged
      ? { ...deletedRefs, kpis: nextDeletedKpis }
      : deletedRefs,
    kpis: migratedKpis,
    kpiOrder,
  };
}

export function ensureHappinessMapDefaults(payload) {
  return ensureDefaultHappinessKpis(flattenHappinessMapForKpiOnlyTab(payload));
}

/** @deprecated ensureHappinessMapDefaults 사용 */
export function ensureDefaultHappinessCategory(payload) {
  return ensureHappinessMapDefaults(payload);
}

let _warnedNoSupabaseClient = false;
let _warnedNoAuthSession = false;

const DELETED_REF_KEYS = ["categories", "kpis", "kpiLogs", "kpiTodos", "kpiDailyRepeatTodos"];

function defaultDeletedRefs() {
  return {
    categories: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
  };
}

function normalizeDeletedRefs(dr) {
  if (!dr || typeof dr !== "object") return defaultDeletedRefs();
  const out = {};
  for (const k of DELETED_REF_KEYS) {
    const arr = Array.isArray(dr[k]) ? dr[k] : [];
    out[k] = [...new Set(arr.map(String))];
  }
  return out;
}

function hasDeletedRefsPayload(p) {
  const dr = p?.deletedRefs;
  if (!dr || typeof dr !== "object") return false;
  return DELETED_REF_KEYS.some((k) => Array.isArray(dr[k]) && dr[k].length > 0);
}

function happinessKpiUploadLog(phase, detail) {
  if (phase !== "ok" && phase !== "error") return;
  const extra = detail && typeof detail === "object" ? { ...detail } : detail != null ? { note: detail } : {};
  logKpiServerSnapshot("happiness", { op: "push", phase, ...extra });
}

function readLocalPayload() {
  try {
    const raw = readKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY);
    if (!raw) return emptyPayload();
    const p = JSON.parse(raw);
    return normalizePayload(p);
  } catch (_) {
    return emptyPayload();
  }
}

function readLocalPayloadStrictForSync() {
  const raw = readKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY);
  if (raw == null) {
    return { ok: true, payload: emptyPayload(), rawMissing: true };
  }
  try {
    const p = JSON.parse(raw);
    return { ok: true, payload: normalizePayload(p), rawMissing: false };
  } catch (e) {
    return {
      ok: false,
      reason: "parse_error",
      message: String(e?.message || e),
    };
  }
}

function emptyPayload() {
  return {
    happinesses: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
    kpiOrder: {},
    kpiTaskSync: {},
    deletedRefs: defaultDeletedRefs(),
    metaServerUpdatedAt: "",
    localMetaModifiedAt: undefined,
  };
}

function normalizePayload(p) {
  if (!p || typeof p !== "object") return emptyPayload();
  const kpis = (Array.isArray(p.kpis) ? p.kpis : []).map((k) => ({
    ...k,
    needHabitTracker: !!k.needHabitTracker,
    useTaskCompletionGoal: !!k.useTaskCompletionGoal,
    direction: k.direction === "lower" ? "lower" : "higher",
  }));
  return ensureHappinessMapDefaults({
    happinesses: Array.isArray(p.happinesses) ? p.happinesses : [],
    kpis,
    kpiLogs: Array.isArray(p.kpiLogs) ? p.kpiLogs : [],
    kpiTodos: Array.isArray(p.kpiTodos) ? p.kpiTodos : [],
    kpiDailyRepeatTodos: Array.isArray(p.kpiDailyRepeatTodos) ? p.kpiDailyRepeatTodos : [],
    kpiOrder: p.kpiOrder && typeof p.kpiOrder === "object" ? p.kpiOrder : {},
    kpiTaskSync: p.kpiTaskSync && typeof p.kpiTaskSync === "object" ? p.kpiTaskSync : {},
    deletedRefs: normalizeDeletedRefs(p.deletedRefs),
    metaServerUpdatedAt:
      typeof p.metaServerUpdatedAt === "string" ? p.metaServerUpdatedAt : "",
    localMetaModifiedAt:
      typeof p.localMetaModifiedAt === "number" && Number.isFinite(p.localMetaModifiedAt)
        ? p.localMetaModifiedAt
        : undefined,
  });
}

export function applyHappinessKpiMapToLocalStorage(dbRow) {
  if (!dbRow || typeof dbRow !== "object") return;
  const payload = dbRow.payload != null ? normalizePayload(dbRow.payload) : normalizePayload(dbRow);
  try {
    writeKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    logKpiServerSnapshot("happiness", {
      phase: "error",
      step: "getUser",
      ok: false,
      message: error.message,
    });
    return null;
  }
  return user?.id ?? null;
}

function rowToKpi(r) {
  return {
    id: r.id,
    happinessId: r.happiness_id,
    name: r.name || "",
    unit: r.unit || "",
    targetValue: r.target_value ?? "",
    targetStartDate: r.target_start_date ?? "",
    targetDeadline: r.target_deadline ?? "",
    targetTimeRequired: r.target_time_required ?? "",
    needHabitTracker: !!r.need_habit_tracker,
    useTimeAsUnit: !!r.use_time_as_unit,
    useTaskCompletionGoal: !!r.use_task_completion_goal,
    direction: r.direction === "lower" ? "lower" : "higher",
    serverUpdatedAt: serverUpdatedAtFromRow(r),
  };
}

function rowToLog(r) {
  const dc = r.daily_completed;
  const di = r.daily_incomplete;
  return {
    id: r.id,
    kpiId: r.kpi_id,
    happinessId: r.happiness_id || "",
    date: r.date_display || "",
    dateRaw: r.date_raw || "",
    value: r.value ?? "",
    status: r.status || "",
    memo: r.memo || "",
    dailyCompleted: Array.isArray(dc) ? dc : [],
    dailyIncomplete: Array.isArray(di) ? di : [],
    serverUpdatedAt: serverUpdatedAtFromRow(r),
    ...kpiLogMetaFromDbRow(r),
  };
}

function rowToTodo(r) {
  const ex = r.extra && typeof r.extra === "object" && !Array.isArray(r.extra) ? r.extra : {};
  return {
    id: r.id,
    kpiId: r.kpi_id,
    text: r.text || "",
    completed: !!r.completed,
    ...ex,
    serverUpdatedAt: serverUpdatedAtFromRow(r),
  };
}

function rowToDaily(r) {
  return {
    ...mapDbRowToKpiDailyTodo(r),
    serverUpdatedAt: serverUpdatedAtFromRow(r),
  };
}

function deletedRefsFromMetaRow(meta) {
  const raw = meta?.deleted_refs;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return normalizeDeletedRefs(raw);
  }
  return defaultDeletedRefs();
}

function buildPayloadFromNormalizedRows(categories, kpis, logs, todos, daily, meta) {
  const kpiIdsEarly = new Set((kpis || []).map((k) => String(k.id)));
  const dr = scrubKpiIdsFromDailyTodoDeletedRefs(deletedRefsFromMetaRow(meta), kpiIdsEarly);
  const rawCounts = {
    categories: (categories || []).length,
    kpis: (kpis || []).length,
    logs: (logs || []).length,
    todos: (todos || []).length,
    daily: (daily || []).length,
  };
  const drCat = new Set(dr.categories);
  const drKpi = new Set(dr.kpis);
  const drLog = new Set(dr.kpiLogs);
  const drTodo = new Set(dr.kpiTodos);
  const drDaily = new Set(dr.kpiDailyRepeatTodos);

  const sortedCats = [...(categories || [])]
    .filter((c) => !drCat.has(String(c.id)))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const happinesses = sortedCats
    .filter((c) => String(c.id) === HAPPINESS_KPI_GLOBAL_SCOPE_ID)
    .map((c) => ({
      id: c.id,
      name: c.name || "",
      serverUpdatedAt: serverUpdatedAtFromRow(c),
    }));

  const kpisFiltered = (kpis || []).filter((k) => !drKpi.has(String(k.id)));
  const kpiIds = new Set(kpisFiltered.map((k) => String(k.id)));

  const logsFiltered = (logs || []).filter((l) => {
    if (drLog.has(String(l.id))) return false;
    return kpiIds.has(String(l.kpi_id));
  });
  const todosFiltered = (todos || []).filter((t) => {
    if (drTodo.has(String(t.id))) return false;
    return kpiIds.has(String(t.kpi_id));
  });
  const dailyFiltered = (daily || []).filter((t) => {
    if (drDaily.has(String(t.id))) return false;
    return kpiIds.has(String(t.kpi_id));
  });

  const kpiOrder = meta?.kpi_order && typeof meta.kpi_order === "object" ? meta.kpi_order : {};
  const kpiTaskSync = meta?.kpi_task_sync && typeof meta.kpi_task_sync === "object" ? meta.kpi_task_sync : {};
  const out = normalizePayload({
    happinesses,
    kpis: kpisFiltered.map(rowToKpi),
    kpiLogs: logsFiltered.map(rowToLog),
    kpiTodos: sortNormalizedKpiTodoRows(todosFiltered).map(rowToTodo),
    kpiDailyRepeatTodos: sortNormalizedKpiTodoRows(dailyFiltered).map(rowToDaily),
    kpiOrder,
    kpiTaskSync,
    deletedRefs: dr,
    metaServerUpdatedAt: serverUpdatedAtFromRow(meta) || "",
  });
  if (kpiSyncDebugEnabled()) {
    const diff =
      rawCounts.kpis !== out.kpis.length ||
      rawCounts.logs !== out.kpiLogs.length ||
      rawCounts.todos !== out.kpiTodos.length ||
      rawCounts.daily !== out.kpiDailyRepeatTodos.length ||
      rawCounts.categories !== out.happinesses.length;
    kpiSyncTrace("happiness", "buildPayload(db→앱)", {
      metaHasDeletedRefs: !!(meta?.deleted_refs && typeof meta.deleted_refs === "object"),
      rawDbRows: rawCounts,
      afterDeletedRefsFilter: {
        happinesses: out.happinesses.length,
        kpis: out.kpis.length,
        kpiLogs: out.kpiLogs.length,
        kpiTodos: out.kpiTodos.length,
        kpiDailyRepeatTodos: out.kpiDailyRepeatTodos.length,
      },
      note: diff
        ? "DB 행 수와 필터 후 불일치 — deleted_refs로 숨김 처리됨"
        : "DB 행 수와 필터 후 일치",
    });
  }
  return out;
}

function metaRowHasData(meta) {
  if (!meta) return false;
  if (Object.keys(meta.kpi_order || {}).length > 0 || Object.keys(meta.kpi_task_sync || {}).length > 0) return true;
  const dr = meta.deleted_refs;
  if (dr && typeof dr === "object" && !Array.isArray(dr)) {
    if (DELETED_REF_KEYS.some((k) => Array.isArray(dr[k]) && dr[k].length > 0)) return true;
  }
  return false;
}

function hasAnyNormalizedData(categories, kpis, logs, todos, daily, meta) {
  if (meta != null && typeof meta === "object" && meta.user_id) {
    return true;
  }
  if (
    (categories?.length || 0) +
      (kpis?.length || 0) +
      (logs?.length || 0) +
      (todos?.length || 0) +
      (daily?.length || 0) >
    0
  ) {
    return true;
  }
  return metaRowHasData(meta);
}

function shouldInsertMetaRow(p) {
  return (
    (p.kpiOrder && Object.keys(p.kpiOrder).length > 0) ||
    (p.kpiTaskSync && Object.keys(p.kpiTaskSync).length > 0) ||
    hasDeletedRefsPayload(p)
  );
}

function kpiToRow(userId, k) {
  return {
    user_id: userId,
    id: String(k.id),
    happiness_id: String(k.happinessId),
    name: (k.name || "").trim(),
    unit: (k.unit || "").trim(),
    target_value: k.targetValue != null ? String(k.targetValue) : "",
    target_start_date: (k.targetStartDate || "").trim(),
    target_deadline: (k.targetDeadline || "").trim(),
    target_time_required: (k.targetTimeRequired || "").trim(),
    need_habit_tracker: !!k.needHabitTracker,
    use_time_as_unit: !!k.useTimeAsUnit,
    use_task_completion_goal: !!k.useTaskCompletionGoal,
    direction: k.direction === "lower" ? "lower" : "higher",
  };
}

function logToRow(userId, l) {
  return {
    user_id: userId,
    id: String(l.id),
    kpi_id: String(l.kpiId),
    happiness_id: String(l.happinessId || ""),
    date_display: (l.date || "").trim(),
    date_raw: (l.dateRaw || "").trim(),
    value: l.value != null ? String(l.value) : "",
    status: (l.status || "").trim(),
    memo: (l.memo || "").trim(),
    daily_completed: Array.isArray(l.dailyCompleted) ? l.dailyCompleted : [],
    daily_incomplete: Array.isArray(l.dailyIncomplete) ? l.dailyIncomplete : [],
    kpi_log_source:
      l.kpiLogSource === KPI_LOG_SOURCE_TIME_LEDGER
        ? KPI_LOG_SOURCE_TIME_LEDGER
        : KPI_LOG_SOURCE_MANUAL,
    time_ledger_entry_ids: Array.isArray(l.timeLedgerEntryIds)
      ? l.timeLedgerEntryIds
      : [],
  };
}

function todoToRow(userId, t, sortIndex) {
  const id = String(t.id);
  const kpiId = String(t.kpiId);
  const text = (t.text || "").trim();
  const completed = !!t.completed;
  const {
    id: _i,
    kpiId: _k,
    text: _t,
    completed: _c,
    ...rest
  } = t;
  return {
    user_id: userId,
    id,
    kpi_id: kpiId,
    text,
    completed,
    extra: { ...rest, sortOrder: sortIndex },
  };
}

function dailyTodoToRow(userId, t, sortIndex) {
  const norm = normalizeKpiDailyTodoIdentity(t);
  const {
    id,
    kpiId,
    text,
    completed,
    sortOrder: _sortOrder,
    serverUpdatedAt: _serverUpdatedAt,
    ...rest
  } = norm;
  return {
    user_id: userId,
    id: String(id),
    kpi_id: String(kpiId),
    text: (text || "").trim(),
    completed: !!completed,
    extra: { ...rest, sortOrder: sortIndex },
  };
}

async function upsertNormalizedFromPayloadWithRetry(userId, p) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await upsertNormalizedFromPayload(userId, p);
      return;
    } catch (e) {
      lastErr = e;
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
    }
  }
  throw lastErr;
}

const UPSERT_CONFLICT_ROW = "user_id,id";

async function upsertNormalizedFromPayload(userId, p) {
  if (p.happinesses.length) {
    const rows = p.happinesses.map((h, i) => ({
      user_id: userId,
      id: String(h.id),
      name: (h.name || "").trim(),
      sort_order: i,
    }));
    const { error } = await supabase
      .from("happiness_map_categories")
      .upsert(rows, { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`happiness_map_categories: ${error.message}`);
  }
  if (p.kpis.length) {
    const { error } = await supabase
      .from("happiness_map_kpis")
      .upsert(p.kpis.map((k) => kpiToRow(userId, k)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`happiness_map_kpis: ${error.message}`);
  }
  if (p.kpiLogs.length) {
    const { error } = await supabase
      .from("happiness_map_kpi_logs")
      .upsert(p.kpiLogs.map((l) => logToRow(userId, l)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`happiness_map_kpi_logs: ${error.message}`);
  }
  if (p.kpiTodos.length) {
    const { error } = await supabase
      .from("happiness_map_kpi_todos")
      .upsert(
        p.kpiTodos.map((t, sortIndex) => todoToRow(userId, t, sortIndex)),
        { onConflict: UPSERT_CONFLICT_ROW },
      );
    if (error) throw new Error(`happiness_map_kpi_todos: ${error.message}`);
  }
  if (p.kpiDailyRepeatTodos.length) {
    const { error } = await supabase
      .from("happiness_map_kpi_daily_todos")
      .upsert(
        p.kpiDailyRepeatTodos.map((t, sortIndex) =>
          dailyTodoToRow(userId, t, sortIndex),
        ),
        { onConflict: UPSERT_CONFLICT_ROW },
      );
    if (error) throw new Error(`happiness_map_kpi_daily_todos: ${error.message}`);
  }
  if (localPayloadHasAnythingToPersist(p)) {
    const dr = normalizeDeletedRefs(p.deletedRefs);
    const { error } = await supabase.from("happiness_map_meta").upsert(
      {
        user_id: userId,
        kpi_order: p.kpiOrder || {},
        kpi_task_sync: p.kpiTaskSync || {},
        deleted_refs: dr,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`happiness_map_meta: ${error.message}`);
  }
}

function localPayloadHasAnythingToPersist(p) {
  return (
    p.happinesses.length > 0 ||
    p.kpis.length > 0 ||
    p.kpiLogs.length > 0 ||
    p.kpiTodos.length > 0 ||
    p.kpiDailyRepeatTodos.length > 0 ||
    shouldInsertMetaRow(p)
  );
}

async function fetchHappinessMapPayloadFromSupabase(userId) {
  if (!supabase || !userId) return { ok: false };
  const [catRes, kpiRes, logRes, todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("happiness_map_categories").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpis").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpi_logs").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpi_todos").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("happiness_map_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  for (const res of [catRes, kpiRes, logRes, todoRes, dailyRes]) {
    if (res.error) return { ok: false };
  }
  if (metaRes.error) return { ok: false };
  const categories = catRes.data || [];
  const kpis = kpiRes.data || [];
  const logs = logRes.data || [];
  const todos = todoRes.data || [];
  const daily = dailyRes.data || [];
  const meta = metaRes.data;
  if (hasAnyNormalizedData(categories, kpis, logs, todos, daily, meta)) {
    return { ok: true, payload: buildPayloadFromNormalizedRows(categories, kpis, logs, todos, daily, meta) };
  }
  return { ok: true, payload: normalizePayload(buildPayloadFromNormalizedRows([], [], [], [], [], null)) };
}

export function applyHappinessKpiTimestampsOnSave(prev, next) {
  const out = { ...normalizePayload(next) };
  const prevN = prev ? normalizePayload(prev) : emptyPayload();
  out.happinesses = bumpEntityArrayLocalModified(
    prevN.happinesses,
    out.happinesses,
    (x) => x.id,
  );
  out.kpis = bumpEntityArrayLocalModified(prevN.kpis, out.kpis, (x) => x.id);
  out.kpiLogs = bumpEntityArrayLocalModified(prevN.kpiLogs, out.kpiLogs, (x) => x.id);
  out.kpiTodos = bumpEntityArrayLocalModified(prevN.kpiTodos, out.kpiTodos, (x) => x.id);
  out.kpiDailyRepeatTodos = bumpEntityArrayLocalModified(
    prevN.kpiDailyRepeatTodos,
    out.kpiDailyRepeatTodos,
    (x) => x.id,
  );
  const metaChanged =
    JSON.stringify(prevN.kpiOrder) !== JSON.stringify(out.kpiOrder) ||
    JSON.stringify(prevN.kpiTaskSync) !== JSON.stringify(out.kpiTaskSync) ||
    JSON.stringify(prevN.deletedRefs) !== JSON.stringify(out.deletedRefs);
  if (metaChanged) out.localMetaModifiedAt = Date.now();
  else out.localMetaModifiedAt = prevN.localMetaModifiedAt;
  return normalizePayload(out);
}

/** happiness_map_* pull·sync 직렬화 */
let _happinessKpiServerChain = Promise.resolve();
function runSerializedHappinessKpiServerOp(fn) {
  const next = _happinessKpiServerChain.then(fn, fn);
  _happinessKpiServerChain = next.catch(() => {});
  return next;
}

let _happinessKpiPushDirty = false;
let _happinessKpiSyncInFlight = false;
let _pushTimer = null;

function shouldDeferHappinessKpiPullWhileLocalUpdatePending() {
  if (_happinessKpiSyncInFlight) return true;
  if (_happinessKpiPushDirty) return true;
  if (_pushTimer) return true;
  return false;
}

/** @returns {Promise<boolean>} 서버 데이터로 로컬을 갱신했으면 true */
async function pullHappinessKpiMapFromSupabaseImpl(opts = {}) {
  const force = !!opts.force;
  const skipTodos = !!opts.skipTodos;
  if (!force && shouldDeferHappinessKpiPullWhileLocalUpdatePending()) return false;
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    logKpiServerSnapshot("happiness", {
      op: "pull",
      ok: false,
      reason: !supabase ? "no_supabase" : "no_session",
    });
    kpiSyncDebugLog("행복 pull", {
      ok: false,
      reason: !supabase ? "Supabase 없음" : "로그인 세션 없음",
    });
    return false;
  }

  const emptyTodoRes = { data: [], error: null };
  const [catRes, kpiRes, logRes, todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("happiness_map_categories").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpis").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpi_logs").select("*").eq("user_id", userId),
    skipTodos
      ? Promise.resolve(emptyTodoRes)
      : supabase.from("happiness_map_kpi_todos").select("*").eq("user_id", userId),
    skipTodos
      ? Promise.resolve(emptyTodoRes)
      : supabase.from("happiness_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("happiness_map_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  for (const res of [catRes, kpiRes, logRes, ...(skipTodos ? [] : [todoRes, dailyRes])]) {
    if (res.error) {
      logKpiServerSnapshot("happiness", { op: "pull", ok: false, error: res.error.message, step: "table" });
      kpiSyncDebugLog("행복 pull", { ok: false, error: res.error.message });
      return false;
    }
  }
  if (metaRes.error) {
    logKpiServerSnapshot("happiness", { op: "pull", ok: false, error: metaRes.error.message, step: "meta" });
    kpiSyncDebugLog("행복 pull", { ok: false, error: metaRes.error.message, step: "meta" });
    return false;
  }

  const categories = catRes.data || [];
  const kpis = kpiRes.data || [];
  const logs = logRes.data || [];
  const todos = skipTodos ? [] : todoRes.data || [];
  const daily = skipTodos ? [] : dailyRes.data || [];
  const meta = metaRes.data;
  const localBeforePull = readLocalPayload();

  if (!hasAnyNormalizedData(categories, kpis, logs, todos, daily, meta)) {
    const localOnly = localBeforePull;
    if (localPayloadHasAnythingToPersist(localOnly)) {
      kpiTodoLifecycleLog("happiness_pull_스킵_서버스냅샷없음_로컬유지", {
        localTodos: kpiTodoSnapshotBrief(localOnly),
        localDr: deletedRefsKpiTodosLen(localOnly),
      });
      kpiSyncDebugLog("행복 pull", {
        ok: false,
        skipped: "서버에 happiness_map 스냅샷 없음 — 로컬 유지(자동 push 예약 없음)",
      });
      return false;
    }
    const emptyPayload = buildPayloadFromNormalizedRows([], [], [], [], [], null);
    kpiTodoLifecycleLog("happiness_pull_빈서버빈로컬", {
      emptyTodos: kpiTodoSnapshotBrief(emptyPayload),
    });
    try {
      writeKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(emptyPayload));
    } catch (_) {}
    logKpiServerSnapshot("happiness", {
      op: "pull",
      ok: true,
      policy: "server_snapshot_only",
      note: "empty_server_and_local",
      dbRowCounts: { categories: 0, kpis: 0, logs: 0, todos: 0, dailyTodos: 0 },
    });
    return true;
  }

  const serverPayload = buildPayloadFromNormalizedRows(categories, kpis, logs, todos, daily, meta);
  let snapshot = normalizePayload(serverPayload);
  if (skipTodos && localBeforePull) {
    snapshot = normalizePayload({
      ...snapshot,
      kpiTodos: localBeforePull.kpiTodos || [],
      kpiDailyRepeatTodos: localBeforePull.kpiDailyRepeatTodos || [],
      deletedRefs: {
        ...(snapshot.deletedRefs || {}),
        kpiTodos: localBeforePull.deletedRefs?.kpiTodos || [],
        kpiDailyRepeatTodos: localBeforePull.deletedRefs?.kpiDailyRepeatTodos || [],
      },
    });
  }
  kpiTodoLifecyclePullCompare(
    "happiness",
    HAPPINESS_KPI_MAP_STORAGE_KEY,
    localBeforePull,
    snapshot,
    "서버스냅샷_setItem직전",
    { dbKpiTodoRows: todos.length },
  );
  try {
    writeKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (_) {}
  kpiSyncDebugLog("행복 pull → 완료", {
    source: "Supabase happiness_map_* (서버 스냅샷만 반영)",
    localKey: HAPPINESS_KPI_MAP_STORAGE_KEY,
    counts: {
      categories: categories.length,
      kpis: kpis.length,
      logs: logs.length,
      todos: todos.length,
      dailyTodos: daily.length,
    },
  });
  kpiSyncTrace("happiness", "pull→localStorage", {
    userIdPrefix: String(userId).slice(0, 8),
    rawDbRows: {
      categories: categories.length,
      kpis: kpis.length,
      logs: logs.length,
      todos: todos.length,
      daily: daily.length,
    },
    payloadSummary: kpiSyncPayloadSummary("happiness", snapshot),
  });
  logKpiServerSnapshot("happiness", {
    op: "pull",
    ok: true,
    policy: "server_snapshot_only",
    dbRowCounts: {
      categories: categories.length,
      kpis: kpis.length,
      logs: logs.length,
      todos: todos.length,
      dailyTodos: daily.length,
    },
  });
  return true;
}

/** @param {{ force?: boolean, skipTodos?: boolean }} [opts] */
export function pullHappinessKpiMapFromSupabase(opts = {}) {
  const o = opts && typeof opts === "object" ? opts : { force: !!opts };
  return runSerializedHappinessKpiServerOp(() => pullHappinessKpiMapFromSupabaseImpl(o));
}

/** KPI 상세 진입 시 — 할일·매일할일만 서버에서 당김 */
async function pullHappinessKpiMapTodosFromSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  const localBefore = normalizePayload(readLocalPayload());
  const kpiIds = new Set((localBefore.kpis || []).map((k) => String(k.id)));
  const [todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("happiness_map_kpi_todos").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("happiness_map_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  for (const res of [todoRes, dailyRes]) {
    if (res.error) return false;
  }
  if (metaRes.error) return false;
  const dr = deletedRefsFromMetaRow(metaRes.data);
  const drTodo = new Set(dr.kpiTodos || []);
  const drDaily = new Set(dr.kpiDailyRepeatTodos || []);
  const todosFiltered = (todoRes.data || []).filter((t) => {
    if (drTodo.has(String(t.id))) return false;
    return kpiIds.has(String(t.kpi_id));
  });
  const dailyFiltered = (dailyRes.data || []).filter((t) => {
    if (drDaily.has(String(t.id))) return false;
    return kpiIds.has(String(t.kpi_id));
  });
  const next = normalizePayload({
    ...localBefore,
    kpiTodos: sortNormalizedKpiTodoRows(todosFiltered).map(rowToTodo),
    kpiDailyRepeatTodos: sortNormalizedKpiTodoRows(dailyFiltered).map(rowToDaily),
    deletedRefs: {
      ...(localBefore.deletedRefs || {}),
      kpiTodos: dr.kpiTodos || [],
      kpiDailyRepeatTodos: dr.kpiDailyRepeatTodos || [],
    },
  });
  try {
    writeKpiMapScopedStorageRaw(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(next));
  } catch (_) {
    return false;
  }
  return true;
}

export function pullHappinessKpiMapTodosFromSupabase() {
  return runSerializedHappinessKpiServerOp(() => pullHappinessKpiMapTodosFromSupabaseImpl());
}

async function runHappinessKpiMapSyncOnce() {
  _happinessKpiSyncInFlight = true;
  try {
  const userId = await getSessionUserId();
  if (!supabase) {
    if (!_warnedNoSupabaseClient) {
      _warnedNoSupabaseClient = true;
      happinessKpiUploadLog("skip", {
        reason: "Supabase 없음 — .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인",
      });
    }
    return;
  }
  if (!userId) {
    if (!_warnedNoAuthSession) {
      _warnedNoAuthSession = true;
      happinessKpiUploadLog("skip", { reason: "로그인 세션 없음 — 서버로 올리지 않음" });
    }
    return;
  }

  const checked = readLocalPayloadStrictForSync();
  if (!checked.ok) {
    happinessKpiUploadLog("error", {
      phase: "local_read",
      message:
        "이 브라우저 저장값(JSON)이 깨져 있어 서버는 건드리지 않았습니다. 새로고침·다른 기기 백업을 확인해 주세요.",
      detail: checked.message,
    });
    return;
  }
  const { payload: p, rawMissing } = checked;
  kpiTodoLifecycleLog("happiness_sync_로컬읽음", {
    rawMissing,
    todos: kpiTodoSnapshotBrief(p),
    completion: kpiTodosCompletionBrief(p, 35),
    dr: deletedRefsKpiTodosLen(p),
  });
  if (rawMissing && !localPayloadHasAnythingToPersist(p)) {
    happinessKpiUploadLog("skip", {
      reason: "브라우저에 행복 KPI 데이터 키 없음 — 서버 삭제·덮어쓰기 안 함",
    });
    return;
  }

  try {
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("happiness", "sync:1-localRead", {
        userIdPrefix: String(userId).slice(0, 8),
        rawKeyMissing: rawMissing,
        summary: kpiSyncPayloadSummary("happiness", p),
      });
    }
    const fetched = await fetchHappinessMapPayloadFromSupabase(userId);
    const mergedFromServer = fetched.ok;
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("happiness", "sync:2-serverFetch", {
        ok: fetched.ok,
        summary: fetched.ok ? kpiSyncPayloadSummary("happiness", fetched.payload) : null,
        meaning: mergedFromServer
          ? "고아 삭제·업로드 후 재조회용; upsert에는 로컬(저장값)만 사용"
          : "서버 조회 실패 — 로컬만으로 upsert(고아 삭제 생략 가능)",
      });
    }
    const toSync = normalizePayload(p);
    kpiTodoLifecycleLog("happiness_sync_toSync_업서트직전", {
      mergedFromServer,
      todos: kpiTodoSnapshotBrief(toSync),
      completion: kpiTodosCompletionBrief(toSync, 35),
      dr: deletedRefsKpiTodosLen(toSync),
    });
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("happiness", "sync:3-toSyncLocal", {
        mergedFromServer,
        summary: kpiSyncPayloadSummary("happiness", toSync),
      });
    }

    if (localPayloadHasAnythingToPersist(toSync)) {
      await upsertNormalizedFromPayloadWithRetry(userId, toSync);
      kpiSyncTrace("happiness", "sync:4-orphanDelete", {
        skipped: true,
        reason: "로컬 기준 고아 삭제 없음 — 모달·체크 저장 시 upsert만",
      });
    } else {
      let metaEmptyErr = null;
      const drEmpty = normalizeDeletedRefs(toSync.deletedRefs);
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.from("happiness_map_meta").upsert(
          {
            user_id: userId,
            kpi_order: {},
            kpi_task_sync: {},
            deleted_refs: drEmpty,
          },
          { onConflict: "user_id" },
        );
        metaEmptyErr = error;
        if (!metaEmptyErr) break;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
      if (metaEmptyErr) throw new Error(`happiness_map_meta(empty): ${metaEmptyErr.message}`);
      kpiSyncTrace("happiness", "sync:4-orphanDelete(emptyPayloadBranch)", {
        skipped: true,
        reason: "로컬 기준 고아 삭제 없음",
      });
    }

    if (mergedFromServer) {
      const afterSync = await fetchHappinessMapPayloadFromSupabase(userId);
      if (afterSync.ok) {
        try {
          const finalPayload = normalizePayload(afterSync.payload);
          kpiTodoLifecycleLog("happiness_sync_서버재조회_검증만", {
            finalTodos: kpiTodoSnapshotBrief(finalPayload),
            finalCompletion: kpiTodosCompletionBrief(finalPayload, 35),
            finalDr: deletedRefsKpiTodosLen(finalPayload),
          });
        } catch (_) {}
      }
    }

    const hasData = localPayloadHasAnythingToPersist(toSync);
    happinessKpiUploadLog("ok", {
      mode: hasData ? "upsert" : "empty_meta_only",
      mergedFromServer,
      counts: {
        happinesses: toSync.happinesses.length,
        kpis: toSync.kpis.length,
        kpiLogs: toSync.kpiLogs.length,
        kpiTodos: toSync.kpiTodos.length,
        kpiDailyRepeatTodos: toSync.kpiDailyRepeatTodos.length,
      },
    });
    if (!_pushTimer) {
      _happinessKpiPushDirty = false;
    }
  } catch (e) {
    const msg = e?.message || String(e);
    happinessKpiUploadLog("error", { message: msg });
    kpiSyncDebugLog("행복 sync 실패", { message: msg });
  }
  } finally {
    _happinessKpiSyncInFlight = false;
  }
}

/** @returns {Promise<void>} */
export function syncHappinessKpiMapToSupabase() {
  return runSerializedHappinessKpiServerOp(() => runHappinessKpiMapSyncOnce());
}

const PUSH_DEBOUNCE_MS = 800;

export function flushHappinessKpiMapSyncPush() {
  if (!supabase) return;
  const hadPending = !!_pushTimer;
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  if (!hadPending && !_happinessKpiPushDirty) return;
  return syncHappinessKpiMapToSupabase().catch((e) => {
    happinessKpiUploadLog("error", { phase: "flush", message: e?.message || String(e) });
  });
}

export function scheduleHappinessKpiMapSyncPush() {
  if (!supabase) return;
  _happinessKpiPushDirty = true;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncHappinessKpiMapToSupabase().catch((e) => {
      happinessKpiUploadLog("error", { phase: "debounced_push", message: e?.message || String(e) });
    });
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachHappinessKpiMapSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("happiness-kpi-map-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
    if (!e.detail?.pushServer) return;
    syncHappinessKpiMapToSupabase().catch((err) => {
      happinessKpiUploadLog("error", { phase: "immediate_push", message: err?.message || String(err) });
    });
  });
}

/** @returns {Promise<boolean>} pull로 로컬이 바뀌었으면 true */
export async function hydrateHappinessKpiMapFromCloud() {
  lpPullDebug("hydrateHappinessKpiMapFromCloud", {});
  kpiSyncDebugLog("행복 hydrate 시작", { when: "앱 부팅 시 Promise.all 안" });
  attachHappinessKpiMapSaveListener();
  if (!supabase) {
    kpiSyncDebugLog("행복 hydrate 생략", { reason: "Supabase 없음" });
    return false;
  }
  const applied = await pullHappinessKpiMapFromSupabase({ force: true });
  kpiSyncDebugLog("행복 hydrate 끝", { applied });
  return applied;
}
