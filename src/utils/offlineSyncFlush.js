/**
 * 오프라인에서 기기에만 쌓인 변경을, 다시 온라인 되면 먼저 서버에 올린다.
 * (pull보다 push 우선 — 서버 스냅샷이 방금 쓴 로컬을 지우지 않게)
 */

import { isAppOffline } from "./networkPresence.js";
import {
  setOfflineFlushPromise,
  clearOfflineFlushPromise,
} from "./offlineFlushState.js";
import { loadDiaryEntries } from "../diaryData.js";
import { syncDiaryToSupabase } from "./diarySupabase.js";
import { pushDirtyTimeLedgerEntriesToSupabase } from "./timeLedgerEntriesSupabase.js";
import { flushDreamKpiMapSyncPush } from "./dreamKpiMapSupabase.js";
import { flushHealthKpiMapSyncPush } from "./healthKpiMapSupabase.js";
import { flushHappinessKpiMapSyncPush } from "./happinessKpiMapSupabase.js";
import { flushSideincomeKpiMapSyncPush } from "./sideincomeKpiMapSupabase.js";
import { scheduleTimeLedgerTasksSyncPush } from "./timeLedgerTasksSupabase.js";

let _inited = false;
/** @type {Promise<void> | null} */
let _flushPromise = null;

async function runFlushPendingOfflineWrites() {
  if (isAppOffline()) return;
  try {
    await pushDirtyTimeLedgerEntriesToSupabase().catch(() => {});
    await syncDiaryToSupabase(loadDiaryEntries()).catch(() => {});
    await Promise.resolve(flushDreamKpiMapSyncPush()).catch(() => {});
    await Promise.resolve(flushHealthKpiMapSyncPush()).catch(() => {});
    await Promise.resolve(flushHappinessKpiMapSyncPush()).catch(() => {});
    await Promise.resolve(flushSideincomeKpiMapSyncPush()).catch(() => {});
    try {
      scheduleTimeLedgerTasksSyncPush();
    } catch (_) {}
  } catch (_) {}
}

export async function flushPendingOfflineWrites() {
  if (isAppOffline()) return;
  if (_flushPromise) return _flushPromise;
  _flushPromise = runFlushPendingOfflineWrites().finally(() => {
    _flushPromise = null;
    clearOfflineFlushPromise();
  });
  setOfflineFlushPromise(_flushPromise);
  return _flushPromise;
}

/** 온라인 복귀 시 대기 중인 로컬 변경을 서버에 반영 */
export function initOfflineSyncFlush() {
  if (_inited || typeof window === "undefined") return;
  _inited = true;
  window.addEventListener(
    "online",
    () => {
      void flushPendingOfflineWrites();
    },
    { passive: true },
  );
}
