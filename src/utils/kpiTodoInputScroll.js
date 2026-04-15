/**
 * 모바일 KPI 할일: 키보드·하단 탭 가림 보정용 스크롤
 * — 일시 비활성화: iOS에서 커서·입력줄 어긋남이 스크롤 보정과 겹칠 수 있어 시험 제거
 * — 다시 켜려면 git 히스토리에서 scrollKpiFieldIntoView / attachKpiTodoInputScrollIntoView 구현 복구
 */

/** @param {Element} [_fieldEl] */
export function scrollKpiFieldIntoView(_fieldEl) {}

/** @param {HTMLElement | null} [_historyWrapEl] */
export function afterKpiTodoListMutationScroll(_historyWrapEl) {}

/** @param {HTMLElement} [_inputEl] */
export function attachKpiTodoInputScrollIntoView(_inputEl) {}
