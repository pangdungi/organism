/**
 * KPI 할일 완료 기록 — 목록에서 지워도 서버 기록은 남김 (체크 끌 때만 뺌)
 */

import { supabase } from "../supabase.js";
import { persistHappinessKpiCompletionEventOnly } from "./happinessKpiMapSupabase.js";
import {
  readKpiMapScopedStorageRaw,
  writeKpiMapScopedStorageRaw,
} from "./kpiMapLocalStorage.js";
import { normalizeKpiTaskCompletionEvents } from "./kpiTaskCompletionEvents.js";

const HAPPINESS_KEY = "kpi-happiness-map";

const META_BY_KEY = {
  "kpi-health-map": {
    metaTable: "health_map_meta",
    todoTable: "health_map_kpi_todos",
  },
  "kpi-dream-map": {
    metaTable: "dream_map_meta",
    todoTable: "dream_map_kpi_todos",
  },
  "kpi-sideincome-paths": {
    metaTable: "sideincome_map_meta",
    todoTable: "sideincome_map_kpi_todos",
  },
};

/** @type {Map<string, Promise<unknown>>} */
const queues = new Map();

function runSerialized(key, fn) {
  const prev = queues.get(key) || Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(
    key,
    next.catch(() => {}),
  );
  return next;
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * @param {string} storageKey
 * @param {string} todoId
 * @param {boolean} completed
 */
export function persistKpiCompletionEventOnly(storageKey, todoId, completed) {
  const key = String(storageKey || "");
  if (key === HAPPINESS_KEY) {
    return persistHappinessKpiCompletionEventOnly(todoId, completed);
  }
  const spec = META_BY_KEY[key];
  if (!spec) return Promise.resolve(false);
  return runSerialized(key, () =>
    persistDomainCompletionEvent(spec, key, todoId, completed),
  );
}

async function persistDomainCompletionEvent(spec, storageKey, todoId, completed) {
  const userId = await getSessionUserId();
  const tid = String(todoId || "").trim();
  if (!userId || !supabase || !tid) return false;
  let local = {};
  try {
    const raw = readKpiMapScopedStorageRaw(storageKey);
    local = raw ? JSON.parse(raw) : {};
  } catch (_) {
    local = {};
  }
  const todo = (local?.kpiTodos || []).find((t) => String(t.id) === tid);
  let kpiId = String(todo?.kpiId || "").trim();
  if (!kpiId) {
    const localEv = normalizeKpiTaskCompletionEvents(
      local?.kpiTaskCompletionEvents,
    ).find((e) => String(e.todoId || "").trim() === tid);
    kpiId = String(localEv?.kpiId || "").trim();
  }
  if (!kpiId) {
    const { data: row, error: todoErr } = await supabase
      .from(spec.todoTable)
      .select("kpi_id")
      .eq("user_id", userId)
      .eq("id", tid)
      .maybeSingle();
    if (todoErr) return false;
    kpiId = String(row?.kpi_id || "").trim();
  }
  if (completed && !kpiId) return false;
  const { data: meta, error: selErr } = await supabase
    .from(spec.metaTable)
    .select("kpi_order, kpi_task_sync, deleted_refs, kpi_task_completion_events")
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) return false;
  let events = normalizeKpiTaskCompletionEvents(meta?.kpi_task_completion_events);
  events = events.filter((e) => String(e.todoId || "").trim() !== tid);
  if (completed) {
    const localEv = normalizeKpiTaskCompletionEvents(
      local?.kpiTaskCompletionEvents,
    ).find(
      (e) =>
        String(e.todoId || "").trim() === tid &&
        String(e.kpiId || "").trim() === kpiId,
    );
    events.push(
      localEv || {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        kpiId,
        todoId: tid,
        completedAt:
          String(todo?.completedAt || "").trim() || new Date().toISOString(),
      },
    );
  }
  const { error } = await supabase.from(spec.metaTable).upsert(
    {
      user_id: userId,
      kpi_order:
        meta?.kpi_order && typeof meta.kpi_order === "object"
          ? meta.kpi_order
          : local?.kpiOrder || {},
      kpi_task_sync:
        meta?.kpi_task_sync && typeof meta.kpi_task_sync === "object"
          ? meta.kpi_task_sync
          : local?.kpiTaskSync || {},
      deleted_refs:
        meta?.deleted_refs && typeof meta.deleted_refs === "object"
          ? meta.deleted_refs
          : local?.deletedRefs || {},
      kpi_task_completion_events: events,
    },
    { onConflict: "user_id" },
  );
  if (error) return false;
  try {
    writeKpiMapScopedStorageRaw(
      storageKey,
      JSON.stringify({
        ...local,
        kpiTaskCompletionEvents: events,
      }),
    );
  } catch (_) {}
  return true;
}
