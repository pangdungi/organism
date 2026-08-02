/**
 * 시간가계부 기록 행 ↔ Supabase (time_ledger_entries)
 *
 * 정책: 화면에 보이는 날짜 구간은 서버 조회 결과가 기준(로컬은 캐시·오프라인용).
 * 올리기: 사용자 저장으로 바뀐 행만 upsert · 삭제는 delete API (통째 업로드 없음).
 * pushDirty는 opts.entryIds가 있으면 그 기록 id만 upsert(백로그 일괄 업로드로 저장 실패 방지).
 * 기본(skipPull 미지정 시): upsert 직후 피커 구간 pull — 저장 직후 덮어쓰기가 나면 skipPull: true 로 호출.
 * 서버 쓰기: 모달 추가·수정·삭제 + 어제 이전 진행중 자동 23:59 마감(pushDirty).
 * pull 병합: 구간은 서버 스냅샷만. 미업로드분은 pull 직전 서버에 올린 뒤 다시 조회.
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
import { isUuid } from "./idUtils.js";
import { coalesceInFlightPull } from "./timeLedgerPullCoalesce.js";

const TABLE = "time_ledger_entries";
const UPSERT_CONFLICT_ROW = "user_id,id";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const LEDGER_ENTRY_SELECT_BASE =
  "id, entry_date, task_id, task_name, start_time, end_time, productivity, category, time_tracked, focus_events, memo, meal_detail, memo_tags, linked_expense_ids, habit_daily_completed, kpi_performed_value, updated_at";

/** null=미확인, true=있음, false=마이그레이션 전 서버 */
let _supportsTimeRatingColumn = null;

function ledgerEntrySelectColumns() {
  if (_supportsTimeRatingColumn === false) return LEDGER_ENTRY_SELECT_BASE;
  const mid = `${LEDGER_ENTRY_SELECT_BASE.slice(0, -"updated_at".length)}time_rating`;
  if (_supportsTimeEndReasonColumn === false) return `${mid}, updated_at`;
  if (_supportsTimeFlowFactorColumn === false)
    return `${mid}, time_end_reasons, updated_at`;
  if (_supportsTimeFlowDisruptorColumn === false)
    return `${mid}, time_end_reasons, time_flow_factors, updated_at`;
  if (_supportsTimeSleepFactorColumn === false)
    return `${mid}, time_end_reasons, time_flow_factors, time_flow_disruptors, updated_at`;
  if (_supportsTimeBadFeelingColumn === false)
    return `${mid}, time_end_reasons, time_flow_factors, time_flow_disruptors, time_sleep_good_factors, time_sleep_poor_reasons, updated_at`;
  return `${mid}, time_end_reasons, time_flow_factors, time_flow_disruptors, time_sleep_good_factors, time_sleep_poor_reasons, time_bad_feeling_reasons, updated_at`;
}

function isMissingTimeRatingColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return /time_rating/i.test(msg);
}

function isMissingTimeEndReasonColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return /time_end_reasons?/i.test(msg);
}

function isMissingTimeEndReasonsPluralColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return /time_end_reasons/i.test(msg);
}

function isMissingTimeFlowFactorColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return /time_flow_factors?/i.test(msg);
}

function isMissingTimeFlowDisruptorColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return /time_flow_disruptors?/i.test(msg);
}

function isMissingTimeSleepFactorColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return /time_sleep_good_factors|time_sleep_poor_reasons/i.test(msg);
}

function isMissingTimeBadFeelingColumnError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return /time_bad_feeling_reasons/i.test(msg);
}

function markTimeRatingColumnSupported(ok) {
  _supportsTimeRatingColumn = ok;
}

/** null=미확인, true=있음, false=마이그레이션 전 서버 */
let _supportsTimeEndReasonColumn = null;

function markTimeEndReasonColumnSupported(ok) {
  _supportsTimeEndReasonColumn = ok;
}

/** null=미확인, true=있음, false=마이그레이션 전 서버 */
let _supportsTimeFlowFactorColumn = null;

function markTimeFlowFactorColumnSupported(ok) {
  _supportsTimeFlowFactorColumn = ok;
}

/** null=미확인, true=있음, false=마이그레이션 전 서버 */
let _supportsTimeFlowDisruptorColumn = null;

function markTimeFlowDisruptorColumnSupported(ok) {
  _supportsTimeFlowDisruptorColumn = ok;
}

/** null=미확인, true=있음, false=마이그레이션 전 서버 */
let _supportsTimeSleepFactorColumn = null;

function markTimeSleepFactorColumnSupported(ok) {
  _supportsTimeSleepFactorColumn = ok;
}

/** null=미확인, true=있음, false=마이그레이션 전 서버 */
let _supportsTimeBadFeelingColumn = null;

function markTimeBadFeelingColumnSupported(ok) {
  _supportsTimeBadFeelingColumn = ok;
}

function stripTimeRatingFromPayloads(payloads) {
  return payloads.map(({ time_rating: _drop, ...rest }) => rest);
}

function stripTimeEndReasonFromPayloads(payloads) {
  return payloads.map(
    ({
      time_end_reason: _drop,
      time_end_reasons: _drop2,
      time_flow_factor: _drop3,
      time_flow_factors: _drop4,
      ...rest
    }) => rest,
  );
}

function mapTimeEndReasonsToLegacyPayload(payload) {
  const reasons = Array.isArray(payload.time_end_reasons)
    ? payload.time_end_reasons
    : [];
  const first = reasons.map((r) => String(r ?? "").trim()).find(Boolean);
  const { time_end_reasons: _drop, ...rest } = payload;
  return {
    ...rest,
    time_end_reason: first || null,
  };
}

function stripTimeFlowFactorFromPayloads(payloads) {
  return payloads.map(
    ({ time_flow_factor: _drop, time_flow_factors: _drop2, ...rest }) => rest,
  );
}

function stripTimeFlowDisruptorFromPayloads(payloads) {
  return payloads.map(
    ({
      time_flow_disruptor: _drop,
      time_flow_disruptors: _drop2,
      ...rest
    }) => rest,
  );
}

function stripTimeSleepFactorFromPayloads(payloads) {
  return payloads.map(
    ({
      time_sleep_good_factors: _drop,
      time_sleep_poor_reasons: _drop2,
      time_bad_feeling_reasons: _drop3,
      ...rest
    }) => rest,
  );
}

function stripTimeBadFeelingFromPayloads(payloads) {
  return payloads.map(
    ({ time_bad_feeling_reasons: _drop, ...rest }) => rest,
  );
}

async function fetchLedgerEntriesForRangePage(
  userId,
  rs,
  re,
  offset,
  pageSize,
) {
  const selectCols = ledgerEntrySelectColumns();
  let result = await supabase
    .from(TABLE)
    .select(selectCols)
    .eq("user_id", userId)
    .gte("entry_date", rs)
    .lte("entry_date", re)
    .order("entry_date", { ascending: false })
    .order("start_time", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (result.error && isMissingTimeRatingColumnError(result.error)) {
    markTimeRatingColumnSupported(false);
    markTimeEndReasonColumnSupported(false);
    markTimeFlowFactorColumnSupported(false);
    markTimeFlowDisruptorColumnSupported(false);
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    result = await supabase
      .from(TABLE)
      .select(LEDGER_ENTRY_SELECT_BASE)
      .eq("user_id", userId)
      .gte("entry_date", rs)
      .lte("entry_date", re)
      .order("entry_date", { ascending: false })
      .order("start_time", { ascending: false })
      .range(offset, offset + pageSize - 1);
  } else if (result.error && isMissingTimeEndReasonsPluralColumnError(result.error)) {
    result = await supabase
      .from(TABLE)
      .select(
        `${LEDGER_ENTRY_SELECT_BASE.slice(0, -"updated_at".length)}time_rating, time_end_reason, time_flow_factors, updated_at`,
      )
      .eq("user_id", userId)
      .gte("entry_date", rs)
      .lte("entry_date", re)
      .order("entry_date", { ascending: false })
      .order("start_time", { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (result.error && isMissingTimeFlowFactorColumnError(result.error)) {
      markTimeFlowFactorColumnSupported(false);
      result = await supabase
        .from(TABLE)
        .select(
          `${LEDGER_ENTRY_SELECT_BASE.slice(0, -"updated_at".length)}time_rating, time_end_reason, updated_at`,
        )
        .eq("user_id", userId)
        .gte("entry_date", rs)
        .lte("entry_date", re)
        .order("entry_date", { ascending: false })
        .order("start_time", { ascending: false })
        .range(offset, offset + pageSize - 1);
    }
  } else if (result.error && isMissingTimeEndReasonColumnError(result.error)) {
    markTimeEndReasonColumnSupported(false);
    markTimeFlowFactorColumnSupported(false);
    markTimeFlowDisruptorColumnSupported(false);
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    result = await supabase
      .from(TABLE)
      .select(
        `${LEDGER_ENTRY_SELECT_BASE.slice(0, -"updated_at".length)}time_rating, updated_at`,
      )
      .eq("user_id", userId)
      .gte("entry_date", rs)
      .lte("entry_date", re)
      .order("entry_date", { ascending: false })
      .order("start_time", { ascending: false })
      .range(offset, offset + pageSize - 1);
  } else if (result.error && isMissingTimeFlowFactorColumnError(result.error)) {
    markTimeFlowFactorColumnSupported(false);
    markTimeFlowDisruptorColumnSupported(false);
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    result = await supabase
      .from(TABLE)
      .select(
        `${LEDGER_ENTRY_SELECT_BASE.slice(0, -"updated_at".length)}time_rating, time_end_reasons, updated_at`,
      )
      .eq("user_id", userId)
      .gte("entry_date", rs)
      .lte("entry_date", re)
      .order("entry_date", { ascending: false })
      .order("start_time", { ascending: false })
      .range(offset, offset + pageSize - 1);
  } else if (result.error && isMissingTimeFlowDisruptorColumnError(result.error)) {
    markTimeFlowDisruptorColumnSupported(false);
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    result = await supabase
      .from(TABLE)
      .select(
        `${LEDGER_ENTRY_SELECT_BASE.slice(0, -"updated_at".length)}time_rating, time_end_reasons, time_flow_factors, updated_at`,
      )
      .eq("user_id", userId)
      .gte("entry_date", rs)
      .lte("entry_date", re)
      .order("entry_date", { ascending: false })
      .order("start_time", { ascending: false })
      .range(offset, offset + pageSize - 1);
  } else if (result.error && isMissingTimeSleepFactorColumnError(result.error)) {
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    result = await supabase
      .from(TABLE)
      .select(
        `${LEDGER_ENTRY_SELECT_BASE.slice(0, -"updated_at".length)}time_rating, time_end_reasons, time_flow_factors, time_flow_disruptors, updated_at`,
      )
      .eq("user_id", userId)
      .gte("entry_date", rs)
      .lte("entry_date", re)
      .order("entry_date", { ascending: false })
      .order("start_time", { ascending: false })
      .range(offset, offset + pageSize - 1);
  } else if (result.error && isMissingTimeBadFeelingColumnError(result.error)) {
    markTimeBadFeelingColumnSupported(false);
    result = await supabase
      .from(TABLE)
      .select(
        `${LEDGER_ENTRY_SELECT_BASE.slice(0, -"updated_at".length)}time_rating, time_end_reasons, time_flow_factors, time_flow_disruptors, time_sleep_good_factors, time_sleep_poor_reasons, updated_at`,
      )
      .eq("user_id", userId)
      .gte("entry_date", rs)
      .lte("entry_date", re)
      .order("entry_date", { ascending: false })
      .order("start_time", { ascending: false })
      .range(offset, offset + pageSize - 1);
  } else if (!result.error) {
    if (_supportsTimeRatingColumn === null) markTimeRatingColumnSupported(true);
    if (_supportsTimeEndReasonColumn === null) markTimeEndReasonColumnSupported(true);
    if (_supportsTimeFlowFactorColumn === null) markTimeFlowFactorColumnSupported(true);
    if (_supportsTimeFlowDisruptorColumn === null) markTimeFlowDisruptorColumnSupported(true);
    if (_supportsTimeSleepFactorColumn === null) markTimeSleepFactorColumnSupported(true);
    if (_supportsTimeBadFeelingColumn === null) markTimeBadFeelingColumnSupported(true);
  }
  return result;
}

function isOnConflictConstraintError(error) {
  const msg = `${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`;
  return (
    /no unique|unique constraint|ON CONFLICT|conflict/i.test(msg) ||
    String(error?.code || "") === "42P10"
  );
}

/** 쓰기 응답은 id·updated_at만 — 선택 컬럼 select 때문에 upsert 전체가 실패하던 사고 방지 */
const UPSERT_RETURN_COLS = "id, updated_at";

function stripPayloadForMissingColumnError(payloads, error) {
  if (isMissingTimeBadFeelingColumnError(error)) {
    markTimeBadFeelingColumnSupported(false);
    return stripTimeBadFeelingFromPayloads(payloads);
  }
  if (isMissingTimeSleepFactorColumnError(error)) {
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    return stripTimeSleepFactorFromPayloads(payloads);
  }
  if (isMissingTimeFlowDisruptorColumnError(error)) {
    markTimeFlowDisruptorColumnSupported(false);
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    return stripTimeFlowDisruptorFromPayloads(payloads);
  }
  if (isMissingTimeFlowFactorColumnError(error)) {
    markTimeFlowFactorColumnSupported(false);
    markTimeFlowDisruptorColumnSupported(false);
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    return stripTimeFlowFactorFromPayloads(payloads);
  }
  if (isMissingTimeEndReasonsPluralColumnError(error)) {
    return payloads.map(mapTimeEndReasonsToLegacyPayload);
  }
  if (isMissingTimeEndReasonColumnError(error)) {
    markTimeEndReasonColumnSupported(false);
    markTimeFlowFactorColumnSupported(false);
    markTimeFlowDisruptorColumnSupported(false);
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    return stripTimeEndReasonFromPayloads(payloads);
  }
  if (isMissingTimeRatingColumnError(error)) {
    markTimeRatingColumnSupported(false);
    markTimeEndReasonColumnSupported(false);
    markTimeFlowFactorColumnSupported(false);
    markTimeFlowDisruptorColumnSupported(false);
    markTimeSleepFactorColumnSupported(false);
    markTimeBadFeelingColumnSupported(false);
    return stripTimeRatingFromPayloads(payloads);
  }
  return null;
}

async function upsertLedgerEntryPayloads(payloads) {
  let batch = payloads;
  let onConflict = UPSERT_CONFLICT_ROW;
  let result = await supabase
    .from(TABLE)
    .upsert(batch, { onConflict })
    .select(UPSERT_RETURN_COLS);

  for (let attempt = 0; attempt < 8 && result.error; attempt += 1) {
    if (isOnConflictConstraintError(result.error) && onConflict !== "id") {
      onConflict = "id";
      result = await supabase
        .from(TABLE)
        .upsert(batch, { onConflict })
        .select(UPSERT_RETURN_COLS);
      continue;
    }
    const stripped = stripPayloadForMissingColumnError(batch, result.error);
    if (!stripped) break;
    batch = stripped;
    result = await supabase
      .from(TABLE)
      .upsert(batch, { onConflict })
      .select(UPSERT_RETURN_COLS);
  }

  return result;
}

/** @deprecated 내부 select 헬퍼 사용 — 호환용 */
const LEDGER_ENTRY_SELECT = ledgerEntrySelectColumns();

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

/**
 * 시간가계부 탭을 나가거나 다시 들어올 때:
 * 조회기간·일간/주간/월간/연간을 오늘 하루(1일)로 되돌림.
 */
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
    sessionStorage.removeItem("lp_time_usage_text_search");
    sessionStorage.setItem("lp_time_ledger_layout_view", "timeline");
    sessionStorage.setItem("lp_time_ledger_timeline_granularity", "day");
    sessionStorage.setItem("lp_time_ledger_timebox_granularity", "day");
    sessionStorage.setItem("lp_time_ledger_report_granularity", "day");
    sessionStorage.setItem("lp_time_report_range_start", t);
    sessionStorage.setItem("lp_time_report_range_end", t);
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
    const prs = sessionStorage.getItem("lp_time_report_range_start");
    const pre = sessionStorage.getItem("lp_time_report_range_end");
    if (prs && YMD_RE.test(prs)) {
      let rrs = prs;
      let rre = pre && YMD_RE.test(pre) ? pre : prs;
      if (rrs > rre) {
        const t = rrs;
        rrs = rre;
        rre = t;
      }
      return {
        rangeStart: outStart < rrs ? outStart : rrs,
        rangeEnd: outEnd > rre ? outEnd : rre,
      };
    }
    return { rangeStart: outStart, rangeEnd: outEnd };
  } catch (_) {}
  return base;
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
  const withTimeout = () =>
    Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        setTimeout(() => reject(new Error("ledger_op_timeout")), 40000);
      }),
    ]);
  const next = _ledgerServerChain.then(withTimeout, withTimeout);
  _ledgerServerChain = next.catch(() => {});
  return next;
}

/**
 * pullTimeLedgerEntriesForDateRange 의 실조회·로컬 반영 (직렬 큐 안에서만 pushDirty 등이 호출)
 */
/**
 * @param {{ trigger?: string, preferServer?: boolean }} [meta]
 * — trigger: 콘솔 디버그용 (direct / after_push / resume)
 * — preferServer: 호환용(무시). pull은 항상 그 시점 서버 스냅샷만 반영
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

  timeLedgerSyncLog("pull_start", {
    range: `${rs}..${re}`,
    trigger,
    preferServer: true,
  });

  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await fetchLedgerEntriesForRangePage(
      userId,
      rs,
      re,
      offset,
      pageSize,
    );

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

  applyTimeLedgerServerRangeSnapshot(rows, rs, re, { preferServer: true });
  /*
   * 어제 이전 「진행 중」→ 로컬 23:59 마감 후 서버에도 upsert.
   * (마감 없이 남은 행이 pull마다 다시 비어 보이지 않게)
   */
  const closed = closeStaleInProgressTimeLedgerRows(readTimeLedgerEntriesRaw());
  if (closed.changed) {
    writeTimeLedgerEntriesRaw(closed.rows);
    const idSet = new Set(
      (closed.closedEntryIds || []).map((id) => String(id || "").trim()).filter(Boolean),
    );
    const forceRows = closed.rows.filter((r) =>
      idSet.has(String(r?.id || "").trim()),
    );
    if (forceRows.length > 0) {
      await pushDirtyTimeLedgerEntriesToSupabaseCore({
        forceRows,
        entryIds: [...idSet],
        skipPull: true,
      });
    }
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

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      timeLedgerSyncLog("server_delete_done", {
        ok: false,
        message: error.message,
      });
      return false;
    }
    /* select 결과 없이도 삭제 성공으로 봄 — RETURNING 빈 배열로 실패 처리하던 사고 방지 */
    timeLedgerSyncLog("server_delete_done", { ok: true });
    recordTimeLedgerDeletionTombstone(id);
    return true;
  });
}

function isTaskIdForeignKeyError(error) {
  if (!error || String(error.code || "") !== "23503") return false;
  const blob = `${error.message || ""} ${error.details || ""} ${error.hint || ""}`;
  return /task.*fkey/i.test(blob);
}

/**
 * 로컬 dirty 또는 모달이 넘긴 forceRows를 서버 upsert 후 구간 pull.
 * forceRows: 모달 추가·수정 — needsPush·메모리 상태와 무관하게 반드시 upsert.
 * @param {{ skipPull?: boolean, rangeStart?: string, rangeEnd?: string, entryIds?: string[], forceRows?: object[] }} opts
 * @returns {Promise<{ ok: boolean, reason?: string, pushedCount?: number }>}
 */
async function pushDirtyTimeLedgerEntriesToSupabaseCore(opts = {}) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    timeLedgerSyncLog("push_dirty_skipped", { reason: "no_session" });
    return { ok: false, reason: "no_session", pushedCount: 0 };
  }

  const forceRowsIn = Array.isArray(opts.forceRows) ? opts.forceRows : [];
  const forceStamped = [];
  if (forceRowsIn.length > 0) {
    const now = Date.now();
    const { rows: forcedEnsured } = ensureTimeLedgerEntryIds(forceRowsIn);
    for (const r of forcedEnsured) {
      if (!timeLedgerRowIsSyncable(r)) continue;
      forceStamped.push({ ...r, localModifiedAt: now });
    }
    if (forceStamped.length > 0) {
      const byId = new Map(
        readTimeLedgerEntriesRaw()
          .map((r) => [String(r?.id || "").trim(), r])
          .filter(([id]) => id),
      );
      for (const r of forceStamped) {
        byId.set(String(r.id).trim(), r);
      }
      writeTimeLedgerEntriesRaw([...byId.values()]);
    }
  }

  let rows = readTimeLedgerEntriesRaw();
  const ensured = ensureTimeLedgerEntryIds(rows);
  if (ensured.dirty) {
    rows = ensured.rows;
    writeTimeLedgerEntriesRaw(rows);
  }

  const entryIdFilter = new Set(
    (Array.isArray(opts.entryIds) ? opts.entryIds : [])
      .map((id) => String(id || "").trim())
      .filter((id) => isUuid(id)),
  );

  let toUpload;
  if (forceStamped.length > 0) {
    /* 모달 저장본 그대로 — dirty 판정으로 빼지 않음 */
    toUpload = forceStamped.slice();
    if (entryIdFilter.size > 0) {
      toUpload = toUpload.filter((r) =>
        entryIdFilter.has(String(r.id || "").trim()),
      );
    }
  } else {
    const substantive = rows.filter((r) => timeLedgerRowIsSyncable(r));
    toUpload = substantive.filter((r) => timeLedgerRowNeedsPush(r));
    if (entryIdFilter.size > 0) {
      toUpload = toUpload.filter((r) =>
        entryIdFilter.has(String(r.id || "").trim()),
      );
    }
  }

  if (toUpload.length === 0) {
    const reason =
      forceRowsIn.length > 0 || entryIdFilter.size > 0
        ? "no_matching_rows_to_upload"
        : "no_rows_to_upload";
    timeLedgerSyncLog("push_dirty_skipped", { reason });
    /*
     * 모달이 올린 행/특정 id가 0건이면 실패 — 재시도하게.
     * (동시 pull이 dirty를 지운 뒤 ok:true/0건으로 넘어가던 사고 방지)
     */
    if (forceRowsIn.length > 0 || entryIdFilter.size > 0) {
      return { ok: false, reason, pushedCount: 0 };
    }
    return { ok: true, reason, pushedCount: 0 };
  }

  const idPreviews = toUpload.map((r) =>
    String(r.id || "")
      .trim()
      .slice(0, 8),
  );
  timeLedgerSyncLog("server_upsert_start", {
    rowCount: toUpload.length,
    scoped: entryIdFilter.size > 0,
    idPreviews,
  });

  /* 같은 id가 한 배치에 두 번 있으면 Postgres ON CONFLICT 실패 — 마지막 값만 유지 */
  const uploadById = new Map();
  for (const r of toUpload) {
    const id = String(r?.id || "").trim();
    if (!isUuid(id)) continue;
    uploadById.set(id, r);
  }
  toUpload = [...uploadById.values()];

  const payloadById = new Map();
  for (const r of toUpload) {
    const p = localTimeLedgerRowToDbPayload(userId, r);
    if (!p) continue;
    const pid = String(p.id || "").trim();
    if (!isUuid(pid)) continue;
    payloadById.set(pid, p);
  }
  const payloads = [...payloadById.values()];
  if (payloads.length === 0) {
    timeLedgerSyncLog("push_dirty_skipped", { reason: "payloads_empty" });
    return { ok: false, reason: "payloads_empty", pushedCount: 0 };
  }

  /* time_ledger_entries.task_id FK: 과제는 과제설정·KPI 저장 시에만 서버에 올림 — 기록 push에서 과제 upsert 안 함 */
  let { data, error } = await upsertLedgerEntryPayloads(payloads);

  const fkTask = isTaskIdForeignKeyError(error);
  if (fkTask) {
    timeLedgerSyncLog("server_upsert_retry", {
      reason: "task_fkey",
      taskIdStripAll: true,
    });
    const payloadsNoTid = payloads.map((p) => ({
      ...p,
      task_id: null,
    }));
    ({ data, error } = await upsertLedgerEntryPayloads(payloadsNoTid));
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
    return {
      ok: false,
      reason: error.message || "upsert_failed",
      pushedCount: 0,
    };
  }

  const uploadIds = toUpload
    .map((r) => String(r.id || "").trim())
    .filter((id) => isUuid(id));
  let verified = Array.isArray(data)
    ? data.filter((r) => isUuid(String(r?.id || "").trim()))
    : [];
  if (verified.length < uploadIds.length) {
    const verifiedIds = new Set(
      verified.map((r) => String(r.id || "").trim()).filter(Boolean),
    );
    const missingIds = uploadIds.filter((id) => !verifiedIds.has(id));
    const { data: checked, error: checkErr } = await supabase
      .from(TABLE)
      .select("id, updated_at")
      .eq("user_id", userId)
      .in("id", missingIds);
    if (!checkErr) {
      for (const row of checked || []) {
        const id = String(row?.id || "").trim();
        if (!isUuid(id) || verifiedIds.has(id)) continue;
        verifiedIds.add(id);
        verified.push(row);
      }
    }
  }
  /*
   * upsert에 error가 없으면 쓴 것으로 본다.
   * (응답 행이 비어도 로컬 dirty만 지워 재시도 가능하게 updated_at 보정)
   */
  if (verified.length > 0) {
    mergeTimeLedgerEntriesPushedServerTimes(verified);
  } else {
    mergeTimeLedgerEntriesPushedServerTimes(
      uploadIds.map((id) => ({
        id,
        updated_at: new Date().toISOString(),
      })),
    );
  }

  timeLedgerSyncLog("server_upsert_done", {
    ok: true,
    returnedRowCount: verified.length,
  });
  lpSaveDebug("시간행 upsert 성공", {
    rowCount: toUpload.length,
    returned: verified.length,
  });

  if (opts.skipPull) {
    timeLedgerSyncLog("pull_after_push_skipped", {
      reason: "skipPull_option",
    });
    return { ok: true, pushedCount: toUpload.length };
  }

  let rs = opts.rangeStart;
  let re = opts.rangeEnd;
  if (!(rs && re && YMD_RE.test(rs) && YMD_RE.test(re))) {
    ({ rangeStart: rs, rangeEnd: re } = readTimeLedgerCombinedPullRangeYmd());
  }
  const today = timeLedgerLocalTodayYmd();
  const yday = timeLedgerLocalYesterdayYmd();
  if (!rs || rs > yday) rs = yday;
  if (!re || re < today) re = today;
  if (rs > re) {
    rs = yday;
    re = today;
  }
  await pullTimeLedgerEntriesForDateRangeCore(rs, re, {
    trigger: "after_push",
  });
  return { ok: true, pushedCount: toUpload.length };
}

/** @returns {Promise<{ ok: boolean, reason?: string, pushedCount?: number }>} */
export async function pushDirtyTimeLedgerEntriesToSupabase(opts = {}) {
  return runSerializedLedgerServerOp(() =>
    pushDirtyTimeLedgerEntriesToSupabaseCore(opts),
  );
}

/**
 * 시간 탭에서 쓰는 pull: 세션 구간 ∪ 어제~오늘.
 * (오늘만 pull 하면 어제 날짜는 폰 옛 저장이 그대로 남는 문제 방지)
 * @param {{ preferServer?: boolean, force?: boolean }} [opts]
 */
export async function pullTimeLedgerEntriesFromSupabase(opts = {}) {
  let { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
  const today = timeLedgerLocalTodayYmd();
  const yday = timeLedgerLocalYesterdayYmd();
  if (!rangeStart || rangeStart > yday) rangeStart = yday;
  if (!rangeEnd || rangeEnd < today) rangeEnd = today;
  if (rangeStart > rangeEnd) {
    rangeStart = yday;
    rangeEnd = today;
  }
  return pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd, opts);
}

/**
 * entry_date가 [rangeStart, rangeEnd] (포함)인 행만 서버에서 받아 해당 구간만 로컬에 반영(서버 기준).
 * @param {{ preferServer?: boolean, force?: boolean, trigger?: string }} [opts]
 */
export async function pullTimeLedgerEntriesForDateRange(
  rangeStart,
  rangeEnd,
  opts = {},
) {
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  const trigger = opts.trigger || "direct";
  const run = () =>
    runSerializedLedgerServerOp(() =>
      pullTimeLedgerEntriesForDateRangeCore(rangeStart, rangeEnd, {
        trigger,
        preferServer: true,
      }),
    );
  /* force: 진행 중 pull 과 합치지 않음(화면 복귀 등) */
  if (opts.force) return run();
  return coalesceInFlightPull(`ledger-entries:${rs}::${re}`, run);
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
