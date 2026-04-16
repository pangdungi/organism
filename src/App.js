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
import { attachAssetExpenseTransactionsSaveListener } from "./utils/assetExpenseTransactionsSupabase.js";
import { initPushReminderInAppPopup } from "./utils/initPushReminderInAppPopup.js";
import { hydrateTodoSectionTasksFromCloud } from "./utils/todoSectionTasksSupabase.js";
import { hydrateTimeDailyBudgetFromCloud } from "./utils/timeDailyBudgetSupabase.js";
import { hydrateTimeLedgerTasksFromCloud } from "./utils/timeLedgerTasksSupabase.js";
import {
  attachHealthKpiMapSaveListener,
  hydrateHealthKpiMapFromCloud,
} from "./utils/healthKpiMapSupabase.js";
import {
  attachHappinessKpiMapSaveListener,
  hydrateHappinessKpiMapFromCloud,
} from "./utils/happinessKpiMapSupabase.js";
import {
  attachDreamKpiMapSaveListener,
  hydrateDreamKpiMapFromCloud,
} from "./utils/dreamKpiMapSupabase.js";
import {
  attachSideincomeKpiMapSaveListener,
  hydrateSideincomeKpiMapFromCloud,
} from "./utils/sideincomeKpiMapSupabase.js";
import { attachTimeLedgerEntriesSaveListener } from "./utils/timeLedgerEntriesSupabase.js";
import { attachTodoSectionTasksPushFlushOnHideOnce } from "./utils/todoSectionTasksSupabase.js";
import {
  pullAllKpiMapsFromCloud,
  pullKpiTabFromCloud,
} from "./utils/kpiTabCloudRefresh.js";
import { pullAllTimeLedgerFromCloud } from "./utils/timeLedgerCloudRefresh.js";
import { pullAllAssetFromCloud } from "./utils/assetCloudRefresh.js";
import { pullAllDiaryFromCloud } from "./utils/diaryCloudRefresh.js";
import {
  KPI_TAB_IDS,
  kpiSyncDebugLog,
  snapshotKpiLocalStorageBrief,
} from "./utils/kpiSyncDebug.js";
import { initSupabaseRealtimeSync } from "./utils/supabaseRealtimeSync.js";
import { printSyncWatchHelp, syncWatchLog } from "./utils/syncWatchLog.js";
import { getTabSyncCounts, logTabSync } from "./utils/lpTabSyncDebug.js";
import { lpPullDebug } from "./utils/lpPullDebug.js";
import { hydrateWorkScheduleFromCloud } from "./utils/workScheduleSupabase.js";
import {
  logLpRender,
  logLpRenderStack,
  lpRenderTraceOn,
} from "./utils/lpRenderDebugLog.js";
import { initDomPulseDebug } from "./utils/domPulseDebug.js";
import { initMobileVisualViewportKeyboardInset } from "./utils/mobileViewportKeyboard.js";

/** 사용자가 입력 중인지 확인 (입력 중이면 화면 갱신 건너뜀) */
function isUserTypingInApp() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea") return true;
  if (el.isContentEditable) return true;
  return false;
}

/** 브라우저 탭 포커스 시 KPI pull 후 다시 그려야 하는 앱 메뉴(오늘·할일·시간 등 KPI 데이터를 읽는 화면) */
const TAB_IDS_REFRESH_ON_KPI_PULL = new Set([
  "home",
  "dream",
  "sideincome",
  "happiness",
  "health",
  "calendar",
  "schedulecalendar",
  "asset",
  "diary",
  "archive",
]);

/** 시간 기록 행 pull 후 다시 그려야 하는 탭(loadTimeRows·getTodayTimeSummary 등 사용) */
const TAB_IDS_REFRESH_ON_TIME_LEDGER_ROWS = new Set([
  "home",
  "calendar",
  "schedulecalendar",
]);

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
  attachTodoSectionTasksPushFlushOnHideOnce();
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
    renderMain(main, { force: true });
    /* 할일/일정·캘린더 상위 탭 진입 시 서버에서 calendar_section_tasks pull (KPI 탭과 동일하게 setActiveTab에서 명시) */
    if (tabId === "calendar" || tabId === "schedulecalendar") {
      void hydrateTodoSectionTasksFromCloud(`app_setActiveTab_${tabId}`)
        .catch(() => {})
        .then((needRefresh) => {
          if (needRefresh && !isUserTypingInApp()) {
            try {
              window.__lpRenderMain?.({ skipTodoSaveBeforeUnmount: true });
            } catch (_) {}
          }
        });
    }
    /* 꿈·부수입·행복·건강: 다른 기기에서 삭제·추가한 내용을 보려면 진입 시 서버 pull 필요.
     * localStorage 문자열이 바뀐 경우에만 한 번 더 그림(불필요한 깜빡임 감소).
     * 단, 사용자가 입력 중이면 갱신을 건너뜀(입력 도중 화면 날아감 방지). */
    if (KPI_TAB_IDS.has(tabId)) {
      void pullKpiTabFromCloud(tabId).then(({ pullOk, localChanged }) => {
        logTabSync("kpi_tab_pull", { tabId, pullOk, localChanged });
        if (pullOk && localChanged && !isUserTypingInApp()) {
          logLpRender("App:setActiveTab·KPI pull 후 재렌더", {
            tabId,
            pullOk,
            localChanged,
          });
          renderMain(main, {
            skipTodoSaveBeforeUnmount: true,
            force: true,
          });
        }
      });
    }
    if (tabId === "idea") {
      requestAnimationFrame(() => {
        main.scrollTop = 0;
      });
    }
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
    if (lpRenderTraceOn()) {
      try {
        console.trace("[lp-render] renderMain", currentTabId, opts);
      } catch (_) {}
    }
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
      console.error("[renderMain] 탭 로드 실패:", currentTabId, err?.message, err);
      if (err?.stack) console.error(err.stack);
      const errDiv = document.createElement("div");
      errDiv.className = "app-render-error";
      errDiv.style.cssText = "padding:1.5rem;color:#b91c1c;";
      errDiv.innerHTML = `<p><strong>${TABS.find((t) => t.id === currentTabId)?.label || currentTabId} 로드 중 오류</strong></p><p>${String(err?.message || err)}</p>`;
      p.appendChild(errDiv);
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

  /** 브라우저 탭 포커스 복귀 시: KPI·시간·자산·일기 pull (할일 calendar_section_tasks는 탭 클릭 시에만 pull) */
  let _browserTabVisiblePullTimer = null;
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "visible") return;
      if (_browserTabVisiblePullTimer) clearTimeout(_browserTabVisiblePullTimer);
      syncWatchLog("visibility_스케줄", {
        tab: currentTabId,
        delayMs: 350,
        note: "탭 다시 보이기 후 350ms 뒤 pull 묶음(폭주 방지)",
      });
      _browserTabVisiblePullTimer = setTimeout(() => {
        _browserTabVisiblePullTimer = null;
        void (async () => {
          try {
            logTabSync("visibility_pull", { tab: currentTabId });
            lpPullDebug("app_visibility_focus_pull_bundle", { tab: currentTabId });
            const todoPullPromise = Promise.resolve(false);
            const [needTodoRefresh, kpiR, timeR, assetR, diaryR] =
              await Promise.all([
                todoPullPromise,
                pullAllKpiMapsFromCloud(() => currentTabId),
                pullAllTimeLedgerFromCloud(),
                pullAllAssetFromCloud(() => currentTabId),
                pullAllDiaryFromCloud(),
              ]);
            const kpiChanged = kpiR.anyChanged;
            const timeChanged = timeR.anyChanged;
            const assetChanged = assetR.anyChanged;
            const diaryChanged = diaryR.anyChanged;
            syncWatchLog("visibility_pull_결과", {
              tab: currentTabId,
              needTodoRefresh,
              kpiChanged,
              timeChanged,
              assetChanged,
              diaryChanged,
            });
            if (
              !needTodoRefresh &&
              !kpiChanged &&
              !timeChanged &&
              !assetChanged &&
              !diaryChanged
            )
              return;
            if (currentTabId === "time") {
              if (timeChanged) {
                try {
                  document.dispatchEvent(
                    new CustomEvent("lp-time-ledger-remote-updated"),
                  );
                } catch (_) {}
              }
              return;
            }
            const needMainFromTodo = false;
            const needMainFromOther =
              TAB_IDS_REFRESH_ON_KPI_PULL.has(currentTabId) &&
              (kpiChanged || assetChanged || diaryChanged);
            const needMainFromTimeRows =
              timeChanged &&
              TAB_IDS_REFRESH_ON_TIME_LEDGER_ROWS.has(currentTabId);
            if (
              (needMainFromTodo ||
                needMainFromOther ||
                needMainFromTimeRows) &&
              !isUserTypingInApp()
            ) {
              logLpRender("App:visibilitychange·탭 포커스 복귀 후 pull", {
                currentTabId,
                needTodoRefresh,
                kpiChanged,
                timeChanged,
                assetChanged,
                diaryChanged,
                needMainFromTodo,
                needMainFromOther,
                needMainFromTimeRows,
              });
              renderMain(main, { skipTodoSaveBeforeUnmount: true });
            }
          } catch (e) {
            console.warn(
              "[브라우저 탭 포커스 후 pull]",
              e?.message || e,
            );
          }
        })();
      }, 350);
    },
    { passive: true },
  );

  renderMain(main);
  logTabSync("boot_hydrate", { phase: "Promise.all" });
  void Promise.all([
    /* 할일 섹션: calendar_section_tasks는 할일/일정 서브탭 전환 시에만 pull — 부팅 시 pull 제거 */
    Promise.resolve(false),
    hydrateTimeDailyBudgetFromCloud(),
    hydrateTimeLedgerTasksFromCloud(),
    hydrateHealthKpiMapFromCloud(),
    hydrateHappinessKpiMapFromCloud(),
    hydrateDreamKpiMapFromCloud(),
    hydrateSideincomeKpiMapFromCloud(),
    pullAllTimeLedgerFromCloud(),
    /* 근무표: 탭 진입 전에 메모리를 서버와 맞춰 두면 ‘불러오는 중’ 체감·이중 로딩이 줄어듦 */
    hydrateWorkScheduleFromCloud(),
  ]).then(
    ([
      needTodoRefresh,
      budgetMerged,
      ,
      healthKpiPulled,
      happinessKpiPulled,
      dreamKpiPulled,
      sideincomeKpiPulled,
      timeLedgerPullR,
      ,
    ]) => {
      const timeLedgerRowsMerged = !!(timeLedgerPullR && timeLedgerPullR.anyChanged);
      kpiSyncDebugLog("앱 부팅 hydrate 결과", {
        needTodoRefresh,
        budgetMerged,
        healthKpiPulled,
        happinessKpiPulled,
        dreamKpiPulled,
        sideincomeKpiPulled,
        timeLedgerRowsMerged,
        "의미(각 KPI)": "true면 방금 Supabase에서 받아 localStorage를 갱신함",
        "이후 localStorage 요약": snapshotKpiLocalStorageBrief(),
      });
      if (
        needTodoRefresh ||
        budgetMerged ||
        timeLedgerRowsMerged ||
        healthKpiPulled ||
        happinessKpiPulled ||
        dreamKpiPulled ||
        sideincomeKpiPulled
      ) {
        if (currentTabId === "time") {
          try {
            document.dispatchEvent(
              new CustomEvent("lp-time-ledger-remote-updated"),
            );
          } catch (_) {}
        } else if (currentTabId === "workschedule") {
          /* 근무표는 부팅 시 Promise.all 에서 이미 hydrate 함. 여기서 renderMain 하면 패널 전체가
           * 다시 그려져 깜빡이므로 생략(탭 마운트 시 동기화). */
        } else {
          logLpRender("App:초기 hydrate·Promise.all 완료 후 재렌더", {
            needTodoRefresh,
            budgetMerged,
            timeLedgerRowsMerged,
            healthKpiPulled,
            happinessKpiPulled,
            dreamKpiPulled,
            sideincomeKpiPulled,
          });
          renderMain(main);
        }
      }
    }
  );
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
