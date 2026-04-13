/**
 * 꿈 KPI 맵 ↔ Supabase 정규화 테이블 (dream_map_*)
 * 로컬 kpi-dream-map (dreams, goals, tasks, desiredLife, kpis, …)
 */

import { supabase } from "../supabase.js";
import { kpiSyncDebugEnabled, kpiSyncDebugLog, kpiSyncPayloadSummary, kpiSyncTrace } from "./kpiSyncDebug.js";
import { logKpiServerSnapshot } from "./kpiServerAuditLog.js";
import {
  bumpEntityArrayLocalModified,
  parseIsoMs,
  pickNewerRowServerWinsTie,
  serverUpdatedAtFromRow,
} from "./kpiMapLwwMerge.js";
import { lpPullDebug } from "./lpPullDebug.js";

export const DREAM_KPI_MAP_STORAGE_KEY = "kpi-dream-map";

/** 꿈 KPI 로컬→서버 push 단계 — ok / error 만 감사 로그(skip 제외) */
function dreamKpiUploadLog(phase, detail) {
  if (phase !== "ok" && phase !== "error") return;
  const extra = detail && typeof detail === "object" ? { ...detail } : detail != null ? { note: detail } : {};
  logKpiServerSnapshot("dream", { op: "push", phase, ...extra });
}

let _warnedNoSupabaseClient = false;
let _warnedNoAuthSession = false;

function readLocalPayload() {
  try {
    const raw = localStorage.getItem(DREAM_KPI_MAP_STORAGE_KEY);
    if (!raw) return emptyPayload();
    const p = JSON.parse(raw);
    return normalizePayload(p);
  } catch (_) {
    return emptyPayload();
  }
}

/**
 * 서버 동기화 전용: JSON 깨짐·키 없음은 빈 값으로 오인하지 않음(서버 전체 삭제 방지).
 * @returns {{ ok: true, payload: object, rawMissing: boolean } | { ok: false, reason: string, message?: string }}
 */
function readLocalPayloadStrictForSync() {
  const raw = localStorage.getItem(DREAM_KPI_MAP_STORAGE_KEY);
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

function unionDeletedRefs(a, b) {
  const A = normalizeDeletedRefs(a);
  const B = normalizeDeletedRefs(b);
  const out = {};
  for (const k of DELETED_REF_KEYS) {
    out[k] = [...new Set([...(A[k] || []), ...(B[k] || [])].map(String))];
  }
  return out;
}

function hasDeletedRefsPayload(p) {
  const dr = p?.deletedRefs;
  if (!dr || typeof dr !== "object") return false;
  return DELETED_REF_KEYS.some((k) => Array.isArray(dr[k]) && dr[k].length > 0);
}

function emptyPayload() {
  return {
    dreams: [],
    goals: [],
    tasks: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
    kpiOrder: {},
    kpiTaskSync: {},
    desiredLife: "",
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
    direction: k.direction === "lower" ? "lower" : "higher",
  }));
  return {
    dreams: Array.isArray(p.dreams) ? p.dreams : [],
    goals: Array.isArray(p.goals) ? p.goals : [],
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
    kpis,
    kpiLogs: Array.isArray(p.kpiLogs) ? p.kpiLogs : [],
    kpiTodos: Array.isArray(p.kpiTodos) ? p.kpiTodos : [],
    kpiDailyRepeatTodos: Array.isArray(p.kpiDailyRepeatTodos) ? p.kpiDailyRepeatTodos : [],
    kpiOrder: p.kpiOrder && typeof p.kpiOrder === "object" ? p.kpiOrder : {},
    kpiTaskSync: p.kpiTaskSync && typeof p.kpiTaskSync === "object" ? p.kpiTaskSync : {},
    desiredLife: typeof p.desiredLife === "string" ? p.desiredLife : "",
    deletedRefs: normalizeDeletedRefs(p.deletedRefs),
    metaServerUpdatedAt:
      typeof p.metaServerUpdatedAt === "string" ? p.metaServerUpdatedAt : "",
    localMetaModifiedAt:
      typeof p.localMetaModifiedAt === "number" && Number.isFinite(p.localMetaModifiedAt)
        ? p.localMetaModifiedAt
        : undefined,
  };
}

export function applyDreamKpiMapToLocalStorage(dbRow) {
  if (!dbRow || typeof dbRow !== "object") return;
  const payload = dbRow.payload != null ? normalizePayload(dbRow.payload) : normalizePayload(dbRow);
  try {
    localStorage.setItem(DREAM_KPI_MAP_STORAGE_KEY, JSON.stringify(payload));
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
    logKpiServerSnapshot("dream", {
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
    dreamId: r.dream_id,
    name: r.name || "",
    unit: r.unit || "",
    targetValue: r.target_value ?? "",
    targetStartDate: r.target_start_date ?? "",
    targetDeadline: r.target_deadline ?? "",
    targetTimeRequired: r.target_time_required ?? "",
    needHabitTracker: !!r.need_habit_tracker,
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
    dreamId: r.dream_id || "",
    date: r.date_display || "",
    dateRaw: r.date_raw || "",
    value: r.value ?? "",
    status: r.status || "",
    memo: r.memo || "",
    dailyCompleted: Array.isArray(dc) ? dc : [],
    dailyIncomplete: Array.isArray(di) ? di : [],
    serverUpdatedAt: serverUpdatedAtFromRow(r),
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
    id: r.id,
    kpiId: r.kpi_id,
    text: r.text || "",
    completed: !!r.completed,
    serverUpdatedAt: serverUpdatedAtFromRow(r),
  };
}

/**
 * 동기화 직전: 서버 fetch 성공 시 기준으로 병합.
 * 동일 id는 localModifiedAt vs serverUpdatedAt 비교, 동률은 서버 행.
 * 메타(goals·kpiOrder 등)는 metaServerUpdatedAt vs localMetaModifiedAt으로 서버 우선(동률 포함).
 */
function mergeDreamKpiPayloadsForSync(localP, serverP) {
  const L = normalizePayload(localP);
  const S = normalizePayload(serverP);
  const dr = unionDeletedRefs(L.deletedRefs, S.deletedRefs);
  const drCat = new Set(dr.categories);
  const drKpi = new Set(dr.kpis);
  const drLog = new Set(dr.kpiLogs);
  const drTodo = new Set(dr.kpiTodos);
  const drDaily = new Set(dr.kpiDailyRepeatTodos);

  const localDreamById = new Map(L.dreams.map((d) => [String(d.id), d]));
  const serverDreamById = new Map(S.dreams.map((d) => [String(d.id), d]));
  const localDreamIds = new Set(localDreamById.keys());

  const mergedDreamIdsOrder = [];
  const seenDream = new Set();
  for (const d of L.dreams) {
    const id = String(d.id);
    if (drCat.has(id)) continue;
    mergedDreamIdsOrder.push(id);
    seenDream.add(id);
  }
  for (const d of S.dreams) {
    const id = String(d.id);
    if (drCat.has(id) || seenDream.has(id)) continue;
    if (localDreamIds.has(id)) continue;
    mergedDreamIdsOrder.push(id);
    seenDream.add(id);
  }
  const mergedDreams = mergedDreamIdsOrder
    .map((id) =>
      pickNewerRowServerWinsTie(localDreamById.get(id), serverDreamById.get(id)),
    )
    .filter(Boolean);
  const mergedDreamIds = new Set(mergedDreams.map((d) => String(d.id)));

  const localKpiById = new Map(L.kpis.map((k) => [String(k.id), k]));
  const serverKpiById = new Map(S.kpis.map((k) => [String(k.id), k]));
  const allKpiIds = new Set([...localKpiById.keys(), ...serverKpiById.keys()]);
  const kpiSet = new Set(
    [...allKpiIds].filter((id) => {
      if (drKpi.has(id)) return false;
      const k = localKpiById.get(id) || serverKpiById.get(id);
      if (!k) return false;
      if (drCat.has(String(k.dreamId))) return false;
      return mergedDreamIds.has(String(k.dreamId));
    }),
  );

  const mergedKpiOrder = [];
  const seenKpi = new Set();
  for (const k of L.kpis) {
    const id = String(k.id);
    if (!kpiSet.has(id)) continue;
    mergedKpiOrder.push(id);
    seenKpi.add(id);
  }
  for (const k of S.kpis) {
    const id = String(k.id);
    if (!kpiSet.has(id) || seenKpi.has(id)) continue;
    mergedKpiOrder.push(id);
    seenKpi.add(id);
  }
  const mergedKpis = mergedKpiOrder
    .map((id) => pickNewerRowServerWinsTie(localKpiById.get(id), serverKpiById.get(id)))
    .filter(Boolean);
  const mergedKpiIds = new Set(mergedKpis.map((k) => String(k.id)));

  function mergeList(localArr, serverArr, drSet, idGetter, keepRow) {
    const localById = new Map(localArr.map((x) => [String(idGetter(x)), x]));
    const serverById = new Map(serverArr.map((x) => [String(idGetter(x)), x]));
    const allIds = new Set([...localById.keys(), ...serverById.keys()]);
    const ids = [...allIds].filter((id) => {
      if (drSet.has(id)) return false;
      return keepRow(id, localById, serverById);
    });
    const idSet = new Set(ids);
    const order = [];
    const seen = new Set();
    for (const x of localArr) {
      const id = String(idGetter(x));
      if (!idSet.has(id)) continue;
      order.push(id);
      seen.add(id);
    }
    for (const id of ids) {
      if (seen.has(id)) continue;
      order.push(id);
      seen.add(id);
    }
    return order
      .map((id) => pickNewerRowServerWinsTie(localById.get(id), serverById.get(id)))
      .filter(Boolean);
  }

  const mergedLogs = mergeList(
    L.kpiLogs,
    S.kpiLogs,
    drLog,
    (l) => l.id,
    (id, lb, sb) => {
      const row = lb.get(id) || sb.get(id);
      if (!row) return false;
      return mergedKpiIds.has(String(row.kpiId));
    },
  );
  const mergedTodos = mergeList(
    L.kpiTodos,
    S.kpiTodos,
    drTodo,
    (t) => t.id,
    (id, lb, sb) => {
      const row = lb.get(id) || sb.get(id);
      if (!row) return false;
      return mergedKpiIds.has(String(row.kpiId));
    },
  );
  const mergedDaily = mergeList(
    L.kpiDailyRepeatTodos,
    S.kpiDailyRepeatTodos,
    drDaily,
    (t) => t.id,
    (id, lb, sb) => {
      const row = lb.get(id) || sb.get(id);
      if (!row) return false;
      return mergedKpiIds.has(String(row.kpiId));
    },
  );

  const sMetaMs = parseIsoMs(S.metaServerUpdatedAt);
  const lMetaMs =
    typeof L.localMetaModifiedAt === "number" && Number.isFinite(L.localMetaModifiedAt)
      ? L.localMetaModifiedAt
      : 0;
  const serverMetaNewerOrEqual = sMetaMs >= lMetaMs;

  return normalizePayload({
    dreams: mergedDreams,
    kpis: mergedKpis,
    kpiLogs: mergedLogs,
    kpiTodos: mergedTodos,
    kpiDailyRepeatTodos: mergedDaily,
    kpiOrder: serverMetaNewerOrEqual ? S.kpiOrder : L.kpiOrder,
    kpiTaskSync: serverMetaNewerOrEqual ? S.kpiTaskSync : L.kpiTaskSync,
    goals: serverMetaNewerOrEqual ? S.goals : L.goals,
    tasks: serverMetaNewerOrEqual ? S.tasks : L.tasks,
    desiredLife: serverMetaNewerOrEqual ? S.desiredLife : L.desiredLife,
    deletedRefs: dr,
  });
}

function deletedRefsFromMetaRow(meta) {
  const raw = meta?.deleted_refs;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return normalizeDeletedRefs(raw);
  }
  return defaultDeletedRefs();
}

function buildPayloadFromNormalizedRows(categories, kpis, logs, todos, daily, meta) {
  const dr = deletedRefsFromMetaRow(meta);
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
  const dreams = sortedCats.map((c) => ({
    id: c.id,
    name: c.name || "",
    serverUpdatedAt: serverUpdatedAtFromRow(c),
  }));
  const dreamIds = new Set(dreams.map((d) => String(d.id)));

  const kpisFiltered = (kpis || []).filter((k) => {
    if (drKpi.has(String(k.id))) return false;
    return dreamIds.has(String(k.dream_id));
  });
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
  const goals = Array.isArray(meta?.goals) ? meta.goals : [];
  const tasks = Array.isArray(meta?.tasks) ? meta.tasks : [];
  const desiredLife = typeof meta?.desired_life === "string" ? meta.desired_life : "";
  const out = normalizePayload({
    dreams,
    goals,
    tasks,
    desiredLife,
    kpis: kpisFiltered.map(rowToKpi),
    kpiLogs: logsFiltered.map(rowToLog),
    kpiTodos: todosFiltered.map(rowToTodo),
    kpiDailyRepeatTodos: dailyFiltered.map(rowToDaily),
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
      rawCounts.categories !== out.dreams.length;
    kpiSyncTrace("dream", "buildPayload(db→앱)", {
      metaHasDeletedRefs: !!(meta?.deleted_refs && typeof meta.deleted_refs === "object"),
      rawDbRows: rawCounts,
      afterDeletedRefsFilter: {
        dreams: out.dreams.length,
        kpis: out.kpis.length,
        kpiLogs: out.kpiLogs.length,
        kpiTodos: out.kpiTodos.length,
        kpiDailyRepeatTodos: out.kpiDailyRepeatTodos.length,
      },
      note: diff
        ? "DB 행 수와 필터 후 불일치 — deleted_refs로 숨김 처리됨(고아 행이 테이블에 남은 경우)"
        : "DB 행 수와 필터 후 일치",
    });
  }
  return out;
}

function metaRowHasData(meta) {
  if (!meta) return false;
  if (Object.keys(meta.kpi_order || {}).length > 0 || Object.keys(meta.kpi_task_sync || {}).length > 0) return true;
  if (Array.isArray(meta.goals) && meta.goals.length > 0) return true;
  if (Array.isArray(meta.tasks) && meta.tasks.length > 0) return true;
  if (typeof meta.desired_life === "string" && meta.desired_life.trim() !== "") return true;
  const dr = meta.deleted_refs;
  if (dr && typeof dr === "object" && !Array.isArray(dr)) {
    if (DELETED_REF_KEYS.some((k) => Array.isArray(dr[k]) && dr[k].length > 0)) return true;
  }
  return false;
}

function hasAnyNormalizedData(categories, kpis, logs, todos, daily, meta) {
  /* dream_map_meta 행이 있으면 = 서버에 한 번이라도 동기화된 스냅샷(내용이 전부 비어 있어도 ‘삭제 반영’ 등 최신 상태) */
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
    (Array.isArray(p.goals) && p.goals.length > 0) ||
    (Array.isArray(p.tasks) && p.tasks.length > 0) ||
    (typeof p.desiredLife === "string" && p.desiredLife.trim() !== "") ||
    hasDeletedRefsPayload(p)
  );
}

function kpiToRow(userId, k) {
  return {
    user_id: userId,
    id: String(k.id),
    dream_id: String(k.dreamId),
    name: (k.name || "").trim(),
    unit: (k.unit || "").trim(),
    target_value: k.targetValue != null ? String(k.targetValue) : "",
    target_start_date: (k.targetStartDate || "").trim(),
    target_deadline: (k.targetDeadline || "").trim(),
    target_time_required: (k.targetTimeRequired || "").trim(),
    need_habit_tracker: !!k.needHabitTracker,
    direction: k.direction === "lower" ? "lower" : "higher",
  };
}

function logToRow(userId, l) {
  return {
    user_id: userId,
    id: String(l.id),
    kpi_id: String(l.kpiId),
    dream_id: String(l.dreamId || ""),
    date_display: (l.date || "").trim(),
    date_raw: (l.dateRaw || "").trim(),
    value: l.value != null ? String(l.value) : "",
    status: (l.status || "").trim(),
    memo: (l.memo || "").trim(),
    daily_completed: Array.isArray(l.dailyCompleted) ? l.dailyCompleted : [],
    daily_incomplete: Array.isArray(l.dailyIncomplete) ? l.dailyIncomplete : [],
  };
}

function todoToRow(userId, t) {
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
    extra: Object.keys(rest).length ? rest : {},
  };
}

function dailyTodoToRow(userId, t) {
  return {
    user_id: userId,
    id: String(t.id),
    kpi_id: String(t.kpiId),
    text: (t.text || "").trim(),
    completed: !!t.completed,
  };
}

/** upsert 실패 시 재시도 */
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
  if (p.dreams.length) {
    const rows = p.dreams.map((d, i) => ({
      user_id: userId,
      id: String(d.id),
      name: (d.name || "").trim(),
      sort_order: i,
    }));
    const { error } = await supabase
      .from("dream_map_categories")
      .upsert(rows, { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`dream_map_categories: ${error.message}`);
  }
  if (p.kpis.length) {
    const { error } = await supabase
      .from("dream_map_kpis")
      .upsert(p.kpis.map((k) => kpiToRow(userId, k)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`dream_map_kpis: ${error.message}`);
  }
  if (p.kpiLogs.length) {
    const { error } = await supabase
      .from("dream_map_kpi_logs")
      .upsert(p.kpiLogs.map((l) => logToRow(userId, l)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`dream_map_kpi_logs: ${error.message}`);
  }
  if (p.kpiTodos.length) {
    const { error } = await supabase
      .from("dream_map_kpi_todos")
      .upsert(p.kpiTodos.map((t) => todoToRow(userId, t)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`dream_map_kpi_todos: ${error.message}`);
  }
  if (p.kpiDailyRepeatTodos.length) {
    const { error } = await supabase
      .from("dream_map_kpi_daily_todos")
      .upsert(p.kpiDailyRepeatTodos.map((t) => dailyTodoToRow(userId, t)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`dream_map_kpi_daily_todos: ${error.message}`);
  }
  if (localPayloadHasAnythingToPersist(p)) {
    const dr = normalizeDeletedRefs(p.deletedRefs);
    const { error } = await supabase.from("dream_map_meta").upsert(
      {
        user_id: userId,
        kpi_order: p.kpiOrder || {},
        kpi_task_sync: p.kpiTaskSync || {},
        goals: Array.isArray(p.goals) ? p.goals : [],
        tasks: Array.isArray(p.tasks) ? p.tasks : [],
        desired_life: typeof p.desiredLife === "string" ? p.desiredLife : "",
        deleted_refs: dr,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`dream_map_meta: ${error.message}`);
  }
}

function localPayloadHasAnythingToPersist(p) {
  return (
    p.dreams.length > 0 ||
    p.kpis.length > 0 ||
    p.kpiLogs.length > 0 ||
    p.kpiTodos.length > 0 ||
    p.kpiDailyRepeatTodos.length > 0 ||
    shouldInsertMetaRow(p)
  );
}

/**
 * pull과 동일한 조회로 서버 스냅샷만 만든다(localStorage는 건드리지 않음). 동기화 병합용.
 * @returns {Promise<{ ok: true, payload: object } | { ok: false }>}
 */
async function fetchDreamMapPayloadFromSupabase(userId) {
  if (!supabase || !userId) return { ok: false };
  const [catRes, kpiRes, logRes, todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("dream_map_categories").select("*").eq("user_id", userId),
    supabase.from("dream_map_kpis").select("*").eq("user_id", userId),
    supabase.from("dream_map_kpi_logs").select("*").eq("user_id", userId),
    supabase.from("dream_map_kpi_todos").select("*").eq("user_id", userId),
    supabase.from("dream_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("dream_map_meta").select("*").eq("user_id", userId).maybeSingle(),
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

/**
 * 서버에만 남은 행 삭제. toSync는 fetch 후 mergeDreamKpiPayloadsForSync 결과(전체 id 집합이 신뢰 가능할 때만 호출).
 */
/** @returns {Record<string, number>} 테이블명 → 삭제한 행 수 */
async function deleteOrphanRowsForUser(userId, p, allowEmptyOrphans) {
  const deletedByTable = {};
  const tables = [
    {
      table: "dream_map_kpi_daily_todos",
      localIds: (p.kpiDailyRepeatTodos || []).map((x) => String(x.id)),
    },
    { table: "dream_map_kpi_todos", localIds: (p.kpiTodos || []).map((x) => String(x.id)) },
    { table: "dream_map_kpi_logs", localIds: (p.kpiLogs || []).map((x) => String(x.id)) },
    { table: "dream_map_kpis", localIds: (p.kpis || []).map((x) => String(x.id)) },
    { table: "dream_map_categories", localIds: (p.dreams || []).map((x) => String(x.id)) },
  ];
  for (const { table, localIds } of tables) {
    const set = new Set(localIds);
    const { data: rows, error } = await supabase.from(table).select("id").eq("user_id", userId);
    if (error) throw new Error(`${table} orphan select: ${error.message}`);
    const serverIds = (rows || []).map((r) => String(r.id));
    const toDelete = serverIds.filter((id) => !set.has(id));
    if (toDelete.length === 0) continue;
    if (localIds.length === 0 && !allowEmptyOrphans) continue;
    for (const id of toDelete) {
      const { error: dErr } = await supabase.from(table).delete().eq("user_id", userId).eq("id", id);
      if (dErr) throw new Error(`${table} orphan delete ${id}: ${dErr.message}`);
      deletedByTable[table] = (deletedByTable[table] || 0) + 1;
    }
  }
  return deletedByTable;
}

/** 저장 시 변경된 행에만 localModifiedAt, 메타 변경 시 localMetaModifiedAt */
export function applyDreamKpiTimestampsOnSave(prev, next) {
  const out = { ...normalizePayload(next) };
  const prevN = prev ? normalizePayload(prev) : emptyPayload();
  out.dreams = bumpEntityArrayLocalModified(prevN.dreams, out.dreams, (x) => x.id);
  out.kpis = bumpEntityArrayLocalModified(prevN.kpis, out.kpis, (x) => x.id);
  out.kpiLogs = bumpEntityArrayLocalModified(prevN.kpiLogs, out.kpiLogs, (x) => x.id);
  out.kpiTodos = bumpEntityArrayLocalModified(prevN.kpiTodos, out.kpiTodos, (x) => x.id);
  out.kpiDailyRepeatTodos = bumpEntityArrayLocalModified(
    prevN.kpiDailyRepeatTodos,
    out.kpiDailyRepeatTodos,
    (x) => x.id,
  );
  const metaChanged =
    JSON.stringify(prevN.goals) !== JSON.stringify(out.goals) ||
    JSON.stringify(prevN.tasks) !== JSON.stringify(out.tasks) ||
    (prevN.desiredLife || "") !== (out.desiredLife || "") ||
    JSON.stringify(prevN.kpiOrder) !== JSON.stringify(out.kpiOrder) ||
    JSON.stringify(prevN.kpiTaskSync) !== JSON.stringify(out.kpiTaskSync) ||
    JSON.stringify(prevN.deletedRefs) !== JSON.stringify(out.deletedRefs);
  if (metaChanged) out.localMetaModifiedAt = Date.now();
  else out.localMetaModifiedAt = prevN.localMetaModifiedAt;
  return normalizePayload(out);
}

/** dream_map_* pull·sync 직렬화 — 업로드(merge·upsert) 도중 pull이 끼면 옛 서버 스냅샷으로 로컬이 덮일 수 있음 */
let _dreamKpiServerChain = Promise.resolve();
function runSerializedDreamKpiServerOp(fn) {
  const next = _dreamKpiServerChain.then(fn, fn);
  _dreamKpiServerChain = next.catch(() => {});
  return next;
}

/** @returns {Promise<boolean>} 서버 데이터로 로컬을 갱신했으면 true */
async function pullDreamKpiMapFromSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    logKpiServerSnapshot("dream", {
      op: "pull",
      ok: false,
      reason: !supabase ? "no_supabase" : "no_session",
    });
    kpiSyncDebugLog("꿈 pull", {
      ok: false,
      reason: !supabase ? "Supabase 클라이언트 없음" : "로그인 세션 없음(같은 계정으로 데스크탑에서도 로그인 필요)",
    });
    return false;
  }

  const [catRes, kpiRes, logRes, todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("dream_map_categories").select("*").eq("user_id", userId),
    supabase.from("dream_map_kpis").select("*").eq("user_id", userId),
    supabase.from("dream_map_kpi_logs").select("*").eq("user_id", userId),
    supabase.from("dream_map_kpi_todos").select("*").eq("user_id", userId),
    supabase.from("dream_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("dream_map_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  for (const res of [catRes, kpiRes, logRes, todoRes, dailyRes]) {
    if (res.error) {
      logKpiServerSnapshot("dream", { op: "pull", ok: false, error: res.error.message, step: "table" });
      kpiSyncDebugLog("꿈 pull", { ok: false, error: res.error.message });
      return false;
    }
  }
  if (metaRes.error) {
    logKpiServerSnapshot("dream", { op: "pull", ok: false, error: metaRes.error.message, step: "meta" });
    kpiSyncDebugLog("꿈 pull", { ok: false, error: metaRes.error.message, step: "meta" });
    return false;
  }

  const categories = catRes.data || [];
  const kpis = kpiRes.data || [];
  const logs = logRes.data || [];
  const todos = todoRes.data || [];
  const daily = dailyRes.data || [];
  const meta = metaRes.data;

  if (hasAnyNormalizedData(categories, kpis, logs, todos, daily, meta)) {
    const payload = buildPayloadFromNormalizedRows(
      categories,
      kpis,
      logs,
      todos,
      daily,
      meta,
    );
    try {
      localStorage.setItem(DREAM_KPI_MAP_STORAGE_KEY, JSON.stringify(payload));
    } catch (_) {}
    kpiSyncDebugLog("꿈 pull → 완료", {
      source: "Supabase dream_map_* (서버 스냅샷만)",
      localKey: DREAM_KPI_MAP_STORAGE_KEY,
      counts: {
        categories: categories.length,
        kpis: kpis.length,
        logs: logs.length,
        todos: todos.length,
        dailyTodos: daily.length,
      },
      note: "이후 화면은 loadDreamMap()이 이 localStorage 키만 읽음",
    });
    kpiSyncTrace("dream", "pull→localStorage", {
      userIdPrefix: String(userId).slice(0, 8),
      rawDbRows: {
        categories: categories.length,
        kpis: kpis.length,
        logs: logs.length,
        todos: todos.length,
        daily: daily.length,
      },
      payloadSummary: kpiSyncPayloadSummary("dream", payload),
    });
    logKpiServerSnapshot("dream", {
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

  /* 서버에 dream_map_meta도 없고(=한 번도 동기화 안 된 빈 서버) 로컬만 있을 때만 덮어쓰기 유보 — 삭제 반영(meta만 있는 빈 스냅샷)은 위 분기에서 서버 기준 적용됨 */
  const localBefore = readLocalPayload();
  if (localPayloadHasAnythingToPersist(localBefore)) {
    kpiSyncDebugLog("꿈 pull", {
      ok: false,
      skipped:
        "서버에 스냅샷(dream_map_meta) 없음 — 미동기화로 보고 로컬 유지 후 업로드 예약",
      localCounts: {
        dreams: localBefore.dreams.length,
        kpis: localBefore.kpis.length,
        kpiLogs: localBefore.kpiLogs.length,
      },
    });
    scheduleDreamKpiMapSyncPush();
    return false;
  }

  const emptyPayload = buildPayloadFromNormalizedRows([], [], [], [], [], null);
  try {
    localStorage.setItem(DREAM_KPI_MAP_STORAGE_KEY, JSON.stringify(emptyPayload));
  } catch (_) {}
  kpiSyncDebugLog("꿈 pull → 완료", {
    source: "Supabase dream_map_*",
    localKey: DREAM_KPI_MAP_STORAGE_KEY,
    counts: { categories: 0, kpis: 0, logs: 0, todos: 0, dailyTodos: 0 },
    note: "서버·로컬 모두 비어 있음 → 빈 payload로 통일",
  });
  logKpiServerSnapshot("dream", {
    op: "pull",
    ok: true,
    policy: "server_snapshot_only",
    note: "empty_server_and_local",
    dbRowCounts: { categories: 0, kpis: 0, logs: 0, todos: 0, dailyTodos: 0 },
  });
  return true;
}

export function pullDreamKpiMapFromSupabase() {
  return runSerializedDreamKpiServerOp(() => pullDreamKpiMapFromSupabaseImpl());
}

/** 서버에 반영해야 할 로컬 변경이 남아 있음(디바운스 대기 포함) */
let _dreamKpiPushDirty = false;

async function runDreamKpiMapSyncOnce() {
  const userId = await getSessionUserId();
  if (!supabase) {
    if (!_warnedNoSupabaseClient) {
      _warnedNoSupabaseClient = true;
      dreamKpiUploadLog("skip", {
        reason: "Supabase 없음 — .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인",
      });
    }
    return;
  }
  if (!userId) {
    if (!_warnedNoAuthSession) {
      _warnedNoAuthSession = true;
      dreamKpiUploadLog("skip", { reason: "로그인 세션 없음 — 서버로 올리지 않음" });
    }
    return;
  }

  const checked = readLocalPayloadStrictForSync();
  if (!checked.ok) {
    dreamKpiUploadLog("error", {
      phase: "local_read",
      message:
        "이 브라우저 저장값(JSON)이 깨져 있어 서버는 건드리지 않았습니다. 새로고침·다른 기기 백업을 확인해 주세요.",
      detail: checked.message,
    });
    return;
  }
  const { payload: p, rawMissing } = checked;
  /* 키 자체가 없으면 = 아직 저장 이력 없음 → 빈 상태로 서버까지 지우지 않음 */
  if (rawMissing && !localPayloadHasAnythingToPersist(p)) {
    dreamKpiUploadLog("skip", {
      reason: "브라우저에 꿈 KPI 데이터 키 없음 — 서버 삭제·덮어쓰기 안 함",
    });
    return;
  }

  try {
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("dream", "sync:1-localRead", {
        userIdPrefix: String(userId).slice(0, 8),
        rawKeyMissing: rawMissing,
        summary: kpiSyncPayloadSummary("dream", p),
      });
    }
    const fetched = await fetchDreamMapPayloadFromSupabase(userId);
    const mergedFromServer = fetched.ok;
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("dream", "sync:2-serverFetch", {
        ok: fetched.ok,
        summary: fetched.ok ? kpiSyncPayloadSummary("dream", fetched.payload) : null,
        meaning: mergedFromServer
          ? "서버 스냅샷과 로컬 merge 예정"
          : "서버 조회 실패 — 로컬만으로 upsert(고아 삭제 생략 가능)",
      });
    }
    const toSync = fetched.ok ? mergeDreamKpiPayloadsForSync(p, fetched.payload) : normalizePayload(p);
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("dream", "sync:3-afterMerge", {
        mergedFromServer,
        summary: kpiSyncPayloadSummary("dream", toSync),
      });
    }

    if (localPayloadHasAnythingToPersist(toSync)) {
      await upsertNormalizedFromPayloadWithRetry(userId, toSync);
      if (mergedFromServer) {
        const orphanDel = await deleteOrphanRowsForUser(userId, toSync, true);
        kpiSyncTrace("dream", "sync:4-orphanDelete", {
          deletedByTable: orphanDel,
          meaning: "서버에만 남은 id를 DB에서 제거한 개수(0이면 이미 정리됨)",
        });
      } else {
        kpiSyncTrace("dream", "sync:4-orphanDelete", {
          skipped: true,
          reason: "서버 fetch 실패 시 고아 삭제를 하지 않음(빈 로컬로 원격 전체 삭제 방지)",
        });
      }
    } else {
      /* 로컬이 완전히 비었을 때도 meta 한 줄을 남겨 ‘서버 최신=비움’을 pull에서 구분 (미동기화 빈 서버와 구분) */
      let metaEmptyErr = null;
      const drEmpty = normalizeDeletedRefs(toSync.deletedRefs);
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.from("dream_map_meta").upsert(
          {
            user_id: userId,
            kpi_order: {},
            kpi_task_sync: {},
            goals: [],
            tasks: [],
            desired_life: "",
            deleted_refs: drEmpty,
          },
          { onConflict: "user_id" },
        );
        metaEmptyErr = error;
        if (!metaEmptyErr) break;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      }
      if (metaEmptyErr) throw new Error(`dream_map_meta(empty): ${metaEmptyErr.message}`);
      if (mergedFromServer) {
        const orphanDel = await deleteOrphanRowsForUser(userId, toSync, true);
        kpiSyncTrace("dream", "sync:4-orphanDelete(emptyPayloadBranch)", {
          deletedByTable: orphanDel,
        });
      } else {
        kpiSyncTrace("dream", "sync:4-orphanDelete", {
          skipped: true,
          reason: "서버 fetch 실패",
        });
      }
    }

    if (mergedFromServer) {
      const afterSync = await fetchDreamMapPayloadFromSupabase(userId);
      if (afterSync.ok) {
        try {
          const snap = normalizePayload(afterSync.payload);
          const nextRaw = JSON.stringify(snap);
          const prevRaw = localStorage.getItem(DREAM_KPI_MAP_STORAGE_KEY);
          if (prevRaw !== nextRaw) {
            localStorage.setItem(DREAM_KPI_MAP_STORAGE_KEY, nextRaw);
            window.dispatchEvent(new CustomEvent("dream-kpi-map-saved", { detail: { fromServerMerge: true, fromPush: true } }));
          }
        } catch (_) {}
      }
    }

    const hasData = localPayloadHasAnythingToPersist(toSync);
    dreamKpiUploadLog("ok", {
      mode: hasData ? "upsert" : "empty_meta_only",
      mergedFromServer,
      counts: {
        dreams: toSync.dreams.length,
        kpis: toSync.kpis.length,
        kpiLogs: toSync.kpiLogs.length,
        kpiTodos: toSync.kpiTodos.length,
        kpiDailyRepeatTodos: toSync.kpiDailyRepeatTodos.length,
      },
    });
    /* 이미 또 저장되어 디바운스가 걸려 있으면 아직 반영 대기 중으로 둠 */
    if (!_pushTimer) {
      _dreamKpiPushDirty = false;
    }
  } catch (e) {
    const msg = e?.message || String(e);
    dreamKpiUploadLog("error", { message: msg });
    kpiSyncDebugLog("꿈 sync 실패", { message: msg });
  }
}

/** @returns {Promise<void>} */
export function syncDreamKpiMapToSupabase() {
  return runSerializedDreamKpiServerOp(() => runDreamKpiMapSyncOnce());
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 800;

export function flushDreamKpiMapSyncPush() {
  if (!supabase) return;
  const hadPending = !!_pushTimer;
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  /* 방금 디바운스로 올린 직후 탭만 바꾼 경우: 대기 작업 없고 이미 반영됨 → 한 번 더 업로드·ok 로그 방지 */
  if (!hadPending && !_dreamKpiPushDirty) return;
  return syncDreamKpiMapToSupabase().catch((e) => {
    dreamKpiUploadLog("error", { phase: "flush", message: e?.message || String(e) });
  });
}

export function scheduleDreamKpiMapSyncPush() {
  if (!supabase) return;
  _dreamKpiPushDirty = true;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncDreamKpiMapToSupabase().catch((e) => {
      dreamKpiUploadLog("error", { phase: "debounced_push", message: e?.message || String(e) });
    });
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;
let _flushListenersAttached = false;

function attachDreamKpiMapFlushOnLeave() {
  if (_flushListenersAttached) return;
  _flushListenersAttached = true;
  const run = () => {
    void flushDreamKpiMapSyncPush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") run();
  });
  window.addEventListener("pagehide", run);
}

export function attachDreamKpiMapSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  attachDreamKpiMapFlushOnLeave();
  window.addEventListener("dream-kpi-map-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
    syncDreamKpiMapToSupabase().catch((err) => {
      dreamKpiUploadLog("error", { phase: "immediate_push", message: err?.message || String(err) });
    });
  });
}

/** @returns {Promise<boolean>} pull로 로컬이 바뀌었으면 true */
export async function hydrateDreamKpiMapFromCloud() {
  lpPullDebug("hydrateDreamKpiMapFromCloud", {});
  kpiSyncDebugLog("꿈 hydrate 시작", { when: "앱 부팅 시 Promise.all 안" });
  attachDreamKpiMapSaveListener();
  if (!supabase) {
    kpiSyncDebugLog("꿈 hydrate 생략", { reason: "Supabase 없음" });
    return false;
  }
  const applied = await pullDreamKpiMapFromSupabase();
  kpiSyncDebugLog("꿈 hydrate 끝", {
    applied,
    meaning: applied
      ? "서버 데이터로 localStorage(kpi-dream-map) 갱신됨 → 이후 render가 이걸 읽음"
      : "pull 실패·세션 없음 등 — 기존 로컬 유지",
  });
  return applied;
}
