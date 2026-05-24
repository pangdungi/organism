/** 앱 정적 PNG·SVG 아이콘 — lazy/async 지연 없이 즉시 그리기 */
export function applyStaticAppIconImg(img) {
  img.loading = "eager";
  img.decoding = "sync";
}
