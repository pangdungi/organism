/**
 * 꿈·부수입·행복·건강 KPI 맵 — 서버가 단일 진실(single source of truth).
 * pull은 서버 스냅샷만 브라우저 저장소에 반영하고, 로컬·서버 페이로드 병합은 하지 않음.
 * push는 사용자가 저장한 로컬 값만 upsert한 뒤, 재조회한 서버 스냅샷으로 로컬을 맞춤.
 *
 * - pullKpiTabFromCloud: 해당 KPI 탭 진입 시 — 대기 중인 로컬→서버 반영을 먼저 flush 한 뒤 force pull(서버 최종본).
 * - pullAllKpiMapsFromCloud: Realtime·탭 포커스 등 — 현재 보고 있는 KPI 탭 도메인은 건너뜀(로컬 CRUD 유지).
 *   입력 중이면 해당 도메인도 생략.
 * - 로컬→서버 디바운스·sync 중에는 일반 pull이 localStorage를 덮지 않음(force 제외).
 */

import {
  DREAM_KPI_MAP_STORAGE_KEY,
  flushDreamKpiMapSyncPush,
  pullDreamKpiMapFromSupabase,
} from "./dreamKpiMapSupabase.js";
import {
  HEALTH_KPI_MAP_STORAGE_KEY,
  flushHealthKpiMapSyncPush,
  pullHealthKpiMapFromSupabase,
} from "./healthKpiMapSupabase.js";
import {
  HAPPINESS_KPI_MAP_STORAGE_KEY,
  flushHappinessKpiMapSyncPush,
  pullHappinessKpiMapFromSupabase,
} from "./happinessKpiMapSupabase.js";
import {
  SIDEINCOME_KPI_MAP_STORAGE_KEY,
  flushSideincomeKpiMapSyncPush,
  pullSideincomeKpiMapFromSupabase,
} from "./sideincomeKpiMapSupabase.js";
import {
  shouldDeferKpiPullForDomain,
  shouldSkipKpiDomainForBackgroundPullAll,
} from "./kpiPullTypingGuard.js";
import { lpPullDebug } from "./lpPullDebug.js";
import { syncWatchLog } from "./syncWatchLog.js";
import { kpiTodoCountInStorage, kpiTodoLifecycleOn, kpiTodoLifecycleLog } from "./kpiTodoLifecycleDebug.js";
import { kpiTodoFineTrace } from "./kpiTodoFineTrace.js";
const KPI_LOCAL_STORAGE_KEYS = {
  dream: DREAM_KPI_MAP_STORAGE_KEY,
  health: HEALTH_KPI_MAP_STORAGE_KEY,
  happiness: HAPPINESS_KPI_MAP_STORAGE_KEY,
  sideincome: SIDEINCOME_KPI_MAP_STORAGE_KEY,
};

/**
 * @param {string} tabId dream | health | happiness | sideincome
 * @returns {Promise<{ pullOk: boolean, localChanged: boolean }>}
 */
export async function pullKpiTabFromCloud(tabId) {
  kpiTodoFineTrace("cloud.pullKpiTab:시작", { tabId });
  lpPullDebug("pullKpiTabFromCloud", { tabId });
  const key = KPI_LOCAL_STORAGE_KEYS[tabId];
  const before = key ? localStorage.getItem(key) : null;

  let pullOk = false;
  switch (tabId) {
    case "dream":
      await flushDreamKpiMapSyncPush();
      pullOk = await pullDreamKpiMapFromSupabase({ force: true });
      break;
    case "health":
      await flushHealthKpiMapSyncPush();
      pullOk = await pullHealthKpiMapFromSupabase({ force: true });
      break;
    case "happiness":
      await flushHappinessKpiMapSyncPush();
      pullOk = await pullHappinessKpiMapFromSupabase({ force: true });
      break;
    case "sideincome":
      await flushSideincomeKpiMapSyncPush();
      pullOk = await pullSideincomeKpiMapFromSupabase({ force: true });
      break;
    default:
      return { pullOk: false, localChanged: false };
  }

  const after = key ? localStorage.getItem(key) : null;
  const localChanged = pullOk && before !== after;
  kpiTodoFineTrace("cloud.pullKpiTab:끝", { tabId, pullOk, localChanged });
  if (kpiTodoLifecycleOn() && key) {
    kpiTodoLifecycleLog("cloud_pullKpiTab_완료", {
      tabId,
      pullOk,
      localChanged,
      todoCountAfter: kpiTodoCountInStorage(key),
    });
  }
  syncWatchLog("pullKpiTab_완료", {
    tabId,
    pullOk,
    localChanged,
    note: "서버 스냅샷만 반영(로컬·서버 페이로드 merge 없음)",
  });
  return { pullOk, localChanged };
}

const ALL_KPI_STORAGE_KEYS = [
  DREAM_KPI_MAP_STORAGE_KEY,
  HEALTH_KPI_MAP_STORAGE_KEY,
  HAPPINESS_KPI_MAP_STORAGE_KEY,
  SIDEINCOME_KPI_MAP_STORAGE_KEY,
];

/**
 * 꿈·건강·행복·부수입 맵을 병렬 pull. 서버를 단일 원천으로 맞출 때 사용.
 * @param {() => string} [getCurrentTabId] — 꿈·건강·행복·부수입 탭에서 입력 중이면 해당 도메인 pull만 잠시 생략
 * @returns {Promise<{ anyOk: boolean, anyChanged: boolean }>}
 */
export async function pullAllKpiMapsFromCloud(getCurrentTabId) {
  kpiTodoFineTrace("cloud.pullAll:시작", {
    tab: typeof getCurrentTabId === "function" ? getCurrentTabId() : "",
  });
  lpPullDebug("pullAllKpiMapsFromCloud", {
    tab: typeof getCurrentTabId === "function" ? getCurrentTabId() : "",
  });
  let before = [];
  try {
    before = ALL_KPI_STORAGE_KEYS.map((k) => localStorage.getItem(k));
  } catch (_) {}

  const skipDream =
    shouldDeferKpiPullForDomain("dream", getCurrentTabId) ||
    shouldSkipKpiDomainForBackgroundPullAll("dream", getCurrentTabId);
  const skipHealth =
    shouldDeferKpiPullForDomain("health", getCurrentTabId) ||
    shouldSkipKpiDomainForBackgroundPullAll("health", getCurrentTabId);
  const skipHappiness =
    shouldDeferKpiPullForDomain("happiness", getCurrentTabId) ||
    shouldSkipKpiDomainForBackgroundPullAll("happiness", getCurrentTabId);
  const skipSideincome =
    shouldDeferKpiPullForDomain("sideincome", getCurrentTabId) ||
    shouldSkipKpiDomainForBackgroundPullAll("sideincome", getCurrentTabId);

  const [d, h, ha, si] = await Promise.all([
    skipDream ? Promise.resolve(false) : pullDreamKpiMapFromSupabase(),
    skipHealth ? Promise.resolve(false) : pullHealthKpiMapFromSupabase(),
    skipHappiness ? Promise.resolve(false) : pullHappinessKpiMapFromSupabase(),
    skipSideincome ? Promise.resolve(false) : pullSideincomeKpiMapFromSupabase(),
  ]);
  const anyOk = !!(d || h || ha || si);

  let after = [];
  try {
    after = ALL_KPI_STORAGE_KEYS.map((k) => localStorage.getItem(k));
  } catch (_) {}

  const anyChanged =
    before.length === after.length && before.some((b, i) => b !== after[i]);
  kpiTodoFineTrace("cloud.pullAll:끝", { anyOk, anyChanged, skipDream, skipHealth, skipHappiness, skipSideincome });
  if (kpiTodoLifecycleOn()) {
    kpiTodoLifecycleLog("cloud_pullAllKpiMaps_완료", {
      anyOk,
      anyChanged,
      skipDream,
      skipHealth,
      skipHappiness,
      skipSideincome,
      todoCountsAfter: {
        dream: kpiTodoCountInStorage(DREAM_KPI_MAP_STORAGE_KEY),
        health: kpiTodoCountInStorage(HEALTH_KPI_MAP_STORAGE_KEY),
        happiness: kpiTodoCountInStorage(HAPPINESS_KPI_MAP_STORAGE_KEY),
        sideincome: kpiTodoCountInStorage(SIDEINCOME_KPI_MAP_STORAGE_KEY),
      },
    });
  }
  syncWatchLog("pullAllKpiMaps_완료", {
    anyOk,
    anyChanged,
    skipDream,
    skipHealth,
    skipHappiness,
    skipSideincome,
    note: "네 도메인 병렬 pull. 입력 중이면 해당 도메인만 건너뜀",
  });
  return { anyOk, anyChanged };
}
