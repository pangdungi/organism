/**
 * 해빗 트랙커 — 습관 관리
 */

import { setupKpiCategoryHeaderIcon } from "../utils/kpiCategoryHeaderIcon.js";
import {
  createHabitTrackerPageGridElement,
  scheduleScrollHabitTrackerToToday,
  scrollHabitTrackerToToday,
} from "../utils/habitTrackerPageGrid.js";
import { pullHabitTrackerTabFromCloud } from "../utils/habitTrackerCloudRefresh.js";
import { timeLedgerLocalTodayYmd } from "../utils/timeLedgerEntriesSupabase.js";
import {
  buildHabitTrackerWeekInsightModel,
  createHabitTrackerInsightSection,
} from "../utils/habitTrackerInsightCards.js";
import {
  buildHabitTrackerTodayDailyRingModel,
  createHabitTrackerTodayRingElement,
} from "../utils/habitTrackerTodayRing.js";

export function render(opts = {}) {
  const dashboardEmbedMode = !!opts?.dashboardEmbedMode;
  const dashboardHost = opts?.dashboardHost || null;
  const dashboardEmbedKey = String(opts?.dashboardEmbedKey || "").trim();
  const el = document.createElement("div");
  el.className = "app-tab-panel-content dream-view lp-kpi-dream-page";
  if (dashboardEmbedMode) el.classList.add("habit-tracker-view--dashboard-embed");

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "ROUTINE TRACKER";
  const titleRow = document.createElement("div");
  titleRow.className = "dream-view-header-title-row";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "루틴 트랙커";
  titleRow.appendChild(title);
  setupKpiCategoryHeaderIcon(titleRow, "habittracker");
  header.appendChild(label);
  header.appendChild(titleRow);
  el.appendChild(header);

  const contentWrap = document.createElement("div");
  contentWrap.className = "dream-content-wrap habit-tracker-content-wrap";

  /** 원형 링(위) — 홈 3분할 embed만 / 표 / 레포트 카드 — 전체 탭만 */
  let insightHost = null;
  let todayRingHost = null;
  if (dashboardEmbedMode) {
    todayRingHost = document.createElement("div");
    todayRingHost.className = "habit-tracker-today-ring-host";
    contentWrap.appendChild(todayRingHost);
  }

  const gridHost = document.createElement("div");
  gridHost.className = "habit-tracker-grid-host";
  contentWrap.appendChild(gridHost);

  if (!dashboardEmbedMode) {
    insightHost = document.createElement("div");
    insightHost.className = "habit-tracker-insight-host";
    contentWrap.appendChild(insightHost);
  }
  el.appendChild(contentWrap);

  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth() + 1;
  let paintGen = 0;
  let hasSyncedPaint = false;

  function syncViewMonthGlobal() {
    try {
      window.__lpHabitTrackerViewMonth = { year: viewYear, month: viewMonth };
    } catch (_) {}
  }

  function paintInsightCards(skipSync) {
    if (!insightHost) return;
    const model = buildHabitTrackerWeekInsightModel({ skipSync: !!skipSync });
    insightHost.replaceChildren(createHabitTrackerInsightSection(model));
  }

  function paintTodayRing(skipSync) {
    if (!todayRingHost) return;
    const model = buildHabitTrackerTodayDailyRingModel({ skipSync: !!skipSync });
    todayRingHost.replaceChildren(createHabitTrackerTodayRingElement(model));
  }

  function paintGrid(opts = {}) {
    if (!opts.allowBeforeMount && !el.isConnected) return;
    syncViewMonthGlobal();
    const skipSync = opts.skipSync ?? !hasSyncedPaint;
    gridHost.replaceChildren(
      createHabitTrackerPageGridElement({
        year: viewYear,
        month: viewMonth,
        skipSync,
        autoScrollToday: !dashboardEmbedMode,
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
    paintInsightCards(skipSync);
    paintTodayRing(skipSync);
    if (!skipSync) hasSyncedPaint = true;
  }

  /** 3분할 — DOM 통째 교체 없이 오늘 칸으로만 스크롤 (깜빡임 방지) */
  function scrollTodayInEmbed() {
    if (!dashboardEmbedMode || !el.isConnected) return;
    const todayYmd = timeLedgerLocalTodayYmd();
    const now = new Date();
    const ty = now.getFullYear();
    const tm = now.getMonth() + 1;
    const monthChanged = viewYear !== ty || viewMonth !== tm;
    if (monthChanged) {
      viewYear = ty;
      viewMonth = tm;
      syncViewMonthGlobal();
      hasSyncedPaint = true;
      paintGrid({ skipSync: false });
      scheduleScrollHabitTrackerToToday(gridHost, todayYmd);
      return;
    }
    if (!scrollHabitTrackerToToday(gridHost, todayYmd)) {
      scheduleScrollHabitTrackerToToday(gridHost, todayYmd);
    }
  }

  let softRefreshRaf = 0;
  function scheduleSoftRefresh() {
    if (!el.isConnected) return;
    if (softRefreshRaf) return;
    softRefreshRaf = requestAnimationFrame(() => {
      softRefreshRaf = 0;
      hasSyncedPaint = true;
      paintGrid({ skipSync: false });
    });
  }

  if (dashboardEmbedMode && dashboardHost && dashboardEmbedKey) {
    dashboardHost._lpEmbedSoftRefresh = dashboardHost._lpEmbedSoftRefresh || {};
    dashboardHost._lpEmbedSoftRefresh[dashboardEmbedKey] = scheduleSoftRefresh;
    dashboardHost._lpEmbedHabitScrollToday = scrollTodayInEmbed;
  } else {
    window.__lpHabitTrackerSoftRefresh = scheduleSoftRefresh;
  }
  syncViewMonthGlobal();
  paintGrid({ skipSync: true, allowBeforeMount: true });

  return el;
}
