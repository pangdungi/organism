/**
 * 순자산 탭 목표 순자산 ↔ Supabase (asset_user_net_worth_goal)
 * 행 없음: pull 시 로컬 유지. 행 있음: 서버 값으로 로컬 덮어씀(target_amount null이면 비움).
 */

import { supabase } from "../supabase.js";

const TABLE = "asset_user_net_worth_goal";
export const NET_WORTH_TARGET_STORAGE_KEY = "asset_networth_target";

function parseNum(val) {
  const n = parseFloat(String(val || "").replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function applyServerTargetToLocalStorage(targetAmount) {
  let display = "";
  if (targetAmount != null) {
    const n = Number(targetAmount);
    if (!Number.isNaN(n) && n > 0) display = n.toLocaleString("ko-KR");
  }
  try {
    localStorage.setItem(NET_WORTH_TARGET_STORAGE_KEY, display);
  } catch (_) {}
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/** @returns {Promise<boolean>} 서버에 행이 있어 로컬을 갱신했으면 true */
export async function pullAssetNetWorthGoalFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select("target_amount")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[asset-networth-goal] pull", error.message);
    return false;
  }
  if (data == null) return false;

  applyServerTargetToLocalStorage(data.target_amount);
  return true;
}

export async function syncAssetNetWorthGoalToSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  let raw = "";
  try {
    raw = localStorage.getItem(NET_WORTH_TARGET_STORAGE_KEY) ?? "";
  } catch (_) {}
  const n = parseNum(raw);
  const target_amount = n !== null && n > 0 ? Math.round(n * 100) / 100 : null;

  const { error } = await supabase.from(TABLE).upsert(
    { user_id: userId, target_amount },
    { onConflict: "user_id" },
  );
  if (error) console.warn("[asset-networth-goal] upsert", error.message);
}

export async function pushLocalNetWorthGoalIfServerHasNoRow() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { data, error } = await supabase.from(TABLE).select("user_id").eq("user_id", userId).maybeSingle();
  if (error || data != null) return;

  let raw = "";
  try {
    raw = localStorage.getItem(NET_WORTH_TARGET_STORAGE_KEY) ?? "";
  } catch (_) {}
  const n = parseNum(raw);
  if (n === null || n <= 0) return;

  await syncAssetNetWorthGoalToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

export function scheduleAssetNetWorthGoalSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncAssetNetWorthGoalToSupabase().catch((e) => console.warn("[asset-networth-goal]", e));
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachAssetNetWorthGoalSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("asset-networth-target-saved", () => {
    scheduleAssetNetWorthGoalSyncPush();
  });
}

/** @returns {Promise<boolean>} pull로 로컬이 바뀌었으면 true(순자산 UI 재렌더용) */
export async function hydrateAssetNetWorthGoalFromCloud() {
  attachAssetNetWorthGoalSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetNetWorthGoalFromSupabase();
  await pushLocalNetWorthGoalIfServerHasNoRow();
  return applied;
}
