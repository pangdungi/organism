/**
 * 시간 사용 개선하기 메모 ↔ Supabase (time_improve_daily_notes)
 */

import { supabase } from "../supabase.js";
import {
  buildAllLocalImproveNotePayloadsForSync,
  getStoredImproveNotes,
  mergeImproveNotesFromServerRows,
} from "./timeImproveNotesModel.js";
import { lpPullDebug } from "./lpPullDebug.js";

const TABLE = "time_improve_daily_notes";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

function rowToUpsert(userId, dateKey, entry) {
  return {
    user_id: userId,
    entry_date: dateKey,
    root_cause: String(entry.rootCause || "").trim(),
    countermeasures: String(entry.countermeasures || "").trim(),
    plan_reality: String(entry.planReality || "").trim(),
    important_invest: String(entry.importantInvest || "").trim(),
    invest_reduce: String(entry.investReduce || "").trim(),
  };
}

export async function syncTimeImproveNoteDateToSupabase(dateKey) {
  const userId = await getSessionUserId();
  if (!userId || !supabase || !dateKey) return;
  const d = String(dateKey).replace(/\//g, "-").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  const entry = getStoredImproveNotes(d);
  await supabase.from(TABLE).upsert(rowToUpsert(userId, d, entry), {
    onConflict: "user_id,entry_date",
  });
}

export async function pullTimeImproveNotesFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "entry_date, root_cause, countermeasures, plan_reality, important_invest, invest_reduce, updated_at",
    )
    .eq("user_id", userId)
    .order("entry_date", { ascending: false });

  if (error) return;
  if (data?.length) mergeImproveNotesFromServerRows(data);
}

export async function pushAllLocalTimeImproveNotesIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return;
  if (count != null && count > 0) return;

  const locals = buildAllLocalImproveNotePayloadsForSync();
  if (locals.length === 0) return;

  const payloads = locals.map((row) =>
    rowToUpsert(userId, row.dateKey, row),
  );
  await supabase.from(TABLE).upsert(payloads, {
    onConflict: "user_id,entry_date",
  });
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

export function scheduleTimeImproveNotesSyncPush(dateKey) {
  if (!supabase || !dateKey) return;
  const d = String(dateKey).replace(/\//g, "-").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncTimeImproveNoteDateToSupabase(d).catch(() => {});
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachTimeImproveNotesSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("time-improve-notes-saved", (ev) => {
    const dk = ev.detail?.dateKey;
    if (dk) scheduleTimeImproveNotesSyncPush(dk);
  });
}

export async function hydrateTimeImproveNotesFromCloud() {
  lpPullDebug("hydrateTimeImproveNotesFromCloud", {});
  if (!supabase) return;
  attachTimeImproveNotesSaveListener();
  await pullTimeImproveNotesFromSupabase();
  await pushAllLocalTimeImproveNotesIfServerEmpty();
}
