/**
 * 시간가계부 기록 행 ↔ Supabase (time_ledger_entries)
 *
 * 정책: 화면에 보이는 날짜 구간은 서버 조회 결과가 기준(로컬은 캐시·오프라인용).
 * 올리기: 사용자 저장으로 바뀐 행만 upsert · 삭제는 delete API (통째 업로드 없음).
 * 기본(skipPull 미지정 시): upsert 직후 피커 구간 pull — 저장 직후 덮어쓰기가 나면 skipPull: true 로 호출.
 * 서버 쓰기는 사용자가 기록·모달에서 저장·삭제할 때만(pushDirty·delete API).
 */

import { supabase } from "../supabase.js";
import { lpSaveDebug } from "./lpSaveDebug.js";
import { lpPullDebug } from "./lpPullDebug.js";
import {
  applyTimeLedgerServerRangeSnapshot,
  ensureTimeLedgerEntryIds,
  localTimeLedgerRowToDbPayload,
  mergeTimeLedgerEntriesPushedServerTimes,
  readTimeLedgerEntriesRaw,
  recordTimeLedgerDeletionTombstone,
  timeLedgerMonthRangeYmd,
  timeLedgerRowIsSyncable,
  timeLedgerRowNeedsPush,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";
import { timeLedgerSyncLog } from "./timeLedgerSyncDebug.js";

const TABLE = "time_ledger_entries";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const LEDGER_ENTRY_SELECT =
  "id, entry_date, task_id, task_name, start_time, end_time, productivity, category, time_tracked, focus_events, memo, memo_tags, linked_expense_ids, updated_at";

/** 로컬 달력 기준 오늘 YYYY-MM-DD */
export function timeLedgerLocalTodayYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 로컬 달력 기준 어제 YYYY-MM-DD (1일 뷰「어제 실제」토글·탭 진입 시 pull 범위용) */
export function timeLedgerLocalYesterdayYmd() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const SS_AUDIT_START = "lp_time_audit_filter_start";
const SS_AUDIT_END = "lp_time_audit_filter_end";
const SS_RETROSPECT_START = "lp_time_retrospect_filter_start";
const SS_RETROSPECT_END = "lp_time_retrospect_filter_end";

/** 오늘이 속한 주의 일요일~토요일(로컬, 포함 7일) YYYY-MM-DD */
function weekSundayToSaturdayContainingYmd(ymd) {
  let dStr = ymd;
  if (!dStr || !YMD_RE.test(dStr)) {
    dStr = timeLedgerLocalTodayYmd();
  }
  const [y, mo, d] = dStr.split("-").map(Number);
  const dt = new Date(y, mo - 1, d, 12, 0, 0, 0);
  if (Number.isNaN(dt.getTime())) {
    const t = timeLedgerLocalTodayYmd();
    const [y2, mo2, d2] = t.split("-").map(Number);
    dt.setFullYear(y2, mo2 - 1, d2);
  }
  dt.setDate(dt.getDate() - dt.getDay());
  const pad = (n) => String(n).padStart(2, "0");
  const rs = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
  const end = new Date(dt);
  end.setDate(end.getDate() + 6);
  const re = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  return { rangeStart: rs, rangeEnd: re };
}

function readTimeLedgerRetrospectSessionStoredYmdOrNull() {
  try {
    if (typeof sessionStorage !== "undefined") {
      const ss = sessionStorage.getItem(SS_RETROSPECT_START);
      const se = sessionStorage.getItem(SS_RETROSPECT_END);
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
  return null;
}

/**
 * 「회고」탭 날짜 구간. 저장값 없으면 오늘 기준 해당 주 일~토(7일).
 */
export function readTimeLedgerRetrospectSessionFilterRangeYmd() {
  const stored = readTimeLedgerRetrospectSessionStoredYmdOrNull();
  if (stored) return stored;
  return weekSundayToSaturdayContainingYmd(timeLedgerLocalTodayYmd());
}

/** 로컬 달력 기준 이번 달 1일 YYYY-MM-DD (보고서 기본 시작일) */
export function timeLedgerLocalMonthFirstYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

/** 상위 '시간' 탭 클릭 시 — 시간「기록」피커를 오늘 하루로 맞춤(이후 사용자가 날짜 변경 가능). */
export function resetTimeLedgerSessionFilterToToday() {
  try {
    if (typeof sessionStorage === "undefined") return;
    const t = timeLedgerLocalTodayYmd();
    sessionStorage.setItem("lp_time_filter_start", t);
    sessionStorage.setItem("lp_time_filter_end", t);
  } catch (_) {}
}

/**
 * 시간「기록」탭 날짜 피커가 sessionStorage에 둔 구간(start/end 포함).
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
        const today = timeLedgerLocalTodayYmd();
        const monthFirst = timeLedgerLocalMonthFirstYmd();
        /* 시간「기록」은 오늘 하루가 기본. 달 1일~오늘은 보고서용이라 기록 키에 남은 값은 오늘로 맞춤 */
        if (rs === monthFirst && re === today) {
          try {
            sessionStorage.setItem("lp_time_filter_start", today);
            sessionStorage.setItem("lp_time_filter_end", today);
          } catch (_) {}
          return { rangeStart: today, rangeEnd: today };
        }
        return { rangeStart: rs, rangeEnd: re };
      }
    }
  } catch (_) {}
  const t = timeLedgerLocalTodayYmd();
  return { rangeStart: t, rangeEnd: t };
}

/** 보고서 탭에만 저장된 구간. 없으면 null(당겨오기 범위는 시간 기록 구간만 씀). */
function readTimeLedgerAuditSessionStoredYmdOrNull() {
  try {
    if (typeof sessionStorage !== "undefined") {
      const ss = sessionStorage.getItem(SS_AUDIT_START);
      const se = sessionStorage.getItem(SS_AUDIT_END);
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
  return null;
}

/**
 * 「보고서」탭용 날짜 구간(저장값 없으면 이번 달 1일~오늘).
 */
export function readTimeLedgerAuditSessionFilterRangeYmd() {
  const stored = readTimeLedgerAuditSessionStoredYmdOrNull();
  if (stored) return stored;
  return {
    rangeStart: timeLedgerLocalMonthFirstYmd(),
    rangeEnd: timeLedgerLocalTodayYmd(),
  };
}

/**
 * 서버 당겨오기: 시간 기록·보고서 구간을 합친 최소~최대(보고서를 한 번도 안 열었으면 시간 기록 구간만).
 */
export function readTimeLedgerCombinedPullRangeYmd() {
  const L = readTimeLedgerSessionFilterRangeYmd();
  let rs = L.rangeStart;
  let re = L.rangeEnd;
  const A = readTimeLedgerAuditSessionStoredYmdOrNull();
  if (A) {
    if (A.rangeStart < rs) rs = A.rangeStart;
    if (A.rangeEnd > re) re = A.rangeEnd;
  }
  const R = readTimeLedgerRetrospectSessionStoredYmdOrNull();
  if (R) {
    if (R.rangeStart < rs) rs = R.rangeStart;
    if (R.rangeEnd > re) re = R.rangeEnd;
  }
  return { rangeStart: rs, rangeEnd: re };
}

/** Realtime payload: 이 변경이 현재 피커/보고서 구간 entry_date에 닿는지 (알 수 없으면 true). */
export function timeLedgerEntryPayloadTouchesSessionPicker(payload) {
  if (!payload || payload.table !== "time_ledger_entries") return true;
  const row =
    payload.new &&
    typeof payload.new === "object" &&
    Object.keys(payload.new).length
      ? payload.new
      : payload.old;
  if (!row || row.entry_date == null || row.entry_date === "") return true;
  const d = String(row.entry_date).slice(0, 10);
  if (!YMD_RE.test(d)) return true;
  const { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
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
async function pullTimeLedgerEntriesForDateRangeCore(
  rangeStart,
  rangeEnd,
  meta = {},
) {
  const userId = await getSessionUserId();
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  const trigger = meta.trigger ?? "direct";
  if (!userId || !supabase) {
    timeLedgerSyncLog("pull_skipped", {
      reason: "no_session",
      range: `${rs}..${re}`,
      trigger,
    });
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
      timeLedgerSyncLog("server_delete_skipped", {
        reason: "no_session",
        idPreview: id.slice(0, 8),
      });
      return false;
    }

    timeLedgerSyncLog("server_delete_start", {
      idPreview: `${id.slice(0, 8)}…`,
    });

    const { error, data } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", userId)
      .select();

    if (error) {
      timeLedgerSyncLog("server_delete_done", {
        ok: false,
        message: error.message,
      });
      return false;
    }
    const deleted = Array.isArray(data) ? data.length : 0;
    const ok = deleted > 0;
    timeLedgerSyncLog("server_delete_done", { ok, deletedRows: deleted });
    if (ok) recordTimeLedgerDeletionTombstone(id);
    return ok;
  });
}

/**
 * 로컬에서 «이번에 사용자가 저장해 바뀐 행»만 서버 upsert 후, 피커 구간을 서버 기준으로 pull.
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
      timeLedgerSyncLog("server_upsert_done", {
        ok: false,
        message: error.message,
      });
      lpSaveDebug("시간행 upsert 실패", {
        message: error.message,
        code: error.code,
        hint: error.hint,
      });
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
    lpSaveDebug("시간행 upsert 성공", {
      rowCount: toUpload.length,
      returned: Array.isArray(data) ? data.length : 0,
    });

    if (opts.skipPull) {
      timeLedgerSyncLog("pull_after_push_skipped", {
        reason: "skipPull_option",
      });
      return;
    }

    const rs = opts.rangeStart;
    const re = opts.rangeEnd;
    if (rs && re && YMD_RE.test(rs) && YMD_RE.test(re)) {
      await pullTimeLedgerEntriesForDateRangeCore(rs, re, {
        trigger: "after_push",
      });
    } else {
      const { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
      await pullTimeLedgerEntriesForDateRangeCore(rangeStart, rangeEnd, {
        trigger: "after_push",
      });
    }
  });
}

/** 시간 탭에서 쓰는 pull: 계정 + 시간기록·보고서 날짜 구간 합친 entry_date만 조회 */
export async function pullTimeLedgerEntriesFromSupabase() {
  const { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
  return pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
}

/**
 * entry_date가 [rangeStart, rangeEnd] (포함)인 행만 서버에서 받아 해당 구간만 로컬에 반영(서버 기준).
 */
export async function pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd) {
  return runSerializedLedgerServerOp(() =>
    pullTimeLedgerEntriesForDateRangeCore(rangeStart, rangeEnd, {
      trigger: "direct",
    }),
  );
}

/**
 * 아카이브: 해당 연·월만 서버에서 받아 세션 메모리에 반영.
 */
export async function hydrateTimeLedgerEntriesForArchiveMonth(year, month) {
  lpPullDebug("hydrateTimeLedgerEntriesForArchiveMonth", { year, month });
  if (!supabase) return false;
  const { rangeStart, rangeEnd } = timeLedgerMonthRangeYmd(year, month);
  return pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
}

/**
 * 아카이브: 선택한 날짜 구간(YYYY-MM-DD 포함)을 서버에서 받아 세션 메모리에 반영.
 */
export async function hydrateTimeLedgerEntriesForArchiveRange(
  rangeStart,
  rangeEnd,
) {
  lpPullDebug("hydrateTimeLedgerEntriesForArchiveRange", {
    rangeStart,
    rangeEnd,
  });
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
  lpPullDebug("hydrateTimeLedgerEntriesFromCloud", {});
  if (!supabase) return false;
  attachTimeLedgerEntriesSaveListener();
  return pullTimeLedgerEntriesFromSupabase();
}
