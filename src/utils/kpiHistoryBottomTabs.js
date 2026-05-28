/** KPI 카드 확장 영역 — 할 일 / 매일(습관 KPI일 때만) / 로그 단일 패널 토글 */

export const KPI_BOTTOM_TAB_LOG = "log";
export const KPI_BOTTOM_TAB_TODO = "todo";
export const KPI_BOTTOM_TAB_DAILY = "daily";

const subByKey = new Map();

function storageKey(namespace, kpiId) {
  return `${String(namespace || "kpi")}::${String(kpiId || "")}`;
}

export function getKpiHistoryBottomTab(namespace, kpiId) {
  const v = subByKey.get(storageKey(namespace, kpiId));
  if (
    v === KPI_BOTTOM_TAB_TODO ||
    v === KPI_BOTTOM_TAB_DAILY ||
    v === KPI_BOTTOM_TAB_LOG
  ) {
    return v;
  }
  return KPI_BOTTOM_TAB_TODO;
}

export function setKpiHistoryBottomTab(namespace, kpiId, tab) {
  const t =
    tab === KPI_BOTTOM_TAB_TODO
      ? KPI_BOTTOM_TAB_TODO
      : tab === KPI_BOTTOM_TAB_DAILY
        ? KPI_BOTTOM_TAB_DAILY
        : KPI_BOTTOM_TAB_LOG;
  subByKey.set(storageKey(namespace, kpiId), t);
}

/**
 * @param {string} namespace 예: dream
 * @param {string} kpiId
 * @param {HTMLButtonElement} btnLog
 * @param {HTMLButtonElement} btnTodo
 * @param {HTMLButtonElement | null} btnDaily 매일 탭 없으면 null
 * @param {HTMLElement} panelLog
 * @param {HTMLElement} panelTodo
 * @param {HTMLElement | null} panelDaily
 * @param {boolean} hasDailyTab
 * @param {((tab: string) => void) | null} [onTabChange]
 */
export function wireKpiHistoryBottomTabs(
  namespace,
  kpiId,
  btnLog,
  btnTodo,
  btnDaily,
  panelLog,
  panelTodo,
  panelDaily,
  hasDailyTab,
  onTabChange,
) {
  const apply = (which) => {
    let w = which;
    if (!hasDailyTab && w === KPI_BOTTOM_TAB_DAILY) w = KPI_BOTTOM_TAB_TODO;
    setKpiHistoryBottomTab(namespace, kpiId, w);
    const showLog = w === KPI_BOTTOM_TAB_LOG;
    const showTodo = w === KPI_BOTTOM_TAB_TODO;
    const showDaily = hasDailyTab && w === KPI_BOTTOM_TAB_DAILY;
    btnLog.classList.toggle("active", showLog);
    btnTodo.classList.toggle("active", showTodo);
    btnLog.setAttribute("aria-selected", showLog ? "true" : "false");
    btnTodo.setAttribute("aria-selected", showTodo ? "true" : "false");
    panelLog.hidden = !showLog;
    panelTodo.hidden = !showTodo;
    if (btnDaily && panelDaily) {
      btnDaily.classList.toggle("active", showDaily);
      btnDaily.setAttribute("aria-selected", showDaily ? "true" : "false");
      panelDaily.hidden = !showDaily;
    }
    onTabChange?.(w);
  };

  let initial = getKpiHistoryBottomTab(namespace, kpiId);
  if (!hasDailyTab && initial === KPI_BOTTOM_TAB_DAILY) initial = KPI_BOTTOM_TAB_TODO;
  apply(initial);

  btnLog.addEventListener("click", () => apply(KPI_BOTTOM_TAB_LOG));
  btnTodo.addEventListener("click", () => apply(KPI_BOTTOM_TAB_TODO));
  if (btnDaily) btnDaily.addEventListener("click", () => apply(KPI_BOTTOM_TAB_DAILY));
}
