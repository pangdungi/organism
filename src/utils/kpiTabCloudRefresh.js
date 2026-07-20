/**
 * 꿈·부수입·행복·건강 KPI 맵
 * - 고정 pull(읽기): `pullKpiTabFromCloud` — 꿈/건강/행복/부수입 **상위 앱 탭** 클릭 시 `force: true`.
 *   **건강·행복**: KPI·할일(await, KPI 로그 제외), 시간기록·습관 sync 는 백그라운드.
 *   **꿈·부수입**: KPI·할일(await, KPI 로그 제외), 시간기록 pull 병렬.
 * - 서브 pull: `pullKpiMapSubViewFromCloud` — 탭 **내부**에서 꿈/경로/건강 **루트(상단 목표) 전환** 시만.
 *   `force: false`로 sync 진행 중이면 생략(삭제·수정 직후 낡은 서버로 덮임 방지). KPI 카드 클릭에서는 pull 안 함.
 * - push: `saveDreamMap` 등 저장 후 즉시 sync 리스너. 가시성만으로는 푸시 안 함.
 * - pull로 서버가 비어 있을 때 자동 push 예약 없음(저장 시에만 서버 반영).
 */

import { pullDreamKpiMapFromSupabase } from "./dreamKpiMapSupabase.js";
import {
  pullHealthKpiMapFromSupabase,
  pullHealthKpiMapTodosFromSupabase,
} from "./healthKpiMapSupabase.js";
import {
  pullHappinessKpiMapFromSupabase,
  pullHappinessKpiMapTodosFromSupabase,
} from "./happinessKpiMapSupabase.js";
import { pullSideincomeKpiMapFromSupabase } from "./sideincomeKpiMapSupabase.js";
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
  readTimeLedgerCombinedPullRangeYmd,
  timeLedgerLocalTodayYmd,
} from "./timeLedgerEntriesSupabase.js";
import { coalesceInFlightPull } from "./timeLedgerPullCoalesce.js";
import { syncHabitTrackerLogs, getKpiTargetDateRange } from "./timeKpiSync.js";
import { syncSleepHealthGoalLogsFromTimeLedger } from "./healthSleepGoalTimeLedgerSync.js";
import {
  patchKpiLinkedTasksFromKpiMaps,
} from "./timeTaskOptionsModel.js";
import { readKpiMapScopedStorageRaw } from "./kpiMapLocalStorage.js";
import { probeKpiDomainServerStale, rememberKpiDomainServerWatermarkMs } from "./kpiMapServerWatermark.js";
import {
  isTaskListFirstPullNeeded,
  pullTimeLedgerTasksForTabEnter,
  pullTimeLedgerTasksIfStaleForModal,
  pullTimeLedgerTasksFromSupabase,
} from "./timeLedgerTasksSupabase.js";
import { ensureAllKpiTimeTasksFromStorage } from "./kpiTimeTaskSync.js";
import { resolveKpiDomainForKpiId } from "./kpiTodoSync.js";

const KPI_DOMAIN_PULL = {
  dream: pullDreamKpiMapFromSupabase,
  health: pullHealthKpiMapFromSupabase,
  happiness: pullHappinessKpiMapFromSupabase,
  sideincome: pullSideincomeKpiMapFromSupabase,
};
const KPI_LOCAL_STORAGE_KEYS = {
  dream: "kpi-dream-map",
  health: "kpi-health-map",
  happiness: "kpi-happiness-map",
  sideincome: "kpi-sideincome-paths",
};

/** KPI 탭 진입 시 — 시간기록 탭과 동일한 세션 날짜 구간만 pull (과제목록은 과제설정 모달에서만). */
async function pullLedgerForKpiTabEnter() {
  return coalesceInFlightPull("kpi-tab-ledger-enter", async () => {
    try {
      const { rangeStart, rangeEnd } = readTimeLedgerCombinedPullRangeYmd();
      await pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd);
      patchKpiLinkedTasksFromKpiMaps();
    } catch (_) {}
  });
}

const KPI_TAB_LITE_ENTER_IDS = new Set(["health", "happiness"]);
const KPI_TAB_ENTER_PULL_OPTS = { force: true, skipLogs: true };

/** 건강·행복 탭 — 시간기록 pull·습관 연동을 백그라운드에서 처리 */
function scheduleKpiTabLedgerBackgroundSync(tabId) {
  void (async () => {
    try {
      await pullLedgerForKpiTabEnter();
      syncHabitTrackerLogs();
    } catch (_) {}
    try {
      if (tabId === "health") window.__lpHealthSoftRefresh?.();
      else if (tabId === "happiness") window.__lpHappinessSoftRefresh?.();
    } catch (_) {}
  })();
}

/**
 * KPI 상세(시간 단위) — 목표 기간 또는 최근 2년 가계부 pull
 * @param {object} kpi
 * @returns {Promise<boolean>}
 */
export async function pullTimeLedgerForKpi(kpi) {
  const kid = String(kpi?.id || "").trim();
  if (!kid) return false;
  try {
    const today = timeLedgerLocalTodayYmd();
    const { start, end } = getKpiTargetDateRange(kpi);
    let rangeStart = start;
    let rangeEnd = end || today;
    if (!rangeStart) {
      const d = new Date();
      d.setFullYear(d.getFullYear() - 2);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      rangeStart = `${y}-${m}-${day}`;
    }
    if (rangeEnd > today) rangeEnd = today;
    if (rangeStart > rangeEnd) rangeEnd = rangeStart;
    await Promise.all([
      pullTimeLedgerEntriesForDateRange(rangeStart, rangeEnd),
    ]);
    patchKpiLinkedTasksFromKpiMaps();
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * @param {string} tabId dream | health | happiness | sideincome
 * @returns {Promise<{ pullOk: boolean, localChanged: boolean }>}
 */
export async function pullKpiTabFromCloud(tabId) {
  kpiTodoFineTrace("cloud.pullKpiTab:시작", { tabId });
  lpPullDebug("pullKpiTabFromCloud", { tabId });
  const key = KPI_LOCAL_STORAGE_KEYS[tabId];
  const before = key ? readKpiMapScopedStorageRaw(key) : null;

  const liteEnter = KPI_TAB_LITE_ENTER_IDS.has(tabId);
  let pullOk = false;

  if (liteEnter) {
    if (tabId === "health") {
      pullOk = await pullHealthKpiMapFromSupabase(KPI_TAB_ENTER_PULL_OPTS);
      try {
        syncSleepHealthGoalLogsFromTimeLedger();
      } catch (_) {}
    } else {
      pullOk = await pullHappinessKpiMapFromSupabase(KPI_TAB_ENTER_PULL_OPTS);
    }
    scheduleKpiTabLedgerBackgroundSync(tabId);
  } else {
    let domainPull = Promise.resolve(false);
    switch (tabId) {
      case "dream":
        domainPull = pullDreamKpiMapFromSupabase(KPI_TAB_ENTER_PULL_OPTS);
        break;
      case "sideincome":
        domainPull = pullSideincomeKpiMapFromSupabase(KPI_TAB_ENTER_PULL_OPTS);
        break;
      default:
        return { pullOk: false, localChanged: false };
    }
    const [, ok] = await Promise.all([pullLedgerForKpiTabEnter(), domainPull]);
    pullOk = ok;
    try {
      syncHabitTrackerLogs();
    } catch (_) {}
  }

  const after = key ? readKpiMapScopedStorageRaw(key) : null;
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
 * 건강·행복 KPI 카드(상세) 진입 시 — 할일·매일할일 서버 pull
 * @param {"health" | "happiness"} tabId
 * @returns {Promise<boolean>}
 */
export async function pullKpiDetailTodosFromCloud(tabId) {
  if (tabId === "health") return pullHealthKpiMapTodosFromSupabase();
  if (tabId === "happiness") return pullHappinessKpiMapTodosFromSupabase();
  return false;
}

/**
 * 과제 기록 모달 — 연결 KPI 도메인의 할 일 목록 pull
 * @param {string} kpiId
 * @returns {Promise<boolean>}
 */
export async function pullKpiTodosDomainFromCloud(kpiId) {
  const domain = resolveKpiDomainForKpiId(kpiId);
  if (!domain) return false;
  switch (domain) {
    case "dream":
      return pullDreamKpiMapFromSupabase({ force: false, skipLogs: true });
    case "health":
      return pullHealthKpiMapTodosFromSupabase();
    case "happiness":
      return pullHappinessKpiMapTodosFromSupabase();
    case "sideincome":
      return pullSideincomeKpiMapFromSupabase({ force: false, skipLogs: true });
    default:
      return false;
  }
}

/**
 * 과제 기록 모달 — 서버 워터마크가 로컬보다 새로울 때만 할일·매일할일 pull
 * @param {string} kpiId
 * @returns {Promise<{ stale: boolean, pulled: boolean, pullOk: boolean }>}
 */
export async function pullKpiTodosDomainFromCloudIfStale(kpiId) {
  const domain = resolveKpiDomainForKpiId(kpiId);
  if (!domain) return { stale: false, pulled: false, pullOk: false };
  const probe = await probeKpiDomainServerStale(domain);
  if (!probe.stale) {
    return { stale: false, pulled: false, pullOk: true };
  }
  const pullOk = !!(await pullKpiTodosDomainFromCloud(kpiId));
  if (pullOk && probe.serverMs > 0) {
    rememberKpiDomainServerWatermarkMs(domain, probe.serverMs, probe.userId);
  }
  return { stale: true, pulled: true, pullOk };
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

  let domainPull = Promise.resolve(false);
  switch (tabId) {
    case "dream":
      domainPull = pullDreamKpiMapFromSupabase({ force: false, skipLogs: true });
      break;
    case "health":
      domainPull = pullHealthKpiMapFromSupabase({ force: false, skipLogs: true });
      break;
    case "happiness":
      domainPull = pullHappinessKpiMapFromSupabase({ force: false, skipLogs: true });
      break;
    case "sideincome":
      domainPull = pullSideincomeKpiMapFromSupabase({ force: false, skipLogs: true });
      break;
    default:
      return false;
  }

  const pullOk = await domainPull;

  try {
    syncHabitTrackerLogs();
  } catch (_) {}
  kpiTodoFineTrace("cloud.pullKpiSubView:끝", { tabId, pullOk });
  syncWatchLog("pullKpiMapSubView_완료", { tabId, pullOk });
  return pullOk;
}

const ALL_KPI_STORAGE_KEYS = [
  KPI_LOCAL_STORAGE_KEYS.dream,
  KPI_LOCAL_STORAGE_KEYS.health,
  KPI_LOCAL_STORAGE_KEYS.happiness,
  KPI_LOCAL_STORAGE_KEYS.sideincome,
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
    before = ALL_KPI_STORAGE_KEYS.map((k) => readKpiMapScopedStorageRaw(k));
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
    after = ALL_KPI_STORAGE_KEYS.map((k) => readKpiMapScopedStorageRaw(k));
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
        dream: kpiTodoCountInStorage(KPI_LOCAL_STORAGE_KEYS.dream),
        health: kpiTodoCountInStorage(KPI_LOCAL_STORAGE_KEYS.health),
        happiness: kpiTodoCountInStorage(KPI_LOCAL_STORAGE_KEYS.happiness),
        sideincome: kpiTodoCountInStorage(KPI_LOCAL_STORAGE_KEYS.sideincome),
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
 * 과제 기록 모달 — 로컬 KPI·과제 캐시만으로 UI 준비(네트워크 없음).
 * KPI 탭을 안 거쳐도 연동 과제(잡무 처리하기 등)가 검색·목록에 보이게 기본 KPI 반영.
 */
export function primeTaskLogModalFromLocal() {
  try {
    ensureAllKpiTimeTasksFromStorage();
  } catch (_) {}
  try {
    patchKpiLinkedTasksFromKpiMaps();
  } catch (_) {}
}

const TASK_LOG_KPI_DOMAINS = ["dream", "health", "happiness", "sideincome"];

/** 과제 선택 목록용 — 네 KPI 도메인 중 서버가 더 새로우면 pull */
export async function pullStaleKpiDomainsForTaskLogList() {
  let kpiChanged = false;
  await Promise.all(
    TASK_LOG_KPI_DOMAINS.map(async (domain) => {
      const stale = await probeKpiDomainServerStale(domain);
      if (!stale?.stale) return;
      const pullFn = KPI_DOMAIN_PULL[domain];
      if (!pullFn) return;
      const changed = !!(await pullFn({ force: false }));
      if (changed && stale.serverMs > 0) {
        rememberKpiDomainServerWatermarkMs(domain, stale.serverMs, stale.userId);
      }
      if (changed) kpiChanged = true;
    }),
  );
  if (kpiChanged) {
    try {
      ensureAllKpiTimeTasksFromStorage();
    } catch (_) {}
    try {
      patchKpiLinkedTasksFromKpiMaps();
    } catch (_) {}
    try {
      syncHabitTrackerLogs();
    } catch (_) {}
  }
  return kpiChanged;
}

/**
 * 캘린더 일간(예상 일정) — 첫 진입 full pull, 이후 서버 변경(stale)일 때만.
 * 시간기록 탭 과제목록과 같은 기준을 씁니다.
 */
export async function pullTaskListForCalendar1DayEnter() {
  const needFull = await isTaskListFirstPullNeeded();
  try {
    await pullTimeLedgerTasksForTabEnter();
  } catch (_) {}
  try {
    if (needFull) {
      await pullKpiDomainsForTaskLogListForce();
    } else {
      await pullStaleKpiDomainsForTaskLogList();
    }
  } catch (_) {}
  if (!needFull) {
    try {
      ensureAllKpiTimeTasksFromStorage();
    } catch (_) {}
    try {
      patchKpiLinkedTasksFromKpiMaps();
    } catch (_) {}
  }
}

/** 홈 3분할 boot — KPI 맵을 stale 무시하고 받아 과제 picker 필터에 필요 */
export async function pullKpiDomainsForTaskLogListForce() {
  await Promise.all(
    TASK_LOG_KPI_DOMAINS.map(async (domain) => {
      const pullFn = KPI_DOMAIN_PULL[domain];
      if (!pullFn) return;
      try {
        await pullFn({ force: true, skipLogs: true });
      } catch (_) {}
    }),
  );
  try {
    ensureAllKpiTimeTasksFromStorage();
  } catch (_) {}
  try {
    patchKpiLinkedTasksFromKpiMaps();
  } catch (_) {}
  try {
    syncHabitTrackerLogs();
  } catch (_) {}
}

/**
 * 과제 기록/수정 모달 백그라운드 동기화 — stale일 때만 pull, force 없음(로컬→서버 대기 중 보호).
 * 서버 push 는 호출하지 않음.
 * @param {() => void} [onApplied] — pull로 로컬이 바뀐 뒤(모달仍 open일 때 UI 갱신용)
 * @param {{ resolveKpiId?: () => string, forceTasks?: boolean, skipTasks?: boolean }} [opts]
 * @returns {Promise<{ tasksChanged: boolean, kpiChanged: boolean, anyChanged: boolean }>}
 */
export function scheduleTaskLogModalCloudSync(onApplied, opts = {}) {
  const resolveKpiId =
    typeof opts.resolveKpiId === "function" ? opts.resolveKpiId : () => "";
  const forceTasks = !!opts.forceTasks;
  const skipTasks = !!opts.skipTasks;
  return coalesceInFlightPull("task-log-modal-cloud-sync", async () => {
    let tasksChanged = false;
    if (!skipTasks) {
      try {
        tasksChanged = forceTasks
          ? !!(await pullTimeLedgerTasksFromSupabase({ ignoreSkip: true }))
          : !!(await pullTimeLedgerTasksIfStaleForModal());
      } catch (_) {
        tasksChanged = false;
      }
    }
    const kpiId = String(resolveKpiId() || "").trim();
    const kpiChanged = !!(await pullKpiMapsForTaskLogModalOpen({ kpiId }).catch(
      () => false,
    ));
    /* 서버 pull이 로컬 KPI 연동 과제를 덮을 수 있어, 맵 기준으로 다시 채운 뒤 UI를 갱신 */
    try {
      ensureAllKpiTimeTasksFromStorage();
    } catch (_) {}
    try {
      patchKpiLinkedTasksFromKpiMaps();
    } catch (_) {}
    const anyChanged = tasksChanged || kpiChanged;
    try {
      onApplied?.({ tasksChanged, kpiChanged, anyChanged });
    } catch (_) {}
    return { tasksChanged, kpiChanged, anyChanged };
  });
}

/**
 * 과제 기록 모달 — 연결된 KPI가 속한 메뉴 1개만.
 * 서버 updated_at 워터마크가 로컬보다 새로울 때만 pull(force:false).
 * @param {{ kpiId?: string }} [opts]
 * @returns {Promise<boolean>} 이번에 서버 스냅샷을 반영했으면 true
 */
export async function pullKpiMapsForTaskLogModalOpen(opts = {}) {
  kpiTodoFineTrace("cloud.pullKpiMapsForTaskLogModalOpen:시작", {});
  lpPullDebug("pullKpiMapsForTaskLogModalOpen", {});

  const kpiId = String(opts.kpiId || "").trim();
  const kpiChanged = await pullStaleKpiDomainsForTaskLogList();

  kpiTodoFineTrace("cloud.pullKpiMapsForTaskLogModalOpen:끝", {
    pullOk: true,
    kpiChanged,
    kpiId: kpiId || "(task-list)",
  });
  syncWatchLog("pullKpiMapsForTaskLogModalOpen_완료", {
    pullOk: true,
    kpiChanged,
    note: kpiId
      ? "과제 KPI id + 목록용 네 도메인 stale pull"
      : "과제 선택 전 — 목록용 네 도메인 stale pull",
  });
  return kpiChanged;
}
