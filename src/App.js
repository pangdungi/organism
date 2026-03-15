import { signOut } from "./auth.js";
import { observeDatePickerInit } from "./utils/datePickerInit.js";
import { getRoutineSyncedTaskNames } from "./utils/routineTimeSync.js";
import { render as renderCalendar } from "./views/Calendar.js";
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

const TABS = [
  { id: "home", label: "오늘", icon: "/toolbaricons/dashboard.svg" },
  { id: "dream", label: "꿈", icon: "/toolbaricons/star.svg" },
  { id: "sideincome", label: "부수입", icon: "/toolbaricons/money-circle.svg" },
  { id: "happiness", label: "행복", icon: "/toolbaricons/plug-electric.svg" },
  { id: "health", label: "건강", icon: "/toolbaricons/heart-rate.svg" },
  { id: "calendar", label: "할일/일정", icon: "/toolbaricons/calendar-alt.svg" },
  { id: "time", label: "시간가계부", icon: "/toolbaricons/timer.svg" },
  { id: "diary", label: "감정관리", icon: "/toolbaricons/chat-bubbles.svg" },
  { id: "asset", label: "자산관리", icon: "/toolbaricons/wallet.svg" },
  {
    id: "workschedule",
    label: "근무표",
    icon: "/toolbaricons/calendar-heart1.svg",
  },
  { id: "archive", label: "아카이브", icon: "/toolbaricons/harddrive.svg" },
];

const RENDERERS = {
  home: renderHome,
  calendar: renderCalendar,
  time: renderTime,
  workschedule: renderWorkSchedule,
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
  migrateRemoveRoutineTasks();
  container.innerHTML = "";

  const appPage = document.createElement("div");
  appPage.className = "app-page";

  const appScreen = document.createElement("div");
  appScreen.id = "app-screen-inner";

  const sidebar = document.createElement("aside");
  sidebar.className = "app-sidebar";

  const nav = document.createElement("nav");
  nav.className = "app-sidebar-nav";

  const HIDE_ON_MOBILE_TAB_IDS = ["dream", "sideincome", "happiness", "health", "asset"];
  TABS.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className =
      "app-sidebar-item" + (tab.id === currentTabId ? " active" : "");
    if (HIDE_ON_MOBILE_TAB_IDS.includes(tab.id)) {
      btn.classList.add("app-sidebar-item--hide-on-mobile");
    }
    btn.dataset.tabId = tab.id;
    btn.title = tab.label;
    const label = document.createElement("span");
    label.className = "app-sidebar-item-label";
    label.textContent = tab.label;
    btn.appendChild(label);
    nav.appendChild(btn);
  });

  const accountBtn = document.createElement("button");
  accountBtn.className = "app-sidebar-item app-sidebar-logout";
  accountBtn.title = "나의 계정";
  accountBtn.dataset.tabId = "idea";
  const accountLabel = document.createElement("span");
  accountLabel.className = "app-sidebar-item-label";
  accountLabel.textContent = "나의 계정";
  accountBtn.appendChild(accountLabel);
  sidebar.appendChild(nav);
  sidebar.appendChild(accountBtn);
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
  const mobileTabs = TABS.filter((t) => !HIDE_ON_MOBILE_TAB_IDS.includes(t.id));
  mobileTabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "app-bottom-nav-item" + (tab.id === currentTabId ? " active" : "");
    btn.dataset.tabId = tab.id;
    btn.title = tab.label;
    btn.innerHTML = `<img src="${tab.icon}" alt="" class="app-bottom-nav-icon" width="22" height="22"><span class="app-bottom-nav-label">${tab.label}</span>`;
    btn.addEventListener("click", () => {
      setActiveTab(tab.id);
      sidebar.classList.remove("is-open");
      document.querySelector(".app-sidebar-overlay")?.remove();
    });
    bottomNav.appendChild(btn);
  });
  const accountBottomBtn = document.createElement("button");
  accountBottomBtn.type = "button";
  accountBottomBtn.className = "app-bottom-nav-item" + (currentTabId === "idea" ? " active" : "");
  accountBottomBtn.dataset.tabId = "idea";
  accountBottomBtn.title = "나의 계정";
  accountBottomBtn.innerHTML = '<img src="/toolbaricons/user-square.svg" alt="" class="app-bottom-nav-icon" width="22" height="22"><span class="app-bottom-nav-label">나의 계정</span>';
  accountBottomBtn.addEventListener("click", () => {
    setActiveTab("idea");
    sidebar.classList.remove("is-open");
    document.querySelector(".app-sidebar-overlay")?.remove();
  });
  bottomNav.appendChild(accountBottomBtn);

  document.addEventListener("app-switch-tab", (e) => {
    const tabId = e.detail?.tabId;
    if (tabId) setActiveTab(tabId);
  });

  function renderMain(mainEl) {
    const p = mainEl?.querySelector(".app-tab-panel");
    if (!p) return;
    saveTodoListBeforeUnmount(p);
    p.innerHTML = "";
    const render = RENDERERS[currentTabId];
    try {
      if (render) {
        const content = render();
        if (content) p.appendChild(content);
      } else {
        const div = document.createElement("p");
        div.textContent =
          TABS.find((t) => t.id === currentTabId)?.label || "준비 중";
        p.appendChild(div);
      }
    } catch (err) {
      console.error("[renderMain]", currentTabId, err);
      const errDiv = document.createElement("div");
      errDiv.className = "app-render-error";
      errDiv.style.cssText = "padding:1.5rem;color:#b91c1c;";
      errDiv.innerHTML = `<p><strong>${TABS.find((t) => t.id === currentTabId)?.label || currentTabId} 로드 중 오류</strong></p><p>${String(err?.message || err)}</p>`;
      p.appendChild(errDiv);
    }
  }

  renderMain(main);
  appScreen.appendChild(main);
  appPage.appendChild(appScreen);
  appPage.appendChild(bottomNav);
  container.appendChild(appPage);
  observeDatePickerInit(container);
  observeDatePickerInit(document.body);
}
