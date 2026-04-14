/**
 * 행복 KPI 맵 ↔ Supabase 정규화 테이블 (happiness_map_*)
 * 로컬 키 kpi-happiness-map (happinesses, kpis, kpiLogs, …)
 */

import { supabase } from "../supabase.js";
import { kpiSyncDebugLog, kpiSyncDebugEnabled, kpiSyncPayloadSummary, kpiSyncTrace } from "./kpiSyncDebug.js";
import { logKpiServerSnapshot } from "./kpiServerAuditLog.js";
import {
  bumpEntityArrayLocalModified,
  parseIsoMs,
  pickNewerRowServerWinsTie,
  serverUpdatedAtFromRow,
} from "./kpiMapLwwMerge.js";
import { lpPullDebug } from "./lpPullDebug.js";

export const HAPPINESS_KPI_MAP_STORAGE_KEY = "kpi-happiness-map";

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

function happinessKpiUploadLog(phase, detail) {
  if (phase !== "ok" && phase !== "error") return;
  const extra = detail && typeof detail === "object" ? { ...detail } : detail != null ? { note: detail } : {};
  logKpiServerSnapshot("happiness", { op: "push", phase, ...extra });
}

function readLocalPayload() {
  try {
    const raw = localStorage.getItem(HAPPINESS_KPI_MAP_STORAGE_KEY);
    if (!raw) return emptyPayload();
    const p = JSON.parse(raw);
    return normalizePayload(p);
  } catch (_) {
    return emptyPayload();
  }
}

function readLocalPayloadStrictForSync() {
  const raw = localStorage.getItem(HAPPINESS_KPI_MAP_STORAGE_KEY);
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
    direction: k.direction === "lower" ? "lower" : "higher",
  }));
  return {
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
  };
}

export function applyHappinessKpiMapToLocalStorage(dbRow) {
  if (!dbRow || typeof dbRow !== "object") return;
  const payload = dbRow.payload != null ? normalizePayload(dbRow.payload) : normalizePayload(dbRow);
  try {
    localStorage.setItem(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(payload));
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
  const happinesses = sortedCats.map((c) => ({
    id: c.id,
    name: c.name || "",
    serverUpdatedAt: serverUpdatedAtFromRow(c),
  }));
  const happinessIds = new Set(happinesses.map((h) => String(h.id)));

  const kpisFiltered = (kpis || []).filter((k) => {
    if (drKpi.has(String(k.id))) return false;
    return happinessIds.has(String(k.happiness_id));
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
  const out = normalizePayload({
    happinesses,
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

/** 동기화 직전 병합: 동일 id는 타임스탬프·동률은 서버, 메타는 metaServerUpdatedAt 우선 */
function mergeHappinessKpiPayloadsForSync(localP, serverP) {
  const L = normalizePayload(localP);
  const S = normalizePayload(serverP);
  const dr = unionDeletedRefs(L.deletedRefs, S.deletedRefs);
  const drCat = new Set(dr.categories);
  const drKpi = new Set(dr.kpis);
  const drLog = new Set(dr.kpiLogs);
  const drTodo = new Set(dr.kpiTodos);
  const drDaily = new Set(dr.kpiDailyRepeatTodos);

  const localHById = new Map(L.happinesses.map((h) => [String(h.id), h]));
  const serverHById = new Map(S.happinesses.map((h) => [String(h.id), h]));
  const localHIds = new Set(localHById.keys());

  const mergedHOrder = [];
  const seenH = new Set();
  for (const h of L.happinesses) {
    const id = String(h.id);
    if (drCat.has(id)) continue;
    mergedHOrder.push(id);
    seenH.add(id);
  }
  for (const h of S.happinesses) {
    const id = String(h.id);
    if (drCat.has(id) || seenH.has(id)) continue;
    if (localHIds.has(id)) continue;
    mergedHOrder.push(id);
    seenH.add(id);
  }
  const mergedHappinesses = mergedHOrder
    .map((id) => pickNewerRowServerWinsTie(localHById.get(id), serverHById.get(id)))
    .filter(Boolean);
  const mergedHappinessIds = new Set(mergedHappinesses.map((h) => String(h.id)));

  const localKpiById = new Map(L.kpis.map((k) => [String(k.id), k]));
  const serverKpiById = new Map(S.kpis.map((k) => [String(k.id), k]));
  const allKpiIds = new Set([...localKpiById.keys(), ...serverKpiById.keys()]);
  const kpiSet = new Set(
    [...allKpiIds].filter((id) => {
      if (drKpi.has(id)) return false;
      const k = localKpiById.get(id) || serverKpiById.get(id);
      if (!k) return false;
      if (drCat.has(String(k.happinessId))) return false;
      return mergedHappinessIds.has(String(k.happinessId));
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
    happinesses: mergedHappinesses,
    kpis: mergedKpis,
    kpiLogs: mergedLogs,
    kpiTodos: mergedTodos,
    kpiDailyRepeatTodos: mergedDaily,
    kpiOrder: serverMetaNewerOrEqual ? S.kpiOrder : L.kpiOrder,
    kpiTaskSync: serverMetaNewerOrEqual ? S.kpiTaskSync : L.kpiTaskSync,
    deletedRefs: dr,
  });
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
      .upsert(p.kpiTodos.map((t) => todoToRow(userId, t)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`happiness_map_kpi_todos: ${error.message}`);
  }
  if (p.kpiDailyRepeatTodos.length) {
    const { error } = await supabase
      .from("happiness_map_kpi_daily_todos")
      .upsert(p.kpiDailyRepeatTodos.map((t) => dailyTodoToRow(userId, t)), { onConflict: UPSERT_CONFLICT_ROW });
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

async function deleteOrphanRowsForUser(userId, p, allowEmptyOrphans) {
  const deletedByTable = {};
  const tables = [
    {
      table: "happiness_map_kpi_daily_todos",
      localIds: (p.kpiDailyRepeatTodos || []).map((x) => String(x.id)),
    },
    { table: "happiness_map_kpi_todos", localIds: (p.kpiTodos || []).map((x) => String(x.id)) },
    { table: "happiness_map_kpi_logs", localIds: (p.kpiLogs || []).map((x) => String(x.id)) },
    { table: "happiness_map_kpis", localIds: (p.kpis || []).map((x) => String(x.id)) },
    { table: "happiness_map_categories", localIds: (p.happinesses || []).map((x) => String(x.id)) },
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

/** @returns {Promise<boolean>} 서버 데이터로 로컬을 갱신했으면 true */
async function pullHappinessKpiMapFromSupabaseImpl() {
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

  const [catRes, kpiRes, logRes, todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("happiness_map_categories").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpis").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpi_logs").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpi_todos").select("*").eq("user_id", userId),
    supabase.from("happiness_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("happiness_map_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  for (const res of [catRes, kpiRes, logRes, todoRes, dailyRes]) {
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
  const todos = todoRes.data || [];
  const daily = dailyRes.data || [];
  const meta = metaRes.data;

  if (!hasAnyNormalizedData(categories, kpis, logs, todos, daily, meta)) {
    const localOnly = readLocalPayload();
    if (localPayloadHasAnythingToPersist(localOnly)) {
      kpiSyncDebugLog("행복 pull", {
        ok: false,
        skipped: "서버에 happiness_map 스냅샷 없음 — 로컬 유지 후 업로드 예약",
      });
      scheduleHappinessKpiMapSyncPush();
      return false;
    }
    const emptyPayload = buildPayloadFromNormalizedRows([], [], [], [], [], null);
    try {
      localStorage.setItem(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(emptyPayload));
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
  const merged = mergeHappinessKpiPayloadsForSync(readLocalPayload(), serverPayload);
  try {
    localStorage.setItem(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(merged));
  } catch (_) {}
  kpiSyncDebugLog("행복 pull → 완료", {
    source: "Supabase happiness_map_* (서버+로컬 merge)",
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
    payloadSummary: kpiSyncPayloadSummary("happiness", merged),
  });
  logKpiServerSnapshot("happiness", {
    op: "pull",
    ok: true,
    policy: "local_server_merge",
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

export function pullHappinessKpiMapFromSupabase() {
  return runSerializedHappinessKpiServerOp(() => pullHappinessKpiMapFromSupabaseImpl());
}

/** 서버에 반영해야 할 로컬 변경이 남아 있음(디바운스 대기 포함) */
let _happinessKpiPushDirty = false;

async function runHappinessKpiMapSyncOnce() {
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
          ? "서버 스냅샷과 로컬 merge 예정"
          : "서버 조회 실패 — 로컬만으로 upsert(고아 삭제 생략 가능)",
      });
    }
    const toSync = fetched.ok ? mergeHappinessKpiPayloadsForSync(p, fetched.payload) : normalizePayload(p);
    if (kpiSyncDebugEnabled()) {
      kpiSyncTrace("happiness", "sync:3-afterMerge", {
        mergedFromServer,
        summary: kpiSyncPayloadSummary("happiness", toSync),
      });
    }

    if (localPayloadHasAnythingToPersist(toSync)) {
      await upsertNormalizedFromPayloadWithRetry(userId, toSync);
      if (mergedFromServer) {
        const orphanDel = await deleteOrphanRowsForUser(userId, toSync, true);
        kpiSyncTrace("happiness", "sync:4-orphanDelete", {
          deletedByTable: orphanDel,
          meaning: "서버에만 남은 id를 DB에서 제거한 개수",
        });
      } else {
        kpiSyncTrace("happiness", "sync:4-orphanDelete", {
          skipped: true,
          reason: "서버 fetch 실패 시 고아 삭제 안 함",
        });
      }
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
      if (mergedFromServer) {
        const orphanDel = await deleteOrphanRowsForUser(userId, toSync, true);
        kpiSyncTrace("happiness", "sync:4-orphanDelete(emptyPayloadBranch)", { deletedByTable: orphanDel });
      } else {
        kpiSyncTrace("happiness", "sync:4-orphanDelete", { skipped: true, reason: "서버 fetch 실패" });
      }
    }

    if (mergedFromServer) {
      const afterSync = await fetchHappinessMapPayloadFromSupabase(userId);
      if (afterSync.ok) {
        try {
          const snap = normalizePayload(afterSync.payload);
          const finalPayload = mergeHappinessKpiPayloadsForSync(toSync, snap);
          const nextRaw = JSON.stringify(finalPayload);
          const prevRaw = localStorage.getItem(HAPPINESS_KPI_MAP_STORAGE_KEY);
          if (prevRaw !== nextRaw) {
            localStorage.setItem(HAPPINESS_KPI_MAP_STORAGE_KEY, nextRaw);
            window.dispatchEvent(new CustomEvent("happiness-kpi-map-saved", { detail: { fromServerMerge: true, fromPush: true } }));
          }
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
}

/** @returns {Promise<void>} */
export function syncHappinessKpiMapToSupabase() {
  return runSerializedHappinessKpiServerOp(() => runHappinessKpiMapSyncOnce());
}

let _pushTimer = null;
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
let _flushListenersAttached = false;

function attachHappinessKpiMapFlushOnLeave() {
  if (_flushListenersAttached) return;
  _flushListenersAttached = true;
  const run = () => {
    void flushHappinessKpiMapSyncPush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") run();
  });
  window.addEventListener("pagehide", run);
}

export function attachHappinessKpiMapSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  attachHappinessKpiMapFlushOnLeave();
  window.addEventListener("happiness-kpi-map-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
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
  const applied = await pullHappinessKpiMapFromSupabase();
  kpiSyncDebugLog("행복 hydrate 끝", { applied });
  return applied;
}
