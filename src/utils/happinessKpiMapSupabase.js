/**
 * 행복 KPI 맵 ↔ Supabase 정규화 테이블 (happiness_map_*)
 * 로컬 키 kpi-happiness-map (happinesses, kpis, kpiLogs, …)
 */

import { supabase } from "../supabase.js";

export const HAPPINESS_KPI_MAP_STORAGE_KEY = "kpi-happiness-map";

let _warnedNoSupabaseClient = false;
let _warnedNoAuthSession = false;

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

function emptyPayload() {
  return {
    happinesses: [],
    kpis: [],
    kpiLogs: [],
    kpiTodos: [],
    kpiDailyRepeatTodos: [],
    kpiOrder: {},
    kpiTaskSync: {},
  };
}

/** 디버그: 새로고침 직후 로컬 vs pull 후 비교용 (콘솔 필터: happiness-kpi-map][trace) */
function happinessKpiMapTraceSnapshot(p) {
  const n = normalizePayload(p);
  return {
    happinesses: n.happinesses.length,
    kpis: n.kpis.length,
    kpiTodos: n.kpiTodos.length,
    kpiLogs: n.kpiLogs.length,
  };
}

function normalizePayload(p) {
  if (!p || typeof p !== "object") return emptyPayload();
  const kpis = (Array.isArray(p.kpis) ? p.kpis : []).map((k) => ({
    ...k,
    needHabitTracker: !!k.needHabitTracker,
  }));
  return {
    happinesses: Array.isArray(p.happinesses) ? p.happinesses : [],
    kpis,
    kpiLogs: Array.isArray(p.kpiLogs) ? p.kpiLogs : [],
    kpiTodos: Array.isArray(p.kpiTodos) ? p.kpiTodos : [],
    kpiDailyRepeatTodos: Array.isArray(p.kpiDailyRepeatTodos) ? p.kpiDailyRepeatTodos : [],
    kpiOrder: p.kpiOrder && typeof p.kpiOrder === "object" ? p.kpiOrder : {},
    kpiTaskSync: p.kpiTaskSync && typeof p.kpiTaskSync === "object" ? p.kpiTaskSync : {},
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
    console.warn("[happiness-kpi-map] getUser", error.message);
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

function buildPayloadFromNormalizedRows(categories, kpis, logs, todos, daily, meta) {
  const sortedCats = [...(categories || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const happinesses = sortedCats.map((c) => ({ id: c.id, name: c.name || "" }));
  const kpiOrder = meta?.kpi_order && typeof meta.kpi_order === "object" ? meta.kpi_order : {};
  const kpiTaskSync = meta?.kpi_task_sync && typeof meta.kpi_task_sync === "object" ? meta.kpi_task_sync : {};
  return normalizePayload({
    happinesses,
    kpis: (kpis || []).map(rowToKpi),
    kpiLogs: (logs || []).map(rowToLog),
    kpiTodos: (todos || []).map(rowToTodo),
    kpiDailyRepeatTodos: (daily || []).map(rowToDaily),
    kpiOrder,
    kpiTaskSync,
  });
}

function hasAnyNormalizedData(categories, kpis, logs, todos, daily, meta) {
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
  if (meta && (Object.keys(meta.kpi_order || {}).length > 0 || Object.keys(meta.kpi_task_sync || {}).length > 0)) {
    return true;
  }
  return false;
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

const DELETE_ORDER = [
  "happiness_map_kpi_daily_todos",
  "happiness_map_kpi_todos",
  "happiness_map_kpi_logs",
  "happiness_map_kpis",
  "happiness_map_categories",
  "happiness_map_meta",
];

async function deleteAllNormalizedForUser(userId) {
  for (const table of DELETE_ORDER) {
    const { error } = await supabase.from(table).delete().eq("user_id", userId);
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function insertNormalizedFromPayload(userId, p) {
  if (p.happinesses.length) {
    const rows = p.happinesses.map((h, i) => ({
      user_id: userId,
      id: String(h.id),
      name: (h.name || "").trim(),
      sort_order: i,
    }));
    const { error } = await supabase.from("happiness_map_categories").insert(rows);
    if (error) throw new Error(`happiness_map_categories: ${error.message}`);
  }
  if (p.kpis.length) {
    const { error } = await supabase.from("happiness_map_kpis").insert(p.kpis.map((k) => kpiToRow(userId, k)));
    if (error) throw new Error(`happiness_map_kpis: ${error.message}`);
  }
  if (p.kpiLogs.length) {
    const { error } = await supabase.from("happiness_map_kpi_logs").insert(p.kpiLogs.map((l) => logToRow(userId, l)));
    if (error) throw new Error(`happiness_map_kpi_logs: ${error.message}`);
  }
  if (p.kpiTodos.length) {
    const { error } = await supabase.from("happiness_map_kpi_todos").insert(p.kpiTodos.map((t) => todoToRow(userId, t)));
    if (error) throw new Error(`happiness_map_kpi_todos: ${error.message}`);
  }
  if (p.kpiDailyRepeatTodos.length) {
    const { error } = await supabase
      .from("happiness_map_kpi_daily_todos")
      .insert(p.kpiDailyRepeatTodos.map((t) => dailyTodoToRow(userId, t)));
    if (error) throw new Error(`happiness_map_kpi_daily_todos: ${error.message}`);
  }
  const hasMeta =
    (p.kpiOrder && Object.keys(p.kpiOrder).length > 0) || (p.kpiTaskSync && Object.keys(p.kpiTaskSync).length > 0);
  if (hasMeta) {
    const { error } = await supabase.from("happiness_map_meta").insert({
      user_id: userId,
      kpi_order: p.kpiOrder || {},
      kpi_task_sync: p.kpiTaskSync || {},
    });
    if (error) throw new Error(`happiness_map_meta: ${error.message}`);
  }
}

/** @returns {Promise<boolean>} 서버 데이터로 로컬을 갱신했으면 true */
export async function pullHappinessKpiMapFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

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
      console.warn("[happiness-kpi-map] pull", res.error.message);
      return false;
    }
  }
  if (metaRes.error) {
    console.warn("[happiness-kpi-map] pull meta", metaRes.error.message);
    return false;
  }

  const categories = catRes.data || [];
  const kpis = kpiRes.data || [];
  const logs = logRes.data || [];
  const todos = todoRes.data || [];
  const daily = dailyRes.data || [];
  const meta = metaRes.data;

  const payload = hasAnyNormalizedData(categories, kpis, logs, todos, daily, meta)
    ? buildPayloadFromNormalizedRows(categories, kpis, logs, todos, daily, meta)
    : buildPayloadFromNormalizedRows([], [], [], [], [], null);
  try {
    localStorage.setItem(HAPPINESS_KPI_MAP_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
  return true;
}

export async function syncHappinessKpiMapToSupabase() {
  const userId = await getSessionUserId();
  if (!supabase) {
    if (!_warnedNoSupabaseClient) {
      _warnedNoSupabaseClient = true;
      console.warn(
        "[happiness-kpi-map] sync 건너뜀: Supabase 클라이언트 없음(.env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인)",
      );
    }
    return;
  }
  if (!userId) {
    if (!_warnedNoAuthSession) {
      _warnedNoAuthSession = true;
      console.warn("[happiness-kpi-map] sync 건너뜀: 로그인 세션 없음");
    }
    return;
  }

  const p = readLocalPayload();
  console.log("[happiness-kpi-map][trace] push: 로컬 → Supabase 전체 반영 직전", happinessKpiMapTraceSnapshot(p));
  try {
    await deleteAllNormalizedForUser(userId);
    if (
      p.happinesses.length ||
      p.kpis.length ||
      p.kpiLogs.length ||
      p.kpiTodos.length ||
      p.kpiDailyRepeatTodos.length ||
      Object.keys(p.kpiOrder).length ||
      Object.keys(p.kpiTaskSync).length
    ) {
      await insertNormalizedFromPayload(userId, p);
    }
  } catch (e) {
    console.warn("[happiness-kpi-map] sync", e?.message || e);
  }
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 800;

export function flushHappinessKpiMapSyncPush() {
  if (!supabase) return;
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  return syncHappinessKpiMapToSupabase().catch((e) => console.warn("[happiness-kpi-map]", e));
}

export function scheduleHappinessKpiMapSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncHappinessKpiMapToSupabase().catch((e) => console.warn("[happiness-kpi-map]", e));
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
  window.addEventListener("happiness-kpi-map-saved", () => {
    scheduleHappinessKpiMapSyncPush();
  });
}

/** @returns {Promise<boolean>} pull로 로컬이 바뀌었으면 true */
export async function hydrateHappinessKpiMapFromCloud() {
  attachHappinessKpiMapSaveListener();
  const before = readLocalPayload();
  console.log(
    "[happiness-kpi-map][trace] hydrate: pull 직전 로컬 (새로고침 직후면 여기가 브라우저에 남아 있던 값)",
    happinessKpiMapTraceSnapshot(before),
  );
  if (!supabase) return false;
  const applied = await pullHappinessKpiMapFromSupabase();
  const afterPull = readLocalPayload();
  console.log(
    "[happiness-kpi-map][trace] hydrate: pull 이후 (applied=" +
      applied +
      " = pull 성공 시 true, 서버가 비어도 로컬을 빈 스냅샷으로 맞춤)",
    happinessKpiMapTraceSnapshot(afterPull),
  );
  return applied;
}
