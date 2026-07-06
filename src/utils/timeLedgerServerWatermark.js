/**
 * 시간기록·일간 예산 — 구간별 서버 updated_at 워터마크 vs 로컬·세션 캐시
 * 탭 진입 시 변경 없으면 select * pull 생략
 */

import { supabase } from "../supabase.js";
import { parseIsoMs } from "./kpiMapLwwMerge.js";
import {
  ledgerRowEntryDateYmd,
  readTimeLedgerEntriesRaw,
} from "./timeLedgerEntriesModel.js";
import { readTimeDailyBudgetGoalsRaw } from "./timeDailyBudgetModel.js";

const LEDGER_ENTRIES_TABLE = "time_ledger_entries";
const DAILY_BUDGET_TABLE = "time_daily_budget_days";

const LEDGER_RANGE_WM_PREFIX = "lp:ledger-range-wm:";
const BUDGET_RANGE_WM_PREFIX = "lp:budget-range-wm:";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

function rangeWatermarkKey(prefix, userId, rangeStart, rangeEnd) {
  const u = String(userId || "").trim();
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  if (!u || !rs || !re) return "";
  return `${prefix}${u}:${rs}::${re}`;
}

function readRangeSessionWatermarkMs(prefix, userId, rangeStart, rangeEnd) {
  const key = rangeWatermarkKey(prefix, userId, rangeStart, rangeEnd);
  if (!key || typeof sessionStorage === "undefined") return 0;
  try {
    const n = Number(sessionStorage.getItem(key) || 0);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch (_) {
    return 0;
  }
}

function rememberRangeSessionWatermarkMs(prefix, userId, rangeStart, rangeEnd, ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return;
  const key = rangeWatermarkKey(prefix, userId, rangeStart, rangeEnd);
  if (!key || typeof sessionStorage === "undefined") return;
  try {
    const prev = Number(sessionStorage.getItem(key) || 0);
    if (n > prev) sessionStorage.setItem(key, String(n));
  } catch (_) {}
}

async function fetchTableMaxUpdatedAtMsInRange(
  table,
  userId,
  dateColumn,
  rangeStart,
  rangeEnd,
) {
  if (!supabase || !userId || !table) return 0;
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  if (!rs || !re) return 0;
  try {
    const { data, error } = await supabase
      .from(table)
      .select("updated_at")
      .eq("user_id", userId)
      .gte(dateColumn, rs)
      .lte(dateColumn, re)
      .order("updated_at", { ascending: false })
      .limit(1);
    if (error) return 0;
    return parseIsoMs(data?.[0]?.updated_at);
  } catch (_) {
    return 0;
  }
}

/** @returns {number} */
export function readLocalTimeLedgerEntriesRangeWatermarkMs(rangeStart, rangeEnd) {
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  if (!rs || !re) return 0;
  let max = 0;
  for (const row of readTimeLedgerEntriesRaw()) {
    const d = ledgerRowEntryDateYmd(row);
    if (!d || d < rs || d > re) continue;
    max = Math.max(max, parseIsoMs(row?.serverUpdatedAt));
    if (
      typeof row?.localModifiedAt === "number" &&
      Number.isFinite(row.localModifiedAt)
    ) {
      max = Math.max(max, row.localModifiedAt);
    }
  }
  return max;
}

export function hasLocalTimeLedgerEntriesInRange(rangeStart, rangeEnd) {
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  if (!rs || !re) return false;
  for (const row of readTimeLedgerEntriesRaw()) {
    const d = ledgerRowEntryDateYmd(row);
    if (d && d >= rs && d <= re) return true;
  }
  return false;
}

export function readLedgerEntriesRangeSessionWatermarkMs(
  userId,
  rangeStart,
  rangeEnd,
) {
  return readRangeSessionWatermarkMs(
    LEDGER_RANGE_WM_PREFIX,
    userId,
    rangeStart,
    rangeEnd,
  );
}

export function rememberLedgerEntriesRangeWatermarkMs(
  userId,
  rangeStart,
  rangeEnd,
  serverMs,
) {
  rememberRangeSessionWatermarkMs(
    LEDGER_RANGE_WM_PREFIX,
    userId,
    rangeStart,
    rangeEnd,
    serverMs,
  );
}

/** @returns {Promise<number>} */
export async function probeTimeLedgerEntriesRangeServerMs(
  userId,
  rangeStart,
  rangeEnd,
) {
  const uid = userId || (await getSessionUserId());
  if (!uid) return 0;
  return fetchTableMaxUpdatedAtMsInRange(
    LEDGER_ENTRIES_TABLE,
    uid,
    "entry_date",
    rangeStart,
    rangeEnd,
  );
}

/**
 * @param {number} serverMs
 * @param {number} localMs
 * @param {number} sessionMs
 * @param {boolean} hasLocalRows
 */
export function isTimeLedgerRangePullStale(
  serverMs,
  localMs,
  sessionMs,
  hasLocalRows,
) {
  const effectiveLocal = Math.max(localMs, sessionMs);
  if (serverMs > effectiveLocal) return true;
  if (serverMs > 0 && serverMs <= effectiveLocal) return false;
  if (serverMs === 0 && sessionMs > 0) return true;
  if (serverMs === 0 && (effectiveLocal > 0 || hasLocalRows)) return false;
  return false;
}

export function hasLocalTimeDailyBudgetInRange(rangeStart, rangeEnd) {
  const rs = String(rangeStart || "").trim();
  const re = String(rangeEnd || "").trim();
  if (!rs || !re) return false;
  try {
    const raw = readTimeDailyBudgetGoalsRaw();
    const all = raw ? JSON.parse(raw) : {};
    for (const [dk, goals] of Object.entries(all)) {
      if (!dk || dk < rs || dk > re) continue;
      if (goals && typeof goals === "object" && Object.keys(goals).length > 0) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

export function readDailyBudgetRangeSessionWatermarkMs(
  userId,
  rangeStart,
  rangeEnd,
) {
  return readRangeSessionWatermarkMs(
    BUDGET_RANGE_WM_PREFIX,
    userId,
    rangeStart,
    rangeEnd,
  );
}

export function rememberDailyBudgetRangeWatermarkMs(
  userId,
  rangeStart,
  rangeEnd,
  serverMs,
) {
  rememberRangeSessionWatermarkMs(
    BUDGET_RANGE_WM_PREFIX,
    userId,
    rangeStart,
    rangeEnd,
    serverMs,
  );
}

/** @returns {Promise<number>} */
export async function probeTimeDailyBudgetRangeServerMs(
  userId,
  rangeStart,
  rangeEnd,
) {
  const uid = userId || (await getSessionUserId());
  if (!uid) return 0;
  return fetchTableMaxUpdatedAtMsInRange(
    DAILY_BUDGET_TABLE,
    uid,
    "plan_date",
    rangeStart,
    rangeEnd,
  );
}

/**
 * @param {number} serverMs
 * @param {number} sessionMs
 * @param {boolean} hasLocalBudget
 */
export function isTimeDailyBudgetRangePullStale(
  serverMs,
  sessionMs,
  hasLocalBudget,
) {
  if (serverMs > sessionMs) return true;
  if (serverMs > 0 && serverMs <= sessionMs) return false;
  if (serverMs === 0 && sessionMs > 0) return true;
  if (serverMs === 0 && (sessionMs > 0 || hasLocalBudget)) return false;
  return false;
}
