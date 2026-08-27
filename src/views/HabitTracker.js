/**
 * 해빗 트랙커 — 오늘의 행동 / 간트 / 성공·실패 / 전체 할일 / 행동 트래커
 */

import {
  KPI_TWOPANE_SPLIT_MQ,
  isKpiTwoPaneSplitViewport,
  setKpiFooterBackVisible,
  ensureKpiHeaderBackButton,
} from "../utils/kpiTwoPaneSplit.js";
import {
  createHabitTrackerPageGridElement,
} from "../utils/habitTrackerPageGrid.js";
import { pullHabitTrackerTabFromCloud } from "../utils/habitTrackerCloudRefresh.js";
import { timeLedgerLocalTodayYmd } from "../utils/timeLedgerEntriesSupabase.js";
import {
  habitTrackerWeekDateKeys,
} from "../utils/habitTrackerPageModel.js";
import { mountKpiActiveGanttView } from "../utils/kpiActiveGanttView.js";
import { collectGoalTrackerActiveKpis } from "../utils/kpiGoalTrackerActiveKpis.js";
import {
  captureAllTodosBoardScrollState,
  mountKpiGoalAllTodosSection,
} from "../utils/kpiGoalTrackerAllTodos.js";
import { mountKpiGoalSuccessFailSection } from "../utils/kpiGoalTrackerSuccessFail.js";
import { mountKpiGoalTodayGoalsSection } from "../utils/kpiGoalTrackerTodayGoals.js";

const MAIN_VIEW_KEY = "lp_habit_tracker_main_view";

/** @typedef {"today"|"gantt"|"successfail"|"alltodos"|"routine"} HabitMainView */

const MAIN_VIEWS = /** @type {const} */ ([
  "today",
  "gantt",
  "successfail",
  "alltodos",
  "routine",
]);

const VIEW_CHROME = {
  today: { label: "TODAY'S ACTIONS", title: "오늘의 행동" },
  gantt: { label: "GANTT CHART", title: "간트 차트" },
  successfail: { label: "SUCCESS · FAIL", title: "성공·실패표" },
  alltodos: { label: "ALL TODOS", title: "전체 할일" },
  routine: { label: "ACTION TRACKER", title: "행동 트래커" },
};

/** @returns {HabitMainView} */
function readMainView() {
  try {
    const v = sessionStorage.getItem(MAIN_VIEW_KEY);
    if (v === "goals") return "today";
    if (MAIN_VIEWS.includes(/** @type {HabitMainView} */ (v))) {
      return /** @type {HabitMainView} */ (v);
    }
  } catch (_) {}
  return "today";
}

/** @param {HabitMainView} mode */
function writeMainView(mode) {
  const m = MAIN_VIEWS.includes(mode) ? mode : "today";
  try {
    sessionStorage.setItem(MAIN_VIEW_KEY, m);
  } catch (_) {}
  return m;
}

async function pullMonthsCoveringYmds(ymdList) {
  const seen = new Set();
  for (const ymd of ymdList || []) {
    const key = String(ymd || "").slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7));
    try {
      await pullHabitTrackerTabFromCloud(y, m);
    } catch (_) {}
  }
}

export function render(opts = {}) {
  const dashboardEmbedMode = !!opts?.dashboardEmbedMode;
  const dashboardHost = opts?.dashboardHost || null;
  const dashboardEmbedKey = String(opts?.dashboardEmbedKey || "").trim();
  const el = document.createElement("div");
  el.className = "app-tab-panel-content dream-view lp-kpi-dream-page";
  if (dashboardEmbedMode) el.classList.add("habit-tracker-view--dashboard-embed");

  let label = null;
  let title = null;
  if (!dashboardEmbedMode) {
    const header = document.createElement("header");
    header.className = "dream-view-header";
    const titleRow = document.createElement("div");
    titleRow.className = "dream-view-header-title-row";
    const textCol = document.createElement("div");
    textCol.className = "dream-view-header-text";
    label = document.createElement("span");
    label.className = "dream-view-label";
    label.textContent = VIEW_CHROME.today.label;
    const titleInner = document.createElement("div");
    titleInner.className = "dream-view-header-title-inner";
    title = document.createElement("h1");
    title.className = "dream-view-title";
    title.textContent = VIEW_CHROME.today.title;
    titleInner.appendChild(title);
    textCol.append(label, titleInner);
    titleRow.appendChild(textCol);
    ensureKpiHeaderBackButton(titleRow, { label: "오늘(메인)으로" });
    header.appendChild(titleRow);
    el.appendChild(header);
  }

  /** @type {HabitMainView} */
  let mainView = dashboardEmbedMode ? "today" : readMainView();

  const viewModeBar = document.createElement("div");
  viewModeBar.className =
    "dream-kpi-filter-bar habit-tracker-main-view-bar habit-tracker-main-view-bar--five";
  viewModeBar.setAttribute("role", "tablist");
  viewModeBar.setAttribute("aria-label", "진행 상황 보기");
  viewModeBar.innerHTML = `
    <button type="button" class="dream-kpi-filter-btn" data-main-view="today" role="tab">오늘의 행동</button>
    <button type="button" class="dream-kpi-filter-btn" data-main-view="gantt" role="tab">간트 차트</button>
    <button type="button" class="dream-kpi-filter-btn" data-main-view="successfail" role="tab">성공·실패표</button>
    <button type="button" class="dream-kpi-filter-btn" data-main-view="alltodos" role="tab">전체 할일</button>
    <button type="button" class="dream-kpi-filter-btn" data-main-view="routine" role="tab">행동 트래커</button>
  `;
  if (!dashboardEmbedMode) {
    el.appendChild(viewModeBar);
  }

  const contentWrap = document.createElement("div");
  contentWrap.className = "dream-content-wrap habit-tracker-content-wrap";

  const routineBlock = document.createElement("div");
  routineBlock.className = "habit-tracker-routine-block";

  const gridHost = document.createElement("div");
  gridHost.className = "habit-tracker-grid-host";
  routineBlock.appendChild(gridHost);

  const goalHost = document.createElement("div");
  goalHost.className = "habit-tracker-goal-host";
  goalHost.hidden = true;

  if (!dashboardEmbedMode) {
    contentWrap.appendChild(routineBlock);
  }
  contentWrap.appendChild(goalHost);
  el.appendChild(contentWrap);

  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth() + 1;
  let viewWeekAnchorYmd = timeLedgerLocalTodayYmd();
  let successFailWeekAnchorYmd = timeLedgerLocalTodayYmd();
  let paintGen = 0;
  let hasSyncedPaint = false;

  function syncViewMonthGlobal() {
    try {
      window.__lpHabitTrackerViewMonth = { year: viewYear, month: viewMonth };
    } catch (_) {}
  }

  function syncHeaderChrome() {
    if (!label || !title) return;
    const chrome = VIEW_CHROME[mainView] || VIEW_CHROME.today;
    label.textContent = chrome.label;
    title.textContent = chrome.title;
  }

  function syncHabitDesktopBack() {
    if (dashboardEmbedMode) return;
    const wide = isKpiTwoPaneSplitViewport();
    el.classList.toggle("habit-tracker-view--wide", wide);
    setKpiFooterBackVisible(
      document.querySelector("[data-lp-app-footer-back]"),
      !wide,
    );
  }

  function syncViewModeBar() {
    viewModeBar.querySelectorAll(".dream-kpi-filter-btn").forEach((btn) => {
      const on = btn.dataset.mainView === mainView;
      btn.classList.toggle("active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function paintTodayGoals(opts = {}) {
    if (!goalHost) return;
    goalHost.replaceChildren();
    goalHost.classList.toggle(
      "habit-tracker-goal-host--panel",
      !dashboardEmbedMode,
    );
    const skipSync = opts.skipSync ?? !hasSyncedPaint;
    mountKpiGoalTodayGoalsSection(goalHost, {
      pinChrome: true,
      skipSync,
    });
    if (!skipSync) hasSyncedPaint = true;
  }

  function paintGanttOnly() {
    if (!goalHost) return;
    goalHost.replaceChildren();
    goalHost.classList.add("habit-tracker-goal-host--panel");
    const { kpis, getProgressPct } = collectGoalTrackerActiveKpis();
    mountKpiActiveGanttView(goalHost, kpis, {
      getProgressPct,
      collapsible: false,
      emptyMessage:
        "진행중이면서 시작·마감일이 있는 행동이 없습니다. (시급·건강·행복)",
    });
  }

  function paintSuccessFailOnly(opts = {}) {
    if (!goalHost) return;
    goalHost.replaceChildren();
    goalHost.classList.add("habit-tracker-goal-host--panel");
    const scroll = document.createElement("div");
    scroll.className = "habit-tracker-goal-panel-scroll";
    goalHost.appendChild(scroll);
    const skipSync = opts.skipSync ?? !hasSyncedPaint;
    mountKpiGoalSuccessFailSection(scroll, {
      weekAnchorYmd: successFailWeekAnchorYmd || timeLedgerLocalTodayYmd(),
      skipSync,
      onWeekChange: (nextAnchorYmd) => {
        successFailWeekAnchorYmd = String(nextAnchorYmd || "").slice(0, 10);
        paintSuccessFailOnly({ skipSync: true });
      },
    });
    if (!skipSync) hasSyncedPaint = true;
  }

  function paintAllTodosOnly() {
    if (!goalHost) return;
    const snap = captureAllTodosBoardScrollState(goalHost);
    const keepScrollLeft =
      snap.boardScrollLeft ||
      Number(goalHost._lpAllTodosBoardScrollLeft) ||
      0;
    const listScrollByKpi = {
      ...(goalHost._lpAllTodosListScrollByKpi || {}),
      ...snap.listScrollByKpi,
    };
    goalHost._lpAllTodosBoardScrollLeft = keepScrollLeft;
    goalHost._lpAllTodosListScrollByKpi = listScrollByKpi;
    goalHost.replaceChildren();
    goalHost.classList.remove("habit-tracker-goal-host--panel");
    mountKpiGoalAllTodosSection(goalHost, {
      boardScrollLeft: keepScrollLeft,
      listScrollByKpi,
    });
  }

  function paintGrid(opts = {}) {
    if (!opts.allowBeforeMount && !el.isConnected) return;
    syncViewMonthGlobal();
    const skipSync = opts.skipSync ?? !hasSyncedPaint;
    if (dashboardEmbedMode) {
      gridHost.replaceChildren(
        createHabitTrackerPageGridElement({
          viewMode: "week",
          weekAnchorYmd: viewWeekAnchorYmd,
          skipSync,
          autoScrollToday: false,
          onWeekChange: async (nextAnchorYmd) => {
            viewWeekAnchorYmd = String(nextAnchorYmd || "").slice(0, 10);
            const weekKeys = habitTrackerWeekDateKeys(viewWeekAnchorYmd);
            const mid = weekKeys[3] || weekKeys[0] || viewWeekAnchorYmd;
            viewYear = Number(mid.slice(0, 4)) || viewYear;
            viewMonth = Number(mid.slice(5, 7)) || viewMonth;
            syncViewMonthGlobal();
            const gen = ++paintGen;
            paintGrid({ skipSync: true });
            await pullMonthsCoveringYmds(weekKeys);
            if (gen !== paintGen || !el.isConnected) return;
            hasSyncedPaint = true;
            paintGrid({ skipSync: false });
          },
        }),
      );
    } else {
      gridHost.replaceChildren(
        createHabitTrackerPageGridElement({
          year: viewYear,
          month: viewMonth,
          skipSync,
          autoScrollToday: true,
          onMonthChange: async (next) => {
            viewYear = next.year;
            viewMonth = next.month;
            syncViewMonthGlobal();
            const gen = ++paintGen;
            paintGrid({ skipSync: true });
            try {
              await pullHabitTrackerTabFromCloud(viewYear, viewMonth);
            } catch (_) {}
            if (gen !== paintGen || !el.isConnected) return;
            hasSyncedPaint = true;
            paintGrid({ skipSync: false });
          },
        }),
      );
    }
    if (!skipSync) hasSyncedPaint = true;
  }

  function paintActiveView(opts = {}) {
    if (dashboardEmbedMode) {
      routineBlock.hidden = true;
      goalHost.hidden = false;
      paintTodayGoals(opts);
      return;
    }

    const isRoutine = mainView === "routine";
    routineBlock.hidden = !isRoutine;
    goalHost.hidden = isRoutine;

    if (isRoutine) {
      if (!gridHost.hasChildNodes() || opts.forceGrid) {
        /* 첫 페인트는 sync 생략 — 칸 계산이 무거움 */
        paintGrid({
          skipSync: true,
          allowBeforeMount: true,
        });
        hasSyncedPaint = true;
      }
      return;
    }
    if (mainView === "today") {
      paintTodayGoals(opts);
      return;
    }
    if (mainView === "gantt") {
      paintGanttOnly();
      return;
    }
    if (mainView === "alltodos") {
      paintAllTodosOnly();
      return;
    }
    paintSuccessFailOnly(opts);
  }

  function applyMainView() {
    syncHeaderChrome();
    syncHabitDesktopBack();
    if (!dashboardEmbedMode) syncViewModeBar();
    contentWrap.dataset.habitView = mainView;
    paintActiveView();
  }

  if (!dashboardEmbedMode) {
    viewModeBar.querySelectorAll(".dream-kpi-filter-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const next = /** @type {HabitMainView} */ (
          String(btn.dataset.mainView || "today")
        );
        if (!MAIN_VIEWS.includes(next) || next === mainView) return;
        mainView = writeMainView(next);
        applyMainView();
      });
    });
  }

  let softRefreshRaf = 0;
  function scheduleSoftRefresh() {
    if (!el.isConnected) return;
    if (softRefreshRaf) return;
    softRefreshRaf = requestAnimationFrame(() => {
      softRefreshRaf = 0;
      /* pull 쪽에서 이미 sync — 행동 트래커는 보이는 중일 때만 격자 재생성 */
      hasSyncedPaint = true;
      paintActiveView({
        skipSync: true,
        forceGrid: mainView === "routine",
      });
    });
  }

  window.__lpHabitTrackerSoftRefresh = scheduleSoftRefresh;
  if (dashboardEmbedMode && dashboardHost && dashboardEmbedKey) {
    dashboardHost._lpEmbedSoftRefresh = dashboardHost._lpEmbedSoftRefresh || {};
    dashboardHost._lpEmbedSoftRefresh[dashboardEmbedKey] = scheduleSoftRefresh;
  }
  syncViewMonthGlobal();
  applyMainView();

  if (!dashboardEmbedMode) {
    /** @type {MediaQueryList | null} */
    let wideMql = null;
    function onWideViewportChange() {
      if (!el.isConnected) return;
      syncHabitDesktopBack();
    }
    try {
      wideMql = window.matchMedia(KPI_TWOPANE_SPLIT_MQ);
      if (wideMql.addEventListener) {
        wideMql.addEventListener("change", onWideViewportChange);
      } else if (wideMql.addListener) {
        wideMql.addListener(onWideViewportChange);
      }
    } catch (_) {
      wideMql = null;
    }
  }

  return el;
}
