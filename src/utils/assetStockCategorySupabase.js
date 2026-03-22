/**
 * 주식분류 사용자 추가 옵션 ↔ Supabase (asset_user_stock_category_options)
 * 기본 6종은 Asset.js 코드; DB·로컬 배열에는 사용자 추가분만.
 */

import { supabase } from "../supabase.js";

const TABLE = "asset_user_stock_category_options";
const STOCK_CATEGORY_OPTIONS_KEY = "asset_stock_category_options";

const DEFAULT_STOCK_CATEGORY_LABELS = ["미국주식", "국내주식", "ETF", "코인", "현물", "선물"];
const DEFAULT_SET = new Set(DEFAULT_STOCK_CATEGORY_LABELS);

function loadCustomLabelsFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STOCK_CATEGORY_OPTIONS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    const out = [];
    const seen = new Set();
    for (const s of arr) {
      const t = String(s || "").trim();
      if (!t || DEFAULT_SET.has(t) || seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
    return out;
  } catch (_) {
    return [];
  }
}

function saveCustomLabelsToLocalStorage(labels) {
  try {
    localStorage.setItem(STOCK_CATEGORY_OPTIONS_KEY, JSON.stringify(labels));
  } catch (_) {}
}

function buildPayloadsFromLocal(userId) {
  return loadCustomLabelsFromLocalStorage().map((label, sort_order) => ({
    user_id: userId,
    label,
    sort_order,
  }));
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/** 서버에 행이 있으면 로컬 사용자 추가분만 서버 목록으로 덮어씀 */
export async function pullAssetStockCategoryOptionsFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select("label, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[asset-stock-cat] pull", error.message);
    return false;
  }
  if (!data?.length) return false;

  const labels = data
    .map((r) => String(r.label || "").trim())
    .filter((l) => l && !DEFAULT_SET.has(l));
  saveCustomLabelsToLocalStorage(labels);
  return true;
}

export async function syncAssetStockCategoryOptionsToSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const payloads = buildPayloadsFromLocal(userId);
  const want = new Set(payloads.map((p) => p.label));

  if (payloads.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(payloads, { onConflict: "user_id,label" });
    if (error) console.warn("[asset-stock-cat] upsert", error.message);
  }

  const { data: remote, error: listErr } = await supabase.from(TABLE).select("id, label").eq("user_id", userId);
  if (listErr || !remote) return;

  for (const r of remote) {
    if (!want.has(r.label)) {
      const { error: dErr } = await supabase.from(TABLE).delete().eq("id", r.id);
      if (dErr) console.warn("[asset-stock-cat] delete", dErr.message);
    }
  }
}

export async function pushAllLocalStockCategoryOptionsIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return;
  if (count != null && count > 0) return;

  const customs = loadCustomLabelsFromLocalStorage();
  if (customs.length === 0) return;

  await syncAssetStockCategoryOptionsToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

export function scheduleAssetStockCategoryOptionsSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncAssetStockCategoryOptionsToSupabase().catch((e) => console.warn("[asset-stock-cat]", e));
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachAssetStockCategoryOptionsSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("asset-stock-category-options-saved", () => {
    scheduleAssetStockCategoryOptionsSyncPush();
  });
}

export async function hydrateAssetStockCategoryOptionsFromCloud() {
  attachAssetStockCategoryOptionsSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetStockCategoryOptionsFromSupabase();
  await pushAllLocalStockCategoryOptionsIfServerEmpty();
  return applied;
}
