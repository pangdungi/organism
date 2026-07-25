/**
 * 일간 시간 예산(오늘 해치우기 1·3·4) ↔ Supabase time_daily_budget_days
 */

import { supabase } from "../supabase.js";
import {
  mergeTimeDailyBudgetRowsFromServer,
  buildAllLocalTimeDailyBudgetPayloadsForSync,
  readTimeDailyBudgetGoalsRaw,
  readTimeDailyBudgetExcludedRaw,
  clearTimeDailyBudgetDateLocalDirtyIfNotNewer,
} from "./timeDailyBudgetModel.js";
import { lpPullDebug } from "./lpPullDebug.js";
import { coalesceInFlightPull } from "./timeLedgerPullCoalesce.js";

const TABLE = "time_daily_budget_days";

function lpExpectedBudgetDeleteDebug(step, detail) {
  try {
    console.log("[lp expected-delete]", step, detail ?? "");
  } catch (_) {}
}

function summarizeGoalsForDebug(goals) {
  if (!goals || typeof goals !== "object") return {};
  const out = {};
  for (const [task, entry] of Object.entries(goals)) {
    let n = 0;
    if (Array.isArray(entry?.scheduledTimes)) n = entry.scheduledTimes.length;
    else if (entry?.scheduledTime) n = 1;
    out[task] = { slots: n, times: entry?.scheduledTimes };
  }
  return out;
}

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

/**
 * 한 날짜 upsert 1회 — 호출 시점에 로컬을 다시 읽음.
 * (겹친 sync 는 체인으로 이어져, 예전 스냅샷이 최신을 덮지 않음)
 */
async function syncTimeDailyBudgetDateOnce(dk) {
  const syncStartedAt = Date.now();
  const userId = await getSessionUserId();
  if (!userId || !supabase) {
    lpExpectedBudgetDeleteDebug("sync.skip", {
      reason: !userId ? "no_login" : "no_supabase",
      dateKey: dk,
    });
    return { ok: false, error: !userId ? "no_login" : "no_supabase" };
  }
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
  } catch (err) {
    lpExpectedBudgetDeleteDebug(
      "sync.read_local.error",
      String(err?.message || err),
    );
  }
  lpExpectedBudgetDeleteDebug("sync.upsert.request", {
    dk,
    userIdPrefix: String(userId).slice(0, 8),
    goalsSummary: summarizeGoalsForDebug(goals),
    excludedCount: excluded_names.length,
  });
  const { error, status, statusText } = await supabase
    .from(TABLE)
    .upsert(rowToUpsert(userId, dk, goals, excluded_names), {
      onConflict: "user_id,plan_date",
    });
  lpExpectedBudgetDeleteDebug("sync.upsert.response", {
    httpStatus: status,
    statusText,
    error: error?.message || error?.code || null,
    goalsSummary: summarizeGoalsForDebug(goals),
  });
  if (error) {
    return { ok: false, error: error.message || "upsert_failed" };
  }
  cancelPendingTimeDailyBudgetSyncPush(dk);
  clearTimeDailyBudgetDateLocalDirtyIfNotNewer(dk, syncStartedAt);
  return { ok: true };
}

export async function syncTimeDailyBudgetDateToSupabase(dateKey) {
  const dk = normalizeDateKey(dateKey);
  if (!dk) {
    lpExpectedBudgetDeleteDebug("sync.skip", { reason: "bad_date", dateKey });
    return { ok: false, error: "bad_date" };
  }
  /* 같은 날짜는 직렬 — 진행 중이면 끝난 뒤 최신 로컬로 다시 올림 */
  const prev = _syncInflightByDate.get(dk) || Promise.resolve();
  const job = prev
    .catch(() => {})
    .then(() => syncTimeDailyBudgetDateOnce(dk));
  _syncInflightByDate.set(dk, job);
  try {
    return await job;
  } finally {
    if (_syncInflightByDate.get(dk) === job) _syncInflightByDate.delete(dk);
  }
}

export async function pullTimeDailyBudgetForDateRange(rangeStart, rangeEnd) {
  const userId = await getSessionUserId();
  if (!userId || !supabase) return false;
  const rs = normalizeDateKey(rangeStart);
  const re = normalizeDateKey(rangeEnd);
  if (!rs || !re) return false;
  return coalesceInFlightPull(`daily-budget:${userId}:${rs}::${re}`, async () => {
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
  const selfRows = (Array.isArray(data) ? data : []).filter(
    (r) => r && r.user_id === userId,
  );
  /* 구간 pull: 서버 0건이어도 해당 기간 로컬 잔존을 비움 */
  return mergeTimeDailyBudgetRowsFromServer(selfRows, {
    rangeStart: rs,
    rangeEnd: re,
  });
  });
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

/** @deprecated 서버 비어 있을 때 로컬 통째 시드 금지 — 서버는 사용자 모달 저장만 */
export async function pushAllLocalTimeDailyBudgetIfServerEmpty() {
  return;
}

/** 날짜별 디바운스 — 타이머를 하나만 쓰면 다른 날짜만 편집했을 때 이전 날짜가 서버에 안 올라가던 문제 방지 */
const _pushTimersByDate = new Map();
/** 같은 날짜 upsert 직렬 체인(모달 즉시 sync + 디바운스 push 겹침) */
const _syncInflightByDate = new Map();
const PUSH_DEBOUNCE_MS = 900;

export function cancelPendingTimeDailyBudgetSyncPush(dateKey) {
  const dk = normalizeDateKey(dateKey);
  if (!dk) return;
  const prev = _pushTimersByDate.get(dk);
  if (prev) {
    clearTimeout(prev);
    _pushTimersByDate.delete(dk);
  }
}

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
