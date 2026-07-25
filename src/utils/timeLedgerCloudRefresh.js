/**
 * 시간가계부 — 기록 행·일간 예산·과제 마스터(time_ledger_tasks) pull.
 * (앱 상단「시간가계부」탭 클릭 시 App에서만. 모달 열 때도 추가 pull 가능.)
 */

import {
  ensureTimeLedgerStorageReady,
  TIME_LEDGER_ENTRIES_KEY,
} from "./timeLedgerEntriesModel.js";
import { pullTimeDailyBudgetForDateRange } from "./timeDailyBudgetSupabase.js";
import {
  pullTimeLedgerEntriesFromSupabase,
  readTimeLedgerCombinedPullRangeYmd,
} from "./timeLedgerEntriesSupabase.js";
import {
  getLedgerTasksMemSnapshotString,
  patchKpiLinkedTasksFromKpiMaps,
  TIME_TASK_LOG_ROWS_KEY,
} from "./timeTaskOptionsModel.js";
import {
  TIME_DAILY_BUDGET_GOALS_KEY,
  TIME_BUDGET_EXCLUDED_KEY,
  readTimeDailyBudgetGoalsRaw,
  readTimeDailyBudgetExcludedRaw,
} from "./timeDailyBudgetModel.js";
import { lpPullDebug } from "./lpPullDebug.js";
import { getScopedLocalStorageItem } from "./clientStorageScope.js";
import { pullTimeLedgerTasksForTabEnter } from "./timeLedgerTasksSupabase.js";
import { ensureAllKpiTimeTasksFromStorage } from "./kpiTimeTaskSync.js";
import { pullStaleKpiDomainsForTaskLogList } from "./kpiTabCloudRefresh.js";
import { coalesceInFlightPull } from "./timeLedgerPullCoalesce.js";

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

async function pullTimeLedgerTabEnterFromCloudCore(opts = {}) {
  const skipTasks = !!opts.skipTasks;
  lpPullDebug("pullTimeLedgerTabEnterFromCloud", { skipTasks });
  await ensureTimeLedgerStorageReady();
  const before = snapshotTimeLedgerLocalStorage();
  const { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
  /*
   * KPI·기록·예산·과제를 한꺼번에 — 끝난 뒤 KPI 연동 과제만 합친다.
   * (예전: KPI를 먼저 await 해서 모바일 복귀 시 체감이 길어짐)
   */
  const jobs = [
    pullStaleKpiDomainsForTaskLogList(),
    pullTimeLedgerEntriesFromSupabase(),
    pullTimeDailyBudgetForDateRange(rangeStart, rangeEnd),
  ];
  if (!skipTasks) {
    jobs.push(pullTimeLedgerTasksForTabEnter());
  }
  await Promise.all(jobs);
  if (!skipTasks) {
    try {
      ensureAllKpiTimeTasksFromStorage();
    } catch (_) {}
    try {
      patchKpiLinkedTasksFromKpiMaps();
    } catch (_) {}
  }
  const after = snapshotTimeLedgerLocalStorage();
  return { anyChanged: before !== after };
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
 * 시간기록 탭 클릭 — KPI·과제는 첫 반영 전 무조건 pull, 이후 서버 변경(stale)일 때만.
 * 기록 행·일간 예산은 매 탭 진입 시 pull.
 */
/**
 * @param {{ skipTasks?: boolean, force?: boolean }} [opts]
 * — skipTasks: 과제 목록 pull·KPI 병합은 호출 쪽에서 처리(홈 3분할 boot/sync)
 * — force: 진행 중 tab-enter pull 과 합치지 않고 새로 받기(화면 복귀용)
 */
export function pullTimeLedgerTabEnterFromCloud(opts = {}) {
  const skipTasks = !!opts.skipTasks;
  if (opts.force) {
    return pullTimeLedgerTabEnterFromCloudCore(opts);
  }
  return coalesceInFlightPull(
    skipTasks ? "time-ledger-tab-enter-skip-tasks" : "time-ledger-tab-enter",
    () => pullTimeLedgerTabEnterFromCloudCore(opts),
  );
}
