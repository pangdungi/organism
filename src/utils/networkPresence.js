/**
 * 비행기 모드·데이터 없음 등 — 브라우저가 오프라인이라고 알릴 때만 true.
 * 온라인일 때는 기존 동기화 경로를 그대로 둔다.
 */

export function isAppOffline() {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch (_) {
    return false;
  }
}

export function isAppOnline() {
  return !isAppOffline();
}
