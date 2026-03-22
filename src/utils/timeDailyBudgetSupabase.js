/**
 * 일간 시간 예산(오늘 해치우기 1·3·4) ↔ Supabase time_daily_budget_days
 */

import { supabase } from "../supabase.js";
import {
  TIME_DAILY_BUDGET_GOALS_KEY,
  TIME_BUDGET_EXCLUDED_KEY,
  mergeTimeDailyBudgetRowsFromServer,
  buildAllLocalTimeDailyBudgetPayloadsForSync,
} from "./timeDailyBudgetModel.js";

const TABLE = "time_daily_budget_days";

async function getSessionUserId() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id || null;
}

function normalizeDateKey(s) {
  const d = String(s || "").replace(/\//g, "-").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

function rowToUpsert(userId, dateKey, goals, excluded_names) {
  return {
    user_id: userId,
    plan_date: dateKey,
    goals: goals && typeof goals === "object" && !Array.isArray(goals) ? goals : {},
    excluded_names: Array.isArray(excluded_names) ? excluded_names : [],
  };
}

export async function syncTimeDailyBudgetDateToSupabase(dateKey) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;
  const dk = normalizeDateKey(dateKey);
  if (!dk) return;
  let goals = {};
  let excluded_names = [];
  try {
    const rawG = localStorage.getItem(TIME_DAILY_BUDGET_GOALS_KEY);
    const all = rawG ? JSON.parse(rawG) : {};
    const g = all[dk];
    if (g && typeof g === "object" && !Array.isArray(g)) {
      goals = JSON.parse(JSON.stringify(g));
    }
    const rawE = localStorage.getItem(TIME_BUDGET_EXCLUDED_KEY);
    const excl = rawE ? JSON.parse(rawE) : {};
    const er = excl[dk];
    if (Array.isArray(er)) {
      excluded_names = er.map((x) => String(x || "").trim()).filter(Boolean);
    }
  } catch (_) {}
  const { error } = await supabase
    .from(TABLE)
    .upsert(rowToUpsert(userId, dk, goals, excluded_names), {
      onConflict: "user_id,plan_date",
    });
  if (error) console.warn("[time-daily-budget] upsert", error.message);
}

export async function pullTimeDailyBudgetFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select("plan_date, goals, excluded_names, updated_at")
    .eq("user_id", userId)
    .order("plan_date", { ascending: false });

  if (error) {
    console.warn("[time-daily-budget] pull", error.message);
    return false;
  }
  if (!data?.length) return false;
  return mergeTimeDailyBudgetRowsFromServer(data);
}

export async function pushAllLocalTimeDailyBudgetIfServerEmpty() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return;

  const { count, error } = await supabase
    .from(TABLE)
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return;
  if (count != null && count > 0) return;

  const locals = buildAllLocalTimeDailyBudgetPayloadsForSync();
  if (locals.length === 0) return;

  const payloads = locals.map((row) =>
    rowToUpsert(userId, row.dateKey, row.goals, row.excluded_names),
  );
  const { error: upErr } = await supabase.from(TABLE).upsert(payloads, {
    onConflict: "user_id,plan_date",
  });
  if (upErr) console.warn("[time-daily-budget] bulk upsert", upErr.message);
}

let _pushTimer = null;
const PUSH_DEBOUNCE_MS = 900;

export function scheduleTimeDailyBudgetSyncPush(dateKey) {
  if (!supabase || !dateKey) return;
  const dk = normalizeDateKey(dateKey);
  if (!dk) return;
  if (_pushTimer) clearTimeout(_pushTimer);
  _pushTimer = setTimeout(() => {
    _pushTimer = null;
    syncTimeDailyBudgetDateToSupabase(dk).catch((e) =>
      console.warn("[time-daily-budget]", e),
    );
  }, PUSH_DEBOUNCE_MS);
}

export async function hydrateTimeDailyBudgetFromCloud() {
  if (!supabase) return false;
  const pulled = await pullTimeDailyBudgetFromSupabase();
  await pushAllLocalTimeDailyBudgetIfServerEmpty();
  return pulled;
}
