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
  timeLedgerRowIsSyncable,
  timeLedgerRowNeedsPush,
  writeTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";
import { closeStaleInProgressTimeLedgerRows } from "./timeLedgerStaleInProgressClose.js";
import { timeLedgerSyncLog } from "./timeLedgerSyncDebug.js";
import { upsertTimeLedgerTaskRowsFromLocalByIds } from "./timeLedgerTasksSupabase.js";
import { isUuid } from "./idUtils.js";

const TABLE = "time_ledger_entries";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const LEDGER_ENTRY_SELECT =
  "id, entry_date, task_id, task_name, start_time, end_time, productivity, category, time_tracked, focus_events, memo, meal_detail, memo_tags, linked_expense_ids, habit_daily_completed, updated_at";

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

/** 로컬 달력 기준 이번 달 1일 YYYY-MM-DD (기록 피커 복구 등) */
export function timeLedgerLocalMonthFirstYmd() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}

/** 시간가계부 탭 재진입 시: 오늘 날짜·기본 타임라인·필터 없음 (App.setActiveTab time). */
export function resetTimeLedgerSessionFilterToToday() {
  try {
    if (typeof sessionStorage === "undefined") return;
    const t = timeLedgerLocalTodayYmd();
    sessionStorage.setItem("lp_time_filter_start", t);
    sessionStorage.setItem("lp_time_filter_end", t);
    sessionStorage.setItem("lp_time_usage_list_start", t);
    sessionStorage.setItem("lp_time_usage_list_end", t);
    sessionStorage.setItem("lp_time_usage_memo_only", "0");
    sessionStorage.removeItem("lp_time_usage_task_filter");
    sessionStorage.setItem("lp_time_ledger_layout_view", "timeline");
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
        /* 예전에 보고서 탭이 같은 키로 달 1일~오늘을 쓰던 경우 → 기록 탭 기본(오늘 하루)로 복구 */
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

/**
 * 서버 당겨오기·실시간: 기록 탭 세션 구간(기본 오늘) ∪ 사용내역 조회 구간.
 * 사용내역만 과거로 넓혀도 오늘 잔액용 행이 당겨지도록 합집합으로 둠.
 */
export function readTimeLedgerCombinedPullRangeYmd() {
  const base = readTimeLedgerSessionFilterRangeYmd();
  try {
    if (typeof sessionStorage === "undefined") return base;
    const us = sessionStorage.getItem("lp_time_usage_list_start");
    const ue = sessionStorage.getItem("lp_time_usage_list_end");
    if (!us || !YMD_RE.test(us)) return base;
    let rs = us;
    let re = ue && YMD_RE.test(ue) ? ue : us;
    if (rs > re) {
      const t = rs;
      rs = re;
      re = t;
    }
    const outStart = base.rangeStart < rs ? base.rangeStart : rs;
    const outEnd = base.rangeEnd > re ? base.rangeEnd : re;
    return { rangeStart: outStart, rangeEnd: outEnd };
  } catch (_) {}
  return base;
}

/** KPI 탭용 시간기록 pull: 오늘 기준 뒤로 약 6개월 + 기록 세션 구간과 합침 */
const KPI_TAB_LEDGER_PULL_BACK_DAYS = 179;

/**
 * 꿈·건강·행복·부수입 탭(및 그 안 루트 전환) 진입 시 `time_ledger_entries` 당김 범위.
 * 시간 탭을 거치지 않아도 KPI 일지·시간 연동·「N분」표시에 필요한 행이 로컬에 있게 함.
 */
export function readTimeLedgerPullRangeForKpiTabsYmd() {
  const re = timeLedgerLocalTodayYmd();
  const d = new Date();
  d.setDate(d.getDate() - KPI_TAB_LEDGER_PULL_BACK_DAYS);
  const pad = (n) => String(n).padStart(2, "0");
  const wideStart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const C = readTimeLedgerCombinedPullRangeYmd();
  let rs = wideStart;
  if (C.rangeStart < rs) rs = C.rangeStart;
  let re2 = re;
  if (C.rangeEnd > re2) re2 = C.rangeEnd;
  return { rangeStart: rs, rangeEnd: re2 };
}

/** Realtime payload: 이 변경이 현재 피커 구간 entry_date에 닿는지 (알 수 없으면 true). */
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

  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from(TABLE)
      .select(LEDGER_ENTRY_SELECT)
      .eq("user_id", userId)
      .gte("entry_date", rs)
      .lte("entry_date", re)
      .order("entry_date", { ascending: false })
      .order("start_time", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      timeLedgerSyncLog("pull_done", {
        range: `${rs}..${re}`,
        trigger,
        ok: false,
        error: error.message,
      });
      return false;
    }

    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  applyTimeLedgerServerRangeSnapshot(rows, rs, re);
  const closed = closeStaleInProgressTimeLedgerRows(readTimeLedgerEntriesRaw());
  if (closed.changed) {
    writeTimeLedgerEntriesRaw(closed.rows);
    /* pull 직렬 큐 안에서 pushDirty를 다시 큐에 넣으면 데드락 — core 직접 호출 */
    await pushDirtyTimeLedgerEntriesToSupabaseCore({ skipPull: true });
  }
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
 * @param {{ skipPull?: boolean, rangeStart?: string, rangeEnd?: string, _insideSerializedOp?: boolean }} opts
 */
async function pushDirtyTimeLedgerEntriesToSupabaseCore(opts = {}) {
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

  /* time_ledger_entries.task_id → time_ledger_tasks(id) FK: 로컬에만 있는 과제 id면 먼저 과제 행 upsert */
  const taskIdsToEnsure = [
    ...new Set(
      toUpload
        .map((r) => String(r.taskId || "").trim())
        .filter((id) => isUuid(id)),
    ),
  ];
  if (taskIdsToEnsure.length > 0) {
    await upsertTimeLedgerTaskRowsFromLocalByIds(taskIdsToEnsure);
  }

  let { data, error } = await supabase
    .from(TABLE)
    .upsert(payloads, { onConflict: "id" })
    .select(LEDGER_ENTRY_SELECT);

  const fkTask =
    error &&
    String(error.code || "") === "23503" &&
    /task_id_fkey/i.test(String(error.message || ""));
  if (fkTask) {
    timeLedgerSyncLog("server_upsert_retry", {
      reason: "task_id_fkey",
      taskIdStripAll: true,
    });
    const payloadsNoTid = payloads.map((p) => ({
      ...p,
      task_id: null,
    }));
    ({ data, error } = await supabase
      .from(TABLE)
      .upsert(payloadsNoTid, { onConflict: "id" })
      .select(LEDGER_ENTRY_SELECT));
  }

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
}

export async function pushDirtyTimeLedgerEntriesToSupabase(opts = {}) {
  return runSerializedLedgerServerOp(() =>
    pushDirtyTimeLedgerEntriesToSupabaseCore(opts),
  );
}

/** 시간 탭에서 쓰는 pull: 계정 + 시간「기록」세션 구간 entry_date만 조회 */
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
