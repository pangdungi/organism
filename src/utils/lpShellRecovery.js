/**
 * 스플래시만 보이거나 login·signin 이 모두 숨겨진 셸 고착 복구.
 */

/** @returns {string | null} login | signin | reset-password */
export function getVisibleAppPageId() {
  if (typeof document === "undefined") return null;
  for (const p of document.querySelectorAll("#app > .page")) {
    if (getComputedStyle(p).display !== "none") {
      return p.id.replace(/-page$/, "") || null;
    }
  }
  return null;
}

export function isSplashBlocking() {
  const splash = document.getElementById("app-splash");
  return !!splash && !splash.hasAttribute("hidden");
}

/**
 * @param {{
 *   hasAppMounted: () => boolean;
 *   restorePage: (pageId: string) => void;
 *   hideSplash: () => void;
 *   rerouteInitial?: () => Promise<void>;
 * }} deps
 */
export function runLpShellVisibilityGuard(deps) {
  try {
    document.documentElement.classList.remove("lp-auth-booting");
  } catch (_) {}

  const app = document.getElementById("app");
  if (app && getComputedStyle(app).display === "none") {
    app.style.display = "block";
  }

  const hasMain = !!document.getElementById("app-screen")?.querySelector(".app-page");
  let visible = getVisibleAppPageId();

  if (!visible) {
    if (hasMain || deps.hasAppMounted()) {
      deps.restorePage("signin");
    } else if (deps.rerouteInitial) {
      void deps.rerouteInitial();
      return;
    } else {
      deps.restorePage("login");
    }
    visible = getVisibleAppPageId();
  }

  if (
    isSplashBlocking() &&
    (hasMain || deps.hasAppMounted() || visible)
  ) {
    deps.hideSplash();
  }
}

/**
 * @param {Parameters<typeof runLpShellVisibilityGuard>[0]} deps
 */
export function initLpShellStuckGuard(deps) {
  const tick = () => {
    const visible = getVisibleAppPageId();
    const splashUp = isSplashBlocking();
    if (visible && !splashUp) return;
    runLpShellVisibilityGuard(deps);
  };

  [400, 1500, 4000, 10000].forEach((ms) => setTimeout(tick, ms));

  window.addEventListener("pageshow", () => {
    tick();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") tick();
  });
}
