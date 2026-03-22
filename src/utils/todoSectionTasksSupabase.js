/**
 * 할일/일정 섹션 할 일 ↔ Supabase (calendar_section_tasks). KPI JSON 미포함.
 */

import { supabase } from "../supabase.js";
import {
  flattenCalendarTasksForSync,
  mergeCalendarSectionTasksFromServer,
  readSectionTasksObject,
  readCustomSectionTasksObject,
  ensureCalendarSectionTaskIds,
  writeSectionTasksObject,
  writeCustomSectionTasksObject,
} from "./todoSectionTasksModel.js";

const TABLE = "calendar_section_tasks";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export function persistSectionTasksAndSchedule(obj) {
  writeSectionTasksObject(obj);
  scheduleTodoSectionTasksSyncPush();
}

export function persistCustomSectionTasksAndSchedule(obj) {
  writeCustomSectionTasksObject(obj);
  scheduleTodoSectionTasksSyncPush();
}

export async function syncTodoSectionTasksToSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const ensured = ensureCalendarSectionTaskIds();
  const payloads = flattenCalendarTasksForSync(userId);
  const wantIds = new Set(payloads.map((p) => p.id));

  if (payloads.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(payloads, { onConflict: "id" });
    if (error) console.warn("[calendar-section-tasks] upsert", error.message);
  }

  const { data: remote, error: listErr } = await supabase.from(TABLE).select("id").eq("user_id", userId);
  if (listErr || !remote) return;

  for (const r of remote) {
    const id = String(r.id || "").trim();
    if (id && !wantIds.has(id)) {
      const { error: dErr } = await supabase.from(TABLE).delete().eq("id", id).eq("user_id", userId);
      if (dErr) console.warn("[calendar-section-tasks] delete", dErr.message);
    }
  }

  if (ensured.dirty) {
    try {
      window.__lpRenderMain?.();
    } catch (_) {}
  }
}

export async function pullTodoSectionTasksFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id, section_key, is_custom_section, sort_order, name, start_date, due_date, start_time, end_time, reminder_date, reminder_time, eisenhower, done, item_type, updated_at",
    )
    .eq("user_id", userId)
    .order("section_key", { ascending: true })
    .order("is_custom_section", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[calendar-section-tasks] pull", error.message);
    return false;
  }
  if (!data?.length) return false;

  mergeCalendarSectionTasksFromServer(data);
  return true;
}

export async function pushAllLocalTodoSectionTasksIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return;
  if (count != null && count > 0) return;

  ensureCalendarSectionTaskIds();
  const payloads = flattenCalendarTasksForSync(userId);
  if (payloads.length === 0) return;

  const { error: upErr } = await supabase.from(TABLE).upsert(payloads, { onConflict: "id" });
  if (upErr) console.warn("[calendar-section-tasks] push empty server", upErr.message);
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

export function scheduleTodoSectionTasksSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncTodoSectionTasksToSupabase().catch((e) => console.warn("[calendar-section-tasks]", e));
  }, PUSH_DEBOUNCE_MS);
}

/** @returns {Promise<boolean>} 서버 데이터로 로컬을 덮어썼으면 true */
export async function hydrateTodoSectionTasksFromCloud() {
  if (!supabase) return false;
  let needRefresh = false;
  const e1 = ensureCalendarSectionTaskIds();
  if (e1.dirty) needRefresh = true;
  const pulled = await pullTodoSectionTasksFromSupabase();
  if (pulled) needRefresh = true;
  await pushAllLocalTodoSectionTasksIfServerEmpty();
  const e2 = ensureCalendarSectionTaskIds();
  if (e2.dirty) needRefresh = true;
  return needRefresh;
}
