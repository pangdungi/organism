/** 앱 정적 PNG·SVG 아이콘 — lazy/async 지연 없이 즉시 그리기 */
export function applyStaticAppIconImg(img) {
  img.loading = "eager";
  img.decoding = "sync";
}

/** 아이콘 picker 그리드 — 스크롤 밖은 나중에 로드 */
export function applyLazyPickerIconImg(img) {
  img.loading = "lazy";
  img.decoding = "async";
}

/** 과제설정 목록·피커 — 열자마자 보이게(eager), 디코딩만 비동기 */
export function applyEagerIconImg(img) {
  img.loading = "eager";
  img.decoding = "async";
}
