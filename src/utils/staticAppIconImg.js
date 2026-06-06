/** 앱 정적 PNG·SVG 아이콘 — lazy/async 지연 없이 즉시 그리기 */
export function applyStaticAppIconImg(img) {
  img.loading = "eager";
  img.decoding = "sync";
}

/** 아이콘 picker 그리드·목록 — 한꺼번에 sync 디코딩 금지 */
export function applyLazyPickerIconImg(img) {
  img.loading = "lazy";
  img.decoding = "async";
}
