/**
 * 자산관리계획 월 목표 행 ↔ Supabase (asset_user_plan_monthly_goals)
 * 로컬: JSON 배열 [{ section, category, classification, monthlyGoalStr, sortOrder }]
 */

import { supabase } from "../supabase.js";

const TABLE = "asset_user_plan_monthly_goals";
export const PLAN_MONTHLY_GOALS_STORAGE_KEY = "asset_plan_monthly_goals_v1";

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
  const payload = dbRowsToLocalPayload(dbRows);
  try {
    localStorage.setItem(PLAN_MONTHLY_GOALS_STORAGE_KEY, JSON.stringify(payload));
  } catch (_) {}
}

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

/** @returns {Promise<boolean>} 서버에서 읽어 로컬을 갱신했으면 true(빈 배열 포함) */
export async function pullAssetPlanMonthlyGoalsFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select("plan_section, category, classification, monthly_goal_amount, sort_order")
    .eq("user_id", userId)
    .order("plan_section", { ascending: true })
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[asset-plan-goals] pull", error.message);
    return false;
  }

  const rows = data || [];
  /* 서버에 한 건도 없으면 로컬을 덮어쓰지 않음(미동기화·첫 로그인 시 로컬 유지). 행이 있을 때만 클라우드 기준으로 맞춤 */
  if (rows.length === 0) return false;

  applyPlanMonthlyGoalsServerRowsToLocalStorage(rows);
  return true;
}

function readLocalRows() {
  try {
    const raw = localStorage.getItem(PLAN_MONTHLY_GOALS_STORAGE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

/** 유효한 목표만 업서트 (분류·금액 있는 행) */
export async function syncAssetPlanMonthlyGoalsToSupabase() {
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
    console.warn("[asset-plan-goals] delete", delErr.message);
    return;
  }
  if (insertPayload.length === 0) return;

  const { error: insErr } = await supabase.from(TABLE).insert(insertPayload);
  if (insErr) console.warn("[asset-plan-goals] insert", insErr.message);
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
    syncAssetPlanMonthlyGoalsToSupabase().catch((e) => console.warn("[asset-plan-goals]", e));
  }, PUSH_DEBOUNCE_MS);
}

let _listenerAttached = false;

export function attachAssetPlanMonthlyGoalsSaveListener() {
  if (_listenerAttached) return;
  _listenerAttached = true;
  window.addEventListener("asset-plan-monthly-goals-saved", () => {
    scheduleAssetPlanMonthlyGoalsSyncPush();
  });
}

/** @returns {Promise<boolean>} pull로 로컬이 바뀌었으면 true */
export async function hydrateAssetPlanMonthlyGoalsFromCloud() {
  attachAssetPlanMonthlyGoalsSaveListener();
  if (!supabase) return false;
  const applied = await pullAssetPlanMonthlyGoalsFromSupabase();
  await pushLocalPlanGoalsIfServerEmpty();
  return applied;
}
