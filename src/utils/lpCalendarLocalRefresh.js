/**
 * 사용자가 모달에서 확인(추가·수정·삭제)한 뒤 — 서버 pull 없이 로컬 데이터로 캘린더만 다시 그림.
 * (탭·메뉴 진입 시 pull 은 App 쪽 그대로 유지)
 */
export function lpRefreshAllVisibleCalendarLayoutsFromLocalData() {
  document.querySelectorAll(".calendar-monthly-layout").forEach((layout) => {
    try {
      if (typeof layout._lpRefreshCalendarView === "function") {
        layout._lpRefreshCalendarView();
        return;
      }
      if (typeof layout._lpSoftRefreshAfterPull === "function") {
        layout._lpSoftRefreshAfterPull();
      }
    } catch (_) {}
  });
}
