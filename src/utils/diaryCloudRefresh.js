/**
 * 감정일기 — 서버(Supabase)에서 로컬로만 병합 (assetCloudRefresh·timeLedgerCloudRefresh 와 동일).
 */

import { pullDiaryFromSupabase } from "./diarySupabase.js";

const DIARY_ENTRIES_KEY = "diary_entries";
/** diarySupabase.js 와 동일 키 — 서버에 일기가 있었는지 플래그 */
const DIARY_SERVER_HAD_ROWS_KEY = "diary_server_had_rows_v1";

function snapshotDiaryLocalStorage() {
  try {
    return `${localStorage.getItem(DIARY_ENTRIES_KEY) ?? ""}\n${localStorage.getItem(DIARY_SERVER_HAD_ROWS_KEY) ?? ""}`;
  } catch (_) {
    return "";
  }
}

/**
 * @returns {Promise<{ anyChanged: boolean }>}
 */
export async function pullAllDiaryFromCloud() {
  const before = snapshotDiaryLocalStorage();
  await pullDiaryFromSupabase();
  const after = snapshotDiaryLocalStorage();
  return { anyChanged: before !== after };
}
