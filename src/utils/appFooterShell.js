/**
 * 앱 하단 푸터 오른쪽 액션 슬롯 — 탭이 여기에 아이콘 버튼을 붙입니다.
 * 스타일: APP_FOOTER_ICON_BTN_CLASS 를 버튼에 넣으면 main.css 앱 푸터 공통 규격과 맞습니다.
 */
export const APP_FOOTER_ICON_BTN_CLASS = "app-footer-icon-btn";

export function getAppFooterActionsSlot() {
  return document.querySelector("[data-lp-app-footer-actions]");
}

/** 탭을 떠날 때 이전 탭 버튼이 남지 않게 비웁니다. */
export function clearAppFooterActions() {
  getAppFooterActionsSlot()?.replaceChildren();
}
