/** KPI 카드 확장 영역 — 할 일 / 매일(습관 KPI일 때만) / 기록(시급상승 실험) */

/** KPI 상세 — 구 로그 탭(시간기록 수치); 시급상승은 KPI_BOTTOM_TAB_NOTES 사용 */
export const KPI_DETAIL_LOGS_UI_ENABLED = false;

/** 시급상승 KPI — 태그·메모 기록 탭 */
export const SIDEINCOME_KPI_NOTES_UI_ENABLED = true;

export const KPI_BOTTOM_TAB_LOG = "log";
export const KPI_BOTTOM_TAB_TODO = "todo";
export const KPI_BOTTOM_TAB_DAILY = "daily";
export const KPI_BOTTOM_TAB_NOTES = "notes";

const subByKey = new Map();

function storageKey(namespace, kpiId) {
  return `${String(namespace || "kpi")}::${String(kpiId || "")}`;
}

/** @param {string} namespace */
export function kpiNotesTabEnabledForNamespace(namespace) {
  return namespace === "sideincome" && SIDEINCOME_KPI_NOTES_UI_ENABLED;
}

/** KPI「매일 반복」— 일반 할 일 없이 매일 할 일·기록만 사용 */
export function kpiUsesDailyTodosOnly(kpi) {
  return !!(kpi && kpi.needHabitTracker);
}

export function getKpiHistoryBottomTab(namespace, kpiId) {
  const v = subByKey.get(storageKey(namespace, kpiId));
  if (v === KPI_BOTTOM_TAB_TODO || v === KPI_BOTTOM_TAB_DAILY) return v;
  if (v === KPI_BOTTOM_TAB_NOTES && kpiNotesTabEnabledForNamespace(namespace)) {
    return v;
  }
  if (v === KPI_BOTTOM_TAB_LOG && KPI_DETAIL_LOGS_UI_ENABLED) return v;
  return KPI_BOTTOM_TAB_TODO;
}

/** 매일 반복 KPI에서 할 일 탭·푸터 추가 등에 쓸 실제 탭 */
export function effectiveKpiHistoryBottomTab(tab, kpi) {
  const t = tab || KPI_BOTTOM_TAB_TODO;
  if (kpiUsesDailyTodosOnly(kpi) && t === KPI_BOTTOM_TAB_TODO) {
    return KPI_BOTTOM_TAB_DAILY;
  }
  return t;
}

/** 기록 탭에서도 + 버튼 표시(시급상승 메모 추가) */
export function kpiHistoryFooterShowsAddButton(tab, kpi) {
  const t = effectiveKpiHistoryBottomTab(tab, kpi);
  if (t === KPI_BOTTOM_TAB_NOTES) return true;
  return t !== KPI_BOTTOM_TAB_LOG;
}

export function setKpiHistoryBottomTab(namespace, kpiId, tab) {
  const t =
    tab === KPI_BOTTOM_TAB_TODO
      ? KPI_BOTTOM_TAB_TODO
      : tab === KPI_BOTTOM_TAB_DAILY
        ? KPI_BOTTOM_TAB_DAILY
        : tab === KPI_BOTTOM_TAB_NOTES
          ? KPI_BOTTOM_TAB_NOTES
          : KPI_BOTTOM_TAB_LOG;
  subByKey.set(storageKey(namespace, kpiId), t);
}

/**
 * @param {string} namespace 예: sideincome
 * @param {string} kpiId
 * @param {HTMLButtonElement | null} btnLog
 * @param {HTMLButtonElement | null} btnTodo 매일 반복 전용 KPI면 null
 * @param {HTMLButtonElement | null} btnDaily 매일 탭 없으면 null
 * @param {HTMLElement | null} panelLog
 * @param {HTMLElement | null} panelTodo 매일 반복 전용 KPI면 null
 * @param {HTMLElement | null} panelDaily
 * @param {boolean} hasDailyTab
 * @param {((tab: string) => void) | null} [onTabChange]
 * @param {{
 *   dailyTodosOnly?: boolean,
 *   btnNotes?: HTMLButtonElement | null,
 *   panelNotes?: HTMLElement | null,
 * }} [options]
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
  options = {},
) {
  const dailyTodosOnly = !!options.dailyTodosOnly;
  const btnNotes = options.btnNotes || null;
  const panelNotes = options.panelNotes || null;
  const notesUi =
    kpiNotesTabEnabledForNamespace(namespace) && btnNotes && panelNotes;
  const logsUi = KPI_DETAIL_LOGS_UI_ENABLED && btnLog && panelLog;

  const apply = (which) => {
    let w = which;
    if (!logsUi && w === KPI_BOTTOM_TAB_LOG) w = KPI_BOTTOM_TAB_TODO;
    if (!notesUi && w === KPI_BOTTOM_TAB_NOTES) w = KPI_BOTTOM_TAB_TODO;
    if (dailyTodosOnly && w === KPI_BOTTOM_TAB_TODO) w = KPI_BOTTOM_TAB_DAILY;
    if (!hasDailyTab && w === KPI_BOTTOM_TAB_DAILY) w = KPI_BOTTOM_TAB_TODO;
    setKpiHistoryBottomTab(namespace, kpiId, w);
    const showLog = logsUi && w === KPI_BOTTOM_TAB_LOG;
    const showNotes = notesUi && w === KPI_BOTTOM_TAB_NOTES;
    const showTodo = !dailyTodosOnly && w === KPI_BOTTOM_TAB_TODO;
    const showDaily = hasDailyTab && w === KPI_BOTTOM_TAB_DAILY;
    if (logsUi) {
      btnLog.classList.toggle("active", showLog);
      btnLog.setAttribute("aria-selected", showLog ? "true" : "false");
      panelLog.hidden = !showLog;
    }
    if (notesUi) {
      btnNotes.classList.toggle("active", showNotes);
      btnNotes.setAttribute("aria-selected", showNotes ? "true" : "false");
      panelNotes.hidden = !showNotes;
    }
    if (btnTodo && panelTodo) {
      btnTodo.classList.toggle("active", showTodo);
      btnTodo.setAttribute("aria-selected", showTodo ? "true" : "false");
      panelTodo.hidden = !showTodo;
    }
    if (btnDaily && panelDaily) {
      btnDaily.classList.toggle("active", showDaily);
      btnDaily.setAttribute("aria-selected", showDaily ? "true" : "false");
      panelDaily.hidden = !showDaily;
    }
    onTabChange?.(w);
  };

  let initial = getKpiHistoryBottomTab(namespace, kpiId);
  if (dailyTodosOnly && initial === KPI_BOTTOM_TAB_TODO) {
    initial = KPI_BOTTOM_TAB_DAILY;
  }
  if (!hasDailyTab && initial === KPI_BOTTOM_TAB_DAILY) initial = KPI_BOTTOM_TAB_TODO;
  apply(initial);

  if (logsUi) btnLog.addEventListener("click", () => apply(KPI_BOTTOM_TAB_LOG));
  if (notesUi) btnNotes.addEventListener("click", () => apply(KPI_BOTTOM_TAB_NOTES));
  if (btnTodo) btnTodo.addEventListener("click", () => apply(KPI_BOTTOM_TAB_TODO));
  if (btnDaily) btnDaily.addEventListener("click", () => apply(KPI_BOTTOM_TAB_DAILY));
}
