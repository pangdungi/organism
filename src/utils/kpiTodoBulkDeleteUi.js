/**
 * KPI 일반 할 일(kpiTodos) — 완료 항목 일괄 삭제(휴지통·세그 바 오른쪽)
 */

import { showAlertModal, showConfirmModal } from "./confirmModal.js";

export const KPI_SEG_CLEAR_COMPLETED_TRASH_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';

/**
 * @param {Array<{ kpiId?: string, completed?: boolean, text?: string }>} kpiTodos
 * @param {string} kpiId
 */
export function countCompletedKpiTodosForKpi(kpiTodos, kpiId) {
  const kid = String(kpiId ?? "");
  return (kpiTodos || []).filter(
    (t) =>
      String(t?.kpiId ?? "") === kid &&
      !!t.completed &&
      String(t?.text ?? "").trim() !== "",
  ).length;
}

/**
 * @param {object} data KPI 맵 payload
 * @param {string} kpiId
 * @param {(data: object, kind: string, id: string) => void} appendDeletedRefFn
 * @returns {number} removed count
 */
export function purgeCompletedKpiTodosForKpi(data, kpiId, appendDeletedRefFn) {
  const kid = String(kpiId ?? "");
  const todos = Array.isArray(data.kpiTodos) ? data.kpiTodos : [];
  const toRemove = todos.filter((t) => String(t?.kpiId ?? "") === kid && !!t.completed);
  for (const t of toRemove) {
    appendDeletedRefFn(data, "kpiTodos", t.id);
  }
  data.kpiTodos = todos.filter((t) => !(String(t?.kpiId ?? "") === kid && !!t.completed));
  return toRemove.length;
}

/**
 * 할 일·로그 세그 바 오른쪽에 완료 할 일 삭제(휴지통) 버튼
 * @param {HTMLElement} segBar
 * @param {{
 *   showClearCompleted: boolean,
 *   kpiId: string,
 *   loadMap: () => object,
 *   saveMap: (data: object, opts?: { pushServer?: boolean }) => void,
 *   appendDeletedRef: (data: object, kind: string, id: string) => void,
 *   onAfterDelete?: () => void,
 * }} options
 * @returns {HTMLElement}
 */
export function mountKpiSegBarClearCompletedRow(segBar, options) {
  const {
    showClearCompleted,
    kpiId,
    loadMap,
    saveMap,
    appendDeletedRef,
    onAfterDelete,
  } = options;

  if (!showClearCompleted) return segBar;

  const isSectionHead = segBar.classList?.contains("dream-kpi-detail-section-header");
  const row = document.createElement("div");
  row.className = isSectionHead
    ? "dream-kpi-detail-section-head-row"
    : "dream-kpi-bottom-seg-row";
  const segBarCenter = document.createElement("div");
  segBarCenter.className = isSectionHead
    ? "dream-kpi-detail-section-head-center"
    : "dream-kpi-bottom-seg-bar-center";
  segBarCenter.appendChild(segBar);
  row.appendChild(segBarCenter);

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dream-kpi-bottom-seg-clear-completed-btn";
  btn.setAttribute("aria-label", "완료한 할 일 삭제");
  btn.title = "완료한 할 일 삭제";
  btn.innerHTML = KPI_SEG_CLEAR_COMPLETED_TRASH_ICON;

  btn.addEventListener("click", async () => {
    const snapshot = loadMap();
    const n = countCompletedKpiTodosForKpi(snapshot.kpiTodos, kpiId);
    if (n === 0) {
      await showAlertModal({
        title: "완료한 할 일 삭제",
        message: "삭제할 완료한 할 일이 없습니다.",
      });
      return;
    }
    const ok = await showConfirmModal({
      title: "완료한 할 일 삭제",
      message: `완료한 할 일 ${n}개를 삭제할까요?`,
      warnMessage: "삭제 후에는 복구할 수 없습니다.",
      confirmText: "삭제",
      cancelText: "취소",
      confirmDanger: true,
    });
    if (!ok) return;
    const d = loadMap();
    purgeCompletedKpiTodosForKpi(d, kpiId, appendDeletedRef);
    saveMap(d, { pushServer: true });
    onAfterDelete?.();
  });

  row.appendChild(btn);
  return row;
}
