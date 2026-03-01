import { signOut } from "./auth.js";
import { render as renderCalendar } from "./views/Calendar.js";
import { render as renderKpi } from "./views/Kpi.js";
import { render as renderTime } from "./views/Time.js";
import { render as renderRoutine } from "./views/Routine.js";
import { render as renderWorkSchedule } from "./views/WorkSchedule.js";
import { render as renderAsset } from "./views/Asset.js";
import { render as renderDream } from "./views/Dream.js";
import { render as renderSideincome } from "./views/Sideincome.js";
import { render as renderHappiness } from "./views/Happiness.js";
import { render as renderHealth } from "./views/Health.js";
import { render as renderArchive } from "./views/Archive.js";
import { render as renderDiary } from "./views/Diary.js";
import { render as renderIdea } from "./views/Idea.js";

const TABS = [
  { id: "calendar", label: "캘린더" },
  { id: "kpi", label: "인생 KPI" },
  { id: "time", label: "시간가계부" },
  { id: "routine", label: "데일리 루틴 트랙" },
  { id: "workschedule", label: "근무표" },
  { id: "asset", label: "자산관리" },
  { id: "dream", label: "꿈" },
  { id: "sideincome", label: "부수입" },
  { id: "happiness", label: "행복" },
  { id: "health", label: "건강" },
  { id: "archive", label: "아카이브" },
  { id: "diary", label: "감정관리" },
  { id: "idea", label: "My account" },
];

const RENDERERS = {
  calendar: renderCalendar,
  kpi: renderKpi,
  time: renderTime,
  routine: renderRoutine,
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

let currentTabId = "calendar";

export function mountApp(container) {
  if (!container) return;
  container.innerHTML = "";

  const appPage = document.createElement("div");
  appPage.className = "app-page";

  const appScreen = document.createElement("div");
  appScreen.id = "app-screen-inner";

  const sidebar = document.createElement("aside");
  sidebar.className = "app-sidebar";

  const sidebarTitle = document.createElement("div");
  sidebarTitle.className = "app-sidebar-title";
  sidebarTitle.textContent = "라이프 플래너";
  sidebar.appendChild(sidebarTitle);

  const nav = document.createElement("nav");
  nav.className = "app-sidebar-nav";

  TABS.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = "app-sidebar-item" + (tab.id === currentTabId ? " active" : "");
    btn.dataset.tabId = tab.id;
    btn.textContent = tab.label;
    btn.addEventListener("click", () => {
      currentTabId = tab.id;
      nav.querySelectorAll(".app-sidebar-item").forEach((b) => b.classList.remove("active"));
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
  logoutBtn.textContent = "로그아웃";
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
    p.innerHTML = "";
    const render = RENDERERS[currentTabId];
    if (render) {
      p.appendChild(render());
    } else {
      const div = document.createElement("p");
      div.textContent = TABS.find((t) => t.id === currentTabId)?.label || "준비 중";
      p.appendChild(div);
    }
  }

  renderMain(main);
  appScreen.appendChild(main);
  appPage.appendChild(appScreen);
  container.appendChild(appPage);
}
