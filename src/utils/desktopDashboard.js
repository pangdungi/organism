/**
 * 데스크탑(넓은 화면) 홈 — 3분할 대시보드
 * 시간기록 | KPI 퀵버튼+습관 | 플래너
 */

import { applyStaticAppIconImg } from "./staticAppIconImg.js";
import { appBrandLogoUrl, withToolbarIconCacheVersion } from "./toolbarIconUrl.js";
import { render as renderTime } from "../views/Time.js";
import { render as renderHabitTracker } from "../views/HabitTracker.js";
import { renderMobileScheduleCalendar } from "../views/Calendar.js";

/** iPad Mini 가로(1024px)부터 3분할 — 75rem 미만은 열 너비 1:1:1 */
export const DESKTOP_DASHBOARD_MQ = "(min-width: 64rem)";
/** Mini·Pro 11 등 좁은 3분할 — 세 칸 동일 너비 + 컴팩트 여백 */
export const DESKTOP_DASHBOARD_COMPACT_MQ = "(min-width: 64rem) and (max-width: 74.9375rem)";
/** Pro 12.9·데스크탑 등 넓은 화면용 기본 비율 */
export const DESKTOP_DASHBOARD_FULL_MQ = "(min-width: 75rem)";

const DESKTOP_QUICK_KPI_TABS = [
  {
    id: "sideincome",
    label: "시급상승",
    icon: "/toolbaricons/menu-sideincome.png",
  },
  {
    id: "health",
    label: "건강",
    icon: "/toolbaricons/menu-health.png",
  },
  {
    id: "happiness",
    label: "행복",
    icon: "/toolbaricons/menu-happiness.png",
  },
];

export function isDesktopDashboardViewport() {
  try {
    return window.matchMedia(DESKTOP_DASHBOARD_MQ).matches;
  } catch (_) {
    return false;
  }
}

function createColFooter() {
  const footer = document.createElement("div");
  footer.className =
    "lp-desktop-dashboard-col-footer app-footer-actions lp-desktop-dashboard-col-footer-actions";
  footer.setAttribute("data-lp-dashboard-col-footer-actions", "");
  return footer;
}

const DESKTOP_COL_EXPAND_ICON =
  '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" d="M7 17 17 7M9 7h8v8"/></svg>';

/**
 * @param {HTMLElement} host
 * @param {string} tabId
 * @param {string} label
 * @param {(tabId: string) => void} navigateToTab
 */
function mountColExpandBtn(host, tabId, label, navigateToTab) {
  const row = document.createElement("div");
  row.className = "lp-desktop-dashboard-col-expand-row";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "lp-desktop-dashboard-col-expand-btn";
  btn.title = `${label} 전체 화면`;
  btn.setAttribute("aria-label", `${label} 전체 화면으로 열기`);
  btn.innerHTML = DESKTOP_COL_EXPAND_ICON;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    navigateToTab(tabId);
  });

  row.appendChild(btn);
  host.insertBefore(row, host.firstElementChild);
}

/**
 * @param {(tabId: string) => void} navigateToTab
 */
function renderQuickKpiButtons(navigateToTab) {
  const wrap = document.createElement("div");
  wrap.className = "lp-desktop-dashboard-quick-kpi";

  const list = document.createElement("div");
  list.className = "lp-desktop-dashboard-quick-kpi-list";
  list.setAttribute("role", "group");
  list.setAttribute("aria-label", "목표 바로가기");

  DESKTOP_QUICK_KPI_TABS.forEach((tab) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "lp-desktop-dashboard-quick-kpi-btn";
    btn.dataset.tabId = tab.id;
    btn.title = tab.label;
    btn.setAttribute("aria-label", tab.label);

    const img = document.createElement("img");
    img.className = "lp-desktop-dashboard-quick-kpi-img";
    img.src = withToolbarIconCacheVersion(tab.icon);
    img.alt = "";
    applyStaticAppIconImg(img);

    const label = document.createElement("span");
    label.className = "lp-desktop-dashboard-quick-kpi-label";
    label.textContent = tab.label;

    btn.append(img, label);
    btn.addEventListener("click", () => navigateToTab(tab.id));
    list.appendChild(btn);
  });

  wrap.appendChild(list);
  return wrap;
}

/**
 * @param {{ navigateToTab: (tabId: string) => void, accountIconSrc: string, onBrandRefresh?: () => void | Promise<void> }} opts
 */
export function renderDesktopDashboard(opts) {
  const root = document.createElement("div");
  root.className = "lp-desktop-dashboard";
  root._lpEmbedSoftRefresh = {};

  const abort = new AbortController();
  root._lpTabAbortController = abort;

  const topBar = document.createElement("div");
  topBar.className = "lp-desktop-dashboard-topbar";

  const brand = document.createElement("button");
  brand.type = "button";
  brand.className = "lp-desktop-dashboard-brand";
  brand.title = "새로고침";
  brand.setAttribute("aria-label", "홈 새로고침");

  const brandImg = document.createElement("img");
  brandImg.className = "lp-desktop-dashboard-brand-img";
  brandImg.src = appBrandLogoUrl();
  brandImg.alt = "";
  applyStaticAppIconImg(brandImg);

  const brandTitle = document.createElement("span");
  brandTitle.className = "lp-desktop-dashboard-brand-title";
  brandTitle.textContent = "두들 플래너";

  brand.append(brandImg, brandTitle);
  brand.addEventListener("click", (e) => {
    e.preventDefault();
    void opts.onBrandRefresh?.();
  });

  const accountBtn = document.createElement("button");
  accountBtn.type = "button";
  accountBtn.className = "lp-desktop-dashboard-account-btn";
  accountBtn.title = "나의 계정";
  accountBtn.setAttribute("aria-label", "나의 계정");
  const accountImg = document.createElement("img");
  accountImg.className = "lp-desktop-dashboard-account-img";
  accountImg.src = withToolbarIconCacheVersion(opts.accountIconSrc || "");
  accountImg.alt = "";
  applyStaticAppIconImg(accountImg);
  const accountLabel = document.createElement("span");
  accountLabel.className = "lp-desktop-dashboard-account-label";
  accountLabel.textContent = "나의 계정";
  accountBtn.append(accountImg, accountLabel);
  accountBtn.addEventListener("click", () => opts.navigateToTab("idea"));
  topBar.append(brand, accountBtn);

  const grid = document.createElement("div");
  grid.className = "lp-desktop-dashboard-grid";

  const colTime = document.createElement("section");
  colTime.className = "lp-desktop-dashboard-col lp-desktop-dashboard-col--time";
  const timeBody = document.createElement("div");
  timeBody.className = "lp-desktop-dashboard-col-body";
  const timeFooter = createColFooter();
  colTime.append(timeBody, timeFooter);

  const colCenter = document.createElement("section");
  colCenter.className = "lp-desktop-dashboard-col lp-desktop-dashboard-col--center";
  const centerTop = document.createElement("div");
  centerTop.className =
    "lp-desktop-dashboard-col-split lp-desktop-dashboard-col-split--top lp-desktop-dashboard-col-split--quick";
  const quickKpiBody = document.createElement("div");
  quickKpiBody.className = "lp-desktop-dashboard-col-body";
  centerTop.appendChild(quickKpiBody);
  const centerBottom = document.createElement("div");
  centerBottom.className = "lp-desktop-dashboard-col-split lp-desktop-dashboard-col-split--bottom";
  const habitBody = document.createElement("div");
  habitBody.className = "lp-desktop-dashboard-col-body";
  centerBottom.appendChild(habitBody);
  colCenter.append(centerTop, centerBottom);

  const colPlanner = document.createElement("section");
  colPlanner.className = "lp-desktop-dashboard-col lp-desktop-dashboard-col--planner";
  const plannerBody = document.createElement("div");
  plannerBody.className = "lp-desktop-dashboard-col-body";
  const plannerFooter = createColFooter();
  colPlanner.append(plannerBody, plannerFooter);

  mountColExpandBtn(colTime, "time", "시간기록", opts.navigateToTab);
  mountColExpandBtn(centerBottom, "habittracker", "루틴 트랙커", opts.navigateToTab);
  mountColExpandBtn(colPlanner, "schedulecalendar", "캘린더", opts.navigateToTab);

  grid.append(colTime, colCenter, colPlanner);
  root.append(topBar, grid);

  const embedCommon = {
    dashboardEmbedMode: true,
    dashboardHost: root,
  };

  const timeEl = renderTime({
    ...embedCommon,
    dashboardEmbedKey: "time",
    footerActionsSlot: timeFooter,
  });
  timeBody.appendChild(timeEl);

  quickKpiBody.appendChild(renderQuickKpiButtons(opts.navigateToTab));

  const habitEl = renderHabitTracker({
    ...embedCommon,
    dashboardEmbedKey: "habit",
  });
  habitBody.appendChild(habitEl);

  const plannerEl = renderMobileScheduleCalendar({
    ...embedCommon,
    dashboardEmbedKey: "planner",
    footerActionsSlot: plannerFooter,
  });
  plannerBody.appendChild(plannerEl);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      /* 오늘로 맞추기·스크롤은 App 홈 진입 시 1회만 — 여기서 반복 호출하지 않음 */
      runDesktopDashboardSoftRefresh(root, { skipEmbedKeys: ["habit"] });
    });
  });

  abort.signal.addEventListener(
    "abort",
    () => {
      root._lpEmbedSoftRefresh = {};
      root._lpEmbedHabitScrollToday = null;
      root._lpEmbedPlannerScrollToday = null;
      root._lpEmbedDidInitialTodayAlign = false;
    },
    { once: true },
  );

  return root;
}

/**
 * 3분할 — 오늘 날짜/스크롤 정렬을 세션당 1회만 수행했는지
 * @param {HTMLElement | null | undefined} dashboardRoot
 */
export function hasDesktopDashboardInitialTodayAlign(dashboardRoot) {
  return !!dashboardRoot?._lpEmbedDidInitialTodayAlign;
}

/**
 * 3분할 최초 진입 시에만 습관·플래너를 오늘로 스크롤
 * @param {HTMLElement | null | undefined} dashboardRoot
 * @returns {boolean} 이번에 정렬했으면 true
 */
export function alignDesktopDashboardEmbedsToTodayOnce(dashboardRoot) {
  const root = dashboardRoot;
  if (!root?.isConnected) return false;
  if (root._lpEmbedDidInitialTodayAlign) return false;
  root._lpEmbedDidInitialTodayAlign = true;
  try {
    root._lpEmbedHabitScrollToday?.();
  } catch (_) {}
  try {
    root._lpEmbedPlannerScrollToday?.();
  } catch (_) {}
  return true;
}

/**
 * @param {HTMLElement | null | undefined} dashboardRoot
 * @param {{ skipEmbedKeys?: string[], force?: boolean }} [opts]
 */
export function runDesktopDashboardSoftRefresh(dashboardRoot, opts = {}) {
  const skip = new Set(
    Array.isArray(opts.skipEmbedKeys)
      ? opts.skipEmbedKeys.map((k) => String(k || "").trim()).filter(Boolean)
      : [],
  );
  const softOpts = opts.force ? { force: true } : {};
  const map = dashboardRoot?._lpEmbedSoftRefresh;
  if (!map || typeof map !== "object") return;
  for (const [key, fn] of Object.entries(map)) {
    if (skip.has(key)) continue;
    try {
      if (typeof fn === "function") fn(softOpts);
    } catch (_) {}
  }
}
