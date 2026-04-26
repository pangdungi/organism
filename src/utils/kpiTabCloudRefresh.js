/**
 * 꿈·부수입·행복·건강 KPI 맵
 * - pull(읽기): `pullKpiTabFromCloud` — 꿈/건강/행복/부수입 **상위 탭**을 눌렀을 때만,
 *   그리고 `pullKpiMapSubViewFromCloud` — **탭 내부**에서 꿈·경로·건강 루트, KPI/목표를 클릭했을 때만.
 * - push(쓰기): `saveDreamMap` 등으로 저장·dispatch된 경우에만(즉시 sync 리스너). 탭 이탈·가시성으로 푸시하지 않음.
 * - pull로 서버 스냅샷이 없을 때 **자동**으로 로컬을 서버에 올리는 예약 push 없음(명시적 저장으로만).
 */

import {
  DREAM_KPI_MAP_STORAGE_KEY,
  pullDreamKpiMapFromSupabase,
} from "./dreamKpiMapSupabase.js";
import {
  HEALTH_KPI_MAP_STORAGE_KEY,
  pullHealthKpiMapFromSupabase,
} from "./healthKpiMapSupabase.js";
import {
  HAPPINESS_KPI_MAP_STORAGE_KEY,
  pullHappinessKpiMapFromSupabase,
} from "./happinessKpiMapSupabase.js";
import {
  SIDEINCOME_KPI_MAP_STORAGE_KEY,
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
      pullOk = await pullDreamKpiMapFromSupabase({ force: true });
      break;
    case "health":
      pullOk = await pullHealthKpiMapFromSupabase({ force: true });
      break;
    case "happiness":
      pullOk = await pullHappinessKpiMapFromSupabase({ force: true });
      break;
    case "sideincome":
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

/**
 * 꿈/건강/행복/부수입 **탭 안**에서 목표(상단 탭)·KPI 카드 등을 클릭했을 때만 서버에서 당깁니다(읽기).
 * (상위 앱 탭은 `pullKpiTabFromCloud` — flush 없이 pull만)
 * @param {"dream" | "health" | "happiness" | "sideincome"} tabId
 * @returns {Promise<boolean>}
 */
export async function pullKpiMapSubViewFromCloud(tabId) {
  kpiTodoFineTrace("cloud.pullKpiSubView:시작", { tabId });
  lpPullDebug("pullKpiMapSubViewFromCloud", { tabId });
  let pullOk = false;
  switch (tabId) {
    case "dream":
      pullOk = await pullDreamKpiMapFromSupabase({ force: true });
      break;
    case "health":
      pullOk = await pullHealthKpiMapFromSupabase({ force: true });
      break;
    case "happiness":
      pullOk = await pullHappinessKpiMapFromSupabase({ force: true });
      break;
    case "sideincome":
      pullOk = await pullSideincomeKpiMapFromSupabase({ force: true });
      break;
    default:
      return false;
  }
  kpiTodoFineTrace("cloud.pullKpiSubView:끝", { tabId, pullOk });
  syncWatchLog("pullKpiMapSubView_완료", { tabId, pullOk });
  return pullOk;
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
