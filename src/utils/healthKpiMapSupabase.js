/**
 * 건강 KPI 맵 ↔ Supabase 정규화 테이블 (health_map_*)
 * 로컬 키 kpi-health-map (healths, healthGoalLogs, kpis, kpiLogs, …)
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
import {
  applyKpiMapExplicitDeletesOnServer,
  healthMapActiveIdsFromPayload,
  HEALTH_KPI_MAP_DELETE_TABLES,
} from "./kpiMapServerExplicitDeletes.js";

export const HEALTH_KPI_MAP_STORAGE_KEY = "kpi-health-map";

/** 건강 KPI — 특정 건강 목표에 귀속하지 않는 공통 KPI (DB health_id NOT NULL 대응) */
export const HEALTH_KPI_GLOBAL_SCOPE_ID = "__health_global__";

/** 기본 건강 목표 — 삭제 불가, 수정만 가능 */
export const DEFAULT_WEIGHT_HEALTH_GOAL_ID = "__lp_default_weight_goal__";
export const DEFAULT_SLEEP_HEALTH_GOAL_ID = "__lp_default_sleep_goal__";

/** @deprecated 기본 목록에서 제거됨 — 기존 로컬·서버 데이터 정리용 */
const RETIRED_DEFAULT_WATER_HEALTH_GOAL_ID = "__lp_default_water_goal__";

const PROTECTED_DEFAULT_HEALTH_GOAL_IDS = new Set([
  DEFAULT_WEIGHT_HEALTH_GOAL_ID,
  DEFAULT_SLEEP_HEALTH_GOAL_ID,
]);

export function isProtectedDefaultHealthGoalId(id) {
  return PROTECTED_DEFAULT_HEALTH_GOAL_IDS.has(String(id ?? ""));
}

export function createDefaultWeightHealthGoal() {
  return {
    id: DEFAULT_WEIGHT_HEALTH_GOAL_ID,
    name: "몸무게 목표",
    trackTargetValue: true,
    targetValue: "50",
    unit: "kg",
  };
}

export function createDefaultSleepHealthGoal() {
  return {
    id: DEFAULT_SLEEP_HEALTH_GOAL_ID,
    name: "수면 시간",
    trackTargetValue: true,
    targetValue: "7",
    unit: "시간",
  };
}

const DEFAULT_HEALTH_GOAL_FACTORIES = [
  createDefaultWeightHealthGoal,
  createDefaultSleepHealthGoal,
];

/** 기본 목록에서 제거된 수분섭취량 — 로드·동기화 시 목록·로그에서 제거 */
function stripRetiredDefaultWaterHealthGoal(p) {
  const healths = Array.isArray(p.healths) ? p.healths : [];
  const hasCategory = healths.some(
    (h) => String(h?.id ?? "") === RETIRED_DEFAULT_WATER_HEALTH_GOAL_ID,
  );
  const logs = Array.isArray(p.healthGoalLogs) ? p.healthGoalLogs : [];
  const logsForWater = logs.filter(
    (l) => String(l?.healthId ?? "") === RETIRED_DEFAULT_WATER_HEALTH_GOAL_ID,
  );
  if (!hasCategory && !logsForWater.length) return p;

  const deletedRefs = normalizeDeletedRefs(p.deletedRefs);
  const catIds = new Set(deletedRefs.categories);
  const logIds = new Set(deletedRefs.healthGoalLogs);
  if (hasCategory) catIds.add(RETIRED_DEFAULT_WATER_HEALTH_GOAL_ID);
  for (const l of logsForWater) {
    if (l?.id != null) logIds.add(String(l.id));
  }

  return {
    ...p,
    healths: healths.filter(
      (h) => String(h?.id ?? "") !== RETIRED_DEFAULT_WATER_HEALTH_GOAL_ID,
    ),
    healthGoalLogs: logs.filter(
      (l) => String(l?.healthId ?? "") !== RETIRED_DEFAULT_WATER_HEALTH_GOAL_ID,
    ),
    deletedRefs: {
      ...deletedRefs,
      categories: [...catIds],
      healthGoalLogs: [...logIds],
    },
  };
}

export function ensureDefaultHealthGoals(payload) {
  const p = stripRetiredDefaultWaterHealthGoal(
    payload && typeof payload === "object" ? payload : emptyPayload(),
  );
  const healths = Array.isArray(p.healths) ? [...p.healths] : [];
  const existingIds = new Set(healths.map((h) => String(h.id)));

  const toPrepend = [];
  for (const create of DEFAULT_HEALTH_GOAL_FACTORIES) {
    const def = create();
    if (existingIds.has(def.id)) continue;
    toPrepend.push(def);
    existingIds.add(def.id);
  }

  const deletedRefs = normalizeDeletedRefs(p.deletedRefs);
  const nextDeletedCategories = (deletedRefs.categories || []).filter(
    (id) => !isProtectedDefaultHealthGoalId(id),
  );
  const deletedRefsChanged =
    nextDeletedCategories.length !== (deletedRefs.categories || []).length;

  if (!toPrepend.length && !deletedRefsChanged) return p;

  return {
    ...p,
    deletedRefs: deletedRefsChanged
      ? { ...deletedRefs, categories: nextDeletedCategories }
      : deletedRefs,
    healths: [...toPrepend, ...healths],
  };
}

/** @deprecated ensureDefaultHealthGoals 사용 */
export function ensureDefaultWeightHealthGoal(payload) {
  return ensureDefaultHealthMapDefaults(payload);
}

/** 기본 건강 KPI — 삭제 불가, 수정 가능 */
export const DEFAULT_AEROBIC_KPI_ID = "__lp_default_kpi_aerobic__";
export const DEFAULT_SUPPLEMENT_KPI_ID = "__lp_default_kpi_supplement__";
export const DEFAULT_CHECKUP_KPI_ID = "__lp_default_kpi_checkup__";

const PROTECTED_DEFAULT_HEALTH_KPI_IDS = new Set([
  DEFAULT_AEROBIC_KPI_ID,
  DEFAULT_SUPPLEMENT_KPI_ID,
  DEFAULT_CHECKUP_KPI_ID,
]);

export function isProtectedDefaultHealthKpiId(id) {
  return PROTECTED_DEFAULT_HEALTH_KPI_IDS.has(String(id ?? ""));
}

function createDefaultHealthKpi(overrides) {
  return {
    healthId: HEALTH_KPI_GLOBAL_SCOPE_ID,
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

export function createDefaultAerobicKpi() {
  return createDefaultHealthKpi({
    id: DEFAULT_AEROBIC_KPI_ID,
    name: "유산소 운동",
    needHabitTracker: true,
    unit: "km",
    targetValue: "5",
  });
}

/** 기존 로컬·서버에 직접입력으로 저장된 기본 유산소 KPI → 매일하기로 맞춤 */
function migrateDefaultAerobicKpiToHabit(kpis) {
  let changed = false;
  const next = (kpis || []).map((k) => {
    if (String(k?.id ?? "") !== DEFAULT_AEROBIC_KPI_ID) return k;
    if (k.needHabitTracker) return k;
    if (k.useTimeAsUnit || k.useTaskCompletionGoal) return k;
    changed = true;
    return {
      ...k,
      needHabitTracker: true,
      useTimeAsUnit: false,
      useTaskCompletionGoal: false,
      unit: (k.unit || "").trim() || "km",
      targetValue: String(k.targetValue ?? "").trim() || "5",
      targetStartDate: "",
      targetDeadline: "",
      targetTimeRequired: "",
    };
  });
  return { kpis: changed ? next : kpis, changed };
}

/** 기존 로컬·서버 기본 보충제 KPI 표시명 — 영양제 → 보충제 */
function migrateDefaultSupplementKpiLabel(kpis) {
  let changed = false;
  const next = (kpis || []).map((k) => {
    if (String(k?.id ?? "") !== DEFAULT_SUPPLEMENT_KPI_ID) return k;
    const name = String(k.name || "").trim();
    if (name !== "영양제 섭취") return k;
    changed = true;
    return { ...k, name: "보충제 섭취" };
  });
  return { kpis: changed ? next : kpis, changed };
}

export function createDefaultSupplementKpi() {
  return createDefaultHealthKpi({
    id: DEFAULT_SUPPLEMENT_KPI_ID,
    name: "보충제 섭취",
    needHabitTracker: true,
  });
}

export function createDefaultCheckupKpi() {
  return createDefaultHealthKpi({
    id: DEFAULT_CHECKUP_KPI_ID,
    name: "건강 검진",
    useTaskCompletionGoal: true,
  });
}

const DEFAULT_HEALTH_KPI_FACTORIES = [
  createDefaultAerobicKpi,
  createDefaultSupplementKpi,
  createDefaultCheckupKpi,
];

export function ensureDefaultHealthKpis(payload) {
  const p = payload && typeof payload === "object" ? payload : emptyPayload();
  const kpis = Array.isArray(p.kpis) ? [...p.kpis] : [];
  const existingIds = new Set(kpis.map((k) => String(k.id)));

  const toPrepend = [];
  for (const create of DEFAULT_HEALTH_KPI_FACTORIES) {
    const def = create();
    if (existingIds.has(def.id)) continue;
    toPrepend.push(def);
    existingIds.add(def.id);
  }

  const deletedRefs = normalizeDeletedRefs(p.deletedRefs);
  const nextDeletedKpis = (deletedRefs.kpis || []).filter(
    (id) => !isProtectedDefaultHealthKpiId(id),
  );
  const deletedRefsChanged =
    nextDeletedKpis.length !== (deletedRefs.kpis || []).length;

  const mergedKpis = [...toPrepend, ...kpis];
  const { kpis: afterAerobic, changed: aerobicMigrated } =
    migrateDefaultAerobicKpiToHabit(mergedKpis);
  const { kpis: migratedKpis, changed: supplementLabelMigrated } =
    migrateDefaultSupplementKpiLabel(afterAerobic);

  if (
    !toPrepend.length &&
    !deletedRefsChanged &&
    !aerobicMigrated &&
    !supplementLabelMigrated
  ) {
    return p;
  }

  const kpiOrder = { ...(p.kpiOrder && typeof p.kpiOrder === "object" ? p.kpiOrder : {}) };
  if (toPrepend.length) {
    const scopeId = HEALTH_KPI_GLOBAL_SCOPE_ID;
    const prevOrder = Array.isArray(kpiOrder[scopeId]) ? [...kpiOrder[scopeId]] : [];
    const newIds = toPrepend.map((k) => k.id);
    kpiOrder[scopeId] = [...newIds, ...prevOrder.filter((id) => !newIds.includes(id))];
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

export function ensureDefaultHealthMapDefaults(payload) {
  return ensureDefaultHealthKpis(ensureDefaultHealthGoals(payload));
}

const LEGACY_TABLE = "health_user_kpi_map";

let _warnedNoSupabaseClient = false;
let _warnedNoAuthSession = false;

const DELETED_REF_KEYS = [
  "categories",
  "healthGoalLogs",
  "kpis",
  "kpiLogs",
  "kpiTodos",
  "kpiDailyRepeatTodos",
];

function defaultDeletedRefs() {
  return {
    categories: [],
    healthGoalLogs: [],
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

function healthKpiUploadLog(phase, detail) {
  if (phase !== "ok" && phase !== "error") return;
  const extra = detail && typeof detail === "object" ? { ...detail } : detail != null ? { note: detail } : {};
  logKpiServerSnapshot("health", { op: "push", phase, ...extra });
}

function readLocalPayload() {
  try {
    const raw = readKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY);
    if (!raw) return emptyPayload();
    const p = JSON.parse(raw);
    return normalizePayload(p);
  } catch (_) {
    return emptyPayload();
  }
}

function readLocalPayloadStrictForSync() {
  const raw = readKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY);
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
    healths: [],
    healthGoalLogs: [],
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
  return ensureDefaultHealthMapDefaults({
    healths: Array.isArray(p.healths) ? p.healths : [],
    healthGoalLogs: Array.isArray(p.healthGoalLogs) ? p.healthGoalLogs : [],
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

export function applyHealthKpiMapToLocalStorage(dbRow) {
  if (!dbRow || typeof dbRow !== "object") return;
  const payload = dbRow.payload != null ? normalizePayload(dbRow.payload) : normalizePayload(dbRow);
  try {
    writeKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY, JSON.stringify(payload));
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
    logKpiServerSnapshot("health", { phase: "error", step: "getUser", ok: false, message: error.message });
    return null;
  }
  return user?.id ?? null;
}

function rowToHealth(c) {
  const trackFromDb = c.track_target_value;
  const hasLegacy =
    !!String(c.target_value ?? "").trim() || !!String(c.unit ?? "").trim();
  const trackTargetValue = trackFromDb != null ? !!trackFromDb : hasLegacy;
  return {
    id: c.id,
    name: c.name || "",
    trackTargetValue,
    targetValue: trackTargetValue ? String(c.target_value ?? "").trim() : "",
    unit: trackTargetValue ? String(c.unit ?? "").trim() : "",
    serverUpdatedAt: serverUpdatedAtFromRow(c),
  };
}

function rowToGoalLog(r) {
  return {
    id: r.id,
    healthId: r.health_id,
    date: r.date_display || "",
    dateRaw: r.date_raw || "",
    value: r.value ?? "",
    status: r.status || "",
    memo: r.memo || "",
    serverUpdatedAt: serverUpdatedAtFromRow(r),
  };
}

function healthToRow(userId, h, sortOrder) {
  const trackTargetValue = !!h.trackTargetValue;
  return {
    user_id: userId,
    id: String(h.id),
    name: (h.name || "").trim(),
    target_value: trackTargetValue
      ? h.targetValue != null
        ? String(h.targetValue)
        : ""
      : "",
    unit: trackTargetValue ? String(h.unit || "").trim() : "",
    track_target_value: trackTargetValue,
    sort_order: sortOrder,
  };
}

function goalLogToRow(userId, l) {
  return {
    user_id: userId,
    id: String(l.id),
    health_id: String(l.healthId),
    date_display: (l.date || "").trim(),
    date_raw: (l.dateRaw || "").trim(),
    value: l.value != null ? String(l.value) : "",
    status: (l.status || "").trim(),
    memo: (l.memo || "").trim(),
  };
}

function rowToKpi(r) {
  const ps = String(r.progress_status || "").trim().toLowerCase();
  const progressStatus =
    ps === "pending" || ps === "completed" || ps === "active" ? ps : "active";
  return {
    id: r.id,
    healthId: r.health_id,
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
    habitTrackerStartDate: r.habit_tracker_start_date ?? "",
    progressStatus,
    serverUpdatedAt: serverUpdatedAtFromRow(r),
  };
}

function rowToLog(r) {
  const dc = r.daily_completed;
  const di = r.daily_incomplete;
  return {
    id: r.id,
    kpiId: r.kpi_id,
    healthId: r.health_id || "",
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

function buildPayloadFromNormalizedRows(categories, goalLogs, kpis, logs, todos, daily, meta) {
  const kpiIdsEarly = new Set((kpis || []).map((k) => String(k.id)));
  const dr = scrubKpiIdsFromDailyTodoDeletedRefs(deletedRefsFromMetaRow(meta), kpiIdsEarly);
  const rawCounts = {
    categories: (categories || []).length,
    goalLogs: (goalLogs || []).length,
    kpis: (kpis || []).length,
    logs: (logs || []).length,
    todos: (todos || []).length,
    daily: (daily || []).length,
  };
  const drCat = new Set(dr.categories);
  const drGoalLog = new Set(dr.healthGoalLogs);
  const drKpi = new Set(dr.kpis);
  const drLog = new Set(dr.kpiLogs);
  const drTodo = new Set(dr.kpiTodos);
  const drDaily = new Set(dr.kpiDailyRepeatTodos);

  const sortedCats = [...(categories || [])]
    .filter((c) => !drCat.has(String(c.id)))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const healths = sortedCats.map((c) => rowToHealth(c));
  const healthIds = new Set(healths.map((h) => String(h.id)));

  const goalLogsFiltered = (goalLogs || []).filter((l) => {
    if (drGoalLog.has(String(l.id))) return false;
    return healthIds.has(String(l.health_id));
  });

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
    healths,
    healthGoalLogs: goalLogsFiltered.map(rowToGoalLog),
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
      rawCounts.goalLogs !== out.healthGoalLogs.length ||
      rawCounts.kpis !== out.kpis.length ||
      rawCounts.logs !== out.kpiLogs.length ||
      rawCounts.todos !== out.kpiTodos.length ||
      rawCounts.daily !== out.kpiDailyRepeatTodos.length ||
      rawCounts.categories !== out.healths.length;
    kpiSyncTrace("health", "buildPayload(db→앱)", {
      metaHasDeletedRefs: !!(meta?.deleted_refs && typeof meta.deleted_refs === "object"),
      rawDbRows: rawCounts,
      afterDeletedRefsFilter: {
        healths: out.healths.length,
        healthGoalLogs: out.healthGoalLogs.length,
        kpis: out.kpis.length,
        kpiLogs: out.kpiLogs.length,
        kpiTodos: out.kpiTodos.length,
        kpiDailyRepeatTodos: out.kpiDailyRepeatTodos.length,
      },
      note: diff ? "DB 행 수와 필터 후 불일치 — deleted_refs로 숨김 처리됨" : "DB 행 수와 필터 후 일치",
    });
  }
  return out;
}

export function applyHealthKpiTimestampsOnSave(prev, next) {
  const out = { ...normalizePayload(next) };
  const prevN = prev ? normalizePayload(prev) : emptyPayload();
  out.healths = bumpEntityArrayLocalModified(prevN.healths, out.healths, (x) => x.id);
  out.healthGoalLogs = bumpEntityArrayLocalModified(
    prevN.healthGoalLogs,
    out.healthGoalLogs,
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

function metaRowHasData(meta) {
  if (!meta) return false;
  if (Object.keys(meta.kpi_order || {}).length > 0 || Object.keys(meta.kpi_task_sync || {}).length > 0) return true;
  const dr = meta.deleted_refs;
  if (dr && typeof dr === "object" && !Array.isArray(dr)) {
    if (DELETED_REF_KEYS.some((k) => Array.isArray(dr[k]) && dr[k].length > 0)) return true;
  }
  return false;
}

function hasAnyNormalizedData(categories, goalLogs, kpis, logs, todos, daily, meta) {
  if (meta != null && typeof meta === "object" && meta.user_id) {
    return true;
  }
  if (
    (categories?.length || 0) +
      (goalLogs?.length || 0) +
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
  const ps = String(k.progressStatus || "").trim().toLowerCase();
  const progress_status =
    ps === "pending" || ps === "completed" || ps === "active" ? ps : "active";
  return {
    user_id: userId,
    id: String(k.id),
    health_id: String(k.healthId),
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
    habit_tracker_start_date: (k.habitTrackerStartDate || "").trim(),
    progress_status,
  };
}

function logToRow(userId, l) {
  return {
    user_id: userId,
    id: String(l.id),
    kpi_id: String(l.kpiId),
    health_id: String(l.healthId || ""),
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
  if (p.healths.length) {
    const rows = p.healths.map((h, i) => healthToRow(userId, h, i));
    const { error } = await supabase
      .from("health_map_categories")
      .upsert(rows, { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`health_map_categories: ${error.message}`);
  }
  if (p.healthGoalLogs.length) {
    const { error } = await supabase
      .from("health_map_goal_logs")
      .upsert(p.healthGoalLogs.map((l) => goalLogToRow(userId, l)), {
        onConflict: UPSERT_CONFLICT_ROW,
      });
    if (error) throw new Error(`health_map_goal_logs: ${error.message}`);
  }
  if (p.kpis.length) {
    const { error } = await supabase
      .from("health_map_kpis")
      .upsert(p.kpis.map((k) => kpiToRow(userId, k)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`health_map_kpis: ${error.message}`);
  }
  if (p.kpiLogs.length) {
    const { error } = await supabase
      .from("health_map_kpi_logs")
      .upsert(p.kpiLogs.map((l) => logToRow(userId, l)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`health_map_kpi_logs: ${error.message}`);
  }
  if (p.kpiTodos.length) {
    const { error } = await supabase
      .from("health_map_kpi_todos")
      .upsert(
        p.kpiTodos.map((t, sortIndex) => todoToRow(userId, t, sortIndex)),
        { onConflict: UPSERT_CONFLICT_ROW },
      );
    if (error) throw new Error(`health_map_kpi_todos: ${error.message}`);
  }
  if (p.kpiDailyRepeatTodos.length) {
    const { error } = await supabase
      .from("health_map_kpi_daily_todos")
      .upsert(
        p.kpiDailyRepeatTodos.map((t, sortIndex) =>
          dailyTodoToRow(userId, t, sortIndex),
        ),
        { onConflict: UPSERT_CONFLICT_ROW },
      );
    if (error) throw new Error(`health_map_kpi_daily_todos: ${error.message}`);
  }
  if (localPayloadHasAnythingToPersist(p)) {
    const dr = normalizeDeletedRefs(p.deletedRefs);
    const { error } = await supabase.from("health_map_meta").upsert(
      {
        user_id: userId,
        kpi_order: p.kpiOrder || {},
        kpi_task_sync: p.kpiTaskSync || {},
        deleted_refs: dr,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`health_map_meta: ${error.message}`);
  }
  await applyKpiMapExplicitDeletesOnServer({
    supabase,
    userId,
    deletedRefs: normalizeDeletedRefs(p.deletedRefs),
    active: healthMapActiveIdsFromPayload(p),
    tables: HEALTH_KPI_MAP_DELETE_TABLES,
  });
}

function localPayloadHasAnythingToPersist(p) {
  return (
    p.healths.length > 0 ||
    p.healthGoalLogs.length > 0 ||
    p.kpis.length > 0 ||
    p.kpiLogs.length > 0 ||
    p.kpiTodos.length > 0 ||
    p.kpiDailyRepeatTodos.length > 0 ||
    shouldInsertMetaRow(p)
  );
}

async function fetchHealthMapPayloadFromSupabase(userId) {
  if (!supabase || !userId) return { ok: false };
  const [catRes, goalLogRes, kpiRes, logRes, todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("health_map_categories").select("*").eq("user_id", userId),
    supabase.from("health_map_goal_logs").select("*").eq("user_id", userId),
    supabase.from("health_map_kpis").select("*").eq("user_id", userId),
    supabase.from("health_map_kpi_logs").select("*").eq("user_id", userId),
    supabase.from("health_map_kpi_todos").select("*").eq("user_id", userId),
    supabase.from("health_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("health_map_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  for (const res of [catRes, goalLogRes, kpiRes, logRes, todoRes, dailyRes]) {
    if (res.error) return { ok: false };
  }
  if (metaRes.error) return { ok: false };
  const categories = catRes.data || [];
  const goalLogs = goalLogRes.data || [];
  const kpis = kpiRes.data || [];
  const logs = logRes.data || [];
  const todos = todoRes.data || [];
  const daily = dailyRes.data || [];
  const meta = metaRes.data;
  if (hasAnyNormalizedData(categories, goalLogs, kpis, logs, todos, daily, meta)) {
    return {
      ok: true,
      payload: buildPayloadFromNormalizedRows(
        categories,
        goalLogs,
        kpis,
        logs,
        todos,
        daily,
        meta,
      ),
    };
  }
  return {
    ok: true,
    payload: normalizePayload(buildPayloadFromNormalizedRows([], [], [], [], [], [], null)),
  };
}

/** health_map_* pull·sync 직렬화 */
let _healthKpiServerChain = Promise.resolve();
function runSerializedHealthKpiServerOp(fn) {
  const next = _healthKpiServerChain.then(fn, fn);
  _healthKpiServerChain = next.catch(() => {});
  return next;
}

let _healthKpiPushDirty = false;
let _healthKpiSyncInFlight = false;
let _pushTimer = null;

function shouldDeferHealthKpiPullWhileLocalUpdatePending() {
  if (_healthKpiSyncInFlight) return true;
  if (_healthKpiPushDirty) return true;
  if (_pushTimer) return true;
  return false;
}

/** @returns {Promise<boolean>} 서버 데이터로 로컬을 갱신했으면 true */
async function pullHealthKpiMapFromSupabaseImpl(opts = {}) {
  const force = !!opts.force;
  const habitTrackerLite = !!opts.habitTrackerLite;
  const skipTodos = !!opts.skipTodos || habitTrackerLite;
  const skipLogs = !!opts.skipLogs;
  if (!force && shouldDeferHealthKpiPullWhileLocalUpdatePending()) return false;
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    logKpiServerSnapshot("health", {
      op: "pull",
      ok: false,
      reason: !supabase ? "no_supabase" : "no_session",
    });
    kpiSyncDebugLog("건강 pull", {
      ok: false,
      reason: !supabase ? "Supabase 없음" : "로그인 세션 없음",
    });
    return false;
  }

  const emptyTodoRes = { data: [], error: null };
  const emptyLogRes = { data: [], error: null };
  const emptyRowRes = { data: [], error: null };
  const [catRes, goalLogRes, kpiRes, logRes, todoRes, dailyRes, metaRes] = await Promise.all([
    habitTrackerLite
      ? Promise.resolve(emptyRowRes)
      : supabase.from("health_map_categories").select("*").eq("user_id", userId),
    habitTrackerLite
      ? Promise.resolve(emptyRowRes)
      : supabase.from("health_map_goal_logs").select("*").eq("user_id", userId),
    supabase.from("health_map_kpis").select("*").eq("user_id", userId),
    skipLogs
      ? Promise.resolve(emptyLogRes)
      : supabase.from("health_map_kpi_logs").select("*").eq("user_id", userId),
    skipTodos
      ? Promise.resolve(emptyTodoRes)
      : supabase.from("health_map_kpi_todos").select("*").eq("user_id", userId),
    skipTodos
      ? Promise.resolve(emptyTodoRes)
      : supabase.from("health_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("health_map_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  for (const res of [
    ...(habitTrackerLite ? [] : [catRes, goalLogRes]),
    kpiRes,
    ...(skipLogs ? [] : [logRes]),
    ...(skipTodos ? [] : [todoRes, dailyRes]),
  ]) {
    if (res.error) {
      logKpiServerSnapshot("health", { op: "pull", ok: false, error: res.error.message, step: "table" });
      kpiSyncDebugLog("건강 pull", { ok: false, error: res.error.message });
      return false;
    }
  }
  if (metaRes.error) {
    logKpiServerSnapshot("health", { op: "pull", ok: false, error: metaRes.error.message, step: "meta" });
    kpiSyncDebugLog("건강 pull", { ok: false, error: metaRes.error.message, step: "meta" });
    return false;
  }

  const categories = catRes.data || [];
  const goalLogs = goalLogRes.data || [];
  const kpis = kpiRes.data || [];
  const logs = skipLogs ? [] : logRes.data || [];
  const todos = skipTodos ? [] : todoRes.data || [];
  const daily = skipTodos ? [] : dailyRes.data || [];
  const meta = metaRes.data;
  const localBeforePull = readLocalPayload();

  const serverHasRows = habitTrackerLite
    ? true
    : hasAnyNormalizedData(categories, goalLogs, kpis, logs, todos, daily, meta);

  if (serverHasRows) {
    const serverPayload = buildPayloadFromNormalizedRows(
      habitTrackerLite ? [] : categories,
      habitTrackerLite ? [] : goalLogs,
      kpis,
      logs,
      habitTrackerLite ? [] : todos,
      habitTrackerLite ? [] : daily,
      meta,
    );
    let snapshot = normalizePayload(serverPayload);
    if (habitTrackerLite && localBeforePull) {
      snapshot = normalizePayload({
        ...localBeforePull,
        kpis: snapshot.kpis || [],
        kpiLogs: snapshot.kpiLogs || [],
        deletedRefs: snapshot.deletedRefs || localBeforePull.deletedRefs,
      });
    }
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
    if (skipLogs && localBeforePull) {
      snapshot = normalizePayload({
        ...snapshot,
        kpiLogs: localBeforePull.kpiLogs || [],
        deletedRefs: {
          ...(snapshot.deletedRefs || {}),
          kpiLogs: localBeforePull.deletedRefs?.kpiLogs || [],
        },
      });
    }
    kpiTodoLifecyclePullCompare(
      "health",
      HEALTH_KPI_MAP_STORAGE_KEY,
      localBeforePull,
      snapshot,
      "서버스냅샷_setItem직전",
      { dbKpiTodoRows: todos.length },
    );
    try {
      writeKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (_) {}
    kpiSyncDebugLog("건강 pull → 완료", {
      source: "Supabase health_map_* (서버 스냅샷만 반영)",
      localKey: HEALTH_KPI_MAP_STORAGE_KEY,
      counts: {
        categories: categories.length,
        kpis: kpis.length,
        logs: logs.length,
        todos: todos.length,
        dailyTodos: daily.length,
      },
    });
    kpiSyncTrace("health", "pull→localStorage", {
      userIdPrefix: String(userId).slice(0, 8),
      rawDbRows: {
        categories: categories.length,
        kpis: kpis.length,
        logs: logs.length,
        todos: todos.length,
        daily: daily.length,
      },
      payloadSummary: kpiSyncPayloadSummary("health", snapshot),
    });
    logKpiServerSnapshot("health", {
      op: "pull",
      ok: true,
      policy: "server_snapshot_only",
      source: "normalized_tables",
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

  const localOnly = localBeforePull;
  if (localPayloadHasAnythingToPersist(localOnly)) {
    kpiTodoLifecycleLog("health_pull_스킵_정규화없음_로컬유지", {
      localTodos: kpiTodoSnapshotBrief(localOnly),
      localDr: deletedRefsKpiTodosLen(localOnly),
    });
    kpiSyncDebugLog("건강 pull", {
      ok: false,
      skipped: "정규화 테이블 스냅샷 없음 — 로컬 유지(자동 push 예약 없음)",
    });
    return false;
  }

  const { data: legacyRow, error: legErr } = await supabase
    .from(LEGACY_TABLE)
    .select("payload")
    .eq("user_id", userId)
    .maybeSingle();

  if (legErr) {
    logKpiServerSnapshot("health", { op: "pull", ok: false, error: legErr.message, step: "legacy" });
    kpiSyncDebugLog("건강 pull", { ok: false, error: legErr.message, step: "legacy" });
    return false;
  }
  const legacyPayload = legacyRow?.payload;
  if (legacyPayload == null || (typeof legacyPayload === "object" && Object.keys(legacyPayload).length === 0)) {
    try {
      writeKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY, JSON.stringify(emptyPayload()));
    } catch (_) {}
    kpiSyncDebugLog("건강 pull → 완료", {
      source: "서버 정규화 데이터 없음 → 빈 로컬",
      localKey: HEALTH_KPI_MAP_STORAGE_KEY,
    });
    logKpiServerSnapshot("health", {
      op: "pull",
      ok: true,
      policy: "server_snapshot_only",
      source: "no_normalized_empty_local",
    });
    return true;
  }

  applyHealthKpiMapToLocalStorage({ payload: legacyPayload });
  kpiSyncDebugLog("건강 pull", {
    source: "레거시 테이블 health_user_kpi_map.payload → 로컬 후 정규화 마이그레이션",
    localKey: HEALTH_KPI_MAP_STORAGE_KEY,
  });
  try {
    const p = readLocalPayload();
    await upsertNormalizedFromPayloadWithRetry(userId, p);
    await supabase.from(LEGACY_TABLE).delete().eq("user_id", userId);
    logKpiServerSnapshot("health", {
      op: "pull",
      ok: true,
      policy: "server_snapshot_only",
      source: "legacy_migrated_to_normalized",
    });
  } catch (e) {
    logKpiServerSnapshot("health", {
      op: "pull",
      ok: false,
      phase: "error",
      step: "legacy_migrate",
      message: e?.message || String(e),
    });
  }
  return true;
}

/** @param {{ force?: boolean, skipTodos?: boolean, skipLogs?: boolean, habitTrackerLite?: boolean }} [opts] */
export function pullHealthKpiMapFromSupabase(opts = {}) {
  const o = opts && typeof opts === "object" ? opts : { force: !!opts };
  return runSerializedHealthKpiServerOp(() => pullHealthKpiMapFromSupabaseImpl(o));
}

/** KPI 상세 진입 시 — 할일·매일할일만 서버에서 당김(목록 탭 pull 은 skipTodos) */
async function pullHealthKpiMapTodosFromSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  const localBefore = normalizePayload(readLocalPayload());
  const kpiIds = new Set((localBefore.kpis || []).map((k) => String(k.id)));
  const [todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("health_map_kpi_todos").select("*").eq("user_id", userId),
    supabase.from("health_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("health_map_meta").select("*").eq("user_id", userId).maybeSingle(),
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
    writeKpiMapScopedStorageRaw(HEALTH_KPI_MAP_STORAGE_KEY, JSON.stringify(next));
  } catch (_) {
    return false;
  }
  return true;
}

export function pullHealthKpiMapTodosFromSupabase() {
  return runSerializedHealthKpiServerOp(() => pullHealthKpiMapTodosFromSupabaseImpl());
}

async function runHealthKpiMapSyncOnce() {
  _healthKpiSyncInFlight = true;
  try {
  const userId = await getSessionUserId();
  if (!supabase) {
    if (!_warnedNoSupabaseClient) {
      _warnedNoSupabaseClient = true;
      healthKpiUploadLog("skip", {
        reason: "Supabase 없음 — .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인",
      });
    }
    return;
  }
  if (!userId) {
    if (!_warnedNoAuthSession) {
      _warnedNoAuthSession = true;
      healthKpiUploadLog("skip", { reason: "로그인 세션 없음 — 서버로 올리지 않음" });
    }
    return;
  }

  const checked = readLocalPayloadStrictForSync();
  if (!checked.ok) {
    healthKpiUploadLog("error", {
      phase: "local_read",
      message:
        "이 브라우저 저장값(JSON)이 깨져 있어 서버는 건드리지 않았습니다. 새로고침·다른 기기 백업을 확인해 주세요.",
      detail: checked.message,
    });
    return;
  }
  const { payload: p, rawMissing } = checked;
  kpiTodoLifecycleLog("health_sync_로컬읽음", {
    rawMissing,
    todos: kpiTodoSnapshotBrief(p),
    completion: kpiTodosCompletionBrief(p, 35),
    dr: deletedRefsKpiTodosLen(p),
  });
  if (rawMissing && !localPayloadHasAnythingToPersist(p)) {
    healthKpiUploadLog("skip", {
      reason: "브라우저에 건강 KPI 데이터 키 없음 — 서버 삭제·덮어쓰기 안 함",
    });
    return;
  }

  try {
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("health", "sync:1-localRead", {
        userIdPrefix: String(userId).slice(0, 8),
        rawKeyMissing: rawMissing,
        summary: kpiSyncPayloadSummary("health", p),
      });
    }
    const fetched = await fetchHealthMapPayloadFromSupabase(userId);
    const mergedFromServer = fetched.ok;
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("health", "sync:2-serverFetch", {
        ok: fetched.ok,
        summary: fetched.ok ? kpiSyncPayloadSummary("health", fetched.payload) : null,
        meaning: mergedFromServer
          ? "고아 삭제·업로드 후 재조회용; upsert에는 로컬(저장값)만 사용"
          : "서버 조회 실패 — 로컬만으로 upsert(고아 삭제 생략 가능)",
      });
    }
    const toSync = normalizePayload(p);
    kpiTodoLifecycleLog("health_sync_toSync_업서트직전", {
      mergedFromServer,
      todos: kpiTodoSnapshotBrief(toSync),
      completion: kpiTodosCompletionBrief(toSync, 35),
      dr: deletedRefsKpiTodosLen(toSync),
    });
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("health", "sync:3-toSyncLocal", {
        mergedFromServer,
        summary: kpiSyncPayloadSummary("health", toSync),
      });
    }

    if (localPayloadHasAnythingToPersist(toSync)) {
      await upsertNormalizedFromPayloadWithRetry(userId, toSync);
      kpiSyncTrace("health", "sync:4-explicitDelete", {
        skipped: false,
        reason: "deleted_refs id — upsertNormalizedFromPayload 내부에서 서버 DELETE",
      });
    } else {
      let metaEmptyErr = null;
      const drEmpty = normalizeDeletedRefs(toSync.deletedRefs);
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.from("health_map_meta").upsert(
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
      if (metaEmptyErr) throw new Error(`health_map_meta(empty): ${metaEmptyErr.message}`);
      const deleteResult = await applyKpiMapExplicitDeletesOnServer({
        supabase,
        userId,
        deletedRefs: drEmpty,
        active: healthMapActiveIdsFromPayload(toSync),
        tables: HEALTH_KPI_MAP_DELETE_TABLES,
      });
      kpiSyncTrace("health", "sync:4-explicitDelete(emptyPayloadBranch)", {
        skipped: false,
        deleted: deleteResult.deleted,
      });
    }

    if (mergedFromServer) {
      const afterSync = await fetchHealthMapPayloadFromSupabase(userId);
      if (afterSync.ok) {
        try {
          const finalPayload = normalizePayload(afterSync.payload);
          kpiTodoLifecycleLog("health_sync_서버재조회_검증만", {
            finalTodos: kpiTodoSnapshotBrief(finalPayload),
            finalCompletion: kpiTodosCompletionBrief(finalPayload, 35),
            finalDr: deletedRefsKpiTodosLen(finalPayload),
          });
        } catch (_) {}
      }
    }

    const hasData = localPayloadHasAnythingToPersist(toSync);
    healthKpiUploadLog("ok", {
      mode: hasData ? "upsert" : "empty_meta_only",
      mergedFromServer,
      counts: {
        healths: toSync.healths.length,
        healthGoalLogs: toSync.healthGoalLogs.length,
        kpis: toSync.kpis.length,
        kpiLogs: toSync.kpiLogs.length,
        kpiTodos: toSync.kpiTodos.length,
        kpiDailyRepeatTodos: toSync.kpiDailyRepeatTodos.length,
      },
    });
    if (!_pushTimer) {
      _healthKpiPushDirty = false;
    }
    try {
      await supabase.from(LEGACY_TABLE).delete().eq("user_id", userId);
    } catch (_) {}
  } catch (e) {
    const msg = e?.message || String(e);
    healthKpiUploadLog("error", { message: msg });
    kpiSyncDebugLog("건강 sync 실패", { message: msg });
  }
  } finally {
    _healthKpiSyncInFlight = false;
  }
}

/** @returns {Promise<void>} */
export function syncHealthKpiMapToSupabase() {
  return runSerializedHealthKpiServerOp(() => runHealthKpiMapSyncOnce());
}

const PUSH_DEBOUNCE_MS = 800;

export function flushHealthKpiMapSyncPush() {
  if (!supabase) return;
  const hadPending = !!_pushTimer;
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  if (!hadPending && !_healthKpiPushDirty) return;
  return syncHealthKpiMapToSupabase().catch((e) => {
    healthKpiUploadLog("error", { phase: "flush", message: e?.message || String(e) });
  });
}

export function scheduleHealthKpiMapSyncPush() {
  if (!supabase) return;
  _healthKpiPushDirty = true;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncHealthKpiMapToSupabase().catch((e) => {
      healthKpiUploadLog("error", { phase: "debounced_push", message: e?.message || String(e) });
    });
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachHealthKpiMapSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("health-kpi-map-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
    if (!e.detail?.pushServer) return;
    syncHealthKpiMapToSupabase().catch((err) => {
      healthKpiUploadLog("error", { phase: "immediate_push", message: err?.message || String(err) });
    });
  });
}

/** @returns {Promise<boolean>} pull로 로컬이 바뀌었으면 true */
export async function hydrateHealthKpiMapFromCloud() {
  lpPullDebug("hydrateHealthKpiMapFromCloud", {});
  kpiSyncDebugLog("건강 hydrate 시작", { when: "앱 부팅 시 Promise.all 안" });
  attachHealthKpiMapSaveListener();
  if (!supabase) {
    kpiSyncDebugLog("건강 hydrate 생략", { reason: "Supabase 없음" });
    return false;
  }
  const applied = await pullHealthKpiMapFromSupabase({ force: true });
  kpiSyncDebugLog("건강 hydrate 끝", { applied });
  return applied;
}
