/**
 * 자산관리계획 월 목표 행 ↔ Supabase (asset_user_plan_monthly_goals)
 * — 세션 메모리(서버 pull·sync 후 재조회).
 */

import { supabase } from "../supabase.js";
import { runAssetSerialized } from "./assetServerSyncSerial.js";

const TABLE = "asset_user_plan_monthly_goals";
export const PLAN_MONTHLY_GOALS_STORAGE_KEY = "asset_plan_monthly_goals_v1";

/** @type {unknown[]|undefined} */
let _planRowsMem = undefined;
let _planMigrated = false;

function migratePlanFromLocalStorageOnce() {
  if (_planMigrated) return;
  _planMigrated = true;
  try {
    if (typeof localStorage === "undefined") return;
    const raw = localStorage.getItem(PLAN_MONTHLY_GOALS_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      _planRowsMem = Array.isArray(arr) ? arr : [];
    } else {
      _planRowsMem = undefined;
    }
    localStorage.removeItem(PLAN_MONTHLY_GOALS_STORAGE_KEY);
  } catch (_) {
    _planRowsMem = undefined;
  }
}

export function getPlanMonthlyGoalsRowsMem() {
  migratePlanFromLocalStorageOnce();
  if (!Array.isArray(_planRowsMem)) return [];
  return _planRowsMem.slice();
}

export function setPlanMonthlyGoalsRowsMem(rows) {
  migratePlanFromLocalStorageOnce();
  _planRowsMem = Array.isArray(rows) ? rows.slice() : [];
}

function parseNum(val) {
  const n = parseFloat(String(val || "").replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
}

function dbRowsToLocalPayload(rows) {
  return (rows || []).map((r, i) => ({
    section: r.plan_section,
    category: r.category || "",
    classification: r.classification || "",
    monthlyGoalStr:
      r.monthly_goal_amount != null && Number(r.monthly_goal_amount) > 0
        ? Number(r.monthly_goal_amount).toLocaleString("ko-KR")
        : "",
    sortOrder: typeof r.sort_order === "number" ? r.sort_order : i,
  }));
}

export function applyPlanMonthlyGoalsServerRowsToLocalStorage(dbRows) {
  setPlanMonthlyGoalsRowsMem(dbRowsToLocalPayload(dbRows));
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

export async function pullAssetPlanMonthlyGoalsFromSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select("plan_section, category, classification, monthly_goal_amount, sort_order")
    .eq("user_id", userId)
    .order("plan_section", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    return false;
  }

  const rows = data || [];
  if (rows.length === 0) return false;

  applyPlanMonthlyGoalsServerRowsToLocalStorage(rows);
  return true;
}

export function pullAssetPlanMonthlyGoalsFromSupabase() {
  return runAssetSerialized(() => pullAssetPlanMonthlyGoalsFromSupabaseImpl());
}

function readLocalRows() {
  return getPlanMonthlyGoalsRowsMem();
}

export async function syncAssetPlanMonthlyGoalsToSupabaseImpl() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const local = readLocalRows();
  const insertPayload = [];
  local.forEach((r, i) => {
    const section = String(r.section || "").trim();
    const category = String(r.category || "").trim();
    const classification = String(r.classification || "").trim();
    const amt = parseNum(r.monthlyGoalStr);
    if (!section || !category || !classification) return;
    if (amt === null || amt < 0) return;
    insertPayload.push({
      user_id: userId,
      plan_section: section,
      category,
      classification,
      monthly_goal_amount: Math.round(amt * 100) / 100,
      sort_order: typeof r.sortOrder === "number" ? r.sortOrder : i,
    });
  });

  const { error: delErr } = await supabase.from(TABLE).delete().eq("user_id", userId);
  if (delErr) {
    return;
  }
  if (insertPayload.length > 0) {
    const { error: insErr } = await supabase.from(TABLE).insert(insertPayload);
  }

  const { data: again, error: pullErr } = await supabase
    .from(TABLE)
    .select("plan_section, category, classification, monthly_goal_amount, sort_order")
    .eq("user_id", userId)
    .order("plan_section", { ascending: true })
    .order("sort_order", { ascending: true });

  if (!pullErr && again) {
    applyPlanMonthlyGoalsServerRowsToLocalStorage(again);
  }
  try {
    window.dispatchEvent(new CustomEvent("asset-plan-monthly-goals-saved", { detail: { fromServerMerge: true } }));
  } catch (_) {}
}

export function syncAssetPlanMonthlyGoalsToSupabase() {
  return runAssetSerialized(() => syncAssetPlanMonthlyGoalsToSupabaseImpl());
}

export async function pushLocalPlanGoalsIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { data, error } = await supabase.from(TABLE).select("id").eq("user_id", userId).limit(1);
  if (error || (data && data.length > 0)) return;

  const local = readLocalRows();
  const hasAny = local.some((r) => {
    const cls = String(r.classification || "").trim();
    const amt = parseNum(r.monthlyGoalStr);
    return cls && amt !== null && amt > 0;
  });
  if (!hasAny) return;

  await syncAssetPlanMonthlyGoalsToSupabase();
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 1000;

export function scheduleAssetPlanMonthlyGoalsSyncPush() {
  if (!supabase) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncAssetPlanMonthlyGoalsToSupabase().catch(() => {});
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachAssetPlanMonthlyGoalsSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("asset-plan-monthly-goals-saved", (e) => {
    if (e.detail?.fromServerMerge) return;
    scheduleAssetPlanMonthlyGoalsSyncPush();
  });
}

export async function hydrateAssetPlanMonthlyGoalsFromCloud() {
  attachAssetPlanMonthlyGoalsSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetPlanMonthlyGoalsFromSupabase();
  await pushLocalPlanGoalsIfServerEmpty();
  return applied;
}

export function clearPlanMonthlyGoalsMemAndLegacy() {
  _planRowsMem = undefined;
  _planMigrated = false;
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(PLAN_MONTHLY_GOALS_STORAGE_KEY);
  } catch (_) {}
}
