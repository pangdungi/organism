/**
 * 부수입 맵 ↔ Supabase 정규화 (sideincome_map_*)
 * 로컬 kpi-sideincome-paths: paths(목표금액·단위), pathLogs, kpis, kpiLogs, …
 */

import { supabase } from "../supabase.js";

export const SIDEINCOME_KPI_MAP_STORAGE_KEY = "kpi-sideincome-paths";

let _warnedNoSupabaseClient = false;
let _warnedNoAuthSession = false;

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
  };
}

function normalizePayload(p) {
  if (!p || typeof p !== "object") return emptyPayload();
  const kpis = (Array.isArray(p.kpis) ? p.kpis : []).map((k) => ({
    ...k,
    needHabitTracker: !!k.needHabitTracker,
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
  });
}

function metaRowHasData(meta) {
  if (!meta) return false;
  return Object.keys(meta.kpi_order || {}).length > 0 || Object.keys(meta.kpi_task_sync || {}).length > 0;
}

function hasAnyNormalizedData(paths, pathLogs, kpis, kpiLogs, todos, daily, meta) {
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
    (p.kpiOrder && Object.keys(p.kpiOrder).length > 0) || (p.kpiTaskSync && Object.keys(p.kpiTaskSync).length > 0)
  );
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

const DELETE_ORDER = [
  "sideincome_map_kpi_daily_todos",
  "sideincome_map_kpi_todos",
  "sideincome_map_kpi_logs",
  "sideincome_map_path_logs",
  "sideincome_map_kpis",
  "sideincome_map_paths",
  "sideincome_map_meta",
];

async function deleteAllNormalizedForUser(userId) {
  for (const table of DELETE_ORDER) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function insertNormalizedFromPayload(userId, p) {
  if (p.paths.length) {
    const rows = p.paths.map((path, i) => pathToRow(userId, path, i));
    const { error } = await supabase.from("sideincome_map_paths").insert(rows);
    if (error) throw new Error(`sideincome_map_paths: ${error.message}`);
  }
  if (p.pathLogs.length) {
    const { error } = await supabase.from("sideincome_map_path_logs").insert(p.pathLogs.map((l) => pathLogToRow(userId, l)));
    if (error) throw new Error(`sideincome_map_path_logs: ${error.message}`);
  }
  if (p.kpis.length) {
    const { error } = await supabase.from("sideincome_map_kpis").insert(p.kpis.map((k) => kpiToRow(userId, k)));
    if (error) throw new Error(`sideincome_map_kpis: ${error.message}`);
  }
  if (p.kpiLogs.length) {
    const { error } = await supabase.from("sideincome_map_kpi_logs").insert(p.kpiLogs.map((l) => kpiLogToRow(userId, l)));
    if (error) throw new Error(`sideincome_map_kpi_logs: ${error.message}`);
  }
  if (p.kpiTodos.length) {
    const { error } = await supabase.from("sideincome_map_kpi_todos").insert(p.kpiTodos.map((t) => todoToRow(userId, t)));
    if (error) throw new Error(`sideincome_map_kpi_todos: ${error.message}`);
  }
  if (p.kpiDailyRepeatTodos.length) {
    const { error } = await supabase
      .from("sideincome_map_kpi_daily_todos")
      .insert(p.kpiDailyRepeatTodos.map((t) => dailyTodoToRow(userId, t)));
    if (error) throw new Error(`sideincome_map_kpi_daily_todos: ${error.message}`);
  }
  if (shouldInsertMetaRow(p)) {
    const { error } = await supabase.from("sideincome_map_meta").insert({
      user_id: userId,
      kpi_order: p.kpiOrder || {},
      kpi_task_sync: p.kpiTaskSync || {},
    });
    if (error) throw new Error(`sideincome_map_meta: ${error.message}`);
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
  if (!userId || !supabase) return false;

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
      return false;
    }
  }
  if (metaRes.error) {
    console.warn("[sideincome-kpi-map] pull meta", metaRes.error.message);
    return false;
  }

  const paths = pathRes.data || [];
  const pathLogs = plRes.data || [];
  const kpis = kpiRes.data || [];
  const kpiLogs = klRes.data || [];
  const todos = todoRes.data || [];
  const daily = dailyRes.data || [];
  const meta = metaRes.data;

  if (!hasAnyNormalizedData(paths, pathLogs, kpis, kpiLogs, todos, daily, meta)) return false;

  const payload = buildPayloadFromRows(paths, pathLogs, kpis, kpiLogs, todos, daily, meta);
  try {
    localStorage.setItem(SIDEINCOME_KPI_MAP_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
  return true;
}

export async function syncSideincomeKpiMapToSupabase() {
  const userId = await getSessionUserId();
  if (!supabase) {
    if (!_warnedNoSupabaseClient) {
      _warnedNoSupabaseClient = true;
      console.warn(
        "[sideincome-kpi-map] sync 건너뜀: Supabase 클라이언트 없음(.env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인)",
      );
    }
    return;
  }
  if (!userId) {
    if (!_warnedNoAuthSession) {
      _warnedNoAuthSession = true;
      console.warn("[sideincome-kpi-map] sync 건너뜀: 로그인 세션 없음");
    }
    return;
  }

  const p = readLocalPayload();
  try {
    await deleteAllNormalizedForUser(userId);
    if (localPayloadHasAnythingToPersist(p)) {
      await insertNormalizedFromPayload(userId, p);
    }
  } catch (e) {
    console.warn("[sideincome-kpi-map] sync", e?.message || e);
  }
}

function hasMeaningfulLocalData() {
  return localPayloadHasAnythingToPersist(readLocalPayload());
}

async function serverHasAnyNormalizedRow(userId) {
  const tables = [
    "sideincome_map_paths",
    "sideincome_map_path_logs",
    "sideincome_map_kpis",
    "sideincome_map_kpi_logs",
    "sideincome_map_kpi_todos",
    "sideincome_map_kpi_daily_todos",
  ];
  for (const table of tables) {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true }).eq("user_id", userId);
    if (error) continue;
    if ((count ?? 0) > 0) return true;
  }
  const { data: meta, error: mErr } = await supabase
    .from("sideincome_map_meta")
    .select("kpi_order, kpi_task_sync")
    .eq("user_id", userId)
    .maybeSingle();
  if (!mErr && metaRowHasData(meta)) return true;
  return false;
}

export async function pushLocalSideincomeKpiMapIfServerHasNoRow() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const hasServer = await serverHasAnyNormalizedRow(userId);
  if (hasServer) return;
  if (!hasMeaningfulLocalData()) return;

  await syncSideincomeKpiMapToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 800;

export function flushSideincomeKpiMapSyncPush() {
  if (!supabase) return;
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  return syncSideincomeKpiMapToSupabase().catch((e) => console.warn("[sideincome-kpi-map]", e));
}

export function scheduleSideincomeKpiMapSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncSideincomeKpiMapToSupabase().catch((e) => console.warn("[sideincome-kpi-map]", e));
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
  window.addEventListener("sideincome-kpi-map-saved", () => {
    scheduleSideincomeKpiMapSyncPush();
  });
}

/** @returns {Promise<boolean>} */
export async function hydrateSideincomeKpiMapFromCloud() {
  attachSideincomeKpiMapSaveListener();
  if (!supabase) return false;
  const applied = await pullSideincomeKpiMapFromSupabase();
  await pushLocalSideincomeKpiMapIfServerHasNoRow();
  return applied;
}
