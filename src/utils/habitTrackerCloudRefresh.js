/**
 * 해빗 트랙커 탭 — KPI·시간기록·일간계획 서버 pull
 */

import { pullHealthKpiMapFromSupabase } from "./healthKpiMapSupabase.js";
import { pullHappinessKpiMapFromSupabase } from "./happinessKpiMapSupabase.js";
import { pullSideincomeKpiMapFromSupabase } from "./sideincomeKpiMapSupabase.js";
import {
  pullTimeLedgerEntriesForDateRange,
} from "./timeLedgerEntriesSupabase.js";
import { pullTimeDailyBudgetForDateRange } from "./timeDailyBudgetSupabase.js";
import { syncHabitTrackerLogs } from "./timeKpiSync.js";
import { patchKpiLinkedTasksFromKpiMaps } from "./timeTaskOptionsModel.js";
import { ensureAllKpiTimeTasksFromStorage } from "./kpiTimeTaskSync.js";
import { lastDayYmdOfMonth } from "./kpiHabitTrackerStartDate.js";
import { coalesceInFlightPull } from "./timeLedgerPullCoalesce.js";

const HABIT_TRACKER_KPI_PULL_OPTS = {
  force: true,
  skipTodos: true,
  habitTrackerLite: true,
};

/**
 * @param {number} year
 * @param {number} month 1-12
 * @returns {Promise<{ pullOk: boolean }>}
 */
export async function pullHabitTrackerTabFromCloud(year, month) {
  const y = Number(year);
  const m = Number(month);
  const pad = (n) => String(n).padStart(2, "0");
  const rangeStart = `${y}-${pad(m)}-01`;
  const rangeEnd = lastDayYmdOfMonth(y, m);
  const pullKey = `habit-tracker-tab-${y}-${pad(m)}`;

  return coalesceInFlightPull(pullKey, async () => {
    let pullOk = false;
    try {
      const [h, ha, s, ledgerOk, budgetOk] = await Promise.all([
        pullHealthKpiMapFromSupabase(HABIT_TRACKER_KPI_PULL_OPTS),
        pullHappinessKpiMapFromSupabase(HABIT_TRACKER_KPI_PULL_OPTS),
        pullSideincomeKpiMapFromSupabase(HABIT_TRACKER_KPI_PULL_OPTS),
        pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd),
        pullTimeDailyBudgetForDateRange(rangeStart, rangeEnd),
      ]);
      pullOk = !!(h || ha || s || ledgerOk || budgetOk);
      patchKpiLinkedTasksFromKpiMaps();
      ensureAllKpiTimeTasksFromStorage();
      syncHabitTrackerLogs();
    } catch (_) {}
    return { pullOk };
  });
}
