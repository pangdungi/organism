/**
 * 감정일기 — 서버(Supabase)에서 로컬로만 병합 (assetCloudRefresh·timeLedgerCloudRefresh 와 동일).
 */

import {
  pullDiaryFromSupabase,
  attachDiarySaveListener,
  pushAllLocalDiaryIfServerEmpty,
} from "./diarySupabase.js";
import { lpPullDebug } from "./lpPullDebug.js";
import {
  snapshotDiarySessionForRefresh,
  loadDiaryEntries,
} from "../diaryData.js";

/**
 * @returns {Promise<{ anyChanged: boolean }>}
 */
export async function pullAllDiaryFromCloud() {
  lpPullDebug("pullAllDiaryFromCloud", {});
  const before = snapshotDiarySessionForRefresh();
  await pullDiaryFromSupabase();
  attachDiarySaveListener();
  const merged = loadDiaryEntries();
  await pushAllLocalDiaryIfServerEmpty(merged);
  const after = snapshotDiarySessionForRefresh();
  return { anyChanged: before !== after };
}
