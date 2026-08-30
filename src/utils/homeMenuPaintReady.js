/** 홈 메뉴 히어로·책상 — 스플래시가 내려가기 전에 디코딩까지 끝낸다 */

export const HOME_TIME_MANAGEMENT_SRC = "/home-time-management.png?v=paper-2";
export const HOME_DESK_DOODLE_SRC = "/home-desk-doodle.png?v=paper-2";

const PAINT_WAIT_MS = 4000;

function decodeHtmlImage(el) {
  if (!(el instanceof HTMLImageElement)) return Promise.resolve();
  const afterLoad = () => {
    if (typeof el.decode === "function") {
      return el.decode().catch(() => {});
    }
    return Promise.resolve();
  };
  if (el.complete && el.naturalWidth > 0) return afterLoad();
  return new Promise((resolve) => {
    const done = () => {
      afterLoad().then(resolve, resolve);
    };
    el.addEventListener("load", done, { once: true });
    el.addEventListener("error", () => resolve(), { once: true });
  });
}

function warmOne(src) {
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = src;
  } catch (_) {}
}

/** 스플래시·로그인 중에 홈 그림을 미리 받기 */
export function startHomeMenuAssetWarm() {
  warmOne(HOME_TIME_MANAGEMENT_SRC);
  warmOne(HOME_DESK_DOODLE_SRC);
}

/** 메뉴·책상이 그려진 뒤에만 스플래시를 걷는다 */
export async function waitHomeMenuFirstPaintReady() {
  const root = document.querySelector(".app-home-menu-launcher");
  if (!(root instanceof HTMLElement)) return;
  const imgs = [
    ...root.querySelectorAll(
      ".app-home-menu-launcher-hero, .app-home-menu-launcher-desk",
    ),
  ];
  const fontReady =
    document.fonts && typeof document.fonts.ready?.then === "function"
      ? document.fonts.ready.catch(() => {})
      : Promise.resolve();
  await Promise.race([
    Promise.all([...imgs.map(decodeHtmlImage), fontReady]),
    new Promise((r) => setTimeout(r, PAINT_WAIT_MS)),
  ]);
  root.classList.remove("app-home-menu-launcher--await-paint");
  try {
    await new Promise((r) => {
      requestAnimationFrame(() => requestAnimationFrame(r));
    });
  } catch (_) {}
}
