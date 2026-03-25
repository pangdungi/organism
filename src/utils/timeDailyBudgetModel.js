/**
 * 일간 시간 예산 localStorage — Time.js 의 BUDGET_* 키와 동일
 */

export const TIME_DAILY_BUDGET_GOALS_KEY = "time_daily_budget_goals";
export const TIME_BUDGET_EXCLUDED_KEY = "time_budget_excluded";

function normalizeDateKey(s) {
  const d = String(s || "").replace(/\//g, "-").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
}

/** 서버 행들 → localStorage 병합. 변경 시 true */
export function mergeTimeDailyBudgetRowsFromServer(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  try {
    const rawG = localStorage.getItem(TIME_DAILY_BUDGET_GOALS_KEY);
    const all = rawG && typeof rawG === "string" ? JSON.parse(rawG) : {};
    const rawE = localStorage.getItem(TIME_BUDGET_EXCLUDED_KEY);
    const excl = rawE && typeof rawE === "string" ? JSON.parse(rawE) : {};
    let changed = false;
    for (const r of rows) {
      const dk = normalizeDateKey(r.plan_date);
      if (!dk) continue;
      const g = r.goals;
      if (g !== undefined && g !== null && typeof g === "object" && !Array.isArray(g)) {
        const incoming = JSON.parse(JSON.stringify(g));
        const existing =
          all[dk] && typeof all[dk] === "object" && !Array.isArray(all[dk])
            ? all[dk]
            : {};
        const incomingEmpty = Object.keys(incoming).length === 0;
        const existingKeys = Object.keys(existing).length;
        /* 서버에 빈 goals만 있으면 로컬(4. 오늘 해치우기 예상·목표)을 덮어쓰지 않음 */
        if (incomingEmpty && existingKeys > 0) continue;
        all[dk] = incoming;
        changed = true;
      }
      if (Object.prototype.hasOwnProperty.call(r, "excluded_names")) {
        const en = r.excluded_names;
        if (Array.isArray(en)) {
          excl[dk] = en.map((x) => String(x || "").trim()).filter(Boolean);
          changed = true;
        }
      }
    }
    if (changed) {
      localStorage.setItem(TIME_DAILY_BUDGET_GOALS_KEY, JSON.stringify(all));
      localStorage.setItem(TIME_BUDGET_EXCLUDED_KEY, JSON.stringify(excl));
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
    const rawG = localStorage.getItem(TIME_DAILY_BUDGET_GOALS_KEY);
    const all = rawG ? JSON.parse(rawG) : {};
    const rawE = localStorage.getItem(TIME_BUDGET_EXCLUDED_KEY);
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
