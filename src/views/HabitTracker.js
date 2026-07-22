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
  habitTrackerWeekDateKeys,
} from "../utils/habitTrackerPageModel.js";
import {
  buildHabitTrackerWeekInsightModel,
  createHabitTrackerInsightSection,
} from "../utils/habitTrackerInsightCards.js";
import {
  buildHabitTrackerTodayDailyRingModel,
  createHabitTrackerTodayRingElement,
} from "../utils/habitTrackerTodayRing.js";

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
  /** 3분할 — 1주 뷰 기준일(해당 주 월~일) */
  let viewWeekAnchorYmd = timeLedgerLocalTodayYmd();
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
    insightHost.replaceChildren(
      createHabitTrackerInsightSection(model, { skipSync: !!skipSync }),
    );
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
    paintInsightCards(skipSync);
    paintTodayRing(skipSync);
    if (!skipSync) hasSyncedPaint = true;
  }

  /** 3분할 — 오늘이 들어 있는 주로 맞추기 */
  function scrollTodayInEmbed() {
    if (!dashboardEmbedMode || !el.isConnected) return;
    const todayYmd = timeLedgerLocalTodayYmd();
    const todayWeek = habitTrackerWeekDateKeys(todayYmd)[0] || todayYmd;
    const curWeek = habitTrackerWeekDateKeys(viewWeekAnchorYmd)[0] || viewWeekAnchorYmd;
    if (todayWeek !== curWeek) {
      viewWeekAnchorYmd = todayYmd;
      const mid = habitTrackerWeekDateKeys(todayYmd)[3] || todayYmd;
      viewYear = Number(mid.slice(0, 4)) || viewYear;
      viewMonth = Number(mid.slice(5, 7)) || viewMonth;
      syncViewMonthGlobal();
      hasSyncedPaint = true;
      paintGrid({ skipSync: false });
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

  /* 전체 탭·3분할 모두 — 시간기록 저장 후 window 훅으로도 다시 그릴 수 있게 */
  window.__lpHabitTrackerSoftRefresh = scheduleSoftRefresh;
  if (dashboardEmbedMode && dashboardHost && dashboardEmbedKey) {
    dashboardHost._lpEmbedSoftRefresh = dashboardHost._lpEmbedSoftRefresh || {};
    dashboardHost._lpEmbedSoftRefresh[dashboardEmbedKey] = scheduleSoftRefresh;
    dashboardHost._lpEmbedHabitScrollToday = scrollTodayInEmbed;
  }
  syncViewMonthGlobal();
  paintGrid({ skipSync: true, allowBeforeMount: true });

  return el;
}
