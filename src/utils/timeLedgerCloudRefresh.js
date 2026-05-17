/**
 * 시간가계부 — 기록 행·일간 예산 pull. **과제 마스터(time_ledger_tasks) pull 은 하지 않음**
 * (앱 상단「시간가계부」탭 클릭 시 App에서만, + 시간가계부 내 과제설정 모달 열 때 Time.js에서만).
 */

import {
  ensureTimeLedgerStorageReady,
  TIME_LEDGER_ENTRIES_KEY,
} from "./timeLedgerEntriesModel.js";
import {
  pullTimeLedgerEntriesFromSupabase,
} from "./timeLedgerEntriesSupabase.js";
import { pullTimeDailyBudgetFromSupabase } from "./timeDailyBudgetSupabase.js";
import { getLedgerTasksMemSnapshotString, TIME_TASK_LOG_ROWS_KEY } from "./timeTaskOptionsModel.js";
import {
  TIME_DAILY_BUDGET_GOALS_KEY,
  TIME_BUDGET_EXCLUDED_KEY,
} from "./timeDailyBudgetModel.js";
import { lpPullDebug } from "./lpPullDebug.js";

function snapshotTimeLedgerLocalStorage() {
  try {
    return [
      localStorage.getItem(TIME_LEDGER_ENTRIES_KEY) ?? "",
      getLedgerTasksMemSnapshotString(),
      localStorage.getItem(TIME_TASK_LOG_ROWS_KEY) ?? "",
      localStorage.getItem(TIME_DAILY_BUDGET_GOALS_KEY) ?? "",
      localStorage.getItem(TIME_BUDGET_EXCLUDED_KEY) ?? "",
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
  jobs.push(pullTimeDailyBudgetFromSupabase());
  await Promise.all(jobs);
  const after = snapshotTimeLedgerLocalStorage();
  const anyChanged = before !== after;
  return { anyChanged };
}

/**
 * 시간가계부 화면 안에서 호출 — **기록 행·일간 예산만** pull (과제 목록은 안 함).
 * 과제 목록은 앱 상단 시간가계부 탭 클릭 시(App) + 과제설정 모달(Time.js)만.
 */
export async function pullTimeLedgerTabEnterFromCloud() {
  lpPullDebug("pullTimeLedgerTabEnterFromCloud", {});
  await ensureTimeLedgerStorageReady();
  const before = snapshotTimeLedgerLocalStorage();
  await Promise.all([
    pullTimeLedgerEntriesFromSupabase(),
    pullTimeDailyBudgetFromSupabase(),
  ]);
  const after = snapshotTimeLedgerLocalStorage();
  return { anyChanged: before !== after };
}
