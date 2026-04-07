/**
 * 순자산 탭 테이블 행 ↔ Supabase (asset_user_net_worth_bundle)
 * — 브라우저 저장소 대신 세션 메모리(서버 pull·sync 후 재조회).
 */

import { supabase } from "../supabase.js";
import { runAssetSerialized } from "./assetServerSyncSerial.js";

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

/** @type {Record<string, unknown>} */
const _bundleMem = {};
let _bundleMigrated = false;

/** 로컬에서 순자산 테이블을 건드린 뒤에만 서버 upsert (미초기화 메모리가 빈 값으로 서버를 덮어쓰지 않게) */
let _bundleNeedsCloudSync = false;

function markBundleNeedsCloudSync() {
  _bundleNeedsCloudSync = true;
}

function migrateBundleFromLocalStorageOnce() {
  if (_bundleMigrated) return;
  _bundleMigrated = true;
  try {
    if (typeof localStorage === "undefined") return;
    for (const key of Object.values(NET_WORTH_BUNDLE_LOCAL_KEYS)) {
      const raw = localStorage.getItem(key);
      if (raw) {
        try {
          const p = JSON.parse(raw);
          _bundleMem[key] = Array.isArray(p) ? p : [];
          /* 저장된 빈 배열 = 사용자가 모두 삭제한 상태 → 서버에도 반영 필요 */
          if (Array.isArray(p) && p.length === 0) markBundleNeedsCloudSync();
        } catch (_) {
          _bundleMem[key] = [];
        }
      } else {
        _bundleMem[key] = undefined;
      }
      localStorage.removeItem(key);
    }
  } catch (_) {}
}

/** @returns {unknown[]|undefined} undefined = 저장된 적 없음(Asset에서 기본 빈 행 템플릿) */
export function readNetWorthBundleKey(key) {
  migrateBundleFromLocalStorageOnce();
  const v = _bundleMem[key];
  if (v === undefined) return undefined;
  return Array.isArray(v) ? v.slice() : [];
}

export function writeNetWorthBundleKey(key, rows) {
  migrateBundleFromLocalStorageOnce();
  _bundleMem[key] = Array.isArray(rows) ? rows.slice() : [];
  markBundleNeedsCloudSync();
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

function applyBundleDbRowToMem(dbRow) {
  const n = normalizeBundleRow(dbRow);
  if (!n) return;
  _bundleNeedsCloudSync = false;
  _bundleMem[NET_WORTH_BUNDLE_LOCAL_KEYS.debt] = Array.isArray(n.debt_rows) ? n.debt_rows.slice() : [];
  _bundleMem[NET_WORTH_BUNDLE_LOCAL_KEYS.depositSavings] = Array.isArray(n.deposit_savings_rows)
    ? n.deposit_savings_rows.slice()
    : [];
  _bundleMem[NET_WORTH_BUNDLE_LOCAL_KEYS.realEstate] = Array.isArray(n.real_estate_rows) ? n.real_estate_rows.slice() : [];
  _bundleMem[NET_WORTH_BUNDLE_LOCAL_KEYS.stock] = Array.isArray(n.stock_rows) ? n.stock_rows.slice() : [];
  _bundleMem[NET_WORTH_BUNDLE_LOCAL_KEYS.insurance] = Array.isArray(n.insurance_rows) ? n.insurance_rows.slice() : [];
  _bundleMem[NET_WORTH_BUNDLE_LOCAL_KEYS.annuity] = Array.isArray(n.annuity_rows) ? n.annuity_rows.slice() : [];
}

export function applyNetWorthBundleToLocalStorage(dbRow) {
  applyBundleDbRowToMem(dbRow);
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

export async function pullAssetNetWorthBundleFromSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase.from(TABLE).select("*").eq("user_id", userId).maybeSingle();

  if (error) {
    console.warn("[asset-networth-bundle] pull", error.message);
    return false;
  }
  if (data == null) return false;

  applyBundleDbRowToMem(data);
  return true;
}

export function pullAssetNetWorthBundleFromSupabase() {
  return runAssetSerialized(() => pullAssetNetWorthBundleFromSupabaseImpl());
}

/** 메모리에 아직 없는 섹션은 서버 행을 그대로 둠(한 섹션만 수정할 때 다른 테이블이 []로 덮어쓰이지 않게) */
const _BUNDLE_MEM_DB_PAIRS = [
  [NET_WORTH_BUNDLE_LOCAL_KEYS.debt, "debt_rows"],
  [NET_WORTH_BUNDLE_LOCAL_KEYS.depositSavings, "deposit_savings_rows"],
  [NET_WORTH_BUNDLE_LOCAL_KEYS.realEstate, "real_estate_rows"],
  [NET_WORTH_BUNDLE_LOCAL_KEYS.stock, "stock_rows"],
  [NET_WORTH_BUNDLE_LOCAL_KEYS.insurance, "insurance_rows"],
  [NET_WORTH_BUNDLE_LOCAL_KEYS.annuity, "annuity_rows"],
];

async function buildBundleUpsertPayload(userId) {
  let needServerRow = false;
  for (const [memKey] of _BUNDLE_MEM_DB_PAIRS) {
    if (readNetWorthBundleKey(memKey) === undefined) {
      needServerRow = true;
      break;
    }
  }
  let serverN = null;
  if (needServerRow) {
    const { data: row } = await supabase.from(TABLE).select("*").eq("user_id", userId).maybeSingle();
    if (row) serverN = normalizeBundleRow(row);
  }
  /** @type {Record<string, unknown>} */
  const out = { user_id: userId };
  for (const [memKey, dbCol] of _BUNDLE_MEM_DB_PAIRS) {
    const v = readNetWorthBundleKey(memKey);
    if (v !== undefined) {
      out[dbCol] = Array.isArray(v) ? v : [];
    } else {
      const fallback = serverN?.[dbCol];
      out[dbCol] = Array.isArray(fallback) ? fallback : [];
    }
  }
  return out;
}

function hasAnyLocalBundleDataFromMem() {
  return Object.values(NET_WORTH_BUNDLE_LOCAL_KEYS).some((k) => {
    const v = readNetWorthBundleKey(k);
    return Array.isArray(v) && v.length > 0;
  });
}

export async function syncAssetNetWorthBundleToSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!supabase) {
    if (!_warnedNoSupabaseClient) {
      _warnedNoSupabaseClient = true;
      console.warn("[asset-networth-bundle] sync 건너뜀: Supabase 클라이언트 없음");
    }
    return;
  }
  if (!userId) {
    if (!_warnedNoAuthSession) {
      _warnedNoAuthSession = true;
      console.warn("[asset-networth-bundle] sync 건너뜀: 로그인 세션 없음");
    }
    return;
  }

  if (!_bundleNeedsCloudSync) return;

  const payload = await buildBundleUpsertPayload(userId);
  const { error } = await supabase.from(TABLE).upsert(payload, { onConflict: "user_id" });
  if (error) {
    console.warn("[asset-networth-bundle] upsert", error.message);
    return;
  }

  const { data: row } = await supabase.from(TABLE).select("*").eq("user_id", userId).maybeSingle();
  if (row) applyBundleDbRowToMem(row);
  try {
    window.dispatchEvent(new CustomEvent("asset-networth-bundle-saved", { detail: { fromServerMerge: true } }));
  } catch (_) {}
}

export function syncAssetNetWorthBundleToSupabase() {
  return runAssetSerialized(() => syncAssetNetWorthBundleToSupabaseImpl());
}

export async function pushLocalNetWorthBundleIfServerHasNoRow() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { data, error } = await supabase.from(TABLE).select("user_id").eq("user_id", userId).maybeSingle();
  if (error || data != null) return;
  if (!hasAnyLocalBundleDataFromMem()) return;

  _bundleNeedsCloudSync = true;
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
  window.addEventListener("asset-networth-bundle-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
    scheduleAssetNetWorthBundleSyncPush();
  });
}

export async function hydrateAssetNetWorthBundleFromCloud() {
  attachAssetNetWorthBundleSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetNetWorthBundleFromSupabase();
  await pushLocalNetWorthBundleIfServerHasNoRow();
  return applied;
}

export function clearNetWorthBundleMemAndLegacy() {
  for (const key of Object.values(NET_WORTH_BUNDLE_LOCAL_KEYS)) {
    delete _bundleMem[key];
  }
  _bundleMigrated = false;
  _bundleNeedsCloudSync = false;
  try {
    if (typeof localStorage === "undefined") return;
    for (const key of Object.values(NET_WORTH_BUNDLE_LOCAL_KEYS)) {
      localStorage.removeItem(key);
    }
  } catch (_) {}
}
