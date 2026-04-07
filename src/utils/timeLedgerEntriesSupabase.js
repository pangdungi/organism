/**
 * 시간가계부 기록 행 ↔ Supabase (time_ledger_entries)
 */

import { supabase } from "../supabase.js";
import {
  applyTimeLedgerServerRangeSnapshot,
  ensureTimeLedgerEntryIds,
  localTimeLedgerRowToDbPayload,
  readTimeLedgerEntriesRaw,
  timeLedgerMonthRangeYmd,
  timeLedgerRowIsSyncable,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";

const TABLE = "time_ledger_entries";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const LEDGER_ENTRY_SELECT =
  "id, entry_date, task_id, task_name, start_time, end_time, productivity, category, time_tracked, focus_events, memo, memo_tags, updated_at";

/** 로컬 달력 기준 오늘 YYYY-MM-DD */
export function timeLedgerLocalTodayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 시간 탭 날짜 피커가 sessionStorage에 둔 구간(start/end 포함).
 * 키가 없거나 형식이 잘못됐으면 오늘 하루로 둠.
 */
export function readTimeLedgerSessionFilterRangeYmd() {
  try {
    if (typeof sessionStorage !== "undefined") {
      const ss = sessionStorage.getItem("lp_time_filter_start");
      const se = sessionStorage.getItem("lp_time_filter_end");
      if (ss && YMD_RE.test(ss)) {
        let rs = ss;
        let re = se && YMD_RE.test(se) ? se : ss;
        if (rs > re) {
          const t = rs;
          rs = re;
          re = t;
        }
        return { rangeStart: rs, rangeEnd: re };
      }
    }
  } catch (_) {}
  const t = timeLedgerLocalTodayYmd();
  return { rangeStart: t, rangeEnd: t };
}

/** Realtime payload: 이 변경이 현재 피커 entry_date 구간에 닿는지 (알 수 없으면 true). */
export function timeLedgerEntryPayloadTouchesSessionPicker(payload) {
  if (!payload || payload.table !== "time_ledger_entries") return true;
  const row =
    payload.new && typeof payload.new === "object" && Object.keys(payload.new).length
      ? payload.new
      : payload.old;
  if (!row || row.entry_date == null || row.entry_date === "") return true;
  const d = String(row.entry_date).slice(0, 10);
  if (!YMD_RE.test(d)) return true;
  const { rangeStart, rangeEnd } = readTimeLedgerSessionFilterRangeYmd();
  return d >= rangeStart && d <= rangeEnd;
}

/** 시간기록(time_ledger_entries) 전용 — 과제·예산 등 다른 동기화는 여기서 로그하지 않음 */
function logTimeLedgerServer(payload) {
  try {
    const line = { ...payload, scope: "entries", table: TABLE };
    if (payload?.ok === false) console.warn("[time-ledger-server]", line);
    else console.info("[time-ledger-server]", line);
  } catch (_) {}
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/**
 * 서버에서 시간 기록 행 삭제 (id 기준)
 * @param {string} entryId - 삭제할 행의 UUID
 * @returns {Promise<boolean>} 성공 여부
 */
export async function deleteTimeLedgerEntryFromSupabase(entryId) {
  const id = String(entryId || "").trim();
  if (!id) {
    logTimeLedgerServer({ op: "delete", entryId: id, ok: false, reason: "id 없음" });
    return false;
  }
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    logTimeLedgerServer({ op: "delete", entryId: id, ok: false, reason: "로그인·Supabase 없음" });
    return false;
  }

  const { error, data } = await supabase
    .from(TABLE)
    .delete()
    .eq("id", id)
    .eq("user_id", userId)
    .select();

  if (error) {
    logTimeLedgerServer({ op: "delete", entryId: id, ok: false, reason: error.message });
    return false;
  }
  const deleted = Array.isArray(data) ? data.length : 0;
  if (deleted === 0) {
    logTimeLedgerServer({
      op: "delete",
      entryId: id,
      ok: false,
      reason: "서버에서 삭제된 행 0 (RLS·id·이미 삭제 등)",
    });
    return false;
  }
  logTimeLedgerServer({ op: "delete", entryId: id, ok: true, deletedRows: deleted });
  return true;
}

export async function syncTimeLedgerEntriesToSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    return;
  }

  let rows = readTimeLedgerEntriesRaw();
  const ensured = ensureTimeLedgerEntryIds(rows);
  if (ensured.dirty) {
    rows = ensured.rows;
    writeTimeLedgerEntriesRaw(rows);
  }

  const substantive = rows.filter((r) => timeLedgerRowIsSyncable(r));

  if (substantive.length > 0) {
    const payloads = substantive
      .map((r) => localTimeLedgerRowToDbPayload(userId, r))
      .filter(Boolean);
    if (payloads.length > 0) {
      const { error } = await supabase.from(TABLE).upsert(payloads, { onConflict: "id" });
      const idsPreview = payloads.slice(0, 5).map((p) => String(p?.id || "").trim());
      logTimeLedgerServer({
        op: "upsert",
        rowCount: payloads.length,
        ok: !error,
        error: error ? String(error.message) : undefined,
        idsPreview,
      });
    }
  }

  /*
   * 업서트 직후: 날짜 피커 구간만 pull해 그 구간을 서버와 맞춤 (다른 날짜 로컬 행은 유지).
   */
  await pullTimeLedgerEntriesFromSupabase({ logServer: true });
}

/** 시간 탭에서 쓰는 pull: 계정 + 날짜 피커 구간(entry_date)만 조회 */
export async function pullTimeLedgerEntriesFromSupabase(opts = {}) {
  const { rangeStart, rangeEnd } = readTimeLedgerSessionFilterRangeYmd();
  return pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd, opts);
}

/**
 * entry_date가 [rangeStart, rangeEnd] (포함)인 행만 서버에서 받아 해당 구간만 스냅샷 교체.
 * @param {{ logServer?: boolean }} [opts] — true일 때만 pull 결과를 `[time-ledger-server]` 로그.
 */
export async function pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd, opts = {}) {
  const logServer = opts.logServer === true;
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  if (!rs || !re) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select(LEDGER_ENTRY_SELECT)
    .eq("user_id", userId)
    .gte("entry_date", rs)
    .lte("entry_date", re)
    .order("entry_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) {
    if (logServer) {
      logTimeLedgerServer({
        op: "pull",
        from: rs,
        to: re,
        rowCount: 0,
        ok: false,
        reason: error.message,
      });
    }
    return false;
  }

  const rowCount = Array.isArray(data) ? data.length : 0;
  if (logServer) {
    logTimeLedgerServer({
      op: "pull",
      from: rs,
      to: re,
      rowCount,
      ok: true,
    });
  }
  applyTimeLedgerServerRangeSnapshot(data ?? [], rs, re);
  return true;
}

/**
 * 아카이브: 해당 연·월만 서버 스냅샷으로 로컬 구간 교체.
 */
export async function hydrateTimeLedgerEntriesForArchiveMonth(year, month) {
  if (!supabase) return false;
  attachTimeLedgerEntriesSaveListener();
  const { rangeStart, rangeEnd } = timeLedgerMonthRangeYmd(year, month);
  return pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
}

/**
 * 아카이브: 선택한 날짜 구간(YYYY-MM-DD 포함)을 서버에서 받아 로컬에 반영 후 동기.
 * Supabase는 `pullTimeLedgerEntriesForDateRange`와 동일(entry_date gte/lte).
 */
export async function hydrateTimeLedgerEntriesForArchiveRange(rangeStart, rangeEnd) {
  if (!supabase) return false;
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!ymd.test(rs) || !ymd.test(re)) return false;
  if (rs > re) return false;
  attachTimeLedgerEntriesSaveListener();
  return pullTimeLedgerEntriesForDateRange(rs, re);
}

export async function pushAllLocalTimeLedgerEntriesIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return;
  if (count != null && count > 0) return;

  const rows = readTimeLedgerEntriesRaw();
  if (!rows.some((r) => timeLedgerRowIsSyncable(r))) return;

  await syncTimeLedgerEntriesToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 1200;

export function scheduleTimeLedgerEntriesSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncTimeLedgerEntriesToSupabase().catch((e) =>
      logTimeLedgerServer({ op: "sync", ok: false, reason: String(e?.message || e) }),
    );
  }, PUSH_DEBOUNCE_MS);
}

/** 디바운스 생략하고 즉시 서버 upsert — 탭 전환·앱 백그라운드 시 유실 방지 */
export function flushTimeLedgerEntriesSyncPush() {
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  return syncTimeLedgerEntriesToSupabase();
}

let _flushOnHideAttached = false;
function attachTimeLedgerPushFlushOnHideOnce() {
  if (_flushOnHideAttached || typeof document === "undefined") return;
  _flushOnHideAttached = true;
  const run = () => {
    if (!supabase) return;
    void flushTimeLedgerEntriesSyncPush().catch((e) =>
      logTimeLedgerServer({ op: "sync_flush", ok: false, reason: String(e?.message || e) }),
    );
  };
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") run();
    },
    { passive: true },
  );
  window.addEventListener("pagehide", run, { passive: true });
}

let _listenerAttached = false;

export function attachTimeLedgerEntriesSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  attachTimeLedgerPushFlushOnHideOnce();
  window.addEventListener("time-ledger-entries-saved", () => {
    scheduleTimeLedgerEntriesSyncPush();
  });
}

export async function hydrateTimeLedgerEntriesFromCloud() {
  if (!supabase) return false;
  attachTimeLedgerEntriesSaveListener();
  /* 서버가 비어 있을 때: pull을 먼저 하면 로컬이 []가 되어 기존 기기 데이터가 못 올라감 → 업로드 시도 후 pull */
  await pushAllLocalTimeLedgerEntriesIfServerEmpty();
  const pulled = await pullTimeLedgerEntriesFromSupabase();
  return pulled;
}
