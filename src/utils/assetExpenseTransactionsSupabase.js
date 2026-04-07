/**
 * 가계부 거래 행 ↔ Supabase (asset_user_expense_transactions)
 * — 메모리가 최근 스냅샷(서버 pull·sync 후 재조회). 레거시 localStorage 키는 1회 이전 후 제거.
 */

import { supabase } from "../supabase.js";
import { runAssetSerialized } from "./assetServerSyncSerial.js";

const TABLE = "asset_user_expense_transactions";
export const EXPENSE_ROWS_STORAGE_KEY = "asset_expense_rows";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** @type {unknown[]} */
let _expenseRowsMem = [];

/** false 이면 메모리가 날짜 구간 pull 로만 채워진 상태일 수 있어 sync 시 원격 일괄 삭제를 하지 않음 */
let _expenseMemHasFullSnapshot = false;

function parseNum(val) {
  const n = parseFloat(String(val || "").replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function formatNum(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = parseNum(val);
  return n === null ? "" : n.toLocaleString("ko-KR");
}

export function getExpenseRowsMem() {
  return Array.isArray(_expenseRowsMem) ? _expenseRowsMem.slice() : [];
}

export function setExpenseRowsMem(rows) {
  _expenseRowsMem = Array.isArray(rows) ? rows.slice() : [];
}

/** 로그아웃 시 다음 계정과 섞임 방지 */
export function clearAssetExpenseTransactionsMemAndLegacy() {
  _expenseRowsMem = [];
  _expenseMemHasFullSnapshot = false;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(EXPENSE_ROWS_STORAGE_KEY);
    }
  } catch (_) {}
}

function migrateLegacyLocalStorageToMemOnce() {
  try {
    if (_expenseRowsMem.length > 0) return;
    const raw = localStorage.getItem(EXPENSE_ROWS_STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) {
      localStorage.removeItem(EXPENSE_ROWS_STORAGE_KEY);
      return;
    }
    const uuidRe = UUID_RE;
    const fixed = arr.map((r) => {
      if (typeof r !== "object" || !r) return r;
      const id = String(r.id || "").trim();
      if (!id || !uuidRe.test(id)) {
        return {
          ...r,
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `t-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
        };
      }
      return { ...r, id };
    });
    _expenseRowsMem = fixed;
    localStorage.removeItem(EXPENSE_ROWS_STORAGE_KEY);
  } catch (_) {}
}

function loadExpenseRowsRaw() {
  return getExpenseRowsMem();
}

export function expenseRowIsSubstantive(r) {
  const d = String(r?.date || "").trim();
  const ft = r?.flowType;
  if (!d || (ft !== "입금" && ft !== "지출")) return false;
  return absAmountFromLocal(r) !== null;
}

function absAmountFromLocal(r) {
  const n = parseNum(r.amount);
  if (n === null) return null;
  return Math.abs(n);
}

function localRowToDbPayload(userId, r) {
  const amt = absAmountFromLocal(r);
  return {
    id: r.id,
    user_id: userId,
    transaction_date: r.date,
    amount: amt,
    flow_type: r.flowType,
    expense_category: String(r.category || "").trim(),
    classification: String(r.classification || "").trim(),
    name: String(r.name || "").trim(),
    payment_label: String(r.payment || "").trim(),
    memo: String(r.memo || "").trim(),
  };
}

function dbRowToLocal(row) {
  const abs = Number(row.amount);
  const n = Number.isFinite(abs) ? abs : 0;
  const signed = row.flow_type === "입금" ? n : -n;
  return {
    id: row.id,
    date: row.transaction_date,
    flowType: row.flow_type,
    category: row.expense_category ?? "",
    classification: row.classification ?? "",
    name: row.name ?? "",
    payment: row.payment_label ?? "",
    memo: row.memo ?? "",
    amount: formatNum(signed),
  };
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

async function fetchAllExpenseTxFromDb(userId) {
  if (!supabase || !userId) return { ok: false, rows: [] };
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id, transaction_date, amount, flow_type, expense_category, classification, name, payment_label, memo, created_at",
    )
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[asset-expense-tx] fetch", error.message);
    return { ok: false, rows: [] };
  }
  return { ok: true, rows: (data || []).map(dbRowToLocal) };
}

/** @param {string} dateFrom YYYY-MM-DD @param {string} dateTo YYYY-MM-DD */
async function fetchExpenseTxFromDbInRange(userId, dateFrom, dateTo) {
  if (!supabase || !userId || !dateFrom || !dateTo) return { ok: false, rows: [] };
  const from = String(dateFrom).slice(0, 10);
  const to = String(dateTo).slice(0, 10);
  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id, transaction_date, amount, flow_type, expense_category, classification, name, payment_label, memo, created_at",
    )
    .eq("user_id", userId)
    .gte("transaction_date", from)
    .lte("transaction_date", to)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[asset-expense-tx] fetch range", error.message);
    return { ok: false, rows: [] };
  }
  return { ok: true, rows: (data || []).map(dbRowToLocal) };
}

/**
 * 서버에서 받은 구간만 메모리에 병합(해당 날짜 구간의 기존 행은 서버 결과로 교체).
 */
function mergeExpenseMemWithServerRange(fetchedRows, dateFrom, dateTo) {
  const from = String(dateFrom).slice(0, 10);
  const to = String(dateTo).slice(0, 10);
  const inWin = (ds) => {
    const d = String(ds || "").slice(0, 10);
    return d >= from && d <= to;
  };
  const kept = getExpenseRowsMem().filter((r) => !inWin(r?.date));
  const byId = new Map();
  for (const r of kept) {
    const id = String(r?.id || "").trim();
    if (id) byId.set(id, r);
  }
  for (const r of fetchedRows) {
    const id = String(r?.id || "").trim();
    if (id) byId.set(id, r);
  }
  setExpenseRowsMem([...byId.values()]);
}

export async function pullAssetExpenseTransactionsFromSupabaseImpl() {
  migrateLegacyLocalStorageToMemOnce();
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const hadMemBeforeFetch = _expenseRowsMem.length > 0;
  const res = await fetchAllExpenseTxFromDb(userId);
  if (!res.ok) return false;

  if (res.rows.length > 0) {
    setExpenseRowsMem(res.rows);
    _expenseMemHasFullSnapshot = true;
    return true;
  }
  /* 서버가 비어 있을 때: 방금 레거시·이전 화면에서 채운 메모리는 push(첫 업로드)까지 유지 */
  if (!hadMemBeforeFetch) setExpenseRowsMem([]);
  _expenseMemHasFullSnapshot = true;
  return true;
}

/** 날짜 피커 구간만 서버에서 가져와 메모리에 병합(지출입력장 필터 변경용). */
export async function pullAssetExpenseTransactionsForDateRangeImpl(dateFrom, dateTo) {
  migrateLegacyLocalStorageToMemOnce();
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  const from = String(dateFrom || "").slice(0, 10);
  const to = String(dateTo || "").slice(0, 10);
  if (from.length !== 10 || to.length !== 10) return false;

  const res = await fetchExpenseTxFromDbInRange(userId, from, to);
  if (!res.ok) return false;
  mergeExpenseMemWithServerRange(res.rows, from, to);
  _expenseMemHasFullSnapshot = false;
  return true;
}

export function pullAssetExpenseTransactionsForDateRange(dateFrom, dateTo) {
  return runAssetSerialized(() => pullAssetExpenseTransactionsForDateRangeImpl(dateFrom, dateTo));
}

/** 서버 전체 스냅샷 → 메모리. @returns {Promise<boolean>} */
export function pullAssetExpenseTransactionsFromSupabase() {
  return runAssetSerialized(() => pullAssetExpenseTransactionsFromSupabaseImpl());
}

export async function syncAssetExpenseTransactionsToSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const rows = loadExpenseRowsRaw();
  const substantive = rows.filter((r) => r?.id && UUID_RE.test(String(r.id)) && expenseRowIsSubstantive(r));
  const wantIds = new Set(substantive.map((r) => r.id));

  if (substantive.length > 0) {
    const payloads = substantive.map((r) => localRowToDbPayload(userId, r));
    const { error } = await supabase.from(TABLE).upsert(payloads, { onConflict: "id" });
    if (error) console.warn("[asset-expense-tx] upsert", error.message);
  }

  if (!_expenseMemHasFullSnapshot) {
    const refetch = await fetchAllExpenseTxFromDb(userId);
    if (refetch.ok) {
      setExpenseRowsMem(refetch.rows);
      _expenseMemHasFullSnapshot = true;
      try {
        window.dispatchEvent(
          new CustomEvent("asset-expense-transactions-saved", { detail: { fromServerMerge: true } }),
        );
      } catch (_) {}
    }
    return;
  }

  const { data: remote, error: listErr } = await supabase.from(TABLE).select("id").eq("user_id", userId);
  if (listErr || !remote) return;

  for (const r of remote) {
    if (!wantIds.has(r.id)) {
      const { error: dErr } = await supabase.from(TABLE).delete().eq("id", r.id).eq("user_id", userId);
      if (dErr) console.warn("[asset-expense-tx] delete", dErr.message);
    }
  }

  const refetch = await fetchAllExpenseTxFromDb(userId);
  if (refetch.ok) {
    setExpenseRowsMem(refetch.rows);
    _expenseMemHasFullSnapshot = true;
    try {
      window.dispatchEvent(
        new CustomEvent("asset-expense-transactions-saved", { detail: { fromServerMerge: true } }),
      );
    } catch (_) {}
  }
}

export function syncAssetExpenseTransactionsToSupabase() {
  return runAssetSerialized(() => syncAssetExpenseTransactionsToSupabaseImpl());
}

export async function pushAllLocalAssetExpenseTransactionsIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return;
  if (count != null && count > 0) return;

  const rows = loadExpenseRowsRaw();
  if (!rows.some((r) => r?.id && UUID_RE.test(String(r.id)) && expenseRowIsSubstantive(r))) return;

  await syncAssetExpenseTransactionsToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

export function scheduleAssetExpenseTransactionsSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncAssetExpenseTransactionsToSupabase().catch((e) => console.warn("[asset-expense-tx]", e));
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachAssetExpenseTransactionsSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("asset-expense-transactions-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
    scheduleAssetExpenseTransactionsSyncPush();
  });
}

/** @returns {Promise<boolean>} 서버에서 거래 목록을 받아 메모리를 갱신했으면 true */
export async function hydrateAssetExpenseTransactionsFromCloud() {
  attachAssetExpenseTransactionsSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetExpenseTransactionsFromSupabase();
  await pushAllLocalAssetExpenseTransactionsIfServerEmpty();
  return applied;
}
