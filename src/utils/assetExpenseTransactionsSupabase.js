/**
 * 가계부 거래 행 ↔ Supabase (asset_user_expense_transactions)
 */

import { supabase } from "../supabase.js";

const TABLE = "asset_user_expense_transactions";
const EXPENSE_ROWS_KEY = "asset_expense_rows";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseNum(val) {
  const n = parseFloat(String(val || "").replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function formatNum(val) {
  if (val === null || val === undefined || val === "") return "";
  const n = parseNum(val);
  return n === null ? "" : n.toLocaleString("ko-KR");
}

function loadExpenseRowsRaw() {
  try {
    const raw = localStorage.getItem(EXPENSE_ROWS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function saveExpenseRowsRaw(rows) {
  try {
    localStorage.setItem(EXPENSE_ROWS_KEY, JSON.stringify(rows));
  } catch (_) {}
}

function absAmountFromLocal(r) {
  const n = parseNum(r.amount);
  if (n === null) return null;
  return Math.abs(n);
}

export function expenseRowIsSubstantive(r) {
  const d = String(r?.date || "").trim();
  const ft = r?.flowType;
  if (!d || (ft !== "입금" && ft !== "지출")) return false;
  return absAmountFromLocal(r) !== null;
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

/** 서버에 거래가 있으면 로컬 전체를 서버 기준으로 덮어씀(미동기화 시 빈 서버가 로컬을 지우지 않음). @returns {Promise<boolean>} 로컬 스토리지를 갱신했으면 true */
export async function pullAssetExpenseTransactionsFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select(
      "id, transaction_date, amount, flow_type, expense_category, classification, name, payment_label, memo, created_at"
    )
    .eq("user_id", userId)
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[asset-expense-tx] pull", error.message);
    return false;
  }

  if (data?.length > 0) {
    saveExpenseRowsRaw(data.map(dbRowToLocal));
    return true;
  }

  return false;
}

export async function syncAssetExpenseTransactionsToSupabase() {
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

  const { data: remote, error: listErr } = await supabase.from(TABLE).select("id").eq("user_id", userId);
  if (listErr || !remote) return;

  for (const r of remote) {
    if (!wantIds.has(r.id)) {
      const { error: dErr } = await supabase.from(TABLE).delete().eq("id", r.id).eq("user_id", userId);
      if (dErr) console.warn("[asset-expense-tx] delete", dErr.message);
    }
  }
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
  window.addEventListener("asset-expense-transactions-saved", () => {
    scheduleAssetExpenseTransactionsSyncPush();
  });
}

/** @returns {Promise<boolean>} 서버에서 거래 목록을 받아 로컬을 덮어썼으면 true(가계부 UI 재렌더용) */
export async function hydrateAssetExpenseTransactionsFromCloud() {
  attachAssetExpenseTransactionsSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetExpenseTransactionsFromSupabase();
  await pushAllLocalAssetExpenseTransactionsIfServerEmpty();
  return applied;
}
