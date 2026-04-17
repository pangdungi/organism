/**
 * 가계부 설정: 사용자 추가 소비/수입 분류 · 결제수단 ↔ Supabase
 * — 세션 메모리(서버 pull·sync 후 재조회) + 자산 전역 직렬 큐.
 */

import { supabase } from "../supabase.js";
import { runAssetSerialized } from "./assetServerSyncSerial.js";

const CLS_TABLE = "asset_user_expense_classifications";
const PAY_TABLE = "asset_user_payment_options";

const EXPENSE_CLASSIFICATION_KEY = "asset_expense_classification_by_category";
const EXPENSE_PAYMENT_OPTIONS_KEY = "asset_expense_payment_options";

const DEFAULT_PAYMENT_LABELS = ["신용카드", "체크카드", "현금"];

/** Asset.js DEFAULT_EXPENSE_CLASSIFICATION_BY_CATEGORY 와 동일 라벨 집합 (동기화용) */
const DEFAULT_CLASSIFICATION_LABELS_BY_CAT = {
  고정비: new Set([
    "주거비",
    "보험료",
    "통신비",
    "관리비",
    "구독료",
    "대출상환",
    "교육비",
    "운동",
  ]),
  변동비: new Set([
    "식비",
    "교통비",
    "여가/취미",
    "생활용품",
    "쇼핑",
    "미용",
    "의료/건강",
    "교육",
    "카드대금",
    "세금",
    "경조사",
    "반려동물",
    "여행비",
    "선물비",
    "기부/후원",
  ]),
  저축: new Set(["예/적금", "비상금통장", "청약통장", "연금", "기타계좌"]),
  투자: new Set(["국내주식", "해외주식", "ETF", "부동산", "기타투자"]),
  수입: new Set(["근로소득", "부수입", "용돈", "임대소득", "금융수입", "이월", "기타"]),
};

const DEFAULT_CLS_CATEGORIES = Object.keys(DEFAULT_CLASSIFICATION_LABELS_BY_CAT);

/** @type {Record<string, unknown>|undefined} */
let _clsSavedMem = undefined;
/** @type {unknown[]|undefined} */
let _payListMem = undefined;
let _prefsMigrated = false;

function migratePrefsFromLocalStorageOnce() {
  if (_prefsMigrated) return;
  _prefsMigrated = true;
  try {
    if (typeof localStorage === "undefined") return;
    const rawCls = localStorage.getItem(EXPENSE_CLASSIFICATION_KEY);
    if (rawCls) {
      try {
        const o = JSON.parse(rawCls);
        _clsSavedMem = o && typeof o === "object" ? o : {};
      } catch (_) {
        _clsSavedMem = {};
      }
    } else {
      _clsSavedMem = undefined;
    }
    const rawPay = localStorage.getItem(EXPENSE_PAYMENT_OPTIONS_KEY);
    if (rawPay) {
      try {
        const p = JSON.parse(rawPay);
        _payListMem = Array.isArray(p) ? p : undefined;
      } catch (_) {
        _payListMem = undefined;
      }
    } else {
      _payListMem = undefined;
    }
    localStorage.removeItem(EXPENSE_CLASSIFICATION_KEY);
    localStorage.removeItem(EXPENSE_PAYMENT_OPTIONS_KEY);
  } catch (_) {}
}

/** Asset.js getExpenseClassificationByCategory 에서 쓰는 저장 분류 객체(없으면 {}) */
export function readExpenseClassificationSavedMem() {
  migratePrefsFromLocalStorageOnce();
  if (_clsSavedMem === undefined) return {};
  return typeof _clsSavedMem === "object" && _clsSavedMem ? { ..._clsSavedMem } : {};
}

export function writeExpenseClassificationSavedMem(obj) {
  migratePrefsFromLocalStorageOnce();
  _clsSavedMem = obj && typeof obj === "object" ? JSON.parse(JSON.stringify(obj)) : {};
}

/** 결제수단 전체 목록(문자열 또는 {name}) — 기본+사용자 추가 병합본과 동일 */
export function readExpensePaymentOptionsListMem() {
  migratePrefsFromLocalStorageOnce();
  if (!Array.isArray(_payListMem)) return [];
  return _payListMem.slice();
}

export function writeExpensePaymentOptionsListMem(arr) {
  migratePrefsFromLocalStorageOnce();
  _payListMem = Array.isArray(arr) ? arr.slice() : [];
}

function defaultLabelSetForCategory(cat) {
  return DEFAULT_CLASSIFICATION_LABELS_BY_CAT[cat] || new Set();
}

function isDefaultPaymentLabel(label) {
  return DEFAULT_PAYMENT_LABELS.includes(String(label || "").trim());
}

function loadRawClassificationSaved() {
  return readExpenseClassificationSavedMem();
}

/** 로컬에 저장된 객체에서 시스템 기본이 아닌 분류만 추출 → upsert 페이로드 */
function buildClassificationPayloadsFromLocal(userId) {
  const saved = loadRawClassificationSaved();
  const payloads = [];
  for (const cat of Object.keys(saved)) {
    const defSet = defaultLabelSetForCategory(cat);
    const list = Array.isArray(saved[cat]) ? saved[cat] : [];
    let sortOrder = 0;
    for (const item of list) {
      const lab = String(item?.label || "").trim();
      if (!lab || defSet.has(lab)) continue;
      payloads.push({
        user_id: userId,
        expense_category: cat,
        label: lab,
        color: String(item?.color || "expense-cls-teal").trim() || "expense-cls-teal",
        sort_order: sortOrder++,
      });
    }
  }
  return payloads;
}

function buildPaymentPayloadsFromLocal(userId) {
  const arrRaw = readExpensePaymentOptionsListMem();
  const arr = arrRaw.map((o) => (typeof o === "string" ? o : o?.name)).filter(Boolean);
  const extras = [];
  const seen = new Set();
  for (const s of arr) {
    const t = String(s).trim();
    if (!t || isDefaultPaymentLabel(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    extras.push(t);
  }
  return extras.map((label, sort_order) => ({ user_id: userId, label, sort_order }));
}

function applyClassificationUserOnlyToMem(rows) {
  const byKey = new Map();
  for (const r of rows || []) {
    const cat = String(r.expense_category || "").trim();
    if (!DEFAULT_CLASSIFICATION_LABELS_BY_CAT.hasOwnProperty(cat)) continue;
    if (!byKey.has(cat)) byKey.set(cat, []);
    byKey.get(cat).push(r);
  }
  const byCat = {};
  for (const c of DEFAULT_CLS_CATEGORIES) {
    const list = (byKey.get(c) || []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    byCat[c] = list.map((r) => ({
      label: String(r.label || "").trim(),
      color: String(r.color || "expense-cls-teal").trim(),
    }));
  }
  writeExpenseClassificationSavedMem(byCat);
}

function applyPaymentExtrasToMem(rows) {
  const labels = (rows || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => String(r.label || "").trim())
    .filter(Boolean);
  const merged = [...DEFAULT_PAYMENT_LABELS, ...labels.filter((l) => !isDefaultPaymentLabel(l))];
  writeExpensePaymentOptionsListMem(merged);
}

async function refetchPrefsIntoMem(userId) {
  const [clsRes, payRes] = await Promise.all([
    supabase
      .from(CLS_TABLE)
      .select("expense_category, label, color, sort_order")
      .eq("user_id", userId)
      .order("expense_category", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase.from(PAY_TABLE).select("label, sort_order").eq("user_id", userId).order("sort_order", { ascending: true }),
  ]);


  if (!clsRes.error) applyClassificationUserOnlyToMem(clsRes.data || []);
  if (!payRes.error) applyPaymentExtrasToMem(payRes.data || []);
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export async function pullAssetExpensePrefsFromSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return null;

  const [clsRes, payRes] = await Promise.all([
    supabase
      .from(CLS_TABLE)
      .select("expense_category, label, color, sort_order")
      .eq("user_id", userId)
      .order("expense_category", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase.from(PAY_TABLE).select("label, sort_order").eq("user_id", userId).order("sort_order", { ascending: true }),
  ]);


  if (!clsRes.error && clsRes.data?.length > 0) {
    applyClassificationUserOnlyToMem(clsRes.data);
  }
  if (!payRes.error && payRes.data?.length > 0) {
    applyPaymentExtrasToMem(payRes.data);
  }

  return { classifications: clsRes.data || [], payments: payRes.data || [] };
}

export function pullAssetExpensePrefsFromSupabase() {
  return runAssetSerialized(() => pullAssetExpensePrefsFromSupabaseImpl());
}

export async function syncAssetExpensePrefsToSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const clsPayloads = buildClassificationPayloadsFromLocal(userId);
  const payPayloads = buildPaymentPayloadsFromLocal(userId);

  if (clsPayloads.length > 0) {
    const { error } = await supabase.from(CLS_TABLE).upsert(clsPayloads, {
      onConflict: "user_id,expense_category,label",
    });
  }

  const { data: remoteCls, error: rcErr } = await supabase
    .from(CLS_TABLE)
    .select("id, expense_category, label")
    .eq("user_id", userId);
  if (!rcErr && remoteCls) {
    const want = new Set(clsPayloads.map((p) => `${p.expense_category}\t${p.label}`));
    for (const r of remoteCls) {
      const k = `${r.expense_category}\t${r.label}`;
      if (!want.has(k)) {
        const { error: dErr } = await supabase.from(CLS_TABLE).delete().eq("id", r.id);
      }
    }
  }

  if (payPayloads.length > 0) {
    const { error } = await supabase.from(PAY_TABLE).upsert(payPayloads, { onConflict: "user_id,label" });
  }

  const { data: remotePay, error: rpErr } = await supabase.from(PAY_TABLE).select("id, label").eq("user_id", userId);
  if (!rpErr && remotePay) {
    const want = new Set(payPayloads.map((p) => p.label));
    for (const r of remotePay) {
      if (!want.has(r.label)) {
        const { error: dErr } = await supabase.from(PAY_TABLE).delete().eq("id", r.id);
      }
    }
  }

  await refetchPrefsIntoMem(userId);
  try {
    window.dispatchEvent(new CustomEvent("asset-expense-prefs-saved", { detail: { fromServerMerge: true } }));
  } catch (_) {}
}

export function syncAssetExpensePrefsToSupabase() {
  return runAssetSerialized(() => syncAssetExpensePrefsToSupabaseImpl());
}

export async function pushAllLocalAssetExpensePrefsIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;
  const { count: cCls, error: e1 } = await supabase
    .from(CLS_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  const { count: cPay, error: e2 } = await supabase
    .from(PAY_TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);
  if (e1 || e2) return;
  if ((cCls != null && cCls > 0) || (cPay != null && cPay > 0)) return;
  await syncAssetExpensePrefsToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

export function scheduleAssetExpensePrefsSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncAssetExpensePrefsToSupabase().catch(() => {});
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachAssetExpensePrefsSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("asset-expense-prefs-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
    scheduleAssetExpensePrefsSyncPush();
  });
}

export async function hydrateAssetExpensePrefsFromCloud() {
  attachAssetExpensePrefsSaveListener();
  if (!supabase) return;
  await pullAssetExpensePrefsFromSupabase();
  await pushAllLocalAssetExpensePrefsIfServerEmpty();
}

export function clearAssetExpensePrefsMemAndLegacy() {
  _clsSavedMem = undefined;
  _payListMem = undefined;
  _prefsMigrated = false;
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(EXPENSE_CLASSIFICATION_KEY);
    localStorage.removeItem(EXPENSE_PAYMENT_OPTIONS_KEY);
  } catch (_) {}
}
