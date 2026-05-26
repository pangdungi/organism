/**
 * 일간 시간 예산(오늘 해치우기 1·3·4) ↔ Supabase time_daily_budget_days
 */

import { supabase } from "../supabase.js";
import {
  mergeTimeDailyBudgetRowsFromServer,
  buildAllLocalTimeDailyBudgetPayloadsForSync,
  readTimeDailyBudgetGoalsRaw,
  readTimeDailyBudgetExcludedRaw,
} from "./timeDailyBudgetModel.js";
import { lpPullDebug } from "./lpPullDebug.js";

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
    const rawG = readTimeDailyBudgetGoalsRaw();
    const all = rawG ? JSON.parse(rawG) : {};
    const g = all[dk];
    if (g && typeof g === "object" && !Array.isArray(g)) {
      goals = JSON.parse(JSON.stringify(g));
    }
    const rawE = readTimeDailyBudgetExcludedRaw();
    const excl = rawE ? JSON.parse(rawE) : {};
    const er = excl[dk];
    if (Array.isArray(er)) {
      excluded_names = er.map((x) => String(x || "").trim()).filter(Boolean);
    }
  } catch (_) {}
  await supabase.from(TABLE).upsert(rowToUpsert(userId, dk, goals, excluded_names), {
    onConflict: "user_id,plan_date",
  });
}

export async function pullTimeDailyBudgetForDateRange(rangeStart, rangeEnd) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  const rs = normalizeDateKey(rangeStart);
  const re = normalizeDateKey(rangeEnd);
  if (!rs || !re) return false;
  let q = supabase
    .from(TABLE)
    .select("user_id, plan_date, goals, excluded_names, updated_at")
    .eq("user_id", userId);
  if (rs === re) {
    q = q.eq("plan_date", rs);
  } else {
    q = q.gte("plan_date", rs).lte("plan_date", re);
  }
  const { data, error } = await q.order("plan_date", { ascending: false });
  if (error) return false;
  if (!data?.length) return false;
  const selfRows = data.filter((r) => r && r.user_id === userId);
  if (selfRows.length === 0) return false;
  return mergeTimeDailyBudgetRowsFromServer(selfRows);
}

/** @deprecated 탭 진입 등에서는 `pullTimeDailyBudgetForDateRange` 사용 */
export async function pullTimeDailyBudgetFromSupabase() {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;

  const { data, error } = await supabase
    .from(TABLE)
    .select("user_id, plan_date, goals, excluded_names, updated_at")
    .eq("user_id", userId)
    .order("plan_date", { ascending: false });

  if (error) return false;
  if (!data?.length) return false;
  const selfRows = data.filter((r) => r && r.user_id === userId);
  if (selfRows.length === 0) return false;
  return mergeTimeDailyBudgetRowsFromServer(selfRows);
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
  await supabase.from(TABLE).upsert(payloads, {
    onConflict: "user_id,plan_date",
  });
}

/** 날짜별 디바운스 — 타이머를 하나만 쓰면 다른 날짜만 편집했을 때 이전 날짜가 서버에 안 올라가던 문제 방지 */
const _pushTimersByDate = new Map();
const PUSH_DEBOUNCE_MS = 900;

/** 대기 중인 날짜별 푸시를 모두 즉시 실행(탭 이탈·화면 전환 시 유실 방지) */
export function flushAllPendingTimeDailyBudgetSync() {
  if (_pushTimersByDate.size === 0) return;
  const entries = [..._pushTimersByDate.entries()];
  _pushTimersByDate.clear();
  for (const [, t] of entries) clearTimeout(t);
  const uniqueDks = [...new Set(entries.map(([dk]) => dk))];
  for (const dk of uniqueDks) {
    syncTimeDailyBudgetDateToSupabase(dk).catch(() => {});
  }
}

export function scheduleTimeDailyBudgetSyncPush(dateKey) {
  if (!supabase || !dateKey) return;
  const dk = normalizeDateKey(dateKey);
  if (!dk) return;
  const prev = _pushTimersByDate.get(dk);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    _pushTimersByDate.delete(dk);
    syncTimeDailyBudgetDateToSupabase(dk).catch(() => {});
  }, PUSH_DEBOUNCE_MS);
  _pushTimersByDate.set(dk, t);
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushAllPendingTimeDailyBudgetSync();
  });
  window.addEventListener("pagehide", () => flushAllPendingTimeDailyBudgetSync());
}

export async function hydrateTimeDailyBudgetFromCloud() {
  lpPullDebug("hydrateTimeDailyBudgetFromCloud", {});
  if (!supabase) return false;
  const pulled = await pullTimeDailyBudgetFromSupabase();
  await pushAllLocalTimeDailyBudgetIfServerEmpty();
  return pulled;
}
