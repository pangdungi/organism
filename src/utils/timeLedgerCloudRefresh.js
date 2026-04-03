/**
 * 시간가계부 — 서버(Supabase)에서 로컬로만 병합 (pullAllKpiMapsFromCloud 와 같은 역할).
 * Realtime·브라우저 탭 포커스 시 다른 기기 변경을 반영.
 */

import {
  ensureTimeLedgerStorageReady,
  TIME_LEDGER_ENTRIES_KEY,
} from "./timeLedgerEntriesModel.js";
import { pullTimeLedgerEntriesFromSupabase } from "./timeLedgerEntriesSupabase.js";
import { pullTimeLedgerTasksFromSupabase } from "./timeLedgerTasksSupabase.js";
import { pullTimeDailyBudgetFromSupabase } from "./timeDailyBudgetSupabase.js";
import { TASK_OPTIONS_KEY, TIME_TASK_LOG_ROWS_KEY } from "./timeTaskOptionsModel.js";
import {
  TIME_DAILY_BUDGET_GOALS_KEY,
  TIME_BUDGET_EXCLUDED_KEY,
} from "./timeDailyBudgetModel.js";

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
 * @returns {Promise<{ anyChanged: boolean }>}
 */
export async function pullAllTimeLedgerFromCloud() {
  await ensureTimeLedgerStorageReady();
  const before = snapshotTimeLedgerLocalStorage();
  await Promise.all([
    pullTimeLedgerEntriesFromSupabase(),
    pullTimeLedgerTasksFromSupabase(),
    pullTimeDailyBudgetFromSupabase(),
  ]);
  const after = snapshotTimeLedgerLocalStorage();
  const anyChanged = before !== after;
  return { anyChanged };
}
