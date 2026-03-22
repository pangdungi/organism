/**
 * 순자산 탭 테이블 행 ↔ Supabase (asset_user_net_worth_bundle)
 * 로컬 키: asset_debt_rows, asset_asset_rows, … 와 동일 JSON 배열
 */

import { supabase } from "../supabase.js";

const TABLE = "asset_user_net_worth_bundle";

let _warnedNoSupabaseClient = false;
let _warnedNoAuthSession = false;

export const NET_WORTH_BUNDLE_LOCAL_KEYS = {
  debt: "asset_debt_rows",
  depositSavings: "asset_asset_rows",
  realEstate: "asset_real_estate_rows",
  stock: "asset_stock_rows",
  insurance: "asset_insurance_rows",
  annuity: "asset_annuity_rows",
};

function readJsonArray(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch (_) {
    return [];
  }
}

function writeJsonArray(key, arr) {
  try {
    localStorage.setItem(key, JSON.stringify(Array.isArray(arr) ? arr : []));
  } catch (_) {}
}

function normalizeBundleRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    debt_rows: Array.isArray(row.debt_rows) ? row.debt_rows : [],
    deposit_savings_rows: Array.isArray(row.deposit_savings_rows) ? row.deposit_savings_rows : [],
    real_estate_rows: Array.isArray(row.real_estate_rows) ? row.real_estate_rows : [],
    stock_rows: Array.isArray(row.stock_rows) ? row.stock_rows : [],
    insurance_rows: Array.isArray(row.insurance_rows) ? row.insurance_rows : [],
    annuity_rows: Array.isArray(row.annuity_rows) ? row.annuity_rows : [],
  };
}

export function applyNetWorthBundleToLocalStorage(dbRow) {
  const n = normalizeBundleRow(dbRow);
  if (!n) return;
  writeJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.debt, n.debt_rows);
  writeJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.depositSavings, n.deposit_savings_rows);
  writeJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.realEstate, n.real_estate_rows);
  writeJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.stock, n.stock_rows);
  writeJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.insurance, n.insurance_rows);
  writeJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.annuity, n.annuity_rows);
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id) return session.user.id;
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error) {
    console.warn("[asset-networth-bundle] getUser", error.message);
    return null;
  }
  return user?.id ?? null;
}

/** @returns {Promise<boolean>} 서버에 번들 행이 있어 로컬을 갱신했으면 true */
export async function pullAssetNetWorthBundleFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase.from(TABLE).select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    console.warn("[asset-networth-bundle] pull", error.message);
    return false;
  }
  if (data == null) return false;

  applyNetWorthBundleToLocalStorage(data);
  return true;
}

function localBundlePayload(userId) {
  return {
    user_id: userId,
    debt_rows: readJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.debt),
    deposit_savings_rows: readJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.depositSavings),
    real_estate_rows: readJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.realEstate),
    stock_rows: readJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.stock),
    insurance_rows: readJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.insurance),
    annuity_rows: readJsonArray(NET_WORTH_BUNDLE_LOCAL_KEYS.annuity),
  };
}

export async function syncAssetNetWorthBundleToSupabase() {
  const userId = await getSessionUserId();
  if (!supabase) {
    if (!_warnedNoSupabaseClient) {
      _warnedNoSupabaseClient = true;
      console.warn("[asset-networth-bundle] sync 건너뜀: Supabase 클라이언트 없음(.env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 확인)");
    }
    return;
  }
  if (!userId) {
    if (!_warnedNoAuthSession) {
      _warnedNoAuthSession = true;
      console.warn("[asset-networth-bundle] sync 건너뜀: 로그인 세션 없음(앱에서 로그인 후 다시 시도)");
    }
    return;
  }

  const { error } = await supabase.from(TABLE).upsert(localBundlePayload(userId), { onConflict: "user_id" });
  if (error) {
    console.warn("[asset-networth-bundle] upsert", error.message, error.code, error.details || "", error.hint || "");
  }
}

function hasAnyLocalBundleData() {
  return Object.values(NET_WORTH_BUNDLE_LOCAL_KEYS).some((k) => readJsonArray(k).length > 0);
}

export async function pushLocalNetWorthBundleIfServerHasNoRow() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { data, error } = await supabase.from(TABLE).select("user_id").eq("user_id", userId).maybeSingle();
  if (error || data != null) return;
  if (!hasAnyLocalBundleData()) return;

  await syncAssetNetWorthBundleToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 600;

export function flushAssetNetWorthBundleSyncPush() {
  if (!supabase) return;
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  return syncAssetNetWorthBundleToSupabase().catch((e) => console.warn("[asset-networth-bundle]", e));
}

export function scheduleAssetNetWorthBundleSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncAssetNetWorthBundleToSupabase().catch((e) => console.warn("[asset-networth-bundle]", e));
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;
let _flushListenersAttached = false;

function attachNetWorthBundleFlushOnLeave() {
  if (_flushListenersAttached) return;
  _flushListenersAttached = true;
  const run = () => {
    void flushAssetNetWorthBundleSyncPush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") run();
  });
  window.addEventListener("pagehide", run);
}

export function attachAssetNetWorthBundleSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  attachNetWorthBundleFlushOnLeave();
  window.addEventListener("asset-networth-bundle-saved", () => {
    scheduleAssetNetWorthBundleSyncPush();
  });
}

/** @returns {Promise<boolean>} pull로 로컬이 바뀌었으면 true */
export async function hydrateAssetNetWorthBundleFromCloud() {
  attachAssetNetWorthBundleSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetNetWorthBundleFromSupabase();
  await pushLocalNetWorthBundleIfServerHasNoRow();
  return applied;
}
