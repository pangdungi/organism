/**
 * 순자산 목표 금액 ↔ Supabase (public.asset_user_net_worth_goal, 컬럼 target_amount)
 * 화면에는 쉼표 있는 문자열로 표시합니다.
 */

import { supabase } from "../supabase.js";
import { runAssetSerialized } from "./assetServerSyncSerial.js";

const TABLE = "asset_user_net_worth_goal";
const LOCAL_KEY = "asset_net_worth_target_display_str";
/** Asset.js 예전 키(호환) */
const LEGACY_LOCAL_KEY = "asset_networth_target";

let _warnedNoSupabaseClient = false;
let _warnedNoAuthSession = false;

/** @type {string | undefined} */
let _targetMem = undefined;
let _targetMigrated = false;
let _goalNeedsCloudSync = false;

function parseTargetAmountToNumber(s) {
  const n = parseFloat(String(s || "").replace(/,/g, "").trim());
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function formatTargetAmountFromDb(n) {
  if (n === null || n === undefined || n === "") return "";
  const num = typeof n === "number" ? n : parseFloat(String(n));
  if (!Number.isFinite(num)) return "";
  return num.toLocaleString("ko-KR");
}

function migrateTargetFromLocalStorageOnce() {
  if (_targetMigrated) return;
  _targetMigrated = true;
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(LOCAL_KEY) ?? localStorage.getItem(LEGACY_LOCAL_KEY);
    if (raw != null && String(raw).trim() !== "") {
      _targetMem = String(raw);
    }
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem(LEGACY_LOCAL_KEY);
  } catch (_) {}
}

export function getNetWorthTargetDisplayStrMem() {
  migrateTargetFromLocalStorageOnce();
  return _targetMem ?? "";
}

export function setNetWorthTargetDisplayStrMem(v) {
  migrateTargetFromLocalStorageOnce();
  _targetMem = v == null ? "" : String(v);
  _goalNeedsCloudSync = true;
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
    return null;
  }
  return user?.id ?? null;
}

export async function pullAssetNetWorthTargetFromSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase.from(TABLE).select("target_amount").eq("user_id", userId).maybeSingle();

  if (error) {
    return false;
  }
  if (data == null) return false;

  _goalNeedsCloudSync = false;
  _targetMem = formatTargetAmountFromDb(data.target_amount);
  return true;
}

export function pullAssetNetWorthTargetFromSupabase() {
  return runAssetSerialized(() => pullAssetNetWorthTargetFromSupabaseImpl());
}

export async function syncAssetNetWorthTargetToSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!supabase) {
    if (!_warnedNoSupabaseClient) {
      _warnedNoSupabaseClient = true;
    }
    return;
  }
  if (!userId) {
    if (!_warnedNoAuthSession) {
      _warnedNoAuthSession = true;
    }
    return;
  }

  if (!_goalNeedsCloudSync) return;

  const amt = parseTargetAmountToNumber(getNetWorthTargetDisplayStrMem());

  const { error } = await supabase.from(TABLE).upsert(
    {
      user_id: userId,
      target_amount: amt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    return;
  }

  const { data: row } = await supabase.from(TABLE).select("target_amount").eq("user_id", userId).maybeSingle();
  _goalNeedsCloudSync = false;
  if (row) _targetMem = formatTargetAmountFromDb(row.target_amount);
  try {
    window.dispatchEvent(new CustomEvent("asset-networth-target-saved", { detail: { fromServerMerge: true } }));
  } catch (_) {}
}

export function syncAssetNetWorthTargetToSupabase() {
  return runAssetSerialized(() => syncAssetNetWorthTargetToSupabaseImpl());
}

export async function pushLocalNetWorthTargetIfServerHasNoRow() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { data, error } = await supabase.from(TABLE).select("user_id").eq("user_id", userId).maybeSingle();
  if (error || data != null) return;

  const localText = getNetWorthTargetDisplayStrMem();
  if (!String(localText || "").trim()) return;

  _goalNeedsCloudSync = true;
  await syncAssetNetWorthTargetToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 600;

export function flushAssetNetWorthTargetSyncPush() {
  if (!supabase) return;
  if (_pushTimer) {
    clearTimeout(_pushTimer);
    _pushTimer = null;
  }
  return syncAssetNetWorthTargetToSupabase().catch(() => {});
}

export function scheduleAssetNetWorthTargetSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncAssetNetWorthTargetToSupabase().catch(() => {});
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;
let _flushListenersAttached = false;

function attachNetWorthTargetFlushOnLeave() {
  if (_flushListenersAttached) return;
  _flushListenersAttached = true;
  const run = () => {
    void flushAssetNetWorthTargetSyncPush();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") run();
  });
  window.addEventListener("pagehide", run);
}

export function attachAssetNetWorthTargetSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  attachNetWorthTargetFlushOnLeave();
  window.addEventListener("asset-networth-target-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
    scheduleAssetNetWorthTargetSyncPush();
  });
}

export async function hydrateAssetNetWorthTargetFromCloud() {
  attachAssetNetWorthTargetSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetNetWorthTargetFromSupabase();
  await pushLocalNetWorthTargetIfServerHasNoRow();
  return applied;
}

export function clearNetWorthTargetMemAndLegacy() {
  _targetMem = undefined;
  _targetMigrated = false;
  _goalNeedsCloudSync = false;
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(LOCAL_KEY);
    localStorage.removeItem(LEGACY_LOCAL_KEY);
  } catch (_) {}
}

export { attachAssetNetWorthTargetSaveListener as attachAssetNetWorthGoalSaveListener };
export { hydrateAssetNetWorthTargetFromCloud as hydrateAssetNetWorthGoalFromCloud };
