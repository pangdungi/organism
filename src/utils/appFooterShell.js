/**
 * 앱 하단 푸터 액션 행 — `data-lp-app-footer-actions` 컨테이너 안에
 * 뒤로가기(`data-lp-app-footer-back`) + 탭이 붙인 아이콘 버튼이 들어가며,
 * main.css에서 칸 단위로 가로 균등 분할합니다.
 * 스타일: APP_FOOTER_ICON_BTN_CLASS 를 버튼에 넣으면 main.css 앱 푸터 공통 규격과 맞습니다.
 */
export const APP_FOOTER_ICON_BTN_CLASS = "app-footer-icon-btn";

export function getAppFooterActionsSlot() {
  return document.querySelector("[data-lp-app-footer-actions]");
}

/** 탭을 떠날 때 이전 탭 버튼이 남지 않게 비웁니다. (뒤로가기는 App이 유지) */
export function clearAppFooterActions() {
  const slot = getAppFooterActionsSlot();
  if (!slot) return;
  for (const node of [...slot.children]) {
    if (node?.hasAttribute?.("data-lp-app-footer-back")) continue;
    node.remove();
  }
}
