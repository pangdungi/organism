/**
 * 가계부 거래 행 ↔ Supabase (asset_user_expense_transactions)
 * — 메모리가 최근 스냅샷(서버 pull·sync 후 재조회). 레거시 localStorage 키는 1회 이전 후 제거.
 */

import { supabase } from "../supabase.js";
import { runAssetSerialized } from "./assetServerSyncSerial.js";
import { lpSaveDebug } from "./lpSaveDebug.js";
import { lpPullDebug } from "./lpPullDebug.js";

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
  const prevMem = getExpenseRowsMem();
  const kept = prevMem.filter((r) => !inWin(r?.date));
  const inWinLocal = prevMem.filter((r) => inWin(r?.date));
  const byId = new Map();
  for (const r of kept) {
    const id = String(r?.id || "").trim();
    if (id) byId.set(id, r);
  }
  /* 구간 안 로컬 행(아직 서버에 없는 upsert 대기)을 먼저 넣고, fetch 결과로 같은 id는 덮어씀 */
  for (const r of inWinLocal) {
    const id = String(r?.id || "").trim();
    if (id) byId.set(id, r);
  }
  for (const r of fetchedRows) {
    const id = String(r?.id || "").trim();
    if (id) byId.set(id, r);
  }
  setExpenseRowsMem([...byId.values()]);
}

const SS_EXPENSE_PULL_FROM = "lp_asset_expense_pull_from";
const SS_EXPENSE_PULL_TO = "lp_asset_expense_pull_to";

/** 가계부 화면에서 마지막으로 본 날짜 구간 — Realtime·자산 탭 pull이 전체 fetch 대신 이 구간만 쓰게 함 */
export function persistAssetExpensePullBounds(from, to) {
  try {
    if (typeof sessionStorage === "undefined") return;
    const f = String(from || "").slice(0, 10);
    const t = String(to || "").slice(0, 10);
    if (f.length !== 10 || t.length !== 10) return;
    const a = f <= t ? f : t;
    const b = f <= t ? t : f;
    sessionStorage.setItem(SS_EXPENSE_PULL_FROM, a);
    sessionStorage.setItem(SS_EXPENSE_PULL_TO, b);
  } catch (_) {}
}

function readExpensePullBoundsForCloud() {
  try {
    if (typeof sessionStorage !== "undefined") {
      const f = sessionStorage.getItem(SS_EXPENSE_PULL_FROM);
      const t = sessionStorage.getItem(SS_EXPENSE_PULL_TO);
      if (f && t && f.length === 10 && t.length === 10) {
        return f <= t ? { from: f, to: t } : { from: t, to: f };
      }
    }
  } catch (_) {}
  return getDefaultExpensePullBounds();
}

/** 가계부 필터 UI 기본과 맞춤: 데스크톱≈당월, 모바일≈오늘 하루 */
function getDefaultExpensePullBounds() {
  const mobile =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(max-width: 48rem)").matches;
  const d = new Date();
  if (mobile) {
    const x = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { from: x, to: x };
  }
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const last = new Date(y, m, 0).getDate();
  return {
    from: `${y}-${String(m).padStart(2, "0")}-01`,
    to: `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`,
  };
}

/**
 * @param {{ mode?: "full" | "range" }} [opts]
 * - `range`: 가계부 날짜 필터 구간만 서버에서 가져와 병합(Realtime·pullAllAssetFromCloud 용, 체감 속도)
 * - `full`(기본): 전체 행 스냅샷(시간 탭 hydrate 등)
 */
export async function pullAssetExpenseTransactionsFromSupabaseImpl(opts = {}) {
  const rangeMode = opts.mode === "range";
  migrateLegacyLocalStorageToMemOnce();
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    lpSaveDebug("pull 스킵", { reason: !supabase ? "no_supabase" : "no_userId" });
    return false;
  }

  if (rangeMode) {
    const { from, to } = readExpensePullBoundsForCloud();
    const hadMemBeforeFetch = _expenseRowsMem.length > 0;
    const res = await fetchExpenseTxFromDbInRange(userId, from, to);
    if (!res.ok) {
      lpSaveDebug("pull fetch 실패(range)");
      return false;
    }
    lpSaveDebug("pull 결과", {
      mode: "range",
      serverRows: res.rows.length,
      from,
      to,
      hadMemBeforeFetch,
    });
    mergeExpenseMemWithServerRange(res.rows, from, to);
    _expenseMemHasFullSnapshot = false;
    return true;
  }

  const hadMemBeforeFetch = _expenseRowsMem.length > 0;
  const res = await fetchAllExpenseTxFromDb(userId);
  if (!res.ok) {
    lpSaveDebug("pull fetch 실패");
    return false;
  }
  lpSaveDebug("pull 결과", { mode: "full", serverRows: res.rows.length, hadMemBeforeFetch });

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
  return runAssetSerialized(() => pullAssetExpenseTransactionsFromSupabaseImpl({ mode: "full" }));
}

export async function syncAssetExpenseTransactionsToSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    lpSaveDebug("sync 스킵", { reason: !supabase ? "no_supabase" : "no_userId" });
    return;
  }

  const rows = loadExpenseRowsRaw();
  const substantive = rows.filter((r) => r?.id && UUID_RE.test(String(r.id)) && expenseRowIsSubstantive(r));
  const wantIds = new Set(substantive.map((r) => r.id));

  lpSaveDebug("sync 시작", {
    memRows: rows.length,
    substantive: substantive.length,
    fullSnapshot: _expenseMemHasFullSnapshot,
    sampleIds: substantive.slice(0, 3).map((r) => String(r.id).slice(0, 8)),
  });
  if (substantive.length === 0 && rows.length > 0) {
    lpSaveDebug("실질행 0건 샘플(비실질 이유 확인)", {
      samples: rows.slice(0, 5).map((r) => ({
        id: String(r?.id || "").slice(0, 8),
        ok: expenseRowIsSubstantive(r),
        date: r?.date,
        flowType: r?.flowType,
        amount: r?.amount,
      })),
    });
  }

  if (substantive.length > 0) {
    const payloads = substantive.map((r) => localRowToDbPayload(userId, r));
    const { error } = await supabase.from(TABLE).upsert(payloads, { onConflict: "id" });
    if (error) {
      lpSaveDebug("가계부 upsert 실패", { message: error.message, code: error.code });
    } else {
      lpSaveDebug("가계부 upsert 성공", { count: payloads.length });
    }
  }

  if (!_expenseMemHasFullSnapshot) {
    lpSaveDebug("전체 스냅샷 아님 → pull 후 조기 return", { substantivePushed: substantive.length });
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
  if (listErr || !remote) {
    lpSaveDebug("원격 id 목록 실패·스킵", { message: listErr?.message });
    return;
  }

  /* 빈 로컬·비실질 행만 있을 때 wantIds 가 비면 고아 삭제로 서버 전량 삭제되는 것을 막음 (데이터 유실 방지) */
  if (substantive.length > 0) {
    for (const r of remote) {
      if (!wantIds.has(r.id)) {
        const { error: dErr } = await supabase.from(TABLE).delete().eq("id", r.id).eq("user_id", userId);
      }
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

async function deleteAssetExpenseTransactionsFromSupabaseImpl(ids) {
  const userId = await getSessionUserId();
  if (!userId || !supabase || !Array.isArray(ids) || ids.length === 0) return;
  const uniq = [
    ...new Set(ids.map((id) => String(id || "").trim()).filter((id) => UUID_RE.test(id))),
  ];
  for (const id of uniq) {
    const { error } = await supabase.from(TABLE).delete().eq("id", id).eq("user_id", userId);
  }
}

/** UI에서 제거된 행 id — 서버에서 삭제(마지막 행 삭제 시 고아 삭제 가드와 함께 동작) */
export function deleteAssetExpenseTransactionsFromSupabase(ids) {
  return runAssetSerialized(() => deleteAssetExpenseTransactionsFromSupabaseImpl(ids));
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
  if (!supabase) {
    lpSaveDebug("scheduleAssetExpensePush 스킵: supabase 없음");
    return;
  }
  if (_pushTimer) clearTimeout(_pushTimer);
  lpSaveDebug("가계부 동기화 예약", { debounceMs: PUSH_DEBOUNCE_MS });
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncAssetExpenseTransactionsToSupabase().catch((e) => {
      lpSaveDebug("sync 예외", { err: String(e?.message || e) });
    });
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachAssetExpenseTransactionsSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("asset-expense-transactions-saved", (e) => {
    if (e.detail?.fromServerMerge) {
      lpSaveDebug("이벤트 무시(fromServerMerge)");
      return;
    }
    lpSaveDebug("이벤트: asset-expense-transactions-saved → 동기화 예약");
    scheduleAssetExpenseTransactionsSyncPush();
  });
}

/** @returns {Promise<boolean>} 서버에서 거래 목록을 받아 메모리를 갱신했으면 true */
export async function hydrateAssetExpenseTransactionsFromCloud() {
  lpPullDebug("hydrateAssetExpenseTransactionsFromCloud", {});
  attachAssetExpenseTransactionsSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetExpenseTransactionsFromSupabase();
  await pushAllLocalAssetExpenseTransactionsIfServerEmpty();
  return applied;
}
