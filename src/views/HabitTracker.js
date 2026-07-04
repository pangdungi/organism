/**
 * 해빗 트랙커 — 습관 관리
 */

import { setupKpiCategoryHeaderIcon } from "../utils/kpiCategoryHeaderIcon.js";
import { createHabitTrackerPageGridElement } from "../utils/habitTrackerPageGrid.js";
import { pullHabitTrackerTabFromCloud } from "../utils/habitTrackerCloudRefresh.js";

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content dream-view lp-kpi-dream-page";

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "HABIT TRACKER";
  const titleRow = document.createElement("div");
  titleRow.className = "dream-view-header-title-row";
  const title = document.createElement("h1");
  title.className = "dream-view-title";
  title.textContent = "해빗 트랙커";
  titleRow.appendChild(title);
  setupKpiCategoryHeaderIcon(titleRow, "habittracker");
  header.appendChild(label);
  header.appendChild(titleRow);
  el.appendChild(header);

  const contentWrap = document.createElement("div");
  contentWrap.className = "dream-content-wrap habit-tracker-content-wrap";

  const gridHost = document.createElement("div");
  gridHost.className = "habit-tracker-grid-host";
  contentWrap.appendChild(gridHost);
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

  function paintGrid(opts = {}) {
    if (!opts.allowBeforeMount && !el.isConnected) return;
    syncViewMonthGlobal();
    const skipSync = opts.skipSync ?? !hasSyncedPaint;
    gridHost.replaceChildren(
      createHabitTrackerPageGridElement({
        year: viewYear,
        month: viewMonth,
        skipSync,
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
    if (!skipSync) hasSyncedPaint = true;
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

  window.__lpHabitTrackerSoftRefresh = scheduleSoftRefresh;
  syncViewMonthGlobal();
  paintGrid({ skipSync: true, allowBeforeMount: true });

  return el;
}
