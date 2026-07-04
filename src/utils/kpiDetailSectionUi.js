/**
 * KPI 상세 — 로그 탭 제거 후 할 일·매일할일 섹션(제목 + 목록)
 */

import { mountKpiSegBarClearCompletedRow } from "./kpiTodoBulkDeleteUi.js";
import {
  KPI_BOTTOM_TAB_DAILY,
  KPI_BOTTOM_TAB_TODO,
  setKpiHistoryBottomTab,
} from "./kpiHistoryBottomTabs.js";

/** @param {string} title */
export function createKpiDetailSectionHeader(title) {
  const header = document.createElement("div");
  header.className = "dream-kpi-todo-header dream-kpi-detail-section-header";
  const titleEl = document.createElement("span");
  titleEl.className = "dream-kpi-todo-title";
  titleEl.textContent = title;
  header.appendChild(titleEl);
  return header;
}

function stripDailyPanelInnerHeader(dailyPanel) {
  dailyPanel?.querySelector(".dream-kpi-todo-header")?.remove();
  dailyPanel?.querySelector(".dream-kpi-todo-divider")?.remove();
}

/**
 * @param {HTMLElement} target
 * @param {{
 *   namespace: string,
 *   kpiId: string,
 *   todoPanel: HTMLElement | null,
 *   dailyPanel: HTMLElement | null,
 *   dailyTodosOnly: boolean,
 *   hasDailyTab: boolean,
 *   dailyTitle?: string,
 *   todoTitle?: string,
 *   clearCompleted: {
 *     showClearCompleted: boolean,
 *     kpiId: string,
 *     loadMap: () => object,
 *     saveMap: (data: object, opts?: { pushServer?: boolean }) => void,
 *     appendDeletedRef: (data: object, kind: string, id: string) => void,
 *     onAfterDelete?: () => void,
 *   },
 * }} config
 */
export function mountKpiDetailStackedSections(target, config) {
  const {
    namespace,
    kpiId,
    todoPanel,
    dailyPanel,
    dailyTodosOnly,
    hasDailyTab,
    dailyTitle = "매일할일",
    todoTitle = "할 일",
    clearCompleted,
  } = config;

  target.classList.add("dream-kpi-detail-sections--stacked");

  if (!dailyTodosOnly && todoPanel) {
    const todoHead = createKpiDetailSectionHeader(todoTitle);
    target.appendChild(
      mountKpiSegBarClearCompletedRow(todoHead, {
        ...clearCompleted,
        showClearCompleted: true,
      }),
    );
    target.appendChild(todoPanel);
    setKpiHistoryBottomTab(namespace, kpiId, KPI_BOTTOM_TAB_TODO);
  }

  if (hasDailyTab && dailyPanel) {
    stripDailyPanelInnerHeader(dailyPanel);
    const dailyHead = createKpiDetailSectionHeader(dailyTitle);
    if (dailyTodosOnly) {
      target.appendChild(dailyHead);
      setKpiHistoryBottomTab(namespace, kpiId, KPI_BOTTOM_TAB_DAILY);
    } else {
      target.appendChild(dailyHead);
    }
    target.appendChild(dailyPanel);
  }
}
