import { applyStaticAppIconImg } from "./utils/staticAppIconImg.js";
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
import { supabase } from "./supabase.js";
import { getSupabaseSession } from "./utils/supabaseSession.js";
import { isAppAdminUser } from "./utils/adminAccess.js";
import { showToast } from "./utils/showToast.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  clearAppFooterActions,
} from "./utils/appFooterShell.js";
import { pullCalendarSectionTasksFromSupabase } from "./utils/todoSectionTasksSupabase.js";
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
import { pullKpiTabFromCloud } from "./utils/kpiTabCloudRefresh.js";
import {
  clearKpiTabPullPending,
  isKpiAppTabId,
  setKpiTabPullPending,
} from "./utils/kpiMapSyncLoadingUi.js";
import { pullTimeLedgerTabEnterFromCloud } from "./utils/timeLedgerCloudRefresh.js";
import { attachTimeLedgerTasksSaveListener } from "./utils/timeLedgerTasksSupabase.js";
import {
  getFullTaskOptions,
  saveLedgerTaskList,
} from "./utils/timeTaskOptionsModel.js";
import {
  pullTimeDailyBudgetForDateRange,
  flushAllPendingTimeDailyBudgetSync,
} from "./utils/timeDailyBudgetSupabase.js";
import { pullUserPrefsFromSupabase } from "./utils/userHourlySync.js";
import { initSupabaseRealtimeSync } from "./utils/supabaseRealtimeSync.js";
import { printSyncWatchHelp } from "./utils/syncWatchLog.js";
import { getTabSyncCounts, logTabSync } from "./utils/lpTabSyncDebug.js";
import { logLpRender, logLpRenderStack } from "./utils/lpRenderDebugLog.js";
import { initDomPulseDebug } from "./utils/domPulseDebug.js";
import { initMobileVisualViewportKeyboardInset } from "./utils/mobileViewportKeyboard.js";
import { syncLpAppShellViewportHeight } from "./utils/lpAppShellViewport.js";
import { logTodoScheduleTabOnNavigate } from "./utils/lpTabDataSourceLog.js";
import { ensureTimeLedgerStorageReady } from "./utils/timeLedgerEntriesModel.js";
import { afterLpTabPaint } from "./utils/lpAppLoading.js";
import { prefetchIconsForTab } from "./utils/appIconPrefetch.js";
import {
  setLpTabPullPending,
  clearLpTabPullPending,
} from "./utils/lpTabSyncLoadingUi.js";

/** 상위 탭 메타(아이콘·메뉴 런처 구역 순서) */
const TABS = [
  {
    id: "home",
    label: "오늘",
    icon: "/toolbaricons/dashboard.svg",
    sidebarSection: "main",
    sidebarOrder: 0,
  },
  {
    id: "time",
    label: "시간가계부",
    mobileLabel: "시간",
    icon: "/toolbaricons/menu-time.png",
    sidebarSection: "main",
    sidebarOrder: 0,
  },
  {
    id: "schedulecalendar",
    label: "일정",
    mobileLabel: "일정",
    /** 홈 메뉴 그리드 표시명 */
    homeMenuLabel: "캘린더",
    icon: "/toolbaricons/menu-schedule.png",
    sidebarSection: "main",
    sidebarOrder: 2,
  },
  {
    id: "dream",
    label: "꿈",
    icon: "/toolbaricons/menu-dream.png",
    sidebarSection: "bucket",
    sidebarOrder: 0,
  },
  {
    id: "sideincome",
    label: "부수입",
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
  "dream",
  "sideincome",
  "health",
  "happiness",
  "idea",
];

/** 홈 정사각형 타일 전용 아이콘(사이드바·푸터는 TABS.icon 유지) */
const HOME_MENU_ICON = {
  time: "/toolbaricons/menu-home/time-new.svg",
  schedulecalendar: "/toolbaricons/menu-home/calendar-new.svg",
  dream: "/toolbaricons/menu-home/dream-new.svg",
  sideincome: "/toolbaricons/menu-home/sideincome-new.svg",
  health: "/toolbaricons/menu-home/health-new.svg",
  happiness: "/toolbaricons/menu-home/happiness-new.svg",
  idea: "/toolbaricons/menu-home/account-new.svg",
};

const HOME_MENU_LOGO = "/toolbaricons/menu-home/mainlogo-otter-new.svg";

function tabMetaById(tabId) {
  if (tabId === "idea") {
    return {
      id: "idea",
      label: "나의 계정",
      icon: "/toolbaricons/menu-account.png",
    };
  }
  return TABS.find((t) => t.id === tabId);
}

const RENDERERS = {
  time: renderTime,
  schedulecalendar: renderMobileScheduleCalendar,
  dream: renderDream,
  sideincome: renderSideincome,
  happiness: renderHappiness,
  health: renderHealth,
  idea: renderIdea,
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
  return new Set([...TABS.map((t) => t.id), "idea", "admin"]);
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

/** KPI 탭: pull·동기화 완료 후 화면 갱신 */
function kpiSoftRefreshIfPullChanged(tabId, pullResult) {
  if (!pullResult?.pullOk && !pullResult?.localChanged) return;
  try {
    if (tabId === "dream") window.__lpDreamSoftRefresh?.();
    else if (tabId === "health") window.__lpHealthSoftRefresh?.();
    else if (tabId === "happiness") window.__lpHappinessSoftRefresh?.();
    else if (tabId === "sideincome") window.__lpSideincomeSoftRefresh?.();
  } catch (_) {}
}

/**
 * 탭 진입(클릭·부팅 시 해당 탭) 시에만 서버 pull — 다른 탭 데이터는 가져오지 않음.
 * 시간가계부 **과제 목록**(time_ledger_tasks): `time` 탭 진입 + Time.js 과제설정/기록 모달, 캘린더 1일 뷰 등 해당 화면만.
 */
async function pullDataForActiveTab(tabId, opts = {}) {
  void opts;
  switch (tabId) {
    case "schedulecalendar": {
      const yEnd = timeLedgerLocalTodayYmd();
      const yStart = timeLedgerLocalYesterdayYmd();
      await Promise.all([
        pullCalendarSectionTasksFromSupabase({
          reason: `app_setActiveTab_${tabId}`,
        }),
        pullCalendarDayIconsFromSupabase({
          reason: `app_setActiveTab_${tabId}`,
        }),
        pullTimeLedgerEntriesForDateRange(yStart, yEnd),
        pullTimeDailyBudgetForDateRange(yStart, yEnd),
      ]);
      break;
    }
    case "time":
      /* 기록 탭 날짜는 메뉴 전환 직전 `resetTimeLedgerSessionFilterToToday` 로 맞춤. pull 은 그 구간 기준 */
      await pullTimeLedgerTabEnterFromCloud();
      break;
    case "dream":
    case "health":
    case "happiness":
    case "sideincome":
      return await pullKpiTabFromCloud(tabId);
    case "idea":
      await pullUserPrefsFromSupabase().catch(() => {});
      break;
    case "admin":
      break;
    default:
      break;
  }
}

const ROUTINE_REMOVED_KEY = "app-routine-removed-v1";

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

  const main = document.createElement("main");
  main.className = "app-main";

  const panel = document.createElement("div");
  panel.className = "app-tab-panel";
  main.appendChild(panel);

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
      if (currentTabId === "dream" && window.__lpDreamFooterBack?.()) return;
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
    footerBack.title = "오늘(메인)으로";
    footerBack.setAttribute("aria-label", "오늘(메인)으로");
  }

  function applySetActiveTab(tabId) {
    const fromTab = currentTabId;
    if (fromTab !== tabId) flushAllPendingTimeDailyBudgetSync();
    if (
      tabId !== "dream" &&
      tabId !== "health" &&
      tabId !== "happiness" &&
      tabId !== "sideincome"
    ) {
      resetAppFooterBackLabel();
    }
    currentTabId = tabId;
    persistActiveTabId(tabId);
    logTodoScheduleTabOnNavigate(tabId, fromTab);
    logTabSync("tab_switch", { from: fromTab, to: tabId });
    /* 렌더·pull은 빠른 연속 탭 전환 시 마지막 탭만 처리하도록 짧게 디바운스 */
    if (_tabSwitchTimer != null) clearTimeout(_tabSwitchTimer);
    _tabSwitchTimer = setTimeout(() => {
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
            window.__lpCalendarGridPrefetchedForTabSwitch = true;
          } catch (_) {}
        }
        const pullPromise = pullDataForActiveTab(targetTabId, { fromBoot: false });
        if (targetTabId === "home") {
          const panelEl = main.querySelector(".app-tab-panel");
          if (
            panelEl &&
            homeMenuLauncherEl &&
            panelEl.firstElementChild === homeMenuLauncherEl
          ) {
            syncAppFooterVisibility();
            void syncAdminMenuVisibility();
            return;
          }
        }
        renderMain(main, { force: true, skipTodoSaveBeforeUnmount: true });
        syncAppFooterVisibility();
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
            pullResult = await pullPromise;
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
          try {
            await syncAdminMenuVisibility();
          } catch (_) {}
        } else if (
          targetTabId === "dream" ||
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
        } else {
          renderMain(main, { force: true, skipTodoSaveBeforeUnmount: true });
        }
        afterLpTabPaint(() => {
          void prefetchIconsForTab(targetTabId);
        });
        })();
      })();
    }, 24);
  }

  function appendLauncherIcon(btn, iconSrc) {
    const iconWrap = document.createElement("span");
    iconWrap.className = "app-home-menu-launcher-icon";
    const img = document.createElement("img");
    img.src = iconSrc;
    img.alt = "";
    img.width = 30;
    img.height = 30;
    applyStaticAppIconImg(img);
    iconWrap.appendChild(img);
    btn.appendChild(iconWrap);
  }

  function bindHomeMenuLauncherAdminBtn(root) {
    launcherAdminBtn = root.querySelector(".app-home-menu-launcher-admin-fab");
  }

  function renderHomeMenuLauncher() {
    if (homeMenuLauncherEl?.isConnected) {
      bindHomeMenuLauncherAdminBtn(homeMenuLauncherEl);
      void syncAdminMenuVisibility();
      return homeMenuLauncherEl;
    }
    homeMenuLauncherEl = null;

    launcherAdminBtn = null;

    const root = document.createElement("div");
    root.className = "app-home-menu-launcher";

    const card = document.createElement("div");
    card.className = "app-home-menu-launcher-card";

    const body = document.createElement("div");
    body.className = "app-home-menu-launcher-body";

    const brand = document.createElement("div");
    brand.className = "app-home-menu-launcher-brand";
    const logoShell = document.createElement("div");
    logoShell.className = "app-home-menu-launcher-logo-float-shell";
    const logo = document.createElement("img");
    logo.className = "app-home-menu-launcher-logo";
    logo.src = HOME_MENU_LOGO;
    logo.alt = "";
    logo.width = 256;
    logo.height = 256;
    applyStaticAppIconImg(logo);
    logoShell.appendChild(logo);
    brand.appendChild(logoShell);

    function navButtonFromTab(tab) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "app-home-menu-launcher-btn";
      if (tab.id === "idea") {
        btn.classList.add("app-home-menu-launcher-btn--muted");
      }
      btn.dataset.tabId = tab.id;
      btn.title = tab.label;
      const iconSrc =
        HOME_MENU_ICON[tab.id] ?? tab.iconDesktop ?? tab.icon;
      appendLauncherIcon(btn, iconSrc);
      const labelSpan = document.createElement("span");
      labelSpan.className = "app-home-menu-launcher-label";
      labelSpan.textContent = tab.homeMenuLabel ?? tab.label;
      btn.appendChild(labelSpan);
      btn.addEventListener("click", () => setActiveTab(tab.id));
      return btn;
    }

    const list = document.createElement("div");
    list.className = "app-home-menu-launcher-section-list";
    HOME_MENU_TAB_ORDER.forEach((tid) => {
      const tab = tabMetaById(tid);
      if (tab) list.appendChild(navButtonFromTab(tab));
    });
    body.appendChild(list);

    launcherAdminBtn = document.createElement("button");
    launcherAdminBtn.type = "button";
    launcherAdminBtn.className = "app-home-menu-launcher-admin-fab";
    launcherAdminBtn.hidden = true;
    launcherAdminBtn.title = "관리자전용";
    launcherAdminBtn.setAttribute("aria-label", "관리자 전용");
    launcherAdminBtn.textContent = "관리";
    launcherAdminBtn.addEventListener("click", () => setActiveTab("admin"));

    void syncAdminMenuVisibility();

    card.appendChild(brand);
    card.appendChild(body);
    root.append(card, launcherAdminBtn);
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
    if (prevRoot?._lpTabAbortController) {
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
        const content = renderHomeMenuLauncher();
        mountNodes = content ? [content] : [];
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
        window.matchMedia("(max-width: 48rem)").matches
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

  initSupabaseRealtimeSync({
    getCurrentTabId: () => currentTabId,
    renderMain: (opts) => renderMain(main, opts || {}),
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
  }

  /* 서버 pull 은 상위 탭 전환(setActiveTab)·최초 진입 시에만 수행. 포커스 복귀 등에서는 pull 하지 않음. */

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
          await syncAdminMenuVisibility();
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
        bootTabId === "dream" ||
        bootTabId === "health" ||
        bootTabId === "happiness" ||
        bootTabId === "sideincome"
      ) {
        kpiSoftRefreshAfterPull(bootTabId, pullResult);
      } else {
        renderMain(main, { force: true, skipTodoSaveBeforeUnmount: true });
      }
      if (bootTabId === "idea" || bootTabId === "admin" || bootTabId === "home") {
        requestAnimationFrame(() => {
          main.scrollTop = 0;
        });
      }
      void prefetchIconsForTab(bootTabId);
    } finally {
      finishAppBootReady();
    }
  })();
  if (window.matchMedia("(max-width: 48rem)").matches) {
    initMobileVisualViewportKeyboardInset();
  }
  syncLpAppShellViewportHeight();
  requestAnimationFrame(() => {
    syncLpAppShellViewportHeight();
  });
  if (!window.matchMedia("(max-width: 48rem)").matches) {
    observeDatePickerInit(panel);
  }
  try {
    window.__lpTabSyncCounts = getTabSyncCounts;
  } catch (_) {}
  initDomPulseDebug();
}
