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

const SIDEBAR_COLLAPSED_KEY = "app-sidebar-collapsed";

const TABS = [
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
  { id: "idea", label: "My account", icon: "/toolbaricons/user-square.svg" },
];

const RENDERERS = {
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

let currentTabId = "dream";

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
  const isCollapsed = localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  if (isCollapsed) sidebar.classList.add("is-collapsed");

  const sidebarHeader = document.createElement("div");
  sidebarHeader.className = "app-sidebar-header";
  const sidebarTitle = document.createElement("div");
  sidebarTitle.className = "app-sidebar-title";
  sidebarTitle.textContent = "라이프 플래너";
  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "app-sidebar-collapse-btn";
  collapseBtn.title = isCollapsed ? "사이드바 펼치기" : "사이드바 접기";
  collapseBtn.innerHTML =
    '<img src="/toolbaricons/menu.svg" alt="" width="20" height="20" />';
  collapseBtn.addEventListener("click", () => {
    sidebar.classList.toggle("is-collapsed");
    const collapsed = sidebar.classList.contains("is-collapsed");
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    collapseBtn.title = collapsed ? "사이드바 펼치기" : "사이드바 접기";
  });
  sidebarHeader.appendChild(sidebarTitle);
  sidebarHeader.appendChild(collapseBtn);
  sidebar.appendChild(sidebarHeader);

  const nav = document.createElement("nav");
  nav.className = "app-sidebar-nav";

  TABS.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className =
      "app-sidebar-item" + (tab.id === currentTabId ? " active" : "");
    btn.dataset.tabId = tab.id;
    btn.title = tab.label;
    const icon = document.createElement("img");
    icon.className = "app-sidebar-item-icon";
    icon.src = tab.icon;
    icon.alt = "";
    icon.width = 20;
    icon.height = 20;
    const label = document.createElement("span");
    label.className = "app-sidebar-item-label";
    label.textContent = tab.label;
    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener("click", () => {
      currentTabId = tab.id;
      nav
        .querySelectorAll(".app-sidebar-item")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      renderMain(main);
      sidebar.classList.remove("is-open");
      document.querySelector(".app-sidebar-overlay")?.remove();
    });
    nav.appendChild(btn);
  });

  document.addEventListener("app-switch-tab", (e) => {
    const tabId = e.detail?.tabId;
    if (tabId) {
      currentTabId = tabId;
      nav.querySelectorAll(".app-sidebar-item").forEach((b) => {
        b.classList.toggle("active", b.dataset.tabId === tabId);
      });
      renderMain(main);
    }
  });

  sidebar.appendChild(nav);

  const logoutBtn = document.createElement("button");
  logoutBtn.className = "app-sidebar-item app-sidebar-logout";
  logoutBtn.title = "로그아웃";
  const logoutIcon = document.createElement("img");
  logoutIcon.className = "app-sidebar-item-icon";
  logoutIcon.src = "/toolbaricons/send-out.svg";
  logoutIcon.alt = "";
  logoutIcon.width = 20;
  logoutIcon.height = 20;
  const logoutLabel = document.createElement("span");
  logoutLabel.className = "app-sidebar-item-label";
  logoutLabel.textContent = "로그아웃";
  logoutBtn.appendChild(logoutIcon);
  logoutBtn.appendChild(logoutLabel);
  logoutBtn.addEventListener("click", () => signOut());
  sidebar.appendChild(logoutBtn);
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

  function renderMain(mainEl) {
    const p = mainEl?.querySelector(".app-tab-panel");
    if (!p) return;
    saveTodoListBeforeUnmount(p);
    p.innerHTML = "";
    const render = RENDERERS[currentTabId];
    if (render) {
      p.appendChild(render());
    } else {
      const div = document.createElement("p");
      div.textContent =
        TABS.find((t) => t.id === currentTabId)?.label || "준비 중";
      p.appendChild(div);
    }
  }

  renderMain(main);
  appScreen.appendChild(main);
  appPage.appendChild(appScreen);
  container.appendChild(appPage);
  observeDatePickerInit(container);
}
