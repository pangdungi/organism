/**
 * 시간가계부 기록 행 ↔ Supabase (time_ledger_entries)
 *
 * 정책: 화면에 보이는 구간은 서버 조회 결과로 맞춤. 서버 쓰기는 사용자가 저장한 뒤
 * «이번에 바뀐 행»만 upsert (통째로 로컬 스냅샷을 올리지 않음).
 */

import { supabase } from "../supabase.js";
import {
  applyTimeLedgerServerRangeSnapshot,
  ensureTimeLedgerEntryIds,
  localTimeLedgerRowToDbPayload,
  mergeTimeLedgerEntriesPushedServerTimes,
  readTimeLedgerEntriesRaw,
  timeLedgerMonthRangeYmd,
  timeLedgerRowIsSyncable,
  timeLedgerRowNeedsPush,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";
import { timeLedgerSyncLog } from "./timeLedgerSyncDebug.js";

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

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/** time_ledger_entries 서버 액세스 직렬화 — 삭제·업서트·당겨오기가 겹치지 않게 함 */
let _ledgerServerChain = Promise.resolve();

function runSerializedLedgerServerOp(fn) {
  const next = _ledgerServerChain.then(fn, fn);
  _ledgerServerChain = next.catch(() => {});
  return next;
}

/**
 * pullTimeLedgerEntriesForDateRange 의 실조회·로컬 반영 (직렬 큐 안에서만 pushDirty 등이 호출)
 */
/**
 * @param {{ trigger?: string }} [meta] — 콘솔 디버그용 (direct: 당기기만, after_push: 올린 직후 구간 동기화)
 */
async function pullTimeLedgerEntriesForDateRangeCore(rangeStart, rangeEnd, meta = {}) {
  const userId = await getSessionUserId();
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  const trigger = meta.trigger ?? "direct";
  if (!userId || !supabase) {
    timeLedgerSyncLog("pull_skipped", { reason: "no_session", range: `${rs}..${re}`, trigger });
    return false;
  }
  if (!rs || !re) {
    timeLedgerSyncLog("pull_skipped", { reason: "bad_range", trigger });
    return false;
  }

  timeLedgerSyncLog("pull_start", { range: `${rs}..${re}`, trigger });

  const { data, error } = await supabase
    .from(TABLE)
    .select(LEDGER_ENTRY_SELECT)
    .eq("user_id", userId)
    .gte("entry_date", rs)
    .lte("entry_date", re)
    .order("entry_date", { ascending: false })
    .order("start_time", { ascending: false });

  if (error) {
    timeLedgerSyncLog("pull_done", {
      range: `${rs}..${re}`,
      trigger,
      ok: false,
      error: error.message,
    });
    return false;
  }

  const rows = data ?? [];
  applyTimeLedgerServerRangeSnapshot(rows, rs, re);
  timeLedgerSyncLog("pull_done", {
    range: `${rs}..${re}`,
    trigger,
    ok: true,
    rowCount: rows.length,
  });
  return true;
}

/**
 * 서버에서 시간 기록 행 삭제 (id 기준)
 * @param {string} entryId - 삭제할 행의 UUID
 * @returns {Promise<boolean>} 성공 여부
 */
export async function deleteTimeLedgerEntryFromSupabase(entryId) {
  return runSerializedLedgerServerOp(async () => {
    const id = String(entryId || "").trim();
    if (!id) {
      timeLedgerSyncLog("server_delete_skipped", { reason: "no_id" });
      return false;
    }
    const userId = await getSessionUserId();
    if (!userId || !supabase) {
      timeLedgerSyncLog("server_delete_skipped", { reason: "no_session", idPreview: id.slice(0, 8) });
      return false;
    }

    timeLedgerSyncLog("server_delete_start", { idPreview: `${id.slice(0, 8)}…` });

    const { error, data } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select();

    if (error) {
      timeLedgerSyncLog("server_delete_done", { ok: false, message: error.message });
      return false;
    }
    const deleted = Array.isArray(data) ? data.length : 0;
    const ok = deleted > 0;
    timeLedgerSyncLog("server_delete_done", { ok, deletedRows: deleted });
    return ok;
  });
}

/**
 * 로컬에서 «이번에 사용자가 저장해 바뀐 행»만 서버 upsert 후, 서버 기준으로 해당 날짜 구간만 다시 받음.
 * @param {{ rangeStart?: string, rangeEnd?: string }} [opts] — 아카이브 등에서 구간 지정. 없으면 시간 탭 피커(session) 구간.
 */
export async function pushDirtyTimeLedgerEntriesToSupabase(opts = {}) {
  return runSerializedLedgerServerOp(async () => {
    const userId = await getSessionUserId();
    if (!userId || !supabase) {
      timeLedgerSyncLog("push_dirty_skipped", { reason: "no_session" });
      return;
    }

    let rows = readTimeLedgerEntriesRaw();
    const ensured = ensureTimeLedgerEntryIds(rows);
    if (ensured.dirty) {
      rows = ensured.rows;
      writeTimeLedgerEntriesRaw(rows);
    }

    const substantive = rows.filter((r) => timeLedgerRowIsSyncable(r));
    const toUpload = substantive.filter((r) => timeLedgerRowNeedsPush(r));

    if (toUpload.length === 0) {
      timeLedgerSyncLog("push_dirty_skipped", { reason: "no_rows_to_upload" });
      return;
    }

    const idPreviews = toUpload.map((r) =>
      String(r.id || "")
        .trim()
        .slice(0, 8),
    );
    timeLedgerSyncLog("server_upsert_start", {
      rowCount: toUpload.length,
      idPreviews,
    });

    const payloads = toUpload
      .map((r) => localTimeLedgerRowToDbPayload(userId, r))
      .filter(Boolean);
    if (payloads.length === 0) {
      timeLedgerSyncLog("push_dirty_skipped", { reason: "payloads_empty" });
      return;
    }

    const { data, error } = await supabase
      .from(TABLE)
      .upsert(payloads, { onConflict: "id" })
      .select(LEDGER_ENTRY_SELECT);

    if (error) {
      timeLedgerSyncLog("server_upsert_done", { ok: false, message: error.message });
      return;
    }

    if (Array.isArray(data) && data.length > 0) {
      mergeTimeLedgerEntriesPushedServerTimes(data);
    } else {
      mergeTimeLedgerEntriesPushedServerTimes(
        toUpload.map((r) => ({
          id: String(r.id || "").trim(),
          updated_at: new Date().toISOString(),
        })),
      );
    }

    timeLedgerSyncLog("server_upsert_done", {
      ok: true,
      returnedRowCount: Array.isArray(data) ? data.length : 0,
    });

    if (opts.skipPull) {
      timeLedgerSyncLog("pull_after_push_skipped", { reason: "skipPull_option" });
      return;
    }

    const rs = opts.rangeStart;
    const re = opts.rangeEnd;
    if (rs && re && YMD_RE.test(rs) && YMD_RE.test(re)) {
      await pullTimeLedgerEntriesForDateRangeCore(rs, re, { trigger: "after_push" });
    } else {
      const { rangeStart, rangeEnd } = readTimeLedgerSessionFilterRangeYmd();
      await pullTimeLedgerEntriesForDateRangeCore(rangeStart, rangeEnd, {
        trigger: "after_push",
      });
    }
  });
}

/** 시간 탭에서 쓰는 pull: 계정 + 날짜 피커 구간(entry_date)만 조회 */
export async function pullTimeLedgerEntriesFromSupabase() {
  const { rangeStart, rangeEnd } = readTimeLedgerSessionFilterRangeYmd();
  return pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
}

/**
 * entry_date가 [rangeStart, rangeEnd] (포함)인 행만 서버에서 받아 해당 구간만 로컬에 반영(서버 기준).
 */
export async function pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd) {
  return runSerializedLedgerServerOp(() =>
    pullTimeLedgerEntriesForDateRangeCore(rangeStart, rangeEnd, { trigger: "direct" }),
  );
}

/**
 * 아카이브: 해당 연·월만 서버에서 받아 로컬에 반영.
 */
export async function hydrateTimeLedgerEntriesForArchiveMonth(year, month) {
  if (!supabase) return false;
  const { rangeStart, rangeEnd } = timeLedgerMonthRangeYmd(year, month);
  return pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
}

/**
 * 아카이브: 선택한 날짜 구간(YYYY-MM-DD 포함)을 서버에서 받아 로컬에 반영.
 */
export async function hydrateTimeLedgerEntriesForArchiveRange(rangeStart, rangeEnd) {
  if (!supabase) return false;
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  const ymd = /^\d{4}-\d{2}-\d{2}$/;
  if (!ymd.test(rs) || !ymd.test(re)) return false;
  if (rs > re) return false;
  return pullTimeLedgerEntriesForDateRange(rs, re);
}

let _listenerAttached = false;

/** 예전 자동 업로드 리스너 자리 — 호환용으로만 호출되며 아무 것도 등록하지 않음. */
export function attachTimeLedgerEntriesSaveListener() {
  _listenerAttached = true;
}

export async function hydrateTimeLedgerEntriesFromCloud() {
  if (!supabase) return false;
  attachTimeLedgerEntriesSaveListener();
  return pullTimeLedgerEntriesFromSupabase();
}
