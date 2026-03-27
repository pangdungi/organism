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

const TABS = [
  { id: "home", label: "오늘", icon: "/toolbaricons/dashboard.svg" },
  { id: "dream", label: "꿈", icon: "/toolbaricons/star.svg" },
  { id: "sideincome", label: "부수입", icon: "/toolbaricons/money-circle.svg" },
  { id: "happiness", label: "행복", icon: "/toolbaricons/plug-electric.svg" },
  { id: "health", label: "건강", icon: "/toolbaricons/heart-rate.svg" },
  { id: "calendar", label: "할일/일정", mobileLabel: "할일", icon: "/toolbaricons/calendar-alt.svg" },
  { id: "time", label: "시간가계부", mobileLabel: "시간", icon: "/toolbaricons/timer.svg" },
  { id: "asset", label: "자산관리", icon: "/toolbaricons/wallet.svg" },
  {
    id: "workschedule",
    label: "근무표",
    icon: "/toolbaricons/calendar-heart1.svg",
    sidebarDesktopOnly: true,
  },
  {
    id: "schedulecalendar",
    label: "캘린더",
    mobileLabel: "캘린더",
    icon: "/toolbaricons/calendar-heart1.svg",
    sidebarMobileOnly: true,
  },
  { id: "diary", label: "감정일기", mobileLabel: "감정일기", icon: "/toolbaricons/chat-bubbles.svg" },
  { id: "archive", label: "아카이브", icon: "/toolbaricons/harddrive.svg" },
];

const RENDERERS = {
  home: renderHome,
  calendar: renderCalendar,
  time: renderTime,
  workschedule: renderWorkSchedule,
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
    appendSidebarIcon(btn, tab.icon);
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
    try {
      if (
        typeof localStorage !== "undefined" &&
        localStorage.getItem("debug_app_nav") === "1"
      ) {
        const R = RENDERERS[tabId];
        console.log("[앱 네비] setActiveTab", {
          tabId,
          renderer: typeof R === "function" ? R.name || "(익명)" : String(R),
        });
      }
    } catch (_) {}
    currentTabId = tabId;
    nav.querySelectorAll(".app-sidebar-item").forEach((b) => {
      b.classList.toggle("active", b.dataset.tabId === tabId);
    });
    accountBtn.classList.toggle("active", tabId === "idea");
    if (bottomNav) {
      bottomNav.querySelectorAll(".app-bottom-nav-item").forEach((b) => {
        b.classList.toggle("active", b.dataset.tabId === tabId);
      });
    }
    renderMain(main);
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
      !HIDE_ON_MOBILE_TAB_IDS.includes(t.id) && !t.sidebarDesktopOnly,
  );
  /** 모바일 하단 탭 순서: 오늘 → 시간 → 할일 → 나머지 */
  const MOBILE_BOTTOM_NAV_ORDER = [
    "home",
    "time",
    "calendar",
    "schedulecalendar",
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
  /* 모바일 하단: 나의 계정 바로 앞에 꿈·행복·부수입·건강 (가로 스크롤로 모두 접근) */
  const KPI_MOBILE_IN_MAIN_ORDER = [
    "dream",
    "happiness",
    "sideincome",
    "health",
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

  /**
   * @param {HTMLElement} mainEl
   * @param {{ skipTodoSaveBeforeUnmount?: boolean }} [opts]
   * - skipTodoSaveBeforeUnmount: 저장소를 이미 갱신한 뒤(예: 완료 일괄 제거) DOM이 옛 상태일 때 true.
   *   그렇지 않으면 save가 DOM을 다시 저장해 퍼지 결과를 덮어쓴다.
   */
  function renderMain(mainEl, opts = {}) {
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

  const TODO_TABS_FOR_CLOUD_PULL = new Set(["calendar", "schedulecalendar"]);
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState !== "visible") return;
      if (!TODO_TABS_FOR_CLOUD_PULL.has(currentTabId)) return;
      void hydrateTodoSectionTasksFromCloud().then((needRefresh) => {
        if (needRefresh) renderMain(main);
      });
    },
    { passive: true },
  );

  renderMain(main);
  void Promise.all([
    hydrateTodoSectionTasksFromCloud(),
    hydrateTimeDailyBudgetFromCloud(),
    hydrateTimeLedgerTasksFromCloud(),
    hydrateHealthKpiMapFromCloud(),
    hydrateHappinessKpiMapFromCloud(),
    hydrateDreamKpiMapFromCloud(),
    hydrateSideincomeKpiMapFromCloud(),
  ]).then(
    ([
      needTodoRefresh,
      budgetMerged,
      ,
      healthKpiPulled,
      happinessKpiPulled,
      dreamKpiPulled,
      sideincomeKpiPulled,
    ]) => {
      if (
        needTodoRefresh ||
        budgetMerged ||
        healthKpiPulled ||
        happinessKpiPulled ||
        dreamKpiPulled ||
        sideincomeKpiPulled
      )
        renderMain(main);
    }
  );
  appScreen.appendChild(main);
  appPage.appendChild(appScreen);
  appPage.appendChild(bottomNav);
  container.appendChild(appPage);
  if (!window.matchMedia("(max-width: 48rem)").matches) {
    observeDatePickerInit(panel);
  }
}
