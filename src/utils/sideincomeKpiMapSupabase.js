/**
 * 부수입 맵 ↔ Supabase 정규화 (sideincome_map_*)
 * 로컬 kpi-sideincome-paths: paths(목표금액·단위), pathLogs, kpis, kpiLogs, …
 */

import { supabase } from "../supabase.js";
import { kpiSyncDebugLog } from "./kpiSyncDebug.js";

export const SIDEINCOME_KPI_MAP_STORAGE_KEY = "kpi-sideincome-paths";

let _warnedNoSupabaseClient = false;
let _warnedNoAuthSession = false;

const DELETED_REF_KEYS = ["categories", "pathLogs", "kpis", "kpiLogs", "kpiTodos", "kpiDailyRepeatTodos"];

function defaultDeletedRefs() {
  return {
    categories: [],
    pathLogs: [],
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

function sideincomeKpiUploadLog(phase, detail) {
  try {
    console.info("[sideincome-kpi-upload]", phase, detail != null ? detail : "");
  } catch (_) {}
}

function readLocalPayload() {
  try {
    const raw = localStorage.getItem(SIDEINCOME_KPI_MAP_STORAGE_KEY);
    if (!raw) return emptyPayload();
    const p = JSON.parse(raw);
    return normalizePayload(p);
  } catch (_) {
    return emptyPayload();
  }
}

function readLocalPayloadStrictForSync() {
  const raw = localStorage.getItem(SIDEINCOME_KPI_MAP_STORAGE_KEY);
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
    paths: [],
    pathLogs: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
    kpiOrder: {},
    kpiTaskSync: {},
    deletedRefs: defaultDeletedRefs(),
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
    paths: Array.isArray(p.paths) ? p.paths : [],
    pathLogs: Array.isArray(p.pathLogs) ? p.pathLogs : [],
    kpis,
    kpiLogs: Array.isArray(p.kpiLogs) ? p.kpiLogs : [],
    kpiTodos: Array.isArray(p.kpiTodos) ? p.kpiTodos : [],
    kpiDailyRepeatTodos: Array.isArray(p.kpiDailyRepeatTodos) ? p.kpiDailyRepeatTodos : [],
    kpiOrder: p.kpiOrder && typeof p.kpiOrder === "object" ? p.kpiOrder : {},
    kpiTaskSync: p.kpiTaskSync && typeof p.kpiTaskSync === "object" ? p.kpiTaskSync : {},
    deletedRefs: normalizeDeletedRefs(p.deletedRefs),
  };
}

export function applySideincomeKpiMapToLocalStorage(dbRow) {
  if (!dbRow || typeof dbRow !== "object") return;
  const payload = dbRow.payload != null ? normalizePayload(dbRow.payload) : normalizePayload(dbRow);
  try {
    localStorage.setItem(SIDEINCOME_KPI_MAP_STORAGE_KEY, JSON.stringify(payload));
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
    console.warn("[sideincome-kpi-map] getUser", error.message);
    return null;
  }
  return user?.id ?? null;
}

function rowToPath(r) {
  return {
    id: r.id,
    name: r.name || "",
    targetAmount: r.target_amount ?? "",
    unit: r.unit || "",
  };
}

function rowToPathLog(r) {
  return {
    id: r.id,
    pathId: r.path_id,
    date: r.date_display || "",
    dateRaw: r.date_raw || "",
    value: r.value ?? "",
    status: r.status || "",
    memo: r.memo || "",
  };
}

function rowToKpi(r) {
  return {
    id: r.id,
    pathId: r.path_id,
    name: r.name || "",
    unit: r.unit || "",
    targetValue: r.target_value ?? "",
    targetStartDate: r.target_start_date ?? "",
    targetDeadline: r.target_deadline ?? "",
    targetTimeRequired: r.target_time_required ?? "",
    needHabitTracker: !!r.need_habit_tracker,
    direction: r.direction === "lower" ? "lower" : "higher",
  };
}

function rowToKpiLog(r) {
  const dc = r.daily_completed;
  const di = r.daily_incomplete;
  return {
    id: r.id,
    kpiId: r.kpi_id,
    pathId: r.path_id || "",
    date: r.date_display || "",
    dateRaw: r.date_raw || "",
    value: r.value ?? "",
    status: r.status || "",
    memo: r.memo || "",
    dailyCompleted: Array.isArray(dc) ? dc : [],
    dailyIncomplete: Array.isArray(di) ? di : [],
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
  };
}

function rowToDaily(r) {
  return {
    id: r.id,
    kpiId: r.kpi_id,
    text: r.text || "",
    completed: !!r.completed,
  };
}

function deletedRefsFromMetaRow(meta) {
  const raw = meta?.deleted_refs;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return normalizeDeletedRefs(raw);
  }
  return defaultDeletedRefs();
}

function buildPayloadFromRows(pathRows, pathLogRows, kpiRows, kpiLogRows, todoRows, dailyRows, meta) {
  const sortedPaths = [...(pathRows || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const paths = sortedPaths.map(rowToPath);
  const kpiOrder = meta?.kpi_order && typeof meta.kpi_order === "object" ? meta.kpi_order : {};
  const kpiTaskSync = meta?.kpi_task_sync && typeof meta.kpi_task_sync === "object" ? meta.kpi_task_sync : {};
  return normalizePayload({
    paths,
    pathLogs: (pathLogRows || []).map(rowToPathLog),
    kpis: (kpiRows || []).map(rowToKpi),
    kpiLogs: (kpiLogRows || []).map(rowToKpiLog),
    kpiTodos: (todoRows || []).map(rowToTodo),
    kpiDailyRepeatTodos: (dailyRows || []).map(rowToDaily),
    kpiOrder,
    kpiTaskSync,
    deletedRefs: deletedRefsFromMetaRow(meta),
  });
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

function hasAnyNormalizedData(paths, pathLogs, kpis, kpiLogs, todos, daily, meta) {
  if (meta != null && typeof meta === "object" && meta.user_id) {
    return true;
  }
  if (
    (paths?.length || 0) +
      (pathLogs?.length || 0) +
      (kpis?.length || 0) +
      (kpiLogs?.length || 0) +
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

/** 서버 스냅샷 + 로컬 병합 (행복·꿈 KPI와 동일 패턴, 경로= categories 키) */
function mergeSideincomeKpiPayloadsForSync(localP, serverP) {
  const L = normalizePayload(localP);
  const S = normalizePayload(serverP);
  const dr = unionDeletedRefs(L.deletedRefs, S.deletedRefs);
  const drCat = new Set(dr.categories);
  const drPathLog = new Set(dr.pathLogs);
  const drKpi = new Set(dr.kpis);
  const drLog = new Set(dr.kpiLogs);
  const drTodo = new Set(dr.kpiTodos);
  const drDaily = new Set(dr.kpiDailyRepeatTodos);

  const localPathById = new Map(L.paths.map((p) => [String(p.id), p]));
  const serverPathById = new Map(S.paths.map((p) => [String(p.id), p]));
  const localPathIds = new Set(localPathById.keys());

  const mergedPathOrder = [];
  const seenPath = new Set();
  for (const p of L.paths) {
    const id = String(p.id);
    if (drCat.has(id)) continue;
    mergedPathOrder.push(id);
    seenPath.add(id);
  }
  for (const p of S.paths) {
    const id = String(p.id);
    if (drCat.has(id) || seenPath.has(id)) continue;
    if (localPathIds.has(id)) continue;
    mergedPathOrder.push(id);
    seenPath.add(id);
  }
  const mergedPaths = mergedPathOrder.map((id) => localPathById.get(id) || serverPathById.get(id)).filter(Boolean);
  const mergedPathIds = new Set(mergedPaths.map((p) => String(p.id)));

  const localKpiById = new Map(L.kpis.map((k) => [String(k.id), k]));
  const serverKpiById = new Map(S.kpis.map((k) => [String(k.id), k]));
  const allKpiIds = new Set([...localKpiById.keys(), ...serverKpiById.keys()]);
  const kpiSet = new Set(
    [...allKpiIds].filter((id) => {
      if (drKpi.has(id)) return false;
      const k = localKpiById.get(id) || serverKpiById.get(id);
      if (!k) return false;
      if (drCat.has(String(k.pathId))) return false;
      return mergedPathIds.has(String(k.pathId));
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
  const mergedKpis = mergedKpiOrder.map((id) => localKpiById.get(id) || serverKpiById.get(id)).filter(Boolean);
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
    return order.map((id) => localById.get(id) || serverById.get(id)).filter(Boolean);
  }

  const mergedPathLogs = mergeList(
    L.pathLogs || [],
    S.pathLogs || [],
    drPathLog,
    (l) => l.id,
    (id, lb, sb) => {
      const row = lb.get(id) || sb.get(id);
      if (!row) return false;
      return mergedPathIds.has(String(row.pathId));
    },
  );
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

  return normalizePayload({
    paths: mergedPaths,
    pathLogs: mergedPathLogs,
    kpis: mergedKpis,
    kpiLogs: mergedLogs,
    kpiTodos: mergedTodos,
    kpiDailyRepeatTodos: mergedDaily,
    kpiOrder: L.kpiOrder,
    kpiTaskSync: L.kpiTaskSync,
    deletedRefs: dr,
  });
}

function pathToRow(userId, path, sortOrder) {
  return {
    user_id: userId,
    id: String(path.id),
    name: (path.name || "").trim(),
    target_amount: path.targetAmount != null ? String(path.targetAmount) : "",
    unit: (path.unit || "").trim(),
    sort_order: sortOrder,
  };
}

function pathLogToRow(userId, l) {
  return {
    user_id: userId,
    id: String(l.id),
    path_id: String(l.pathId),
    date_display: (l.date || "").trim(),
    date_raw: (l.dateRaw || "").trim(),
    value: l.value != null ? String(l.value) : "",
    status: (l.status || "").trim(),
    memo: (l.memo || "").trim(),
  };
}

function kpiToRow(userId, k) {
  return {
    user_id: userId,
    id: String(k.id),
    path_id: String(k.pathId),
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

function kpiLogToRow(userId, l) {
  return {
    user_id: userId,
    id: String(l.id),
    kpi_id: String(l.kpiId),
    path_id: String(l.pathId || ""),
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
  if (p.paths.length) {
    const rows = p.paths.map((path, i) => pathToRow(userId, path, i));
    const { error } = await supabase.from("sideincome_map_paths").upsert(rows, { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`sideincome_map_paths: ${error.message}`);
  }
  if (p.pathLogs.length) {
    const { error } = await supabase
      .from("sideincome_map_path_logs")
      .upsert(p.pathLogs.map((l) => pathLogToRow(userId, l)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`sideincome_map_path_logs: ${error.message}`);
  }
  if (p.kpis.length) {
    const { error } = await supabase
      .from("sideincome_map_kpis")
      .upsert(p.kpis.map((k) => kpiToRow(userId, k)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`sideincome_map_kpis: ${error.message}`);
  }
  if (p.kpiLogs.length) {
    const { error } = await supabase
      .from("sideincome_map_kpi_logs")
      .upsert(p.kpiLogs.map((l) => kpiLogToRow(userId, l)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`sideincome_map_kpi_logs: ${error.message}`);
  }
  if (p.kpiTodos.length) {
    const { error } = await supabase
      .from("sideincome_map_kpi_todos")
      .upsert(p.kpiTodos.map((t) => todoToRow(userId, t)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`sideincome_map_kpi_todos: ${error.message}`);
  }
  if (p.kpiDailyRepeatTodos.length) {
    const { error } = await supabase
      .from("sideincome_map_kpi_daily_todos")
      .upsert(p.kpiDailyRepeatTodos.map((t) => dailyTodoToRow(userId, t)), { onConflict: UPSERT_CONFLICT_ROW });
    if (error) throw new Error(`sideincome_map_kpi_daily_todos: ${error.message}`);
  }
  if (localPayloadHasAnythingToPersist(p)) {
    const dr = normalizeDeletedRefs(p.deletedRefs);
    const { error } = await supabase.from("sideincome_map_meta").upsert(
      {
        user_id: userId,
        kpi_order: p.kpiOrder || {},
        kpi_task_sync: p.kpiTaskSync || {},
        deleted_refs: dr,
      },
      { onConflict: "user_id" },
    );
    if (error) throw new Error(`sideincome_map_meta: ${error.message}`);
  }
}

async function fetchSideincomeMapPayloadFromSupabase(userId) {
  if (!supabase || !userId) return { ok: false };
  const [pathRes, plRes, kpiRes, klRes, todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("sideincome_map_paths").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_path_logs").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_kpis").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_kpi_logs").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_kpi_todos").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);
  for (const res of [pathRes, plRes, kpiRes, klRes, todoRes, dailyRes]) {
    if (res.error) return { ok: false };
  }
  if (metaRes.error) return { ok: false };
  const paths = pathRes.data || [];
  const pathLogs = plRes.data || [];
  const kpis = kpiRes.data || [];
  const kpiLogs = klRes.data || [];
  const todos = todoRes.data || [];
  const daily = dailyRes.data || [];
  const meta = metaRes.data;
  if (hasAnyNormalizedData(paths, pathLogs, kpis, kpiLogs, todos, daily, meta)) {
    return { ok: true, payload: buildPayloadFromRows(paths, pathLogs, kpis, kpiLogs, todos, daily, meta) };
  }
  return { ok: true, payload: normalizePayload(buildPayloadFromRows([], [], [], [], [], [], null)) };
}

async function deleteOrphanRowsForUser(userId, p, allowEmptyOrphans) {
  const tables = [
    {
      table: "sideincome_map_kpi_daily_todos",
      localIds: (p.kpiDailyRepeatTodos || []).map((x) => String(x.id)),
    },
    { table: "sideincome_map_kpi_todos", localIds: (p.kpiTodos || []).map((x) => String(x.id)) },
    { table: "sideincome_map_kpi_logs", localIds: (p.kpiLogs || []).map((x) => String(x.id)) },
    { table: "sideincome_map_path_logs", localIds: (p.pathLogs || []).map((x) => String(x.id)) },
    { table: "sideincome_map_kpis", localIds: (p.kpis || []).map((x) => String(x.id)) },
    { table: "sideincome_map_paths", localIds: (p.paths || []).map((x) => String(x.id)) },
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
    }
  }
}

function localPayloadHasAnythingToPersist(p) {
  return (
    p.paths.length > 0 ||
    p.pathLogs.length > 0 ||
    p.kpis.length > 0 ||
    p.kpiLogs.length > 0 ||
    p.kpiTodos.length > 0 ||
    p.kpiDailyRepeatTodos.length > 0 ||
    shouldInsertMetaRow(p)
  );
}

/** @returns {Promise<boolean>} */
export async function pullSideincomeKpiMapFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    kpiSyncDebugLog("부수입 pull", {
      ok: false,
      reason: !supabase ? "Supabase 없음" : "로그인 세션 없음",
    });
    return false;
  }

  const [pathRes, plRes, kpiRes, klRes, todoRes, dailyRes, metaRes] = await Promise.all([
    supabase.from("sideincome_map_paths").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_path_logs").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_kpis").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_kpi_logs").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_kpi_todos").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_kpi_daily_todos").select("*").eq("user_id", userId),
    supabase.from("sideincome_map_meta").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  for (const res of [pathRes, plRes, kpiRes, klRes, todoRes, dailyRes]) {
    if (res.error) {
      console.warn("[sideincome-kpi-map] pull", res.error.message);
      kpiSyncDebugLog("부수입 pull", { ok: false, error: res.error.message });
      return false;
    }
  }
  if (metaRes.error) {
    console.warn("[sideincome-kpi-map] pull meta", metaRes.error.message);
    kpiSyncDebugLog("부수입 pull", { ok: false, error: metaRes.error.message, step: "meta" });
    return false;
  }

  const paths = pathRes.data || [];
  const pathLogs = plRes.data || [];
  const kpis = kpiRes.data || [];
  const kpiLogs = klRes.data || [];
  const todos = todoRes.data || [];
  const daily = dailyRes.data || [];
  const meta = metaRes.data;

  const payload = hasAnyNormalizedData(paths, pathLogs, kpis, kpiLogs, todos, daily, meta)
    ? buildPayloadFromRows(paths, pathLogs, kpis, kpiLogs, todos, daily, meta)
    : buildPayloadFromRows([], [], [], [], [], [], null);
  try {
    localStorage.setItem(SIDEINCOME_KPI_MAP_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
  kpiSyncDebugLog("부수입 pull → 완료", {
    source: "Supabase sideincome_map_*",
    localKey: SIDEINCOME_KPI_MAP_STORAGE_KEY,
    counts: {
      paths: paths.length,
      pathLogs: pathLogs.length,
      kpis: kpis.length,
      kpiLogs: kpiLogs.length,
      todos: todos.length,
      dailyTodos: daily.length,
    },
  });
  return true;
}

/** 서버에 반영해야 할 로컬 변경이 남아 있음(디바운스 대기 포함) */
let _sideincomeKpiPushDirty = false;
let _sideincomeKpiSyncInFlight = null;

async function runSideincomeKpiMapSyncOnce() {
  kpiSyncDebugLog("부수입 sync(로컬→서버) 시도", { event: "sideincome-kpi-map-saved 또는 탭 이탈" });
  const userId = await getSessionUserId();
  if (!supabase) {
    if (!_warnedNoSupabaseClient) {
      _warnedNoSupabaseClient = true;
      console.warn(
        "[sideincome-kpi-map] sync 건너뜀: Supabase 클라이언트 없음(.env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인)",
      );
    }
    kpiSyncDebugLog("부수입 sync 중단", { reason: "Supabase 없음" });
    sideincomeKpiUploadLog("skip", {
      reason: "Supabase 없음 — .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인",
    });
    return;
  }
  if (!userId) {
    kpiSyncDebugLog("부수입 sync 중단", { reason: "로그인 없음" });
    if (!_warnedNoAuthSession) {
      _warnedNoAuthSession = true;
      console.warn("[sideincome-kpi-map] sync 건너뜀: 로그인 세션 없음");
    }
    sideincomeKpiUploadLog("skip", { reason: "로그인 세션 없음 — 서버로 올리지 않음" });
    return;
  }

  const checked = readLocalPayloadStrictForSync();
  if (!checked.ok) {
    sideincomeKpiUploadLog("error", {
      phase: "local_read",
      message:
        "이 브라우저 저장값(JSON)이 깨져 있어 서버는 건드리지 않았습니다. 새로고침·다른 기기 백업을 확인해 주세요.",
      detail: checked.message,
    });
    return;
  }
  const { payload: p, rawMissing } = checked;
  if (rawMissing && !localPayloadHasAnythingToPersist(p)) {
    sideincomeKpiUploadLog("skip", {
      reason: "브라우저에 부수입 KPI 데이터 키 없음 — 서버 삭제·덮어쓰기 안 함",
    });
    return;
  }

  try {
    const fetched = await fetchSideincomeMapPayloadFromSupabase(userId);
    const toSync = fetched.ok ? mergeSideincomeKpiPayloadsForSync(p, fetched.payload) : normalizePayload(p);
    const mergedFromServer = fetched.ok;

    if (localPayloadHasAnythingToPersist(toSync)) {
      await upsertNormalizedFromPayloadWithRetry(userId, toSync);
      if (mergedFromServer) {
        await deleteOrphanRowsForUser(userId, toSync, true);
      }
    } else {
      let metaEmptyErr = null;
      const drEmpty = normalizeDeletedRefs(toSync.deletedRefs);
      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.from("sideincome_map_meta").upsert(
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
      if (metaEmptyErr) throw new Error(`sideincome_map_meta(empty): ${metaEmptyErr.message}`);
      if (mergedFromServer) {
        await deleteOrphanRowsForUser(userId, toSync, true);
      }
    }

    if (mergedFromServer) {
      try {
        const prevRaw = localStorage.getItem(SIDEINCOME_KPI_MAP_STORAGE_KEY);
        const nextRaw = JSON.stringify(toSync);
        if (prevRaw !== nextRaw) {
          localStorage.setItem(SIDEINCOME_KPI_MAP_STORAGE_KEY, nextRaw);
          window.dispatchEvent(new CustomEvent("sideincome-kpi-map-saved", { detail: { fromServerMerge: true } }));
        }
      } catch (_) {}
    }

    const hasData = localPayloadHasAnythingToPersist(toSync);
    sideincomeKpiUploadLog("ok", {
      mode: hasData ? "upsert" : "empty_meta_only",
      mergedFromServer,
      counts: {
        paths: toSync.paths.length,
        pathLogs: toSync.pathLogs.length,
        kpis: toSync.kpis.length,
        kpiLogs: toSync.kpiLogs.length,
        kpiTodos: toSync.kpiTodos.length,
        kpiDailyRepeatTodos: toSync.kpiDailyRepeatTodos.length,
      },
    });
    kpiSyncDebugLog("부수입 sync 완료", { userIdPrefix: String(userId).slice(0, 8) });
    if (!_pushTimer) {
      _sideincomeKpiPushDirty = false;
    }
  } catch (e) {
    const msg = e?.message || String(e);
    console.warn("[sideincome-kpi-map] sync", msg);
    kpiSyncDebugLog("부수입 sync 실패", { message: msg });
    sideincomeKpiUploadLog("error", { message: msg });
  }
}

/** @returns {Promise<void>} */
export function syncSideincomeKpiMapToSupabase() {
  if (_sideincomeKpiSyncInFlight) return _sideincomeKpiSyncInFlight;
  _sideincomeKpiSyncInFlight = runSideincomeKpiMapSyncOnce().finally(() => {
    _sideincomeKpiSyncInFlight = null;
  });
  return _sideincomeKpiSyncInFlight;
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 800;

export function flushSideincomeKpiMapSyncPush() {
  if (!supabase) return;
  const hadPending = !!_pushTimer;
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  if (!hadPending && !_sideincomeKpiPushDirty) return;
  if (_sideincomeKpiSyncInFlight) return _sideincomeKpiSyncInFlight;
  return syncSideincomeKpiMapToSupabase().catch((e) => {
    sideincomeKpiUploadLog("error", { phase: "flush", message: e?.message || String(e) });
  });
}

export function scheduleSideincomeKpiMapSyncPush() {
  if (!supabase) return;
  _sideincomeKpiPushDirty = true;
  if (_pushTimer) clearTimeout(_pushTimer);
  kpiSyncDebugLog("부수입 서버 업로드 예약", { debounceMs: PUSH_DEBOUNCE_MS });
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncSideincomeKpiMapToSupabase().catch((e) => {
      sideincomeKpiUploadLog("error", { phase: "debounced_push", message: e?.message || String(e) });
    });
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;
let _flushListenersAttached = false;

function attachSideincomeKpiMapFlushOnLeave() {
  if (_flushListenersAttached) return;
  _flushListenersAttached = true;
  const run = () => {
    void flushSideincomeKpiMapSyncPush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") run();
  });
  window.addEventListener("pagehide", run);
}

export function attachSideincomeKpiMapSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  attachSideincomeKpiMapFlushOnLeave();
  window.addEventListener("sideincome-kpi-map-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
    scheduleSideincomeKpiMapSyncPush();
  });
}

/** @returns {Promise<boolean>} */
export async function hydrateSideincomeKpiMapFromCloud() {
  kpiSyncDebugLog("부수입 hydrate 시작", { when: "앱 부팅 시 Promise.all 안" });
  attachSideincomeKpiMapSaveListener();
  if (!supabase) {
    kpiSyncDebugLog("부수입 hydrate 생략", { reason: "Supabase 없음" });
    return false;
  }
  const applied = await pullSideincomeKpiMapFromSupabase();
  kpiSyncDebugLog("부수입 hydrate 끝", { applied });
  return applied;
}
