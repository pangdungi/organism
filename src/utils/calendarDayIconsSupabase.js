/**
 * 캘린더 월간 뷰 날짜별 아이콘(1개) ↔ Supabase `calendar_day_icons`
 */

import { supabase } from "../supabase.js";
import {
  applyCalendarDayIconsServerSnapshot,
  clearCalendarDayIconLocalSyncPending,
  markCalendarDayIconLocalSyncPending,
  setCalendarDayIconKeyForDate,
} from "./calendarDayIconsModel.js";
import { runTodoSectionTasksSerialized } from "./todoSectionTasksServerSyncSerial.js";

const TABLE = "calendar_day_icons";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * @param {{ reason?: string }} [opts]
 */
export async function pullCalendarDayIconsFromSupabase(opts = {}) {
  return runTodoSectionTasksSerialized(async () => {
    const userId = await getSessionUserId();
    if (!userId || !supabase) {
      return { ok: false, reason: !supabase ? "no_supabase" : "no_session", rowCount: 0 };
    }
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("day_date", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) {
      return { ok: false, reason: error.message || "select_failed", rowCount: 0 };
    }
    const rows = Array.isArray(data) ? data : [];
    applyCalendarDayIconsServerSnapshot(rows);
    return { ok: true, rowCount: rows.length, reason: String(opts.reason || "") };
  });
}

/**
 * 해당 날짜 아이콘 1개 반영(없으면 삭제).
 * @param {string} dateKey
 * @param {string} iconKey
 */
export async function syncCalendarDayIconForDate(dateKey, iconKey) {
  return runTodoSectionTasksSerialized(async () => {
    const userId = await getSessionUserId();
    const ymd = String(dateKey || "").trim().slice(0, 10);
    const key = String(iconKey || "").trim();
    if (!userId || !supabase || !ymd) {
      return { ok: false, reason: !supabase ? "no_supabase" : !userId ? "no_session" : "bad_date" };
    }

    markCalendarDayIconLocalSyncPending(ymd);
    try {
      setCalendarDayIconKeyForDate(ymd, key);

      const { error: delErr } = await supabase
        .from(TABLE)
        .delete()
        .eq("user_id", userId)
        .eq("day_date", ymd);
      if (delErr) {
        return { ok: false, reason: delErr.message || "delete_failed" };
      }
      if (!key) return { ok: true };

      const { error: insErr } = await supabase.from(TABLE).insert([
        {
          user_id: userId,
          day_date: ymd,
          icon_key: key,
          sort_order: 0,
        },
      ]);
      if (insErr) {
        return { ok: false, reason: insErr.message || "insert_failed" };
      }
      return { ok: true };
    } finally {
      clearCalendarDayIconLocalSyncPending(ymd);
    }
  });
}

/** @deprecated syncCalendarDayIconForDate 사용 */
export function syncCalendarDayIconsForDate(dateKey, iconKeys) {
  const first = (Array.isArray(iconKeys) ? iconKeys : [])[0] || "";
  return syncCalendarDayIconForDate(dateKey, first);
}

/** 스탬프 드래그 — 출발일 삭제 후 도착일 교체·저장 */
export async function syncCalendarDayIconMove(fromDateKey, toDateKey, iconKey) {
  const from = String(fromDateKey || "").trim().slice(0, 10);
  const to = String(toDateKey || "").trim().slice(0, 10);
  const key = String(iconKey || "").trim();
  if (!from || !to || !key) {
    return { ok: false, reason: "bad_args" };
  }
  if (from !== to) {
    const cleared = await syncCalendarDayIconForDate(from, "");
    if (!cleared.ok) return cleared;
  }
  return syncCalendarDayIconForDate(to, key);
}
