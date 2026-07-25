/**
 * 일간 시간 예산 localStorage — Time.js 의 BUDGET_* 키와 동일, 계정별 스코프
 */

import {
  getScopedLocalStorageItem,
  setScopedLocalStorageItem,
} from "./clientStorageScope.js";

export const TIME_DAILY_BUDGET_GOALS_KEY = "time_daily_budget_goals";
export const TIME_BUDGET_EXCLUDED_KEY = "time_budget_excluded";

export function readTimeDailyBudgetGoalsRaw() {
  return getScopedLocalStorageItem(TIME_DAILY_BUDGET_GOALS_KEY);
}

export function readTimeDailyBudgetExcludedRaw() {
  return getScopedLocalStorageItem(TIME_BUDGET_EXCLUDED_KEY);
}

export function writeTimeDailyBudgetGoalsRaw(raw) {
  setScopedLocalStorageItem(TIME_DAILY_BUDGET_GOALS_KEY, raw);
}

export function writeTimeDailyBudgetExcludedRaw(raw) {
  setScopedLocalStorageItem(TIME_BUDGET_EXCLUDED_KEY, raw);
}

function normalizeDateKey(s) {
  const d = String(s || "").replace(/\//g, "-").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

/** 로컬에서 방금 고친 날짜 — pull 이 예전 서버 값으로 덮지 않게 */
const _localDirtyAtByDate = new Map();

export function markTimeDailyBudgetDateLocalDirty(dateKey) {
  const dk = normalizeDateKey(dateKey);
  if (!dk) return;
  _localDirtyAtByDate.set(dk, Date.now());
}

/** @returns {number} dirty 시각(ms) — 없으면 0 */
export function getTimeDailyBudgetDateLocalDirtyAt(dateKey) {
  const dk = normalizeDateKey(dateKey);
  if (!dk) return 0;
  return Number(_localDirtyAtByDate.get(dk) || 0) || 0;
}

export function isTimeDailyBudgetDateLocalDirty(dateKey) {
  return getTimeDailyBudgetDateLocalDirtyAt(dateKey) > 0;
}

/**
 * 서버 upsert 성공 후 — 동기화 시작 이후에 또 고치지 않았을 때만 dirty 해제
 * @param {string} dateKey
 * @param {number} syncStartedAtMs
 */
export function clearTimeDailyBudgetDateLocalDirtyIfNotNewer(
  dateKey,
  syncStartedAtMs,
) {
  const dk = normalizeDateKey(dateKey);
  if (!dk) return;
  const dirtyAt = getTimeDailyBudgetDateLocalDirtyAt(dk);
  if (!dirtyAt) return;
  const started = Number(syncStartedAtMs) || 0;
  if (!started || dirtyAt <= started) {
    _localDirtyAtByDate.delete(dk);
  }
}

export function listTimeDailyBudgetLocalDirtyDates() {
  return [..._localDirtyAtByDate.keys()];
}

/** 화면 복귀 pull 직전 — 업로드를 기다린 뒤 덮어쓰기 가드 해제 */
export function clearTimeDailyBudgetDateLocalDirty(dateKey) {
  const dk = normalizeDateKey(dateKey);
  if (!dk) return;
  _localDirtyAtByDate.delete(dk);
}

/**
 * 서버 병합 시 dirty 날짜도 덮기(화면 복귀용). 한 번의 merge 호출에만 적용.
 * @type {boolean}
 */
let _budgetMergePreferServerOnce = false;

export function armTimeDailyBudgetMergePreferServerOnce() {
  _budgetMergePreferServerOnce = true;
}

function consumeTimeDailyBudgetMergePreferServerOnce() {
  if (!_budgetMergePreferServerOnce) return false;
  _budgetMergePreferServerOnce = false;
  return true;
}

/**
 * 서버 행들 → localStorage. pull 시점 서버만 반영(dirty 로컬이 이기지 않음).
 * @param {unknown[]} rows
 * @param {{ rangeStart?: string, rangeEnd?: string }} [opts]
 * — range가 있으면 그 구간 안·서버에 없는 날짜 로컬은 제거
 */
export function mergeTimeDailyBudgetRowsFromServer(rows, opts = {}) {
  const list = Array.isArray(rows) ? rows : [];
  const rangeStart = normalizeDateKey(opts.rangeStart);
  const rangeEnd = normalizeDateKey(opts.rangeEnd);
  try {
    /* arm 플래그만 소비(호환). 병합은 항상 서버 우선 */
    consumeTimeDailyBudgetMergePreferServerOnce();
    const rawG = readTimeDailyBudgetGoalsRaw();
    const all = rawG && typeof rawG === "string" ? JSON.parse(rawG) : {};
    const rawE = readTimeDailyBudgetExcludedRaw();
    const excl = rawE && typeof rawE === "string" ? JSON.parse(rawE) : {};
    let changed = false;
    const serverDates = new Set();
    for (const r of list) {
      const dk = normalizeDateKey(r?.plan_date);
      if (!dk) continue;
      serverDates.add(dk);
      clearTimeDailyBudgetDateLocalDirty(dk);
      const g = r.goals;
      if (g !== undefined && g !== null && typeof g === "object" && !Array.isArray(g)) {
        const incoming = JSON.parse(JSON.stringify(g));
        const incomingEmpty = Object.keys(incoming).length === 0;
        if (incomingEmpty) {
          if (Object.prototype.hasOwnProperty.call(all, dk)) {
            delete all[dk];
            changed = true;
          }
        } else {
          const prev = all[dk];
          if (!(prev && JSON.stringify(prev) === JSON.stringify(incoming))) {
            all[dk] = incoming;
            changed = true;
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(r, "excluded_names")) {
        const en = r.excluded_names;
        if (Array.isArray(en)) {
          const nextEx = en.map((x) => String(x || "").trim()).filter(Boolean);
          const prevEx = Array.isArray(excl[dk]) ? excl[dk] : [];
          if (JSON.stringify(prevEx) !== JSON.stringify(nextEx)) {
            excl[dk] = nextEx;
            changed = true;
          }
        }
      }
    }
    if (rangeStart && rangeEnd) {
      for (const dk of Object.keys(all)) {
        if (dk < rangeStart || dk > rangeEnd) continue;
        if (serverDates.has(dk)) continue;
        delete all[dk];
        if (Object.prototype.hasOwnProperty.call(excl, dk)) delete excl[dk];
        clearTimeDailyBudgetDateLocalDirty(dk);
        changed = true;
      }
      for (const dk of Object.keys(excl)) {
        if (dk < rangeStart || dk > rangeEnd) continue;
        if (serverDates.has(dk)) continue;
        if (!Object.prototype.hasOwnProperty.call(all, dk)) {
          delete excl[dk];
          clearTimeDailyBudgetDateLocalDirty(dk);
          changed = true;
        }
      }
    } else if (list.length === 0) {
      return false;
    }
    if (changed) {
      writeTimeDailyBudgetGoalsRaw(JSON.stringify(all));
      writeTimeDailyBudgetExcludedRaw(JSON.stringify(excl));
    }
    return changed;
  } catch (_) {
    return false;
  }
}

/** 로컬에 날짜가 하나라도 있으면 { dateKey, goals, excluded_names }[] */
export function buildAllLocalTimeDailyBudgetPayloadsForSync() {
  const out = [];
  try {
    const rawG = readTimeDailyBudgetGoalsRaw();
    const all = rawG ? JSON.parse(rawG) : {};
    const rawE = readTimeDailyBudgetExcludedRaw();
    const excl = rawE ? JSON.parse(rawE) : {};
    if (!all || typeof all !== "object" || Array.isArray(all)) return out;
    for (const dateKey of Object.keys(all)) {
      const dk = normalizeDateKey(dateKey);
      if (!dk) continue;
      const goals = all[dateKey];
      if (!goals || typeof goals !== "object" || Array.isArray(goals)) continue;
      const excludedRaw = excl[dk];
      const excluded_names = Array.isArray(excludedRaw)
        ? excludedRaw.map((x) => String(x || "").trim()).filter(Boolean)
        : [];
      if (Object.keys(goals).length === 0 && excluded_names.length === 0) continue;
      out.push({
        dateKey: dk,
        goals: JSON.parse(JSON.stringify(goals)),
        excluded_names,
      });
    }
  } catch (_) {}
  return out;
}
