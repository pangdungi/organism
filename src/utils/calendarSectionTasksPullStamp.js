/**
 * calendar_section_tasks — 서버 스탬프(행 수 + max updated_at)로 불필요한 전체 SELECT 생략.
 * 삭제만 있고 max updated_at 이 안 바뀌는 경우를 위해 rowCount 도 함께 비교한다.
 */

import { supabase } from "../supabase.js";
import {
  getActiveClientStorageUserId,
  getScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";
import { parseIsoMs } from "./kpiMapLwwMerge.js";

const TABLE = "calendar_section_tasks";
const STAMP_STORAGE_KEY = "calendar-section-tasks-server-stamp";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * @param {unknown[]} rows
 * @returns {{ rowCount: number, maxUpdatedAtMs: number }}
 */
export function computeCalendarSectionTasksStampFromRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let maxUpdatedAtMs = 0;
  for (const row of list) {
    const ms = parseIsoMs(row?.updated_at);
    if (ms > maxUpdatedAtMs) maxUpdatedAtMs = ms;
  }
  return { rowCount: list.length, maxUpdatedAtMs };
}

/** @returns {{ rowCount: number, maxUpdatedAtMs: number } | null} */
export function readCalendarSectionTasksPullStamp(
  uid = getActiveClientStorageUserId(),
) {
  if (!uid) return null;
  try {
    const raw = getScopedLocalStorageItem(STAMP_STORAGE_KEY, uid);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || typeof p !== "object") return null;
    const rowCount =
      typeof p.rowCount === "number" && Number.isFinite(p.rowCount)
        ? Math.max(0, Math.floor(p.rowCount))
        : -1;
    const maxUpdatedAtMs = parseIsoMs(p.maxUpdatedAtMs);
    if (rowCount < 0) return null;
    return { rowCount, maxUpdatedAtMs };
  } catch (_) {
    return null;
  }
}

/** @param {{ rowCount: number, maxUpdatedAtMs: number }} stamp */
export function rememberCalendarSectionTasksPullStamp(
  stamp,
  uid = getActiveClientStorageUserId(),
) {
  if (!uid || !stamp) return;
  try {
    setScopedLocalStorageItem(
      STAMP_STORAGE_KEY,
      JSON.stringify({
        rowCount: Math.max(0, Math.floor(stamp.rowCount || 0)),
        maxUpdatedAtMs: parseIsoMs(stamp.maxUpdatedAtMs),
        savedAt: Date.now(),
      }),
      uid,
    );
  } catch (_) {}
}

export function clearCalendarSectionTasksPullStamp(
  uid = getActiveClientStorageUserId(),
) {
  if (!uid) return;
  try {
    setScopedLocalStorageItem(STAMP_STORAGE_KEY, "", uid);
  } catch (_) {}
}

function stampsMatch(a, b) {
  if (!a || !b) return false;
  return a.rowCount === b.rowCount && a.maxUpdatedAtMs === b.maxUpdatedAtMs;
}

/**
 * @param {{ rowCount: number, maxUpdatedAtMs: number }} serverStamp
 * @param {{ force?: boolean }} [opts]
 */
export function shouldSkipCalendarSectionTasksPull(serverStamp, opts = {}) {
  if (opts.force) return false;
  if (opts.rangeStart || opts.rangeEnd) return false;
  const local = readCalendarSectionTasksPullStamp();
  if (!local) return false;
  return stampsMatch(local, serverStamp);
}

/**
 * @returns {Promise<{ rowCount: number, maxUpdatedAtMs: number } | null>}
 */
export async function fetchCalendarSectionTasksServerStamp(userId) {
  const uid = String(userId || "").trim();
  if (!uid || !supabase) return null;
  try {
    const countRes = await supabase
      .from(TABLE)
      .select("*", { count: "exact", head: true })
      .eq("user_id", uid);
    if (countRes.error) return null;
    const rowCount =
      typeof countRes.count === "number" ? Math.max(0, countRes.count) : 0;

    let maxUpdatedAtMs = 0;
    if (rowCount > 0) {
      const maxRes = await supabase
        .from(TABLE)
        .select("updated_at")
        .eq("user_id", uid)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (maxRes.error) return null;
      maxUpdatedAtMs = parseIsoMs(maxRes.data?.[0]?.updated_at);
    }
    return { rowCount, maxUpdatedAtMs };
  } catch (_) {
    return null;
  }
}

/** pull 직전 — 스탬프 조회 실패 시 안전하게 전체 pull */
export async function probeCalendarSectionTasksPullSkip(opts = {}) {
  if (opts.force) return { skip: false, reason: "force" };
  if (opts.rangeStart || opts.rangeEnd) {
    return { skip: false, reason: "range_pull" };
  }
  const userId = await getSessionUserId();
  if (!userId) return { skip: false, reason: "no_session" };
  const serverStamp = await fetchCalendarSectionTasksServerStamp(userId);
  if (!serverStamp) return { skip: false, reason: "probe_failed" };
  if (!shouldSkipCalendarSectionTasksPull(serverStamp, opts)) {
    return { skip: false, reason: "stamp_changed", serverStamp };
  }
  return { skip: true, reason: "stamp_match", serverStamp };
}
