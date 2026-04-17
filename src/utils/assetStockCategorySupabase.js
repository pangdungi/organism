/**
 * 주식분류 사용자 추가 옵션 ↔ Supabase (asset_user_stock_category_options)
 * — 세션 메모리(서버 pull·sync 후 재조회).
 */

import { supabase } from "../supabase.js";
import { runAssetSerialized } from "./assetServerSyncSerial.js";

const TABLE = "asset_user_stock_category_options";
const STOCK_CATEGORY_OPTIONS_KEY = "asset_stock_category_options";

const DEFAULT_STOCK_CATEGORY_LABELS = ["미국주식", "국내주식", "ETF", "코인", "현물", "선물"];
const DEFAULT_SET = new Set(DEFAULT_STOCK_CATEGORY_LABELS);

/** @type {string[]|undefined} */
let _customLabelsMem = undefined;
let _stockCatMigrated = false;

function migrateStockCatFromLocalStorageOnce() {
  if (_stockCatMigrated) return;
  _stockCatMigrated = true;
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(STOCK_CATEGORY_OPTIONS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        const out = [];
        const seen = new Set();
        for (const s of arr) {
          const t = String(s || "").trim();
          if (!t || DEFAULT_SET.has(t) || seen.has(t)) continue;
          seen.add(t);
          out.push(t);
        }
        _customLabelsMem = out;
      }
    } else {
      _customLabelsMem = undefined;
    }
    localStorage.removeItem(STOCK_CATEGORY_OPTIONS_KEY);
  } catch (_) {
    _customLabelsMem = undefined;
  }
}

export function readStockCategoryCustomLabelsMem() {
  migrateStockCatFromLocalStorageOnce();
  if (!Array.isArray(_customLabelsMem)) return [];
  return _customLabelsMem.slice();
}

export function writeStockCategoryCustomLabelsMem(labels) {
  migrateStockCatFromLocalStorageOnce();
  const out = [];
  const seen = new Set();
  for (const s of labels || []) {
    const t = String(s || "").trim();
    if (!t || DEFAULT_SET.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  _customLabelsMem = out;
}

function buildPayloadsFromMem(userId) {
  return readStockCategoryCustomLabelsMem().map((label, sort_order) => ({
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

export async function pullAssetStockCategoryOptionsFromSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select("label, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (error) {
    return false;
  }
  if (!data?.length) return false;

  const labels = data
    .map((r) => String(r.label || "").trim())
    .filter((l) => l && !DEFAULT_SET.has(l));
  writeStockCategoryCustomLabelsMem(labels);
  return true;
}

export function pullAssetStockCategoryOptionsFromSupabase() {
  return runAssetSerialized(() => pullAssetStockCategoryOptionsFromSupabaseImpl());
}

export async function syncAssetStockCategoryOptionsToSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const payloads = buildPayloadsFromMem(userId);
  const want = new Set(payloads.map((p) => p.label));

  if (payloads.length > 0) {
    const { error } = await supabase.from(TABLE).upsert(payloads, { onConflict: "user_id,label" });
  }

  const { data: remote, error: listErr } = await supabase.from(TABLE).select("id, label").eq("user_id", userId);
  if (listErr || !remote) return;

  for (const r of remote) {
    if (!want.has(r.label)) {
      const { error: dErr } = await supabase.from(TABLE).delete().eq("id", r.id);
    }
  }

  const { data: again, error: pullErr } = await supabase
    .from(TABLE)
    .select("label, sort_order")
    .eq("user_id", userId)
    .order("sort_order", { ascending: true });

  if (!pullErr && again?.length) {
    const labels = again
      .map((r) => String(r.label || "").trim())
      .filter((l) => l && !DEFAULT_SET.has(l));
    writeStockCategoryCustomLabelsMem(labels);
  } else if (!pullErr) {
    writeStockCategoryCustomLabelsMem([]);
  }
  try {
    window.dispatchEvent(new CustomEvent("asset-stock-category-options-saved", { detail: { fromServerMerge: true } }));
  } catch (_) {}
}

export function syncAssetStockCategoryOptionsToSupabase() {
  return runAssetSerialized(() => syncAssetStockCategoryOptionsToSupabaseImpl());
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

  const customs = readStockCategoryCustomLabelsMem();
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
    syncAssetStockCategoryOptionsToSupabase().catch(() => {});
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachAssetStockCategoryOptionsSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("asset-stock-category-options-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
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

export function clearStockCategoryMemAndLegacy() {
  _customLabelsMem = undefined;
  _stockCatMigrated = false;
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(STOCK_CATEGORY_OPTIONS_KEY);
  } catch (_) {}
}
