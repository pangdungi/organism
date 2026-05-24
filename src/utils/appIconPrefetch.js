/**
 * 앱 전체 정적 아이콘(PNG·SVG) — PWA 설치·기동 시 prefetch
 * 목록: public/app-icon-prefetch.json (scripts/generate-app-icon-prefetch.mjs)
 */
import appIconPrefetchPaths from "../../public/app-icon-prefetch.json";

export function getAllAppIconPrefetchPaths() {
  return appIconPrefetchPaths;
}

export function prefetchAppIconAssets() {
  try {
    for (const path of appIconPrefetchPaths) {
      const img = new Image();
      img.decoding = "sync";
      img.src = path;
    }
  } catch (_) {}
}
