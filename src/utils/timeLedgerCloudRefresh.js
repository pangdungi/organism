/**
 * 시간가계부 — 서버 pull / 로컬 저장·upsert 경로 분리.
 * 전체 묶음(pullAllTimeLedgerFromCloud)은 레거시·테스트용; 앱에서는 시간 탭 진입 시 pullTimeLedgerTabEnterFromCloud 만 사용.
 * **과제 마스터(time_ledger_tasks)** 는 Time 뷰에서 기록/수정/과제설정 모달을 열 때만 pull(그 외 경로 pull 금지).
 */

import {
  ensureTimeLedgerStorageReady,
  TIME_LEDGER_ENTRIES_KEY,
} from "./timeLedgerEntriesModel.js";
import {
  pullTimeLedgerEntriesFromSupabase,
} from "./timeLedgerEntriesSupabase.js";
import { syncTimeLedgerTasksToSupabase } from "./timeLedgerTasksSupabase.js";
import { pullTimeDailyBudgetFromSupabase } from "./timeDailyBudgetSupabase.js";
import {
  pullTimeImproveNotesFromSupabase,
  pushAllLocalTimeImproveNotesIfServerEmpty,
} from "./timeImproveNotesSupabase.js";
import { TASK_OPTIONS_KEY, TIME_TASK_LOG_ROWS_KEY } from "./timeTaskOptionsModel.js";
import {
  TIME_DAILY_BUDGET_GOALS_KEY,
  TIME_BUDGET_EXCLUDED_KEY,
} from "./timeDailyBudgetModel.js";
import { lpPullDebug } from "./lpPullDebug.js";

function snapshotTimeLedgerLocalStorage() {
  try {
    return [
      localStorage.getItem(TIME_LEDGER_ENTRIES_KEY) ?? "",
      localStorage.getItem(TASK_OPTIONS_KEY) ?? "",
      localStorage.getItem(TIME_TASK_LOG_ROWS_KEY) ?? "",
      localStorage.getItem(TIME_DAILY_BUDGET_GOALS_KEY) ?? "",
      localStorage.getItem(TIME_BUDGET_EXCLUDED_KEY) ?? "",
    ].join("\n");
  } catch (_) {
    return "";
  }
}

/**
 * 기록 행·과제 마스터·일간 예산을 서버에서 받아 로컬에 병합.
 * @param {{ skipEntries?: boolean }} [opts] — true면 시간「기록」행 pull 생략(과제·일간 예산만).
 * @returns {Promise<{ anyChanged: boolean }>}
 */
export async function pullAllTimeLedgerFromCloud(opts = {}) {
  const { skipEntries = false } = opts;
  lpPullDebug("pullAllTimeLedgerFromCloud", { skipEntries });
  await ensureTimeLedgerStorageReady();
  try {
    await syncTimeLedgerTasksToSupabase();
  } catch (_) {}
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
 * 시간가계부 상위 탭 클릭 시 — sessionStorage 날짜 구간, 기록 행·일간 예산·개선노트.
 * 과제 마스터(time_ledger_tasks)는 Time 뷰에서 기록/수정/과제설정 모달을 열 때만 pull.
 */
export async function pullTimeLedgerTabEnterFromCloud() {
  lpPullDebug("pullTimeLedgerTabEnterFromCloud", {});
  await ensureTimeLedgerStorageReady();
  const before = snapshotTimeLedgerLocalStorage();
  await Promise.all([
    pullTimeLedgerEntriesFromSupabase(),
    pullTimeDailyBudgetFromSupabase(),
    pullTimeImproveNotesFromSupabase(),
  ]);
  await pushAllLocalTimeImproveNotesIfServerEmpty();
  const after = snapshotTimeLedgerLocalStorage();
  return { anyChanged: before !== after };
}
