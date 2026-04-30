/** KPI 일지 영역 — 매일할일(습관) 있을 때 로그 / 트랙커 하위 탭 */

export const KPI_HISTORY_HABIT_TAB_LOG = "log";
export const KPI_HISTORY_HABIT_TAB_TRACKER = "tracker";

const subByKey = new Map();

function storageKey(namespace, kpiId) {
  return `${String(namespace || "kpi")}::${String(kpiId || "")}`;
}

export function getKpiHistoryHabitSubTab(namespace, kpiId) {
  const v = subByKey.get(storageKey(namespace, kpiId));
  return v === KPI_HISTORY_HABIT_TAB_TRACKER
    ? KPI_HISTORY_HABIT_TAB_TRACKER
    : KPI_HISTORY_HABIT_TAB_LOG;
}

export function setKpiHistoryHabitSubTab(namespace, kpiId, tab) {
  subByKey.set(
    storageKey(namespace, kpiId),
    tab === KPI_HISTORY_HABIT_TAB_TRACKER
      ? KPI_HISTORY_HABIT_TAB_TRACKER
      : KPI_HISTORY_HABIT_TAB_LOG,
  );
}

/**
 * @param {string} namespace dream | health | happiness | love | sideincome
 * @param {string} kpiId
 * @param {HTMLButtonElement} btnLog
 * @param {HTMLButtonElement} btnTr
 * @param {HTMLElement} panelLog
 * @param {HTMLElement} panelTr
 */
export function wireKpiHistoryHabitTabs(
  namespace,
  kpiId,
  btnLog,
  btnTr,
  panelLog,
  panelTr,
) {
  const apply = (which) => {
    setKpiHistoryHabitSubTab(namespace, kpiId, which);
    const isLog = which === KPI_HISTORY_HABIT_TAB_LOG;
    btnLog.classList.toggle("active", isLog);
    btnTr.classList.toggle("active", !isLog);
    btnLog.setAttribute("aria-selected", isLog ? "true" : "false");
    btnTr.setAttribute("aria-selected", !isLog ? "true" : "false");
    panelLog.hidden = !isLog;
    panelTr.hidden = isLog;
  };
  apply(getKpiHistoryHabitSubTab(namespace, kpiId));
  btnLog.addEventListener("click", () => apply(KPI_HISTORY_HABIT_TAB_LOG));
  btnTr.addEventListener("click", () => apply(KPI_HISTORY_HABIT_TAB_TRACKER));
}
