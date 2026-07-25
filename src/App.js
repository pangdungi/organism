import { applyStaticAppIconImg } from "./utils/staticAppIconImg.js";
import {
  loginBrandLogoUrl,
  withToolbarIconCacheVersion,
} from "./utils/toolbarIconUrl.js";
import { signOut } from "./auth.js";
import {
  observeDatePickerInit,
  initDatePickersIn,
} from "./utils/datePickerInit.js";
import { getRoutineSyncedTaskNames } from "./utils/routineTimeSync.js";
import {
  renderMobileScheduleCalendar,
  dismissCalendarDayExpandUI,
} from "./views/Calendar.js";
import { saveTodoListBeforeUnmount } from "./views/TodoList.js";
import {
  render as renderTime,
  teardownDetachedTimeLedgerTaskLogBridge,
} from "./views/Time.js";
import { render as renderDream } from "./views/Dream.js";
import { render as renderSideincome } from "./views/Sideincome.js";
import { render as renderHappiness } from "./views/Happiness.js";
import { render as renderHealth } from "./views/Health.js";
import { render as renderIdea } from "./views/Idea.js";
import { render as renderAdmin } from "./views/Admin.js";
import { render as renderHabitTracker } from "./views/HabitTracker.js";
import { supabase } from "./supabase.js";
import { getSupabaseSession } from "./utils/supabaseSession.js";
import { isAppAdminUser } from "./utils/adminAccess.js";
import { dismissAppToast, showToast } from "./utils/showToast.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  clearAppFooterActions,
} from "./utils/appFooterShell.js";
import { pullCalendarSectionTasksFromSupabase } from "./utils/todoSectionTasksSupabase.js";
import { calendarPullRangeYmdForMonth } from "./utils/calendarSectionTasksPullRange.js";
import { pullCalendarDayIconsFromSupabase } from "./utils/calendarDayIconsSupabase.js";
import { attachHealthKpiMapSaveListener } from "./utils/healthKpiMapSupabase.js";
import { attachHappinessKpiMapSaveListener } from "./utils/happinessKpiMapSupabase.js";
import { attachDreamKpiMapSaveListener } from "./utils/dreamKpiMapSupabase.js";
import { attachSideincomeKpiMapSaveListener } from "./utils/sideincomeKpiMapSupabase.js";
import {
  attachTimeLedgerEntriesSaveListener,
  pullTimeLedgerEntriesForDateRange,
  timeLedgerLocalTodayYmd,
  timeLedgerLocalYesterdayYmd,
  resetTimeLedgerSessionFilterToToday,
} from "./utils/timeLedgerEntriesSupabase.js";
import {
  pullKpiTabFromCloud,
  pullKpiDomainsForTaskLogListForce,
  pullStaleKpiDomainsForTaskLogList,
} from "./utils/kpiTabCloudRefresh.js";
import { ensureAllKpiTimeTasksFromStorage } from "./utils/kpiTimeTaskSync.js";
import { pullHabitTrackerTabFromCloud } from "./utils/habitTrackerCloudRefresh.js";
import { syncSleepHealthGoalLogsFromTimeLedger } from "./utils/healthSleepGoalTimeLedgerSync.js";
import {
  clearKpiTabPullPending,
  isKpiAppTabId,
} from "./utils/kpiMapSyncLoadingUi.js";
import { pullTimeLedgerTabEnterFromCloud } from "./utils/timeLedgerCloudRefresh.js";
import {
  attachTimeLedgerTasksSaveListener,
  pullTimeLedgerTasksFromSupabase,
  pullTimeLedgerTasksIfStaleForModal,
} from "./utils/timeLedgerTasksSupabase.js";
import {
  getFullTaskOptions,
  patchKpiLinkedTasksFromKpiMaps,
  saveLedgerTaskList,
} from "./utils/timeTaskOptionsModel.js";
import {
  pullTimeDailyBudgetForDateRange,
  flushAllPendingTimeDailyBudgetSync,
  syncTimeDailyBudgetDateToSupabase,
} from "./utils/timeDailyBudgetSupabase.js";
import {
  listTimeDailyBudgetLocalDirtyDates,
  clearTimeDailyBudgetDateLocalDirty,
  armTimeDailyBudgetMergePreferServerOnce,
} from "./utils/timeDailyBudgetModel.js";
import { pullUserPrefsFromSupabase } from "./utils/userHourlySync.js";
import { initSupabaseRealtimeSync } from "./utils/supabaseRealtimeSync.js";
import { printSyncWatchHelp } from "./utils/syncWatchLog.js";
import { getTabSyncCounts, logTabSync } from "./utils/lpTabSyncDebug.js";
import { logLpRender, logLpRenderStack } from "./utils/lpRenderDebugLog.js";
import { initDomPulseDebug } from "./utils/domPulseDebug.js";
import { initMobileVisualViewportKeyboardInset } from "./utils/mobileViewportKeyboard.js";
import { syncLpAppShellViewportHeight } from "./utils/lpAppShellViewport.js";
import { logTodoScheduleTabOnNavigate } from "./utils/lpTabDataSourceLog.js";
import {
  ensureTimeLedgerStorageReady,
  hydrateTimeLedgerFromLocalMirrorForBoot,
} from "./utils/timeLedgerEntriesModel.js";
import { hydrateSectionTasksFromLocalMirrorForBoot } from "./utils/todoSectionTasksModel.js";
import { hydrateCalendarDayIconsFromLocalMirrorForBoot } from "./utils/calendarDayIconsModel.js";
import {
  afterLpTabPaint,
  scheduleLpTabPullOverlay,
  clearLpTabPullOverlay,
  isLpMainPanelEmpty,
} from "./utils/lpAppLoading.js";
import { prefetchIconsForTab } from "./utils/appIconPrefetch.js";
import {
  clearLpTabPullPending,
} from "./utils/lpTabSyncLoadingUi.js";
import { coalesceInFlightPull } from "./utils/timeLedgerPullCoalesce.js";
import {
  DESKTOP_DASHBOARD_MQ,
  isDesktopDashboardViewport,
  renderDesktopDashboard,
  runDesktopDashboardSoftRefresh,
  hasDesktopDashboardInitialTodayAlign,
  alignDesktopDashboardEmbedsToTodayOnce,
} from "./utils/desktopDashboard.js";

/** 상위 탭 메타(아이콘·메뉴 런처 구역 순서) */
const TABS = [
  {
    id: "home",
    label: "오늘",
    icon: "/toolbaricons/dashboard.png",
    sidebarSection: "main",
    sidebarOrder: 0,
  },
  {
    id: "time",
    label: "시간 가계부",
    mobileLabel: "시간",
    homeMenuLabel: "시간기록",
    icon: "/toolbaricons/menu-time.png",
    sidebarSection: "main",
    sidebarOrder: 0,
  },
  {
    id: "schedulecalendar",
    label: "일정",
    mobileLabel: "일정",
    /** 홈 메뉴 그리드 표시명 */
    homeMenuLabel: "플래너",
    icon: "/toolbaricons/menu-schedule.png",
    sidebarSection: "main",
    sidebarOrder: 2,
  },
  {
    id: "sideincome",
    label: "시급 상승",
    icon: "/toolbaricons/menu-sideincome.png",
    sidebarSection: "bucket",
    sidebarOrder: 1,
  },
  {
    id: "health",
    label: "건강",
    icon: "/toolbaricons/menu-health.png",
    sidebarSection: "bucket",
    sidebarOrder: 2,
  },
  {
    id: "happiness",
    label: "행복",
    icon: "/toolbaricons/menu-happiness.png",
    sidebarSection: "bucket",
    sidebarOrder: 3,
  },
];

/** 홈 메뉴: 섹션 제목 없이 한 그리드 순서 */
const HOME_MENU_TAB_ORDER = [
  "time",
  "schedulecalendar",
  "sideincome",
  "health",
  "happiness",
  "habittracker",
];

const HOME_MENU_ACCOUNT_ICON = "/toolbaricons/menu-home/grid-my-account.png";

/** 홈 메뉴 2×3 — 아이콘만(라벨은 텍스트로 분리, 앱 글꼴 적용) */
const HOME_MENU_ICON = {
  time: "/toolbaricons/menu-home/grid-icon-time.png",
  schedulecalendar: "/toolbaricons/menu-home/grid-icon-planner.png",
  sideincome: "/toolbaricons/menu-home/grid-icon-sideincome.png",
  health: "/toolbaricons/menu-home/grid-icon-health.png",
  happiness: "/toolbaricons/menu-home/grid-icon-happiness.png",
  habittracker: "/toolbaricons/menu-home/grid-icon-habit.png",
};

/** 홈 6그리드 라벨 — 이미지에 박지 않고 DOM 텍스트로 표시 */
const HOME_MENU_LABEL = {
  time: "시간기록",
  schedulecalendar: "플래너",
  sideincome: "시급상승",
  health: "건강",
  happiness: "행복",
  habittracker: "습관관리",
};


function tabMetaById(tabId) {
  if (tabId === "idea") {
    return {
      id: "idea",
      label: "나의 계정",
      icon: HOME_MENU_ACCOUNT_ICON,
    };
  }
  if (tabId === "habittracker") {
    return {
      id: "habittracker",
      label: "습관관리",
      homeMenuLabel: HOME_MENU_LABEL.habittracker,
      icon: HOME_MENU_ICON.habittracker,
    };
  }
  return TABS.find((t) => t.id === tabId);
}

function homeMenuLabelForTab(tab) {
  if (!tab) return "";
  if (HOME_MENU_LABEL[tab.id]) return HOME_MENU_LABEL[tab.id];
  return String(tab.homeMenuLabel || tab.label || "").trim();
}

const RENDERERS = {
  time: renderTime,
  schedulecalendar: renderMobileScheduleCalendar,
  dream: renderDream,
  sideincome: renderSideincome,
  happiness: renderHappiness,
  health: renderHealth,
  idea: renderIdea,
  habittracker: renderHabitTracker,
  admin: renderAdmin,
};

let currentTabId = "home";

const APP_BOOT_READY_TIMEOUT_MS = 22000;

/** @type {(() => void) | null} */
let resolveAppBootReady = null;

export const appBootReadyPromise = new Promise((resolve) => {
  resolveAppBootReady = resolve;
});

export function waitForAppBootReady() {
  return Promise.race([
    appBootReadyPromise,
    new Promise((r) => setTimeout(r, APP_BOOT_READY_TIMEOUT_MS)),
  ]);
}

/**
 * 실험: 화면 잠금·백그라운드 복귀 시 시간기록·플래너 탭이면 서버 pull 후 soft refresh.
 * (입력 모달이 실제로 열린 경우만 건너뜀)
 * @param {() => string} getCurrentTabId
 */
function initLpTabResumeCloudPull(getCurrentTabId) {
  if (typeof document === "undefined") return;
  let hiddenAt = 0;
  const MIN_AWAY_MS = 300;
  let resumeGen = 0;
  let lastResumeAt = 0;
  const MIN_RESUME_GAP_MS = 1200;

  /** 실제 열린 모달만 — 숨긴 과제기록·과제설정 모달은 DOM에 항상 있음 */
  const isResumeBlockingModalOpen = () => {
    const nodes = document.querySelectorAll(
      ".time-task-setup-modal, .time-task-log-modal, .lp-calendar-budget-add-modal",
    );
    for (const m of nodes) {
      if (!(m instanceof HTMLElement)) continue;
      if (m.hidden || m.hasAttribute("hidden")) continue;
      if (m.getAttribute("aria-hidden") === "true") continue;
      return true;
    }
    return false;
  };

  /**
   * 화면 복귀: 예전 로컬을 서버에 올리지 않음.
   * 서버만 받아 그리고, 서버 쓰기는 사용자가 저장·삭제할 때만.
   */
  async function runTimeResumePull(gen) {
    await pullTimeLedgerTabEnterFromCloud({
      force: true,
      preferServer: true,
    });
    if (gen !== resumeGen) return;
    if (getCurrentTabId() !== "time") return;
    if (isResumeBlockingModalOpen()) return;
    try {
      window.__lpTimeLedgerSoftRefresh?.({ force: true });
    } catch (_) {}
  }

  async function runPlannerResumePull(gen) {
    try {
      armTimeDailyBudgetMergePreferServerOnce();
    } catch (_) {}
    await pullDataForActiveTab("schedulecalendar", { preferServer: true });
    if (gen !== resumeGen) return;
    if (getCurrentTabId() !== "schedulecalendar") return;
    if (isResumeBlockingModalOpen()) return;
    try {
      window.__lpCalendarSoftRefresh?.();
    } catch (_) {}
  }

  const runIfNeeded = (reason = "visibility") => {
    if (typeof getCurrentTabId !== "function") return;
    const tab = getCurrentTabId();
    if (tab !== "time" && tab !== "schedulecalendar") return;
    if (isResumeBlockingModalOpen()) return;
    const awayMs = hiddenAt > 0 ? Date.now() - hiddenAt : MIN_AWAY_MS + 1;
    if (awayMs < MIN_AWAY_MS) return;
    const now = Date.now();
    if (now - lastResumeAt < MIN_RESUME_GAP_MS) return;
    lastResumeAt = now;
    const gen = ++resumeGen;
    logTabSync("visibility_pull", { tab, awayMs, reason });
    const toastMsg =
      tab === "schedulecalendar" ? "플래너 동기화 중…" : "시간기록 동기화 중…";
    try {
      showToast(toastMsg, { autoOnly: true, durationMs: 1800 });
    } catch (_) {}
    void (async () => {
      try {
        if (tab === "time") await runTimeResumePull(gen);
        else await runPlannerResumePull(gen);
      } catch (_) {
      } finally {
        try {
          dismissAppToast();
        } catch (_) {}
      }
    })();
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (document.visibilityState === "visible") runIfNeeded("visibility");
  });
  window.addEventListener("pageshow", () => {
    runIfNeeded("pageshow");
  });
  window.addEventListener("focus", () => {
    runIfNeeded("focus");
  });
  /* Chrome Android 등 — 잠금 후 복귀 */
  try {
    document.addEventListener("resume", () => runIfNeeded("resume"), {
      capture: true,
    });
    document.addEventListener(
      "freeze",
      () => {
        hiddenAt = Date.now();
      },
      { capture: true },
    );
  } catch (_) {}
}

function finishAppBootReady() {
  if (resolveAppBootReady) {
    resolveAppBootReady();
    resolveAppBootReady = null;
  }
}

/** 세션 유지 중 마지막 탭(백그라운드 복귀 시 유지). 로그아웃 시 main.js 에서 제거 */
export const LP_LAST_TAB_SESSION_KEY = "lp_active_tab_id";
/** PWA cold start·탭 프로세스 종료 후에도 마지막 화면 복원(동일 기기·로그인 유지 시) */
export const LP_LAST_TAB_LOCAL_KEY = "lp_active_tab_id_persist";

function validAppTabIdSet() {
  return new Set([...TABS.map((t) => t.id), "idea", "habittracker", "admin"]);
}

/** @returns {boolean} 저장된 마지막 탭을 적용했으면 true */
function applyPersistedTabIdFromSessionStorage() {
  const migrateLegacyTabId = (tabId) => {
    if (tabId === "diary") {
      try {
        sessionStorage.setItem("lp_time_ledger_layout_view", "report");
      } catch (_) {}
      return "time";
    }
    if (tabId === "calendar") return "schedulecalendar";
    if (tabId === "workschedule") return "schedulecalendar";
    if (tabId === "dream") return "sideincome";
    return tabId;
  };
  try {
    const fromSession = sessionStorage.getItem(LP_LAST_TAB_SESSION_KEY);
    const migratedSession = fromSession ? migrateLegacyTabId(fromSession) : null;
    if (migratedSession && validAppTabIdSet().has(migratedSession)) {
      currentTabId = migratedSession;
      if (migratedSession !== fromSession) {
        persistActiveTabId(migratedSession);
      }
      return true;
    }
  } catch (_) {}
  try {
    const fromLocal = localStorage.getItem(LP_LAST_TAB_LOCAL_KEY);
    const migratedLocal = fromLocal ? migrateLegacyTabId(fromLocal) : null;
    if (migratedLocal && validAppTabIdSet().has(migratedLocal)) {
      currentTabId = migratedLocal;
      try {
        sessionStorage.setItem(LP_LAST_TAB_SESSION_KEY, migratedLocal);
      } catch (_) {}
      if (migratedLocal !== fromLocal) {
        persistActiveTabId(migratedLocal);
      }
      return true;
    }
  } catch (_) {}
  return false;
}

function persistActiveTabId(tabId) {
  try {
    sessionStorage.setItem(LP_LAST_TAB_SESSION_KEY, tabId);
  } catch (_) {}
  try {
    localStorage.setItem(LP_LAST_TAB_LOCAL_KEY, tabId);
  } catch (_) {}
}

/** KPI 탭: pull 완료 후 화면 갱신(동기화 로딩 해제·데이터 반영) */
function kpiSoftRefreshAfterPull(tabId, pullResult) {
  if (isKpiAppTabId(tabId)) clearKpiTabPullPending(tabId);
  kpiSoftRefreshIfPullChanged(tabId, pullResult);
}

/** KPI 탭: pull·동기화 완료 후 화면 갱신 (저장소·화면 지문이 같으면 뷰에서 재그림 생략) */
function kpiSoftRefreshIfPullChanged(tabId, pullResult) {
  if (!pullResult?.pullOk) return;
  try {
    if (tabId === "health") {
      try {
        syncSleepHealthGoalLogsFromTimeLedger();
      } catch (_) {}
      window.__lpHealthSoftRefresh?.();
    }
    else if (tabId === "happiness") window.__lpHappinessSoftRefresh?.();
    else if (tabId === "sideincome") window.__lpSideincomeSoftRefresh?.();
    else if (tabId === "habittracker") window.__lpHabitTrackerSoftRefresh?.();
  } catch (_) {}
}

/**
 * 탭 진입(클릭·부팅 시 해당 탭) 시에만 서버 pull — 다른 탭 데이터는 가져오지 않음.
 * 시간가계부 **과제 목록**(time_ledger_tasks): `time` 탭 진입·과제설정/기록 모달, 캘린더 1일 뷰 등 해당 화면만.
 */
async function pullDataForActiveTab(tabId, opts = {}) {
  const preferServer = !!opts.preferServer;
  switch (tabId) {
    case "schedulecalendar": {
      const yEnd = timeLedgerLocalTodayYmd();
      const yStart = timeLedgerLocalYesterdayYmd();
      const now = new Date();
      const calRange = calendarPullRangeYmdForMonth(
        now.getFullYear(),
        now.getMonth(),
        21,
      );
      if (preferServer) {
        try {
          armTimeDailyBudgetMergePreferServerOnce();
        } catch (_) {}
      }
      await Promise.all([
        pullCalendarSectionTasksFromSupabase({
          reason: `app_setActiveTab_${tabId}`,
          subView: "calendar",
          rangeStart: calRange.rangeStart,
          rangeEnd: calRange.rangeEnd,
        }),
        pullCalendarDayIconsFromSupabase({
          reason: `app_setActiveTab_${tabId}`,
        }),
        pullTimeLedgerEntriesForDateRange(yStart, yEnd, {
          preferServer,
          force: preferServer,
        }),
        pullTimeDailyBudgetForDateRange(yStart, yEnd),
        import("./utils/timeDailyBudgetTemplateSupabase.js").then((m) =>
          m.pullBudgetScheduleTemplatesFromSupabase(),
        ),
      ]);
      break;
    }
    case "time":
      /* 기록 탭 날짜는 메뉴 전환 직전 `resetTimeLedgerSessionFilterToToday` 로 맞춤. pull 은 그 구간 기준 */
      await pullTimeLedgerTabEnterFromCloud(
        preferServer ? { force: true, preferServer: true } : {},
      );
      break;
    case "health":
    case "happiness":
    case "sideincome":
      return await pullKpiTabFromCloud(tabId);
    case "habittracker": {
      const vm = window.__lpHabitTrackerViewMonth;
      const now = new Date();
      const y = Number(vm?.year) || now.getFullYear();
      const m = Number(vm?.month) || now.getMonth() + 1;
      return await pullHabitTrackerTabFromCloud(y, m);
    }
    case "idea":
      await pullUserPrefsFromSupabase().catch(() => {});
      break;
    case "admin":
      break;
    default:
      break;
  }
}

async function pullDesktopDashboardDataCore(opts = {}) {
  const { forceTaskList = false } = opts;
  const now = new Date();
  const yEnd = timeLedgerLocalTodayYmd();
  const yStart = timeLedgerLocalYesterdayYmd();
  const calRange = calendarPullRangeYmdForMonth(
    now.getFullYear(),
    now.getMonth(),
    21,
  );
  await (forceTaskList
    ? pullKpiDomainsForTaskLogListForce()
    : pullStaleKpiDomainsForTaskLogList());
  const taskPullJob = forceTaskList
    ? pullTimeLedgerTasksFromSupabase({ ignoreSkip: true })
    : pullTimeLedgerTasksIfStaleForModal();
  await Promise.all([
    pullTimeLedgerTabEnterFromCloud({ skipTasks: true }),
    taskPullJob,
    pullHabitTrackerTabFromCloud(now.getFullYear(), now.getMonth() + 1),
    pullCalendarSectionTasksFromSupabase({
      reason: "app_desktop_dashboard",
      subView: "calendar",
      rangeStart: calRange.rangeStart,
      rangeEnd: calRange.rangeEnd,
    }),
    pullCalendarDayIconsFromSupabase({
      reason: "app_desktop_dashboard",
    }),
    pullTimeLedgerEntriesForDateRange(yStart, yEnd),
    pullTimeDailyBudgetForDateRange(yStart, yEnd),
    import("./utils/timeDailyBudgetTemplateSupabase.js").then((m) =>
      m.pullBudgetScheduleTemplatesFromSupabase(),
    ),
  ]);
  try {
    ensureAllKpiTimeTasksFromStorage();
  } catch (_) {}
  try {
    patchKpiLinkedTasksFromKpiMaps();
  } catch (_) {}
}

/** @param {{ forceTaskList?: boolean }} [opts] — boot:true=과제목록 무조건 pull, 이후 sync:false=stale일 때만 */
function pullDesktopDashboardData(opts = {}) {
  const forceTaskList = !!opts.forceTaskList;
  return coalesceInFlightPull(
    `desktop-dashboard-data:${forceTaskList ? "boot" : "sync"}`,
    () => pullDesktopDashboardDataCore({ forceTaskList }),
  );
}

const ROUTINE_REMOVED_KEY = "app-routine-removed-v1";

/** 탭 전환 시 서버 pull 이 있는 탭 — 본문이 비었을 때만 스플래시 오버레이 */
const TAB_IDS_WITH_CLOUD_PULL = new Set([
  "schedulecalendar",
  "time",
  "health",
  "happiness",
  "sideincome",
  "habittracker",
  "idea",
]);

function migrateRemoveRoutineTasks() {
  if (localStorage.getItem(ROUTINE_REMOVED_KEY) === "1") return;
  try {
    const routineNames = getRoutineSyncedTaskNames();
    if (routineNames.size === 0) {
      localStorage.removeItem("routine-track-list");
      localStorage.setItem(ROUTINE_REMOVED_KEY, "1");
      return;
    }
    const opts = getFullTaskOptions();
    const filtered = opts.filter((o) => {
      const name = (o?.name || "").trim();
      return !routineNames.has(name);
    });
    saveLedgerTaskList(filtered, {
      bumpPullSkip: true,
      scheduleSyncPush: false,
    });
    localStorage.removeItem("routine-track-list");
    localStorage.setItem(ROUTINE_REMOVED_KEY, "1");
  } catch (_) {}
}

export async function mountApp(container) {
  if (!container) return;
  if (container.querySelector(".app-page")) return;
  /* 로그아웃 등으로 저장소가 비었는데 메모리 탭만 남으면 크롬·첫 화면이 어긋남 → 오늘로 고정 */
  if (!applyPersistedTabIdFromSessionStorage()) currentTabId = "home";
  if (currentTabId === "admin" && supabase) {
    try {
      const { data: { session } = {} } = await getSupabaseSession();
      if (!isAppAdminUser(session?.user)) {
        currentTabId = "home";
        try {
          sessionStorage.setItem(LP_LAST_TAB_SESSION_KEY, "home");
          localStorage.setItem(LP_LAST_TAB_LOCAL_KEY, "home");
        } catch (_) {}
      }
    } catch (_) {
      currentTabId = "home";
    }
  } else if (currentTabId === "admin" && !supabase) {
    currentTabId = "home";
  }
  migrateRemoveRoutineTasks();
  attachHealthKpiMapSaveListener();
  attachHappinessKpiMapSaveListener();
  attachDreamKpiMapSaveListener();
  attachSideincomeKpiMapSaveListener();
  /* 시간기록 행 저장 → time_ledger_entries upsert (아카이브 메모 비우기 포함) */
  attachTimeLedgerEntriesSaveListener();
  /* TIME 탭 미진입이어도 과제(마스터) 저장 → time_ledger_tasks upsert 수신 */
  attachTimeLedgerTasksSaveListener();
  container.innerHTML = "";

  const appPage = document.createElement("div");
  appPage.className = "app-page";

  const appScreen = document.createElement("div");
  appScreen.id = "app-screen-inner";

  let launcherAdminBtn = null;
  /** 메뉴 그리드 DOM 재사용 — 탭 복귀 시 img 재생성 깜빡임 방지 */
  let homeMenuLauncherEl = null;
  let desktopDashboardEl = null;

  async function syncAdminMenuVisibility() {
    let show = false;
    if (supabase) {
      try {
        const { data: { session } = {} } = await getSupabaseSession();
        show = isAppAdminUser(session?.user);
      } catch (_) {}
    }
    if (launcherAdminBtn) launcherAdminBtn.hidden = !show;
  }

  /** 홈 로고 클릭 — 서버에서 최신 데이터 pull 후 3분할 embed 갱신 */
  async function refreshHomeFromBrandClick() {
    if (currentTabId !== "home") return;
    try {
      syncLpAppShellViewportHeight();
    } catch (_) {}
    if (isDesktopDashboardViewport()) {
      try {
        resetTimeLedgerSessionFilterToToday();
      } catch (_) {}
    }
    try {
      await pullDesktopDashboardData({ forceTaskList: true });
    } catch (_) {}
    if (currentTabId !== "home") return;
    if (isDesktopDashboardViewport()) {
      const root =
        desktopDashboardEl?.isConnected && desktopDashboardEl
          ? desktopDashboardEl
          : main.querySelector(".lp-desktop-dashboard");
      if (root?.isConnected) {
        runDesktopDashboardSoftRefresh(root);
        requestAnimationFrame(() => {
          try {
            root._lpEmbedHabitScrollToday?.();
          } catch (_) {}
          try {
            root._lpEmbedPlannerScrollToday?.();
          } catch (_) {}
        });
      }
    }
    try {
      await syncAdminMenuVisibility();
    } catch (_) {}
  }

  /** 홈(메뉴·3분할) 진입 — boot·탭 복귀·Realtime과 동일하게 pull 후 embed 갱신 */
  async function refreshHomeDesktopDashboardAfterEnter(opts = {}) {
    if (currentTabId !== "home") return;
    try {
      syncLpAppShellViewportHeight();
    } catch (_) {}
    if (!isDesktopDashboardViewport()) {
      try {
        await syncAdminMenuVisibility();
      } catch (_) {}
      return;
    }
    const rootBefore =
      desktopDashboardEl?.isConnected && desktopDashboardEl
        ? desktopDashboardEl
        : main.querySelector(".lp-desktop-dashboard");
    const firstTodayAlign = !hasDesktopDashboardInitialTodayAlign(rootBefore);
    /* 오늘로 맞추기·스크롤은 3분할 최초 진입 1회만 — 다른 탭 갔다 오면 유지 */
    if (firstTodayAlign) {
      try {
        resetTimeLedgerSessionFilterToToday();
      } catch (_) {}
    }
    try {
      /* 탭 복귀는 강제 전체 pull 없이 — 첫 화면이 막히지 않게 */
      await pullDesktopDashboardData({ forceTaskList: !!opts.forceTaskList });
    } catch (_) {}
    if (currentTabId !== "home") return;
    const root =
      desktopDashboardEl?.isConnected && desktopDashboardEl
        ? desktopDashboardEl
        : main.querySelector(".lp-desktop-dashboard");
    if (root?.isConnected) {
      runDesktopDashboardSoftRefresh(root, {
        skipEmbedKeys: firstTodayAlign ? ["habit"] : [],
      });
      if (firstTodayAlign) {
        requestAnimationFrame(() => {
          alignDesktopDashboardEmbedsToTodayOnce(root);
        });
      }
    }
    try {
      await syncAdminMenuVisibility();
    } catch (_) {}
  }

  const main = document.createElement("main");
  main.className = "app-main";

  const panel = document.createElement("div");
  panel.className = "app-tab-panel";
  main.appendChild(panel);

  /**
   * 홈 3분할 DOM은 버리지 않음 — 전체 탭 갔다가 홈(푸터 홈 등)으로 돌아올 때
   * 통째 재생성하면 약 1초 지연이 난다.
   */
  function openAppTabFromHome(tabId) {
    setActiveTab(tabId);
  }

  function setActiveTab(tabId) {
    if (tabId === "admin") {
      void (async () => {
        if (!supabase) return;
        try {
          const { data: { session } = {} } = await getSupabaseSession();
          if (!isAppAdminUser(session?.user)) {
            showToast("관리자만 접근할 수 있어요.");
            return;
          }
        } catch (_) {
          return;
        }
        applySetActiveTab("admin");
      })();
      return;
    }
    applySetActiveTab(tabId);
  }

  const footerNav = document.createElement("nav");
  footerNav.className = "app-footer-menu";
  footerNav.setAttribute("aria-label", "하단 메뉴");
  const footerBackBtn = document.createElement("button");
  footerBackBtn.type = "button";
  footerBackBtn.className = `app-footer-menu-back ${APP_FOOTER_ICON_BTN_CLASS}`;
  footerBackBtn.title = "오늘(메인)으로";
  footerBackBtn.setAttribute("aria-label", "오늘(메인)으로");
  footerBackBtn.innerHTML =
    '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m14 7-6 5 6 5"/><circle cx="12" cy="12" r="10"/></g></svg>';
  footerBackBtn.addEventListener("click", () => {
    try {
      if (currentTabId === "health" && window.__lpHealthFooterBack?.()) return;
      if (currentTabId === "happiness" && window.__lpHappinessFooterBack?.()) return;
      if (currentTabId === "sideincome" && window.__lpSideincomeFooterBack?.()) return;
    } catch (_) {}
    setActiveTab("home");
  });
  footerBackBtn.setAttribute("data-lp-app-footer-back", "");
  const footerActionsSlot = document.createElement("div");
  footerActionsSlot.className = "app-footer-actions";
  footerActionsSlot.setAttribute("data-lp-app-footer-actions", "");
  footerActionsSlot.appendChild(footerBackBtn);
  footerNav.appendChild(footerActionsSlot);

  function syncAppFooterVisibility() {
    footerNav.hidden = currentTabId === "home";
    try {
      const root = document.getElementById("signin-page");
      if (root) {
        root.classList.toggle("lp-tab-footer-visible", !footerNav.hidden);
      }
    } catch (_) {}
  }
  syncAppFooterVisibility();

  let _tabSwitchTimer = null;

  function resetAppFooterBackLabel() {
    const footerBack = document.querySelector("[data-lp-app-footer-back]");
    if (!footerBack) return;
    footerBack.hidden = false;
    footerBack.removeAttribute("aria-hidden");
    footerBack.style.removeProperty("display");
    footerBack.title = "오늘(메인)으로";
    footerBack.setAttribute("aria-label", "오늘(메인)으로");
  }

  /**
   * 캐시된 홈 DOM을 즉시 붙인다(건강·행복·시급→홈 1초 지연 방지).
   * 이전 탭 abort는 홈을 먼저 보여 준 뒤 microtask로 돌린다.
   */
  function restoreCachedHomePanel() {
    const panelEl = main.querySelector(".app-tab-panel");
    if (!panelEl) return false;
    const useDesktop = isDesktopDashboardViewport();
    const cached = useDesktop ? desktopDashboardEl : homeMenuLauncherEl;
    if (!cached) return false;

    const prev = panelEl.firstElementChild;
    if (prev !== cached) {
      clearAppFooterActions();
      panelEl.replaceChildren(cached);
      if (prev?._lpTabAbortController) {
        const ac = prev._lpTabAbortController;
        prev._lpTabAbortController = null;
        queueMicrotask(() => {
          try {
            ac.abort();
          } catch (_) {}
        });
      }
    }
    if (useDesktop) {
      homeMenuLauncherEl = null;
    } else {
      bindHomeMenuLauncherAdminBtn(cached);
      void syncAdminMenuVisibility();
    }
    syncAppFooterVisibility();
    resetAppFooterBackLabel();
    return true;
  }

  function applySetActiveTab(tabId) {
    const fromTab = currentTabId;
    if (fromTab !== tabId) flushAllPendingTimeDailyBudgetSync();
    /*
     * 홈으로 갈 때는 푸터를 미리 건드리지 않음(숨김/버튼 제거 금지).
     * 화면 교체(renderMain) 때 같이 정리한다.
     * 건강·행복·시급→홈: 미리 뒤로가기를 켜면 홈버튼과 겹쳐 보이므로 복구도 교체 후로.
     */
    const fromKpiMapTab =
      fromTab === "health" ||
      fromTab === "happiness" ||
      fromTab === "sideincome";
    if (
      tabId !== "health" &&
      tabId !== "happiness" &&
      tabId !== "sideincome" &&
      !(fromKpiMapTab && tabId === "home")
    ) {
      resetAppFooterBackLabel();
    }
    currentTabId = tabId;
    persistActiveTabId(tabId);
    logTodoScheduleTabOnNavigate(tabId, fromTab);
    logTabSync("tab_switch", { from: fromTab, to: tabId });
    /* 홈은 즉시 전환(푸터 홈 등) — 나머지 탭만 짧게 디바운스 */
    if (_tabSwitchTimer != null) clearTimeout(_tabSwitchTimer);
    const runTabSwitch = () => {
      _tabSwitchTimer = null;
      void (async () => {
        const targetTabId = currentTabId;
        if (targetTabId === "time") {
          try {
            teardownDetachedTimeLedgerTaskLogBridge();
          } catch (_) {}
          try {
            resetTimeLedgerSessionFilterToToday();
          } catch (_) {}
        }
        if (targetTabId === "schedulecalendar") {
          try {
            hydrateSectionTasksFromLocalMirrorForBoot();
            hydrateTimeLedgerFromLocalMirrorForBoot();
            hydrateCalendarDayIconsFromLocalMirrorForBoot();
          } catch (_) {}
        }
        if (targetTabId === "schedulecalendar") {
          try {
            window.__lpCalendarGridPrefetchedForTabSwitch = true;
          } catch (_) {}
        }
        /* 홈: 캐시 DOM 즉시 복원 — renderMain 전체 경로보다 먼저 */
        if (targetTabId === "home" && restoreCachedHomePanel()) {
          void refreshHomeDesktopDashboardAfterEnter();
          return;
        }
        /* 화면 먼저 — pull 을 먼저 돌리면 메인스레드가 막혀 습관관리 등이 ~1초 지연됨 */
        renderMain(main, { force: true, skipTodoSaveBeforeUnmount: true });
        /** @type {string | null} */
        let tabPullOverlayTabId = null;
        if (
          TAB_IDS_WITH_CLOUD_PULL.has(targetTabId) &&
          isLpMainPanelEmpty(main)
        ) {
          tabPullOverlayTabId = targetTabId;
          scheduleLpTabPullOverlay(targetTabId, { immediate: true });
        }
        syncAppFooterVisibility();
        if (fromKpiMapTab && targetTabId === "home") {
          resetAppFooterBackLabel();
        }
        if (
          targetTabId === "idea" ||
          targetTabId === "admin" ||
          targetTabId === "home"
        ) {
          requestAnimationFrame(() => {
            main.scrollTop = 0;
          });
        }
        void (async () => {
          let pullResult;
          try {
            try {
              /* 한 프레임 그린 뒤 pull — 진입 체감 지연 완화 */
              await new Promise((r) => requestAnimationFrame(() => r()));
              if (currentTabId !== targetTabId) return;
              pullResult = await pullDataForActiveTab(targetTabId, {
                fromBoot: false,
              });
            } catch (_) {}
            if (currentTabId !== targetTabId) {
              try {
                window.__lpCalendarGridPrefetchedForTabSwitch = false;
              } catch (_) {}
              if (isKpiAppTabId(targetTabId)) clearKpiTabPullPending(targetTabId);
              if (targetTabId === "home" || targetTabId === "time") {
                clearLpTabPullPending(targetTabId);
              }
              return;
            }
        if (targetTabId === "schedulecalendar") {
          /* 할일/일정·사이드 캘린더: 두 번째 renderMain 시 상단 탭·설정 아이콘이 통째로 다시 붙으며 깜빡임 — 패널 유지 후 본문만 갱신 */
          try {
            window.__lpCalendarSoftRefresh?.();
          } catch (_) {}
        } else if (targetTabId === "idea") {
          /* 나의 계정: pull(시급·appearance) 후 통째 renderMain 하면 화면이 두 번 새로고침되는 것처럼 보임 */
          try {
            window.__lpIdeaSoftRefresh?.();
          } catch (_) {}
        } else if (targetTabId === "home") {
          void refreshHomeDesktopDashboardAfterEnter();
        } else if (
          targetTabId === "health" ||
          targetTabId === "happiness" ||
          targetTabId === "sideincome"
        ) {
          kpiSoftRefreshAfterPull(targetTabId, pullResult);
        } else if (targetTabId === "time") {
          clearLpTabPullPending(targetTabId);
          try {
            window.__lpTimeLedgerSoftRefresh?.();
          } catch (_) {}
        } else if (targetTabId === "habittracker") {
          try {
            window.__lpHabitTrackerSoftRefresh?.();
          } catch (_) {}
        } else {
          renderMain(main, { force: true, skipTodoSaveBeforeUnmount: true });
        }
        afterLpTabPaint(() => {
          void prefetchIconsForTab(targetTabId);
        });
          } finally {
            if (tabPullOverlayTabId) {
              clearLpTabPullOverlay(tabPullOverlayTabId);
            }
          }
        })();
      })();
    };
    if (tabId === "home") {
      runTabSwitch();
    } else {
      _tabSwitchTimer = setTimeout(runTabSwitch, 24);
    }
  }

  function bindHomeMenuLauncherAdminBtn(root) {
    launcherAdminBtn = root.querySelector(".app-home-menu-launcher-admin-fab");
  }

  function renderHomeMenuLauncher() {
    /* 탭 이탈 시 패널에서만 떼어 둠 — isConnected 아니어도 재사용(재생성 지연 방지) */
    if (homeMenuLauncherEl) {
      bindHomeMenuLauncherAdminBtn(homeMenuLauncherEl);
      void syncAdminMenuVisibility();
      return homeMenuLauncherEl;
    }

    launcherAdminBtn = null;

    const root = document.createElement("div");
    root.className = "app-home-menu-launcher";

    const topBar = document.createElement("div");
    topBar.className = "app-home-menu-launcher-topbar";

    const accountBtn = document.createElement("button");
    accountBtn.type = "button";
    accountBtn.className = "app-home-menu-launcher-account-btn";
    accountBtn.title = "나의 계정";
    accountBtn.setAttribute("aria-label", "나의 계정");
    const accountIconWrap = document.createElement("span");
    accountIconWrap.className = "app-home-menu-launcher-account-icon-wrap";
    accountIconWrap.setAttribute("aria-hidden", "true");
    const accountImg = document.createElement("img");
    accountImg.className = "app-home-menu-launcher-account-img";
    accountImg.src = withToolbarIconCacheVersion(HOME_MENU_ACCOUNT_ICON);
    accountImg.alt = "";
    applyStaticAppIconImg(accountImg);
    accountIconWrap.appendChild(accountImg);
    const accountLabel = document.createElement("span");
    accountLabel.className = "app-home-menu-launcher-account-label";
    accountLabel.textContent = "나의 계정";
    accountBtn.append(accountIconWrap, accountLabel);
    accountBtn.addEventListener("click", () => openAppTabFromHome("idea"));
    topBar.appendChild(accountBtn);

    const card = document.createElement("div");
    card.className = "app-home-menu-launcher-card";

    const body = document.createElement("div");
    body.className = "app-home-menu-launcher-body";

    function navButtonFromTab(tab) {
      const menuLabel = homeMenuLabelForTab(tab);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-home-menu-launcher-btn";
      btn.dataset.tabId = tab.id;
      btn.title = menuLabel;
      btn.setAttribute("aria-label", menuLabel);

      const iconWrap = document.createElement("span");
      iconWrap.className = "app-home-menu-launcher-icon";
      iconWrap.setAttribute("aria-hidden", "true");
      const img = document.createElement("img");
      img.className = "app-home-menu-launcher-grid-img";
      img.src = withToolbarIconCacheVersion(
        HOME_MENU_ICON[tab.id] ?? tab.iconDesktop ?? tab.icon,
      );
      img.alt = "";
      applyStaticAppIconImg(img);
      iconWrap.appendChild(img);

      const label = document.createElement("span");
      label.className = "app-home-menu-launcher-label";
      label.textContent = menuLabel;

      btn.append(iconWrap, label);
      btn.addEventListener("click", () => openAppTabFromHome(tab.id));
      return btn;
    }

    const brand = document.createElement("div");
    brand.className = "app-home-menu-launcher-brand";
    const brandRow = document.createElement("div");
    brandRow.className = "app-home-menu-launcher-brand-row";
    const logoShell = document.createElement("div");
    logoShell.className = "app-home-menu-launcher-logo-float-shell";
    const logoImg = document.createElement("img");
    logoImg.className = "app-home-menu-launcher-logo";
    logoImg.src = loginBrandLogoUrl();
    logoImg.alt = "";
    logoImg.setAttribute("aria-hidden", "true");
    applyStaticAppIconImg(logoImg);
    logoShell.appendChild(logoImg);
    const brandTitle = document.createElement("h1");
    brandTitle.className = "app-home-menu-launcher-title";
    brandTitle.textContent = "두들";
    brandRow.append(logoShell, brandTitle);
    const brandSub = document.createElement("p");
    brandSub.className = "app-home-menu-launcher-brand-sub";
    brandSub.textContent = "나를 위한 모든 '행동'들";
    brand.append(brandRow, brandSub);

    const grid = document.createElement("div");
    grid.className = "app-home-menu-launcher-section-grid";
    HOME_MENU_TAB_ORDER.forEach((tid) => {
      const tab = tabMetaById(tid);
      if (tab) grid.appendChild(navButtonFromTab(tab));
    });
    body.append(brand, grid);

    launcherAdminBtn = document.createElement("button");
    launcherAdminBtn.type = "button";
    launcherAdminBtn.className = "app-home-menu-launcher-admin-fab";
    launcherAdminBtn.hidden = true;
    launcherAdminBtn.title = "관리자전용";
    launcherAdminBtn.setAttribute("aria-label", "관리자 전용");
    launcherAdminBtn.textContent = "관리";
    launcherAdminBtn.addEventListener("click", () => setActiveTab("admin"));

    void syncAdminMenuVisibility();

    card.appendChild(body);
    root.append(topBar, card, launcherAdminBtn);
    homeMenuLauncherEl = root;
    bindHomeMenuLauncherAdminBtn(root);
    return root;
  }

  document.addEventListener("app-switch-tab", (e) => {
    const tabId = e.detail?.tabId;
    if (tabId) setActiveTab(tabId);
  });

  /** 입력·모달 포커스 중에는 전체 탭 갱신을 미룸 — 포커스가 빠진 뒤 한 번 더 시도 */
  let _pendingDeferredRender = null;
  let _deferredRenderListenersAttached = false;

  function clearDeferredRenderMain() {
    _pendingDeferredRender = null;
    if (!_deferredRenderListenersAttached) return;
    _deferredRenderListenersAttached = false;
    document.removeEventListener("focusout", _onDeferredFlush, true);
    document.removeEventListener("pointerdown", _onDeferredFlush, true);
  }

  function isFocusBlockingRender(mainEl) {
    /* 근무표 모달은 body에만 붙음. 네이티브 <select> 펼칠 때 포커스가 다이얼로그 밖으로 나가
     * isFocusBlockingRender 가 false가 되어 지연된 renderMain 이 돌면 월별보기가 오늘 달로 초기화될 수 있음 */
    try {
      if (
        document.querySelector(
          "body > .work-schedule-day-entry-modal[role='dialog']",
        )
      )
        return true;
      if (
        document.querySelector(
          "body > .work-schedule-type-settings-modal[role='dialog']",
        )
      )
        return true;
    } catch (_) {}
    const a = document.activeElement;
    if (!a || a === document.body) return false;
    if (a.closest?.("dialog[open]")) return true;
    const dlg = a.closest?.('[role="dialog"]');
    if (dlg && dlg.getAttribute("aria-hidden") !== "true") return true;
    const panel = mainEl?.querySelector(".app-tab-panel");
    if (
      panel &&
      panel.contains(a) &&
      typeof a.matches === "function" &&
      a.matches("input, textarea, select, [contenteditable='true']")
    ) {
      return true;
    }
    return false;
  }

  function _tryFlushDeferredRender() {
    if (!_pendingDeferredRender) return;
    const { mainEl, opts } = _pendingDeferredRender;
    if (isFocusBlockingRender(mainEl)) return;
    clearDeferredRenderMain();
    logLpRender("App:deferredRender·포커스 해제 후 실행", { opts });
    renderMain(mainEl, { ...opts, force: false });
  }

  function _onDeferredFlush() {
    queueMicrotask(() => _tryFlushDeferredRender());
  }

  function scheduleDeferredRenderMain(mainEl, opts) {
    logLpRender("App:deferredRender·예약(입력 중이라 나중에)", { opts });
    _pendingDeferredRender = { mainEl, opts };
    if (_deferredRenderListenersAttached) return;
    _deferredRenderListenersAttached = true;
    document.addEventListener("focusout", _onDeferredFlush, true);
    document.addEventListener("pointerdown", _onDeferredFlush, true);
  }

  /**
   * @param {HTMLElement} mainEl
   * @param {{ skipTodoSaveBeforeUnmount?: boolean, force?: boolean }} [opts]
   * - skipTodoSaveBeforeUnmount: 저장소를 이미 갱신한 뒤(예: 완료 일괄 제거) DOM이 옛 상태일 때 true.
   *   그렇지 않으면 save가 DOM을 다시 저장해 퍼지 결과를 덮어쓴다.
   * - force: true일 때만 입력 중이어도 탭을 다시 그림(메뉴·코드 등으로 화면 전환 시).
   */
  function renderMain(mainEl, opts = {}) {
    logLpRenderStack("renderMain 진입", { tab: currentTabId, opts });
    /* 근무표 등록/유형설정 모달은 body 직하위 — force:true(탭 전환 등)여도 여기서 통째로 지우면 월별보기 달이 초기화됨 */
    let wsBodyModal = null;
    try {
      wsBodyModal =
        document.querySelector(
          "body > .work-schedule-day-entry-modal[role='dialog']",
        ) ||
        document.querySelector(
          "body > .work-schedule-type-settings-modal[role='dialog']",
        );
    } catch (_) {}
    if (opts.force && wsBodyModal) {
      scheduleDeferredRenderMain(mainEl, { ...opts, force: false });
      return;
    }
    if (!opts.force) {
      if (isFocusBlockingRender(mainEl)) {
        scheduleDeferredRenderMain(mainEl, opts);
        return;
      }
    }
    clearDeferredRenderMain();
    const p = mainEl?.querySelector(".app-tab-panel");
    if (!p) return;
    /* 같은 탭만 내용 다시 그릴 때(할일 sync 등): 통째로 비우면 .app-main 스크롤이 0으로 돌아가는 문제 방지.
     * 탭 전환은 setActiveTab → force:true 로 오므로 여기서는 저장하지 않음 */
    let preserveScrollTop = null;
    if (!opts.force && mainEl && typeof mainEl.scrollTop === "number") {
      preserveScrollTop = mainEl.scrollTop;
    }
    if (!opts.skipTodoSaveBeforeUnmount) {
      saveTodoListBeforeUnmount(p);
    }
    dismissCalendarDayExpandUI();
    const prevRoot = p.firstElementChild;
    /* 홈 3분할은 재사용 — 떠날 때 abort/폐기하지 않음 */
    const leavingCachedHomeDashboard =
      !!prevRoot &&
      !!desktopDashboardEl &&
      prevRoot === desktopDashboardEl &&
      currentTabId !== "home";
    if (prevRoot?._lpTabAbortController && !leavingCachedHomeDashboard) {
      try {
        prevRoot._lpTabAbortController.abort();
      } catch (_) {}
      prevRoot._lpTabAbortController = null;
    }
    launcherAdminBtn = null;
    clearAppFooterActions();
    const tabRenderer = RENDERERS[currentTabId];
    /** @type {Node[]} */
    let mountNodes;
    try {
      if (currentTabId === "home") {
        if (isDesktopDashboardViewport()) {
          homeMenuLauncherEl = null;
          if (desktopDashboardEl) {
            void syncAdminMenuVisibility();
            mountNodes = [desktopDashboardEl];
          } else {
            desktopDashboardEl = renderDesktopDashboard({
              navigateToTab: openAppTabFromHome,
              accountIconSrc: HOME_MENU_ACCOUNT_ICON,
              onBrandRefresh: () => refreshHomeFromBrandClick(),
            });
            mountNodes = [desktopDashboardEl];
          }
        } else {
          desktopDashboardEl = null;
          const content = renderHomeMenuLauncher();
          mountNodes = content ? [content] : [];
        }
      } else if (tabRenderer) {
        const content = tabRenderer();
        mountNodes = content ? [content] : [];
      } else {
        const div = document.createElement("p");
        div.textContent =
          currentTabId === "admin"
            ? "관리자전용"
            : TABS.find((t) => t.id === currentTabId)?.label || "준비 중";
        mountNodes = [div];
      }
    } catch (err) {
      const errDiv = document.createElement("div");
      errDiv.className = "app-render-error";
      errDiv.style.cssText = "padding:1.5rem;color:#b91c1c;";
      errDiv.innerHTML = `<p><strong>${currentTabId === "admin" ? "관리자전용" : TABS.find((t) => t.id === currentTabId)?.label || currentTabId} 로드 중 오류</strong></p><p>${String(err?.message || err)}</p>`;
      mountNodes = [errDiv];
    }
    p.replaceChildren(...mountNodes);
    try {
      if (
        currentTabId !== "home" &&
        tabRenderer &&
        window.matchMedia("(max-width: 46rem)").matches
      ) {
        initDatePickersIn(p);
      }
    } catch (_) {}
    if (preserveScrollTop != null && mainEl) {
      const y = preserveScrollTop;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            const max = Math.max(0, mainEl.scrollHeight - mainEl.clientHeight);
            mainEl.scrollTop = Math.max(0, Math.min(y, max));
          } catch (_) {}
        });
      });
    }
    syncAppFooterVisibility();
    /* 본문 replaceChildren 직후 — 푸터 맞춤(탭 클릭 즉시 바꾸면 깜빡임) */
  }

  window.__lpRenderMain = (opts) => renderMain(main, opts || {});
  window.__lpSetTab = (tabId) => setActiveTab(tabId);

  try {
    const desktopDashboardMq = window.matchMedia(DESKTOP_DASHBOARD_MQ);
    desktopDashboardMq.addEventListener("change", () => {
      if (currentTabId !== "home") return;
      homeMenuLauncherEl = null;
      desktopDashboardEl = null;
      renderMain(main, { force: true, skipTodoSaveBeforeUnmount: true });
    });
  } catch (_) {}

  initSupabaseRealtimeSync({
    getCurrentTabId: () => currentTabId,
    renderMain: (opts) => renderMain(main, opts || {}),
    refreshDesktopDashboardFromRealtime: async () => {
      if (currentTabId !== "home" || !isDesktopDashboardViewport()) {
        return false;
      }
      const root =
        desktopDashboardEl?.isConnected && desktopDashboardEl
          ? desktopDashboardEl
          : main.querySelector(".lp-desktop-dashboard");
      if (!root?.isConnected) return false;
      try {
        await pullDesktopDashboardData();
      } catch (_) {
        return false;
      }
      if (currentTabId !== "home") return false;
      const liveRoot =
        desktopDashboardEl?.isConnected && desktopDashboardEl
          ? desktopDashboardEl
          : main.querySelector(".lp-desktop-dashboard");
      if (!liveRoot?.isConnected) return false;
      runDesktopDashboardSoftRefresh(liveRoot);
      return true;
    },
  });
  if (supabase?.auth?.onAuthStateChange) {
    supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        await syncAdminMenuVisibility();
        if (currentTabId === "admin" && !isAppAdminUser(session?.user)) {
          applySetActiveTab("home");
        }
      })();
    });
  }
  void syncAdminMenuVisibility();
  if (typeof window !== "undefined") {
    window.__lpSyncWatchHelp = printSyncWatchHelp;
    window.__lpShowServerTasks = (names) =>
      import("./utils/timeLedgerTasksSupabase.js").then((m) =>
        m.fetchServerTimeLedgerTasksForDebug({
          names: names == null ? [] : Array.isArray(names) ? names : [names],
        }),
      );
    window.__lpCompareServerTasks = (names) =>
      import("./utils/timeLedgerTasksSupabase.js").then((m) =>
        m.debugCompareServerAndLocalTasks(
          names == null ? [] : Array.isArray(names) ? names : [names],
        ),
      );
  }

  /* 서버 pull: 탭 전환·부팅·홈 Realtime + (실험) 시간기록·플래너 화면 복귀 pull */
  initLpTabResumeCloudPull(() => currentTabId);

  logTabSync("boot", { tab: currentTabId, phase: "render_local_then_pull" });
  appScreen.appendChild(main);
  appScreen.appendChild(footerNav);
  appPage.appendChild(appScreen);
  container.appendChild(appPage);
  const bootTabIdForRender = currentTabId;
  if (bootTabIdForRender === "time") {
    try {
      resetTimeLedgerSessionFilterToToday();
    } catch (_) {}
  }
  renderMain(main);
  /*
   * 로컬 화면을 그린 뒤 바로 스플래시 해제.
   * 서버 pull은 뒤에서 이어가고, 끝나면 soft refresh로만 반영한다.
   * (예전: pull 끝날 때까지 스플래시를 붙잡아 복귀·재실행 시 수 초 대기)
   */
  finishAppBootReady();
  void (async () => {
    const bootTabId = currentTabId;
    try {
      if (bootTabId === "schedulecalendar") {
        try {
          window.__lpCalendarGridPrefetchedForTabSwitch = true;
        } catch (_) {}
      }

      await ensureTimeLedgerStorageReady();

      if (bootTabId === "home") {
        try {
          await refreshHomeDesktopDashboardAfterEnter({ forceTaskList: true });
        } catch (_) {}
        return;
      }

      let pullResult;
      try {
        const [, pr] = await Promise.all([
          syncAdminMenuVisibility(),
          pullDataForActiveTab(bootTabId, { fromBoot: true }),
        ]);
        pullResult = pr;
      } catch (_) {}
      if (currentTabId !== bootTabId) {
        try {
          window.__lpCalendarGridPrefetchedForTabSwitch = false;
        } catch (_) {}
        if (bootTabId === "home" || bootTabId === "time") {
          clearLpTabPullPending(bootTabId);
        }
        if (isKpiAppTabId(bootTabId)) clearKpiTabPullPending(bootTabId);
        return;
      }
      if (bootTabId === "time") {
        clearLpTabPullPending("time");
        try {
          window.__lpTimeLedgerSoftRefresh?.();
        } catch (_) {}
      } else if (bootTabId === "schedulecalendar") {
        try {
          window.__lpCalendarSoftRefresh?.();
        } catch (_) {}
      } else if (bootTabId === "idea") {
        try {
          window.__lpIdeaSoftRefresh?.();
        } catch (_) {}
      } else if (
        bootTabId === "health" ||
        bootTabId === "happiness" ||
        bootTabId === "sideincome"
      ) {
        kpiSoftRefreshAfterPull(bootTabId, pullResult);
      } else if (bootTabId === "habittracker") {
        try {
          window.__lpHabitTrackerSoftRefresh?.();
        } catch (_) {}
      } else {
        renderMain(main, { force: true, skipTodoSaveBeforeUnmount: true });
      }
      if (bootTabId === "idea" || bootTabId === "admin" || bootTabId === "home") {
        requestAnimationFrame(() => {
          main.scrollTop = 0;
        });
      }
      void prefetchIconsForTab(bootTabId);
    } catch (_) {
      /* pull 실패해도 로컬 화면은 이미 표시된 상태 */
    }
  })();
  if (window.matchMedia("(max-width: 46rem)").matches) {
    initMobileVisualViewportKeyboardInset();
  }
  syncLpAppShellViewportHeight();
  requestAnimationFrame(() => {
    syncLpAppShellViewportHeight();
  });
  if (!window.matchMedia("(max-width: 46rem)").matches) {
    observeDatePickerInit(panel);
  }
  try {
    window.__lpTabSyncCounts = getTabSyncCounts;
  } catch (_) {}
  initDomPulseDebug();
}
