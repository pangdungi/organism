import { signOut } from "./auth.js";
import { observeDatePickerInit, initDatePickersIn } from "./utils/datePickerInit.js";
import { getRoutineSyncedTaskNames } from "./utils/routineTimeSync.js";
import {
  render as renderCalendar,
  renderMobileScheduleCalendar,
} from "./views/Calendar.js";
import { saveTodoListBeforeUnmount } from "./views/TodoList.js";
import { render as renderTime } from "./views/Time.js";
import { render as renderWorkSchedule } from "./views/WorkSchedule.js";
import { render as renderAsset } from "./views/Asset.js";
import { render as renderDream } from "./views/Dream.js";
import { render as renderSideincome } from "./views/Sideincome.js";
import { render as renderHappiness } from "./views/Happiness.js";
import { render as renderHealth } from "./views/Health.js";
import { render as renderArchive } from "./views/Archive.js";
import { render as renderDiary } from "./views/Diary.js";
import { render as renderIdea } from "./views/Idea.js";
import { render as renderHome } from "./views/Home.js";
import { pullCalendarSectionTasksFromSupabase } from "./utils/todoSectionTasksSupabase.js";
import { attachAssetExpenseTransactionsSaveListener } from "./utils/assetExpenseTransactionsSupabase.js";
import { initPushReminderInAppPopup } from "./utils/initPushReminderInAppPopup.js";
import {
  attachHealthKpiMapSaveListener,
} from "./utils/healthKpiMapSupabase.js";
import {
  attachHappinessKpiMapSaveListener,
} from "./utils/happinessKpiMapSupabase.js";
import {
  attachDreamKpiMapSaveListener,
} from "./utils/dreamKpiMapSupabase.js";
import {
  attachSideincomeKpiMapSaveListener,
} from "./utils/sideincomeKpiMapSupabase.js";
import {
  attachTimeLedgerEntriesSaveListener,
  pullTimeLedgerEntriesForDateRange,
  resetTimeLedgerSessionFilterToToday,
  timeLedgerLocalTodayYmd,
} from "./utils/timeLedgerEntriesSupabase.js";
import { pullKpiTabFromCloud } from "./utils/kpiTabCloudRefresh.js";
import { pullTimeLedgerTabEnterFromCloud } from "./utils/timeLedgerCloudRefresh.js";
import { pullTimeLedgerTasksFromSupabase } from "./utils/timeLedgerTasksSupabase.js";
import { pullTimeDailyBudgetFromSupabase } from "./utils/timeDailyBudgetSupabase.js";
import { pullAllAssetFromCloud } from "./utils/assetCloudRefresh.js";
import { pullAllDiaryFromCloud } from "./utils/diaryCloudRefresh.js";
import { pullUserPrefsFromSupabase } from "./utils/userHourlySync.js";
import { initSupabaseRealtimeSync } from "./utils/supabaseRealtimeSync.js";
import { printSyncWatchHelp } from "./utils/syncWatchLog.js";
import { getTabSyncCounts, logTabSync } from "./utils/lpTabSyncDebug.js";
import { hydrateWorkScheduleFromCloud } from "./utils/workScheduleSupabase.js";
import { logLpRender, logLpRenderStack } from "./utils/lpRenderDebugLog.js";
import { initDomPulseDebug } from "./utils/domPulseDebug.js";
import { initMobileVisualViewportKeyboardInset } from "./utils/mobileViewportKeyboard.js";
import { logTodoScheduleTabOnNavigate } from "./utils/lpTabDataSourceLog.js";

const TABS = [
  { id: "home", label: "오늘", icon: "/toolbaricons/dashboard.svg" },
  { id: "dream", label: "꿈", icon: "/toolbaricons/star.svg" },
  { id: "sideincome", label: "부수입", icon: "/toolbaricons/money-circle.svg" },
  { id: "happiness", label: "행복", icon: "/toolbaricons/plug-electric.svg" },
  { id: "health", label: "건강", icon: "/toolbaricons/heart-rate.svg" },
  {
    id: "calendar",
    label: "할일/일정",
    mobileLabel: "할일",
    /** 모바일 하단·데스크톱 사이드바 동일 — 할일 목록 아이콘 */
    icon: "/toolbaricons/todolist.svg",
  },
  {
    id: "schedulecalendar",
    label: "캘린더",
    mobileLabel: "캘린더",
    icon: "/toolbaricons/calendar-heart1.svg",
  },
  { id: "time", label: "시간가계부", mobileLabel: "시간", icon: "/toolbaricons/timer.svg" },
  { id: "asset", label: "자산관리", mobileLabel: "자산", icon: "/toolbaricons/wallet.svg" },
  {
    id: "workschedule",
    label: "근무표",
    mobileLabel: "근무표",
    icon: "/toolbaricons/calendar-heart1.svg",
  },
  { id: "diary", label: "감정일기", mobileLabel: "감정일기", icon: "/toolbaricons/chat-bubbles.svg" },
  { id: "archive", label: "아카이브", icon: "/toolbaricons/harddrive.svg" },
];

const RENDERERS = {
  home: renderHome,
  calendar: renderCalendar,
  time: renderTime,
  workschedule: () =>
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 48rem)").matches
      ? renderWorkSchedule({ mobile: true })
      : renderWorkSchedule(),
  schedulecalendar: renderMobileScheduleCalendar,
  asset: renderAsset,
  dream: renderDream,
  sideincome: renderSideincome,
  happiness: renderHappiness,
  health: renderHealth,
  archive: renderArchive,
  diary: renderDiary,
  idea: renderIdea,
};

let currentTabId = "home";

/** 세션 유지 중 마지막으로 보던 탭(새로고침·PWA 재진입 시 복원). 로그아웃 시 main.js 에서 제거 */
export const LP_LAST_TAB_SESSION_KEY = "lp_active_tab_id";

function validAppTabIdSet() {
  return new Set([...TABS.map((t) => t.id), "idea"]);
}

function applyPersistedTabIdFromSessionStorage() {
  try {
    const raw = sessionStorage.getItem(LP_LAST_TAB_SESSION_KEY);
    if (raw && validAppTabIdSet().has(raw)) currentTabId = raw;
  } catch (_) {}
}

function persistActiveTabId(tabId) {
  try {
    sessionStorage.setItem(LP_LAST_TAB_SESSION_KEY, tabId);
  } catch (_) {}
}

/**
 * 상위 탭 전환(및 앱 최초 진입 시 현재 탭)에서만 서버와 맞춤. 그 외 경로에서는 pull 하지 않음.
 * @param {{ fromBoot?: boolean }} [opts] — true면 세션에 남은 시간가계부 날짜 필터를 유지(복원 진입).
 */
async function pullDataForActiveTab(tabId, opts = {}) {
  const fromBoot = !!opts.fromBoot;
  switch (tabId) {
    case "home": {
      await pullCalendarSectionTasksFromSupabase({ reason: "app_tab_home" });
      const ymd = timeLedgerLocalTodayYmd();
      await Promise.all([
        pullTimeLedgerEntriesForDateRange(ymd, ymd),
        pullTimeLedgerTasksFromSupabase(),
        pullTimeDailyBudgetFromSupabase(),
      ]);
      break;
    }
    case "calendar":
    case "schedulecalendar":
      await pullCalendarSectionTasksFromSupabase({
        reason: `app_setActiveTab_${tabId}`,
      });
      break;
    case "time":
      if (!fromBoot) resetTimeLedgerSessionFilterToToday();
      await pullTimeLedgerTabEnterFromCloud();
      break;
    case "dream":
    case "health":
    case "happiness":
    case "sideincome":
      await pullKpiTabFromCloud(tabId);
      break;
    case "asset":
      await pullAllAssetFromCloud(() => tabId, { forceExpensePull: true });
      break;
    case "diary":
      await pullAllDiaryFromCloud();
      break;
    case "workschedule":
      await hydrateWorkScheduleFromCloud();
      break;
    case "idea":
      await pullUserPrefsFromSupabase().catch(() => {});
      break;
    case "archive":
    default:
      break;
  }
}

const ROUTINE_REMOVED_KEY = "app-routine-removed-v1";
const SIDEBAR_COLLAPSED_KEY = "app-sidebar-collapsed-v1";

function migrateRemoveRoutineTasks() {
  if (localStorage.getItem(ROUTINE_REMOVED_KEY) === "1") return;
  try {
    const routineNames = getRoutineSyncedTaskNames();
    if (routineNames.size === 0) {
      localStorage.removeItem("routine-track-list");
      localStorage.setItem(ROUTINE_REMOVED_KEY, "1");
      return;
    }
    const raw = localStorage.getItem("time_task_options");
    if (raw) {
      const opts = JSON.parse(raw);
      if (Array.isArray(opts)) {
        const filtered = opts.filter((o) => {
          const name = (typeof o === "string" ? o : o?.name || "").trim();
          return !routineNames.has(name);
        });
        localStorage.setItem("time_task_options", JSON.stringify(filtered));
      }
    }
    localStorage.removeItem("routine-track-list");
    localStorage.setItem(ROUTINE_REMOVED_KEY, "1");
  } catch (_) {}
}

export function mountApp(container) {
  if (!container) return;
  applyPersistedTabIdFromSessionStorage();
  initPushReminderInAppPopup();
  migrateRemoveRoutineTasks();
  /* 가계부 미방문 시에도 시간가계부 소비 저장 → Supabase 동기화 이벤트 수신 */
  attachAssetExpenseTransactionsSaveListener();
  attachHealthKpiMapSaveListener();
  attachHappinessKpiMapSaveListener();
  attachDreamKpiMapSaveListener();
  attachSideincomeKpiMapSaveListener();
  /* 시간기록 행 저장 → time_ledger_entries upsert (아카이브 메모 비우기 포함) */
  attachTimeLedgerEntriesSaveListener();
  container.innerHTML = "";

  const appPage = document.createElement("div");
  appPage.className = "app-page";

  const appScreen = document.createElement("div");
  appScreen.id = "app-screen-inner";

  const sidebar = document.createElement("aside");
  sidebar.className = "app-sidebar";

  const sidebarHeader = document.createElement("div");
  sidebarHeader.className = "app-sidebar-header";
  const brandTitle = document.createElement("span");
  brandTitle.className = "app-sidebar-brand-title";
  const brandTitleText = document.createElement("span");
  brandTitleText.className = "app-sidebar-brand-title-text";
  brandTitleText.textContent = "Organism";
  brandTitle.appendChild(brandTitleText);
  sidebarHeader.appendChild(brandTitle);
  const sidebarToggle = document.createElement("button");
  sidebarToggle.type = "button";
  sidebarToggle.className = "app-sidebar-toggle";
  sidebarToggle.innerHTML =
    '<img src="/toolbaricons/caret-left-double.svg" alt="" class="app-sidebar-toggle-icon" width="20" height="20" />';
  sidebarHeader.appendChild(sidebarToggle);
  sidebar.appendChild(sidebarHeader);

  const nav = document.createElement("nav");
  nav.className = "app-sidebar-nav";

  const HIDE_ON_MOBILE_TAB_IDS = ["dream", "sideincome", "happiness", "health", "asset"];

  function appendSidebarIcon(btn, iconSrc) {
    const iconWrap = document.createElement("span");
    iconWrap.className = "app-sidebar-item-icon";
    const iconImg = document.createElement("img");
    iconImg.src = iconSrc;
    iconImg.alt = "";
    iconImg.width = 20;
    iconImg.height = 20;
    iconImg.loading = "lazy";
    iconWrap.appendChild(iconImg);
    btn.appendChild(iconWrap);
  }

  TABS.forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "app-sidebar-item" + (tab.id === currentTabId ? " active" : "");
    if (HIDE_ON_MOBILE_TAB_IDS.includes(tab.id)) {
      btn.classList.add("app-sidebar-item--hide-on-mobile");
    }
    if (tab.sidebarDesktopOnly) {
      btn.classList.add("app-sidebar-item--desktop-only");
    }
    if (tab.sidebarMobileOnly) {
      btn.classList.add("app-sidebar-item--mobile-only");
    }
    btn.dataset.tabId = tab.id;
    btn.title = tab.label;
    appendSidebarIcon(btn, tab.iconDesktop ?? tab.icon);
    const label = document.createElement("span");
    label.className = "app-sidebar-item-label";
    label.textContent = tab.label;
    btn.appendChild(label);
    nav.appendChild(btn);
  });

  const accountBtn = document.createElement("button");
  accountBtn.type = "button";
  accountBtn.className = "app-sidebar-item app-sidebar-logout";
  accountBtn.title = "나의 계정";
  accountBtn.dataset.tabId = "idea";
  appendSidebarIcon(accountBtn, "/toolbaricons/user-square.svg");
  const accountLabel = document.createElement("span");
  accountLabel.className = "app-sidebar-item-label";
  accountLabel.textContent = "나의 계정";
  accountBtn.appendChild(accountLabel);
  nav.appendChild(accountBtn);
  const sidebarBody = document.createElement("div");
  sidebarBody.className = "app-sidebar-body";
  sidebarBody.appendChild(nav);
  sidebar.appendChild(sidebarBody);

  function applySidebarCollapsed(collapsed) {
    sidebar.classList.toggle("is-collapsed", collapsed);
    sidebarToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    sidebarToggle.setAttribute(
      "aria-label",
      collapsed ? "사이드바 펼치기" : "사이드바 접기",
    );
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch (_) {}
  }
  let startCollapsed = false;
  try {
    startCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch (_) {}
  applySidebarCollapsed(startCollapsed);

  sidebarToggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    applySidebarCollapsed(!sidebar.classList.contains("is-collapsed"));
  });

  appScreen.appendChild(sidebar);

  const main = document.createElement("main");
  main.className = "app-main";

  const menuBtn = document.createElement("button");
  menuBtn.className = "app-menu-btn";
  menuBtn.innerHTML = "☰";
  menuBtn.title = "메뉴";
  menuBtn.addEventListener("click", () => {
    const wasOpen = sidebar.classList.contains("is-open");
    sidebar.classList.toggle("is-open");
    document.querySelector(".app-sidebar-overlay")?.remove();
    if (!wasOpen) {
      const overlay = document.createElement("div");
      overlay.className = "app-sidebar-overlay";
      overlay.addEventListener("click", () => {
        sidebar.classList.remove("is-open");
        overlay.remove();
      });
      document.body.appendChild(overlay);
    }
  });
  main.appendChild(menuBtn);

  const panel = document.createElement("div");
  panel.className = "app-tab-panel";
  main.appendChild(panel);

  function setActiveTab(tabId) {
    const fromTab = currentTabId;
    currentTabId = tabId;
    persistActiveTabId(tabId);
    logTodoScheduleTabOnNavigate(tabId, fromTab);
    logTabSync("tab_switch", { from: fromTab, to: tabId });
    nav.querySelectorAll(".app-sidebar-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.tabId === tabId);
    });
    accountBtn.classList.toggle("active", tabId === "idea");
    if (bottomNav) {
      bottomNav.querySelectorAll(".app-bottom-nav-item").forEach((b) => {
        b.classList.toggle("active", b.dataset.tabId === tabId);
      });
    }
    void (async () => {
      const targetTabId = tabId;
      /* pull 대기 중에도 본문을 바로 갈아끼움 — 시간가계부 등 무거운 pull이 1~2초 걸릴 때 하단 탭만 바뀌고 화면이 남는 현상 방지 */
      renderMain(main, { force: true, skipTodoSaveBeforeUnmount: true });
      try {
        await pullDataForActiveTab(targetTabId, { fromBoot: false });
      } catch (_) {}
      if (currentTabId !== targetTabId) return;
      renderMain(main, { force: true, skipTodoSaveBeforeUnmount: true });
      if (targetTabId === "idea") {
        requestAnimationFrame(() => {
          main.scrollTop = 0;
        });
      }
    })();
  }

  nav.querySelectorAll(".app-sidebar-item").forEach((b) => {
    b.addEventListener("click", () => {
      setActiveTab(b.dataset.tabId);
      sidebar.classList.remove("is-open");
      document.querySelector(".app-sidebar-overlay")?.remove();
    });
  });
  accountBtn.addEventListener("click", () => {
    setActiveTab("idea");
    sidebar.classList.remove("is-open");
    document.querySelector(".app-sidebar-overlay")?.remove();
  });

  const bottomNav = document.createElement("nav");
  bottomNav.className = "app-bottom-nav";
  bottomNav.setAttribute("aria-label", "하단 메뉴");
  const bottomNavMain = document.createElement("div");
  bottomNavMain.className = "app-bottom-nav-main";

  const mobileTabsFiltered = TABS.filter(
    (t) =>
      !HIDE_ON_MOBILE_TAB_IDS.includes(t.id) &&
      !t.sidebarDesktopOnly,
  );
  /** 모바일 하단 탭 순서: 오늘 → 시간 → 할일 → 캘린더 → 근무표 → … */
  const MOBILE_BOTTOM_NAV_ORDER = [
    "home",
    "time",
    "calendar",
    "schedulecalendar",
    "workschedule",
    "diary",
    "archive",
  ];
  const mobileTabs = [
    ...MOBILE_BOTTOM_NAV_ORDER.map((id) =>
      mobileTabsFiltered.find((t) => t.id === id),
    ).filter(Boolean),
    ...mobileTabsFiltered.filter((t) => !MOBILE_BOTTOM_NAV_ORDER.includes(t.id)),
  ];
  mobileTabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-bottom-nav-item" + (tab.id === currentTabId ? " active" : "");
    btn.dataset.tabId = tab.id;
    const navLabel = tab.mobileLabel ?? tab.label;
    btn.title = navLabel;
    btn.innerHTML = `<img src="${tab.icon}" alt="" class="app-bottom-nav-icon" width="20" height="20"><span class="app-bottom-nav-label">${navLabel}</span>`;
    btn.addEventListener("click", () => {
      setActiveTab(tab.id);
      sidebar.classList.remove("is-open");
      document.querySelector(".app-sidebar-overlay")?.remove();
    });
    bottomNavMain.appendChild(btn);
  });
  /* 모바일 하단: 나의 계정 바로 앞에 꿈·행복·부수입·건강·자산 (가로 스크롤로 모두 접근) */
  const KPI_MOBILE_IN_MAIN_ORDER = [
    "dream",
    "happiness",
    "sideincome",
    "health",
    "asset",
  ];
  KPI_MOBILE_IN_MAIN_ORDER.forEach((id) => {
    const tab = TABS.find((t) => t.id === id);
    if (!tab) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className =
      "app-bottom-nav-item app-bottom-nav-item--kpi" +
      (tab.id === currentTabId ? " active" : "");
    btn.dataset.tabId = tab.id;
    const navLabel = tab.mobileLabel ?? tab.label;
    btn.title = navLabel;
    btn.innerHTML = `<img src="${tab.icon}" alt="" class="app-bottom-nav-icon" width="20" height="20"><span class="app-bottom-nav-label">${navLabel}</span>`;
    btn.addEventListener("click", () => {
      setActiveTab(tab.id);
      sidebar.classList.remove("is-open");
      document.querySelector(".app-sidebar-overlay")?.remove();
    });
    bottomNavMain.appendChild(btn);
  });
  const accountBottomBtn = document.createElement("button");
  accountBottomBtn.type = "button";
  accountBottomBtn.className = "app-bottom-nav-item" + (currentTabId === "idea" ? " active" : "");
  accountBottomBtn.dataset.tabId = "idea";
  accountBottomBtn.title = "나의 계정";
  accountBottomBtn.innerHTML = '<img src="/toolbaricons/user-square.svg" alt="" class="app-bottom-nav-icon" width="20" height="20"><span class="app-bottom-nav-label">나의 계정</span>';
  accountBottomBtn.addEventListener("click", () => {
    setActiveTab("idea");
    sidebar.classList.remove("is-open");
    document.querySelector(".app-sidebar-overlay")?.remove();
  });
  bottomNavMain.appendChild(accountBottomBtn);

  bottomNav.appendChild(bottomNavMain);

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
      if (document.querySelector("body > .work-schedule-day-entry-modal[role='dialog']")) return true;
      if (document.querySelector("body > .work-schedule-type-settings-modal[role='dialog']")) return true;
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
   * - force: true일 때만 입력 중이어도 탭을 다시 그림(사이드/하단 메뉴로 화면 전환 시).
   */
  function renderMain(mainEl, opts = {}) {
    logLpRenderStack("renderMain 진입", { tab: currentTabId, opts });
    /* 근무표 등록/유형설정 모달은 body 직하위 — force:true(탭 전환 등)여도 여기서 통째로 지우면 월별보기 달이 초기화됨 */
    let wsBodyModal = null;
    try {
      wsBodyModal =
        document.querySelector("body > .work-schedule-day-entry-modal[role='dialog']") ||
        document.querySelector("body > .work-schedule-type-settings-modal[role='dialog']");
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
    const prevRoot = p.firstElementChild;
    if (prevRoot?._lpTabAbortController) {
      try {
        prevRoot._lpTabAbortController.abort();
      } catch (_) {}
      prevRoot._lpTabAbortController = null;
    }
    p.innerHTML = "";
    const render = RENDERERS[currentTabId];
    try {
      if (render) {
        const content = render();
        if (content) p.appendChild(content);
        if (window.matchMedia("(max-width: 48rem)").matches) {
          initDatePickersIn(p);
        }
      } else {
        const div = document.createElement("p");
        div.textContent =
          TABS.find((t) => t.id === currentTabId)?.label || "준비 중";
        p.appendChild(div);
      }
    } catch (err) {
      const errDiv = document.createElement("div");
      errDiv.className = "app-render-error";
      errDiv.style.cssText = "padding:1.5rem;color:#b91c1c;";
      errDiv.innerHTML = `<p><strong>${TABS.find((t) => t.id === currentTabId)?.label || currentTabId} 로드 중 오류</strong></p><p>${String(err?.message || err)}</p>`;
      p.appendChild(errDiv);
    }
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
  }

  window.__lpRenderMain = (opts) => renderMain(main, opts || {});

  initSupabaseRealtimeSync({
    getCurrentTabId: () => currentTabId,
    renderMain: (opts) => renderMain(main, opts || {}),
  });
  if (typeof window !== "undefined") {
    window.__lpSyncWatchHelp = printSyncWatchHelp;
  }

  /* 서버 pull 은 상위 탭 전환(setActiveTab)·최초 진입 시에만 수행. 포커스 복귀 등에서는 pull 하지 않음. */

  logTabSync("boot", { tab: currentTabId, phase: "pull_then_first_render" });
  void (async () => {
    try {
      await pullDataForActiveTab(currentTabId, { fromBoot: true });
    } catch (_) {}
    renderMain(main);
  })();
  appScreen.appendChild(main);
  appPage.appendChild(appScreen);
  appPage.appendChild(bottomNav);
  container.appendChild(appPage);
  if (window.matchMedia("(max-width: 48rem)").matches) {
    initMobileVisualViewportKeyboardInset();
  }
  if (!window.matchMedia("(max-width: 48rem)").matches) {
    observeDatePickerInit(panel);
  }
  try {
    window.__lpTabSyncCounts = getTabSyncCounts;
  } catch (_) {}
  initDomPulseDebug();
}
