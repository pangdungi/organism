/**
 * 시간가계부 — 기록 행·일간 예산·과제 마스터(time_ledger_tasks) pull.
 * (앱 상단「시간가계부」탭 클릭 시 App에서만. 모달 열 때도 추가 pull 가능.)
 */

import {
  ensureTimeLedgerStorageReady,
  TIME_LEDGER_ENTRIES_KEY,
} from "./timeLedgerEntriesModel.js";
import { pullTimeDailyBudgetIfStaleForDateRange } from "./timeDailyBudgetSupabase.js";
import {
  pullTimeLedgerEntriesIfStaleForCombinedRange,
  readTimeLedgerCombinedPullRangeYmd,
} from "./timeLedgerEntriesSupabase.js";
import { getLedgerTasksMemSnapshotString, TIME_TASK_LOG_ROWS_KEY } from "./timeTaskOptionsModel.js";
import {
  TIME_DAILY_BUDGET_GOALS_KEY,
  TIME_BUDGET_EXCLUDED_KEY,
  readTimeDailyBudgetGoalsRaw,
  readTimeDailyBudgetExcludedRaw,
} from "./timeDailyBudgetModel.js";
import { lpPullDebug } from "./lpPullDebug.js";
import { getScopedLocalStorageItem } from "./clientStorageScope.js";
import { pullTimeLedgerTasksIfStaleForModal } from "./timeLedgerTasksSupabase.js";
import { ensureAllKpiTimeTasksFromStorage } from "./kpiTimeTaskSync.js";
import { pullStaleKpiDomainsForTaskLogList } from "./kpiTabCloudRefresh.js";

function snapshotTimeLedgerLocalStorage() {
  try {
    return [
      getScopedLocalStorageItem(TIME_LEDGER_ENTRIES_KEY) ?? "",
      getLedgerTasksMemSnapshotString(),
      getScopedLocalStorageItem(TIME_TASK_LOG_ROWS_KEY) ?? "",
      readTimeDailyBudgetGoalsRaw() ?? "",
      readTimeDailyBudgetExcludedRaw() ?? "",
    ].join("\n");
  } catch (_) {
    return "";
  }
}

/**
 * 기록 행·일간 예산을 서버에서 받아 로컬에 병합(레거시·테스트용). 과제 목록 pull 없음.
 * @param {{ skipEntries?: boolean }} [opts] — true면 시간「기록」행 pull 생략(과제·일간 예산만).
 * @returns {Promise<{ anyChanged: boolean }>}
 */
export async function pullAllTimeLedgerFromCloud(opts = {}) {
  const { skipEntries = false } = opts;
  lpPullDebug("pullAllTimeLedgerFromCloud", { skipEntries });
  await ensureTimeLedgerStorageReady();
  const before = snapshotTimeLedgerLocalStorage();
  const jobs = [];
  if (!skipEntries) jobs.push(pullTimeLedgerEntriesFromSupabase());
  const { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
  jobs.push(pullTimeDailyBudgetForDateRange(rangeStart, rangeEnd));
  await Promise.all(jobs);
  const after = snapshotTimeLedgerLocalStorage();
  const anyChanged = before !== after;
  return { anyChanged };
}

/**
 * 시간가계부 화면·탭 진입 — 기록 행·일간 예산·과제 목록을 서버에서 받음.
 * (과제설정을 열지 않아도 기록 모달에 KPI·사용자 과제가 보이게 함)
 */
export async function pullTimeLedgerTabEnterFromCloud() {
  lpPullDebug("pullTimeLedgerTabEnterFromCloud", {});
  await ensureTimeLedgerStorageReady();
  const before = snapshotTimeLedgerLocalStorage();
  const { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
  await Promise.all([
    pullTimeLedgerEntriesIfStaleForCombinedRange(),
    pullTimeDailyBudgetIfStaleForDateRange(rangeStart, rangeEnd),
    pullTimeLedgerTasksIfStaleForModal(),
  ]);
  try {
    ensureAllKpiTimeTasksFromStorage();
  } catch (_) {}
  void pullStaleKpiDomainsForTaskLogList().catch(() => {});
  const after = snapshotTimeLedgerLocalStorage();
  return { anyChanged: before !== after };
}
