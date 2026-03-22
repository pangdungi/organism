/**
 * 가계부 설정: 사용자 추가 소비/수입 분류 · 결제수단 ↔ Supabase
 * 기본 목록은 Asset.js 코드; DB에는 사용자 추가분만 저장.
 */

import { supabase } from "../supabase.js";

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

function defaultLabelSetForCategory(cat) {
  return DEFAULT_CLASSIFICATION_LABELS_BY_CAT[cat] || new Set();
}

function isDefaultPaymentLabel(label) {
  return DEFAULT_PAYMENT_LABELS.includes(String(label || "").trim());
}

function loadRawClassificationSaved() {
  try {
    const raw = localStorage.getItem(EXPENSE_CLASSIFICATION_KEY);
    if (!raw) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch (_) {
    return {};
  }
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
  let arr = [];
  try {
    const raw = localStorage.getItem(EXPENSE_PAYMENT_OPTIONS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (Array.isArray(p)) arr = p.map((o) => (typeof o === "string" ? o : o?.name)).filter(Boolean);
    }
  } catch (_) {}
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

/** 서버에서 받은 분류만 담은 객체 → localStorage (getExpenseClassificationByCategory가 기본과 머지) */
function applyClassificationUserOnlyToLocalStorage(rows) {
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
  try {
    localStorage.setItem(EXPENSE_CLASSIFICATION_KEY, JSON.stringify(byCat));
  } catch (_) {}
}

function applyPaymentExtrasToLocalStorage(rows) {
  const labels = (rows || [])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((r) => String(r.label || "").trim())
    .filter(Boolean);
  const merged = [...DEFAULT_PAYMENT_LABELS, ...labels.filter((l) => !isDefaultPaymentLabel(l))];
  try {
    localStorage.setItem(EXPENSE_PAYMENT_OPTIONS_KEY, JSON.stringify(merged));
  } catch (_) {}
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export async function pullAssetExpensePrefsFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return null;

  const [clsRes, payRes] = await Promise.all([
    supabase
      .from(CLS_TABLE)
      .select("expense_category, label, color, sort_order")
      .eq("user_id", userId)
      .order("expense_category", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from(PAY_TABLE)
      .select("label, sort_order")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
  ]);

  if (clsRes.error) console.warn("[asset-expense-prefs] pull classifications", clsRes.error.message);
  if (payRes.error) console.warn("[asset-expense-prefs] pull payments", payRes.error.message);

  /* 서버에 행이 하나도 없으면 로컬을 비우지 않음(미동기화·빈 DB가 로컬 사용자 분류를 날리는 것 방지) */
  if (!clsRes.error && clsRes.data?.length > 0) {
    applyClassificationUserOnlyToLocalStorage(clsRes.data);
  }
  if (!payRes.error && payRes.data?.length > 0) {
    applyPaymentExtrasToLocalStorage(payRes.data);
  }

  return { classifications: clsRes.data || [], payments: payRes.data || [] };
}

export async function syncAssetExpensePrefsToSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const clsPayloads = buildClassificationPayloadsFromLocal(userId);
  const payPayloads = buildPaymentPayloadsFromLocal(userId);

  if (clsPayloads.length > 0) {
    const { error } = await supabase.from(CLS_TABLE).upsert(clsPayloads, {
      onConflict: "user_id,expense_category,label",
    });
    if (error) console.warn("[asset-expense-prefs] upsert classifications", error.message);
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
        if (dErr) console.warn("[asset-expense-prefs] delete classification", dErr.message);
      }
    }
  }

  if (payPayloads.length > 0) {
    const { error } = await supabase.from(PAY_TABLE).upsert(payPayloads, {
      onConflict: "user_id,label",
    });
    if (error) console.warn("[asset-expense-prefs] upsert payments", error.message);
  }

  const { data: remotePay, error: rpErr } = await supabase
    .from(PAY_TABLE)
    .select("id, label")
    .eq("user_id", userId);
  if (!rpErr && remotePay) {
    const want = new Set(payPayloads.map((p) => p.label));
    for (const r of remotePay) {
      if (!want.has(r.label)) {
        const { error: dErr } = await supabase.from(PAY_TABLE).delete().eq("id", r.id);
        if (dErr) console.warn("[asset-expense-prefs] delete payment", dErr.message);
      }
    }
  }
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
    syncAssetExpensePrefsToSupabase().catch((e) => console.warn("[asset-expense-prefs]", e));
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachAssetExpensePrefsSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("asset-expense-prefs-saved", () => {
    scheduleAssetExpensePrefsSyncPush();
  });
}

/** 자산 탭 진입 시: pull(서버에 데이터 있을 때만 로컬 반영) → 양쪽 테이블 모두 비었으면 로컬 업로드 */
export async function hydrateAssetExpensePrefsFromCloud() {
  attachAssetExpensePrefsSaveListener();
  if (!supabase) return;
  await pullAssetExpensePrefsFromSupabase();
  await pushAllLocalAssetExpensePrefsIfServerEmpty();
}
