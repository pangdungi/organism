/**
 * 꿈·부수입·행복·건강 KPI 맵
 * - 고정 pull(읽기): `pullKpiTabFromCloud` — 꿈/건강/행복/부수입 **상위 앱 탭** 클릭 시 `force: true`.
 *   이 때 **시간가계부 기록**도 같은 진입 시점에 서버에서 당겨 KPI–시간 연동·일지 표시에 쓰임(시간 탭 선방문 불필요).
 * - 서브 pull: `pullKpiMapSubViewFromCloud` — 탭 **내부**에서 꿈/경로/건강 **루트(상단 목표) 전환** 시만.
 *   `force: false`로 sync 진행 중이면 생략(삭제·수정 직후 낡은 서버로 덮임 방지). KPI 카드 클릭에서는 pull 안 함.
 * - push: `saveDreamMap` 등 저장 후 즉시 sync 리스너. 가시성만으로는 푸시 안 함.
 * - pull로 서버가 비어 있을 때 자동 push 예약 없음(저장 시에만 서버 반영).
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
import {
  pullTimeLedgerEntriesForDateRange,
  readTimeLedgerPullRangeForKpiTabsYmd,
} from "./timeLedgerEntriesSupabase.js";
import { syncHabitTrackerLogs } from "./timeKpiSync.js";
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

  try {
    const { rangeStart, rangeEnd } = readTimeLedgerPullRangeForKpiTabsYmd();
    await pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
  } catch (_) {}

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

  try {
    syncHabitTrackerLogs();
  } catch (_) {}

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
 * 꿈/건강/행복/부수입 **탭 안**에서 루트 목표(상단 탭)를 전환할 때만 서버에서 당깁니다.
 * `force: false` — 로컬 sync 진행 중이면 생략(삭제·수정 직후 스냅샷 충돌 방지).
 * (상위 앱 탭은 `pullKpiTabFromCloud` — `force: true`)
 * @param {"dream" | "health" | "happiness" | "sideincome"} tabId
 * @returns {Promise<boolean>}
 */
export async function pullKpiMapSubViewFromCloud(tabId) {
  kpiTodoFineTrace("cloud.pullKpiSubView:시작", { tabId });
  lpPullDebug("pullKpiMapSubViewFromCloud", { tabId });

  try {
    const { rangeStart, rangeEnd } = readTimeLedgerPullRangeForKpiTabsYmd();
    await pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
  } catch (_) {}

  let pullOk = false;
  switch (tabId) {
    case "dream":
      pullOk = await pullDreamKpiMapFromSupabase({ force: false });
      break;
    case "health":
      pullOk = await pullHealthKpiMapFromSupabase({ force: false });
      break;
    case "happiness":
      pullOk = await pullHappinessKpiMapFromSupabase({ force: false });
      break;
    case "sideincome":
      pullOk = await pullSideincomeKpiMapFromSupabase({ force: false });
      break;
    default:
      return false;
  }
  try {
    syncHabitTrackerLogs();
  } catch (_) {}
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

/**
 * 과제 기록 모달을 열 때: KPI 탭을 거치지 않아도 매일 할일·KPI 할일이 비지 않도록
 * 꿈/건강/행복/부수입 맵을 **force** pull + 습관 연동용 시간기록 구간 pull.
 * (상위 탭의 `pullKpiTabFromCloud`와 동일하게 `force: true`)
 * @returns {Promise<{ pullOk: boolean }>}
 */
export async function pullKpiMapsForTaskLogModalOpen() {
  kpiTodoFineTrace("cloud.pullKpiMapsForTaskLogModalOpen:시작", {});
  lpPullDebug("pullKpiMapsForTaskLogModalOpen", {});

  try {
    const { rangeStart, rangeEnd } = readTimeLedgerPullRangeForKpiTabsYmd();
    await pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
  } catch (_) {}

  let pullOk = false;
  try {
    const [d, h, ha, si] = await Promise.all([
      pullDreamKpiMapFromSupabase({ force: true }),
      pullHealthKpiMapFromSupabase({ force: true }),
      pullHappinessKpiMapFromSupabase({ force: true }),
      pullSideincomeKpiMapFromSupabase({ force: true }),
    ]);
    pullOk = !!(d || h || ha || si);
  } catch (_) {}

  try {
    syncHabitTrackerLogs();
  } catch (_) {}

  kpiTodoFineTrace("cloud.pullKpiMapsForTaskLogModalOpen:끝", { pullOk });
  syncWatchLog("pullKpiMapsForTaskLogModalOpen_완료", {
    pullOk,
    note: "과제 기록 모달용 KPI 4도메인 force pull + entry 구간",
  });
  return { pullOk };
}
