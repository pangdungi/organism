/**
 * 해빗 트랙커 탭 — KPI·시간기록·일간계획 서버 pull
 */

import { pullDreamKpiMapFromSupabase } from "./dreamKpiMapSupabase.js";
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
import { pullTodayActionTodoPicksFromSupabase } from "./kpiTodayActionTodos.js";

/** 진행 상황 탭: 할일·로그 전체는 생략, 맵은 강제 pull */
const HABIT_TRACKER_KPI_PULL_OPTS = {
  force: true,
  skipTodos: true,
  skipLogs: true,
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
      const [d, h, ha, s, ledgerOk, budgetOk, picksOk] = await Promise.all([
        pullDreamKpiMapFromSupabase({
          force: true,
          skipLogs: true,
          skipTodos: true,
        }),
        pullHealthKpiMapFromSupabase(HABIT_TRACKER_KPI_PULL_OPTS),
        pullHappinessKpiMapFromSupabase(HABIT_TRACKER_KPI_PULL_OPTS),
        pullSideincomeKpiMapFromSupabase(HABIT_TRACKER_KPI_PULL_OPTS),
        pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd, {
          force: true,
          preferServer: true,
        }),
        pullTimeDailyBudgetForDateRange(rangeStart, rangeEnd),
        pullTodayActionTodoPicksFromSupabase(),
      ]);
      pullOk = !!(d || h || ha || s || ledgerOk || budgetOk || picksOk);
      patchKpiLinkedTasksFromKpiMaps();
      ensureAllKpiTimeTasksFromStorage();
      syncHabitTrackerLogs();
    } catch (_) {}
    return { pullOk };
  });
}
