import "./main.css";
import "./styles/lp-desktop-layout.css";
import "./styles/lp-desktop-dashboard.css";
import "./styles/lp-app-font.css";
import "./styles/diary.css";
import "./styles/daily.css";
import "./styles/time-ledger.css";
import "./styles/lp-modals.css";
import "./styles/calendar.css";
import "./styles/stamp-calendar.css";
import "./styles/todo-list.css";
import "./styles/kpi-dream.css";
import "./styles/habit-tracker.css";
import "./styles/lp-pwa-install.css";
import "./styles/lp-app-loading.css";
import { showOnly } from "./pages.js";
import {
  login,
  signUp,
  signOut,
  resetPasswordRequest,
  updatePasswordForRecovery,
  purgeTimeLedgerLocalOnSignOut,
  clearAuthGateForms,
  ensureClientStorageForAuthUser,
  markTabBootAuthUid,
  maybeReloadForAuthUserChange,
  initAuthUserCrossTabGuard,
} from "./auth.js";
import {
  mountApp,
  LP_LAST_TAB_LOCAL_KEY,
  LP_LAST_TAB_SESSION_KEY,
  waitForAppBootReady,
} from "./App.js";
import { initOfflineAppGate } from "./utils/offlineAppGate.js";
import { initModalNoAutoFocus } from "./utils/modalNoAutoFocus.js";
import { initLpAppShellViewportLock } from "./utils/lpAppShellViewport.js";
import { installGlobalTitleTooltipSuppression } from "./utils/suppressNativeTitleTooltips.js";
installGlobalTitleTooltipSuppression();
import { supabase } from "./supabase.js";
import { getSupabaseSession } from "./utils/supabaseSession.js";
import {
  applyUiFontFromLocalCache,
  preloadCalendarMonthFont,
} from "./utils/appUiFont.js";
import { prefetchCriticalAppIconAssets } from "./utils/appIconPrefetch.js";
import { setAppSplashMessage } from "./utils/lpAppLoading.js";
import {
  initAppSplashViewportLock,
  setAppSplashViewportLock,
  syncAppSplashViewport,
} from "./utils/lpSplashViewport.js";
import { pullUserPrefsFromSupabase } from "./utils/userHourlySync.js";
import {
  applyTimeCategoryColors,
  applyTaskCategoryColors,
} from "./utils/todoSettings.js";
import { showToast } from "./utils/showToast.js";
import {
  maybeRedirectImwebConnect,
  readImwebConnectResult,
  clearImwebConnectQueryFromUrl,
} from "./utils/imwebConnectBootstrap.js";
import { showSubscriptionExpiredModal } from "./utils/confirmModal.js";
import { prepareTimeLedgerStorageForBoot, resetTimeLedgerMemoryForAccountSwitch } from "./utils/timeLedgerEntriesModel.js";
import {
  prepareTimeLedgerTasksStorageForBoot,
  resetTimeLedgerTasksMemoryForAccountSwitch,
} from "./utils/timeTaskOptionsModel.js";
import { prepareCalendarSectionTasksForBoot } from "./utils/todoSectionTasksModel.js";
import { prepareCalendarDayIconsForBoot } from "./utils/calendarDayIconsModel.js";
import {
  migrateAllRegisteredLegacyLocalStorage,
  setActiveClientStorageUserId,
} from "./utils/clientStorageScope.js";
import { flushAllPendingTimeDailyBudgetSync } from "./utils/timeDailyBudgetSupabase.js";
import {
  hasPasswordRecoveryUrlHint,
  isPasswordRecoveryPathname,
  isPasswordRecoverySession,
} from "./utils/authRecoverySession.js";
import { consumeSupabaseAuthRedirectErrors } from "./utils/authRedirectErrorUi.js";
import {
  fetchSubscriptionGateSnapshot,
  subscriptionAccessEnded,
  subscriptionBlockedModalOptions,
  runBackgroundSubscriptionGateFromPrefsRow,
} from "./utils/subscriptionAccess.js";
import {
  isLpEnterAppDebugEnabled,
  lpEnterAppDebugMark,
  lpEnterAppDebugSummary,
} from "./utils/lpEnterAppDebug.js";
import {
  initLpShellStuckGuard,
  isSplashBlocking,
  runLpShellVisibilityGuard,
} from "./utils/lpShellRecovery.js";
import { initLpPwaInstall, refreshLpPwaInstall } from "./utils/lpPwaInstall.js";
import {
  initAuthGateKeyboardScroll,
  initMobileVisualViewportKeyboardInset,
} from "./utils/mobileViewportKeyboard.js";
import { syncLoginRememberMeCheckbox } from "./utils/authRememberMe.js";

async function blockExpiredSubscriptionOrSignOut() {
  const snap = await fetchSubscriptionGateSnapshot();
  if (!subscriptionAccessEnded(snap)) return false;
  const result = await showSubscriptionExpiredModal(
    subscriptionBlockedModalOptions(snap),
  );
  if (!result?.deleted) await signOut();
  return true;
}

/** 설정 pull 후 구독·기한 타이머 */
async function pullPrefsAndRunSubscriptionGate() {
  const row = await pullUserPrefsFromSupabase().catch(() => null);
  await runBackgroundSubscriptionGateFromPrefsRow(
    row,
    blockExpiredSubscriptionOrSignOut,
  ).catch(() => {});
}

/**
 * IndexedDB 시간기록은 user_id가 없어 계정과 묶이지 않음.
 * 이전 계정 id와 현재 세션이 다르면 로컬을 비운 뒤 로드한다.
 */
async function prepareTimeLedgerStorageForCurrentSession() {
  if (!supabase) {
    prepareTimeLedgerStorageForBoot();
    prepareTimeLedgerTasksStorageForBoot();
    prepareCalendarSectionTasksForBoot();
    prepareCalendarDayIconsForBoot();
    return;
  }

  let cachedUid = "";
  try {
    cachedUid = localStorage.getItem("lp_last_auth_uid") || "";
  } catch (_) {}

  if (cachedUid) {
    setActiveClientStorageUserId(cachedUid);
    migrateAllRegisteredLegacyLocalStorage(cachedUid);
    prepareTimeLedgerStorageForBoot();
    prepareTimeLedgerTasksStorageForBoot();
    prepareCalendarSectionTasksForBoot();
    prepareCalendarDayIconsForBoot();
  }

  const {
    data: { session },
  } = await getSupabaseSession();
  const uid = session?.user?.id;
  if (!uid) {
    if (!cachedUid) {
      prepareTimeLedgerStorageForBoot();
      prepareTimeLedgerTasksStorageForBoot();
      prepareCalendarSectionTasksForBoot();
      prepareCalendarDayIconsForBoot();
    }
    return;
  }

  if (uid !== cachedUid) {
    resetTimeLedgerMemoryForAccountSwitch();
    resetTimeLedgerTasksMemoryForAccountSwitch();
    await ensureClientStorageForAuthUser(uid);
    prepareTimeLedgerStorageForBoot();
    prepareTimeLedgerTasksStorageForBoot();
    prepareCalendarSectionTasksForBoot();
    prepareCalendarDayIconsForBoot();
    return;
  }

  await ensureClientStorageForAuthUser(uid);
  if (!cachedUid) {
    prepareTimeLedgerStorageForBoot();
    prepareTimeLedgerTasksStorageForBoot();
    prepareCalendarSectionTasksForBoot();
    prepareCalendarDayIconsForBoot();
  }
}

let lpAppMounted = false;
let lpEnterAppPromise = null;
let hideSplashRetryCount = 0;
const HIDE_SPLASH_MAX_RETRIES = 50;
/** @type {ReturnType<typeof setTimeout> | null} */
let lpResumeSplashHideTimer = null;

function setLpAuthBootPending(on) {
  try {
    document.documentElement.classList.toggle("lp-auth-booting", !!on);
  } catch (_) {}
}

function showAppSplashNow() {
  hideSplashRetryCount = 0;
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  splash.classList.remove("app-splash--exiting");
  splash.removeAttribute("hidden");
  splash.setAttribute("aria-hidden", "false");
  splash.setAttribute("aria-busy", "true");
  splash.setAttribute("aria-label", "Good things are coming");
  setAppSplashViewportLock(true);
}

function hideAppSplashNow() {
  const splash = document.getElementById("app-splash");
  if (!splash || splash.hasAttribute("hidden")) return;

  const signinPage = document.getElementById("signin-page");
  const signinVisible =
    signinPage && getComputedStyle(signinPage).display !== "none";
  const hasAppPage = !!document
    .getElementById("app-screen")
    ?.querySelector(".app-page");
  if (
    lpAppMounted &&
    signinVisible &&
    !hasAppPage &&
    hideSplashRetryCount < HIDE_SPLASH_MAX_RETRIES
  ) {
    hideSplashRetryCount += 1;
    setTimeout(hideAppSplashNow, 48);
    return;
  }
  hideSplashRetryCount = 0;

  splash.classList.add("app-splash--exiting");
  splash.setAttribute("aria-busy", "false");
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    splash.removeEventListener("transitionend", onTransitionEnd);
    splash.setAttribute("hidden", "");
    splash.setAttribute("aria-hidden", "true");
    setAppSplashViewportLock(false);
    try {
      window.__lpMarkBootReady?.();
    } catch (_) {}
    try {
      refreshLpPwaInstall();
    } catch (_) {}
  };
  const onTransitionEnd = (ev) => {
    if (ev.target === splash && ev.propertyName === "opacity") done();
  };
  splash.addEventListener("transitionend", onTransitionEnd);
  setTimeout(done, 280);
}

/**
 * 백그라운드·화면 꺼짐 후 복귀 — 브라우저가 흰 화면만 그리는 구간을 스플래시로 덮음.
 * (앱 최초 실행·탭 pull 과는 별도)
 */
function initLpAppResumeSplashCover() {
  if (typeof document === "undefined") return;
  let hiddenAt = 0;
  const MIN_AWAY_MS = 500;
  const MIN_SPLASH_MS = 100;

  const coverIfNeeded = () => {
    if (!lpAppMounted || lpEnterAppPromise) return;
    const hasMain = !!document
      .getElementById("app-screen")
      ?.querySelector(".app-page");
    if (!hasMain) return;
    const signinPage = document.getElementById("signin-page");
    const signinVisible =
      signinPage && getComputedStyle(signinPage).display !== "none";
    if (!signinVisible) return;
    if (isSplashBlocking()) return;
    try {
      if (document.documentElement.classList.contains("lp-auth-booting")) return;
    } catch (_) {}
    const awayMs = hiddenAt > 0 ? Date.now() - hiddenAt : MIN_AWAY_MS + 1;
    if (awayMs < MIN_AWAY_MS) return;

    if (lpResumeSplashHideTimer != null) {
      clearTimeout(lpResumeSplashHideTimer);
      lpResumeSplashHideTimer = null;
    }
    showAppSplashNow();
    const shownAt = Date.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const wait = Math.max(0, MIN_SPLASH_MS - (Date.now() - shownAt));
        lpResumeSplashHideTimer = setTimeout(() => {
          lpResumeSplashHideTimer = null;
          hideAppSplashNow();
        }, wait);
      });
    });
  };

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      hiddenAt = Date.now();
      return;
    }
    if (document.visibilityState === "visible") coverIfNeeded();
  });
  window.addEventListener("pageshow", (ev) => {
    if (ev.persisted) coverIfNeeded();
  });
}

/** @type {null | (() => Promise<void>)} */
let lpRerouteInitialPage = null;

function lpShellRecoveryDeps() {
  return {
    hasAppMounted: () => lpAppMounted,
    restorePage: (pageId) => {
      showOnly(pageId);
      if (pageId === "login") setAuthGatePanel("login");
    },
    hideSplash: () => hideAppSplashNow(),
    rerouteInitial: async () => {
      if (typeof lpRerouteInitialPage === "function") {
        await lpRerouteInitialPage();
        return;
      }
      showOnly("login");
      setAuthGatePanel("login");
      hideAppSplashNow();
    },
  };
}

/**
 * 로그인·자동 로그인 직후: lp_last_auth_uid 캐시로 미러만 즉시 — IDB·세션 정합은 mountApp 뒤
 */
function primeTimeLedgerStorageFromCachedSession() {
  let cachedUid = "";
  try {
    cachedUid = localStorage.getItem("lp_last_auth_uid") || "";
  } catch (_) {}
  if (cachedUid) {
    setActiveClientStorageUserId(cachedUid);
    try {
      migrateAllRegisteredLegacyLocalStorage(cachedUid);
    } catch (_) {}
  }
  prepareTimeLedgerStorageForBoot();
  prepareTimeLedgerTasksStorageForBoot();
  prepareCalendarSectionTasksForBoot();
  prepareCalendarDayIconsForBoot();
}

/** 저장된 세션·자동 로그인: 구독 확인 후 앱 연다 */
async function enterAuthenticatedApp(opts = {}) {
  const { showSplash = false } = opts;
  const screen = document.getElementById("app-screen");
  if (screen?.querySelector(".app-page")) {
    lpAppMounted = true;
    showOnly("signin");
    refreshLpPwaInstall();
    void getSupabaseSession().then(({ data: { session } }) => {
      markTabBootAuthUid(session?.user?.id);
    });
    void blockExpiredSubscriptionOrSignOut();
    return;
  }
  if (lpAppMounted) return;
  if (lpEnterAppPromise) return lpEnterAppPromise;

  const t0 = performance.now();
  const timings = [];
  let stepStart = performance.now();
  const finishStep = (label) => {
    const ms = Math.round(performance.now() - stepStart);
    timings.push({ label, ms });
    lpEnterAppDebugMark(`${label} +${ms}ms`, t0);
    stepStart = performance.now();
  };

  lpEnterAppPromise = (async () => {
    if (showSplash) showAppSplashNow();
    try {
      const {
        data: { session: bootSession },
      } = await getSupabaseSession();
      if (!bootSession?.user?.id) {
        showOnly("login");
        setAuthGatePanel("login");
        return;
      }

      finishStep("세션 확인");
      const uid = bootSession.user.id;
      let cachedUid = "";
      try {
        cachedUid = localStorage.getItem("lp_last_auth_uid") || "";
      } catch (_) {}
      /** 같은 계정 재진입 — 로컬로 바로 그리고, 서버·IDB·구독 확인은 뒤에서 */
      const sameAccountFastPath = !!(cachedUid && cachedUid === uid);

      lpAppMounted = true;
      showOnly("signin");
      setActiveClientStorageUserId(uid);
      applyUiFontFromLocalCache();
      primeTimeLedgerStorageFromCachedSession();
      finishStep("로컬 캐시 준비");

      if (!sameAccountFastPath) {
        if (showSplash) setAppSplashMessage("이용 권한 확인 중…");
        const blocked = await blockExpiredSubscriptionOrSignOut();
        if (blocked) {
          lpAppMounted = false;
          return;
        }
        if (showSplash) setAppSplashMessage("설정 불러오는 중…");
        await prepareTimeLedgerStorageForCurrentSession();
        await pullPrefsAndRunSubscriptionGate();
        finishStep("계정 설정 pull");
      }

      await mountApp(screen);
      finishStep("메인 화면 조립(mountApp)");
      await waitForAppBootReady();
      prefetchCriticalAppIconAssets();
      refreshLpPwaInstall();

      markTabBootAuthUid(uid);
      finishStep("세션·탭 표시");

      if (sameAccountFastPath) {
        void (async () => {
          try {
            await prepareTimeLedgerStorageForCurrentSession();
            await pullPrefsAndRunSubscriptionGate();
            await blockExpiredSubscriptionOrSignOut();
          } catch (_) {}
        })();
      }

      timings.push({
        label: "진입 합계",
        ms: Math.round(performance.now() - t0),
      });
      lpEnterAppDebugMark("진입 합계", t0);
      lpEnterAppDebugSummary(timings);
    } finally {
      if (showSplash) {
        setLpAuthBootPending(false);
        hideAppSplashNow();
      }
    }
  })();

  try {
    await lpEnterAppPromise;
  } catch (_e) {
    lpAppMounted = false;
  } finally {
    lpEnterAppPromise = null;
  }
}

function setAuthGatePanel(mode) {
  closeAuthPwRecoveryModal();
  const signupEl = document.getElementById("auth-panel-signup");
  const loginEl = document.getElementById("auth-panel-login");
  const headingEl = document.getElementById("auth-gate-heading");
  const segWrap = document.getElementById("auth-gate-segments");
  const segLogin = document.getElementById("auth-seg-login");
  const segSignup = document.getElementById("auth-seg-signup");
  if (!signupEl || !loginEl) return;
  const isSignup = mode === "signup";
  if (isSignup) {
    signupEl.style.display = "";
    loginEl.style.display = "none";
  } else {
    signupEl.style.display = "none";
    loginEl.style.display = "";
  }
  if (headingEl) headingEl.textContent = isSignup ? "회원가입" : "로그인";
  segWrap?.classList.toggle("is-signup", isSignup);
  segLogin?.classList.toggle("is-active", !isSignup);
  segSignup?.classList.toggle("is-active", isSignup);
  segLogin?.setAttribute("aria-selected", isSignup ? "false" : "true");
  segSignup?.setAttribute("aria-selected", isSignup ? "true" : "false");
  if (!isSignup) syncLoginRememberMeCheckbox();
}

function openAuthPwRecoveryModal() {
  const modal = document.getElementById("auth-pw-recovery-modal");
  if (!modal) return;
  modal.removeAttribute("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("auth-pw-modal-open");
}

function closeAuthPwRecoveryModal() {
  const modal = document.getElementById("auth-pw-recovery-modal");
  if (!modal || modal.hasAttribute("hidden")) return;
  modal.setAttribute("hidden", "");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-pw-modal-open");
}

function init() {
  const imwebResult = readImwebConnectResult();
  if (imwebResult) {
    clearImwebConnectQueryFromUrl();
    if (imwebResult.status === "connected") {
      showToast("아임웹 연동이 완료됐어요.");
    } else if (imwebResult.status === "error") {
      showToast(
        "아임웹 연동에 실패했어요.",
        imwebResult.reason || "잠시 후 다시 시도해 주세요.",
      );
    }
  }

  setLpAuthBootPending(true);
  initAuthUserCrossTabGuard({ isAppMounted: () => lpAppMounted });
  consumeSupabaseAuthRedirectErrors();

  const app = document.getElementById("app");
  if (app) app.style.display = "block";

  initOfflineAppGate();
  initModalNoAutoFocus();
  initAppSplashViewportLock();
  initLpAppShellViewportLock();
  initLpPwaInstall();
  initMobileVisualViewportKeyboardInset();
  initAuthGateKeyboardScroll();

  void preloadCalendarMonthFont();
  applyTimeCategoryColors();
  applyTaskCategoryColors();

  /* 태블릿 세로: 가로 전환 안내 레이어 접근성 */
  (function initTabletLandscapeHintA11y() {
    const el = document.getElementById("tablet-landscape-hint");
    if (!el) return;
    const mq = window.matchMedia(
      "(orientation: portrait) and (min-width: 46.0625rem) and (max-width: 64rem) and (pointer: coarse)",
    );
    const sync = () => {
      const show = mq.matches;
      el.setAttribute("aria-hidden", show ? "false" : "true");
      if (show) {
        el.setAttribute("role", "alertdialog");
        el.setAttribute("aria-modal", "true");
        el.setAttribute("aria-labelledby", "tablet-landscape-hint-title");
      } else {
        el.removeAttribute("role");
        el.removeAttribute("aria-modal");
        el.removeAttribute("aria-labelledby");
      }
    };
    sync();
    mq.addEventListener("change", sync);
  })();

  /* 모바일 폰 가로: 세로 전환 안내 레이어 접근성 */
  (function initPhonePortraitHintA11y() {
    const el = document.getElementById("phone-portrait-hint");
    if (!el) return;
    const mq = window.matchMedia(
      "(orientation: landscape) and (max-height: 33rem) and (pointer: coarse)",
    );
    const sync = () => {
      const show = mq.matches;
      el.setAttribute("aria-hidden", show ? "false" : "true");
      if (show) {
        el.setAttribute("role", "alertdialog");
        el.setAttribute("aria-modal", "true");
        el.setAttribute("aria-labelledby", "phone-portrait-hint-title");
      } else {
        el.removeAttribute("role");
        el.removeAttribute("aria-modal");
        el.removeAttribute("aria-labelledby");
      }
    };
    sync();
    mq.addEventListener("change", sync);
  })();

  document.getElementById("login-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    void doLogin();
  });
  syncLoginRememberMeCheckbox();
  document.getElementById("btn-do-signup")?.addEventListener("click", doSignUp);
  document
    .getElementById("auth-seg-login")
    ?.addEventListener("click", () => setAuthGatePanel("login"));
  document
    .getElementById("auth-seg-signup")
    ?.addEventListener("click", () => setAuthGatePanel("signup"));
  document
    .getElementById("btn-show-forgot-pw")
    ?.addEventListener("click", () => openAuthPwRecoveryModal());
  document
    .getElementById("auth-pw-modal-close")
    ?.addEventListener("click", closeAuthPwRecoveryModal);
  document
    .querySelector("#auth-pw-recovery-modal .auth-pw-modal__backdrop")
    ?.addEventListener("click", closeAuthPwRecoveryModal);
  document
    .getElementById("btn-cancel-forgot")
    ?.addEventListener("click", closeAuthPwRecoveryModal);

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    const modal = document.getElementById("auth-pw-recovery-modal");
    if (modal && !modal.hasAttribute("hidden")) {
      closeAuthPwRecoveryModal();
    }
  });
  document
    .getElementById("btn-send-reset-mail")
    ?.addEventListener("click", doForgotPassword);
  document
    .getElementById("btn-reset-pw-submit")
    ?.addEventListener("click", doResetPassword);

  function goToPasswordResetUi() {
    closeAuthPwRecoveryModal();
    showOnly("reset-password");
  }

  // 이메일 재설정 링크: implicit → PASSWORD_RECOVERY / PKCE → SIGNED_IN(+ JWT amr recovery)
  supabase?.auth?.onAuthStateChange?.((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      goToPasswordResetUi();
      return;
    }
    if (
      session?.user?.id &&
      lpAppMounted &&
      maybeReloadForAuthUserChange(session, { appMounted: true })
    ) {
      lpAppMounted = false;
      return;
    }
    if (
      (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
      session &&
      (isPasswordRecoverySession(session) || hasPasswordRecoveryUrlHint())
    ) {
      goToPasswordResetUi();
      return;
    }
    if (
      (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
      session &&
      !lpAppMounted
    ) {
      void enterAuthenticatedApp({ showSplash: true });
      return;
    }
    if (event === "SIGNED_OUT") {
      lpAppMounted = false;
      markTabBootAuthUid("");
      lpEnterAppPromise = null;
      try {
        sessionStorage.removeItem(LP_LAST_TAB_SESSION_KEY);
        localStorage.removeItem(LP_LAST_TAB_LOCAL_KEY);
      } catch (_) {}
      void (async () => {
        try {
          flushAllPendingTimeDailyBudgetSync();
        } catch (_) {}
        try {
          const el = document.getElementById("app-screen");
          if (el) el.innerHTML = "";
        } catch (_) {}
        showOnly("login");
        setAuthGatePanel("login");
        clearAuthGateForms();
        try {
          await purgeTimeLedgerLocalOnSignOut();
        } catch (_) {}
      })();
    }
  });

  // 로그인·회원가입 비밀번호 보기 (아이콘 토글)
  (function initAuthGatePasswordToggles() {
    function bind(buttonId, inputId, labelShow, labelHide) {
      const btn = document.getElementById(buttonId);
      const input = document.getElementById(inputId);
      const iconShow = btn?.querySelector(".login-pw-toggle__icon--show");
      const iconHide = btn?.querySelector(".login-pw-toggle__icon--hide");
      if (!btn || !input || !iconShow || !iconHide) return;
      const sync = (visible) => {
        input.type = visible ? "text" : "password";
        btn.setAttribute("aria-pressed", visible ? "true" : "false");
        btn.setAttribute("aria-label", visible ? labelHide : labelShow);
        iconShow.toggleAttribute("hidden", visible);
        iconHide.toggleAttribute("hidden", !visible);
      };
      btn.addEventListener("click", () => sync(input.type === "password"));
    }
    bind("login-pw-toggle", "login-pw", "비밀번호 보기", "비밀번호 숨기기");
    bind("signup-pw-toggle", "signup-pw", "비밀번호 보기", "비밀번호 숨기기");
    bind(
      "signup-pw-confirm-toggle",
      "signup-pw-confirm",
      "비밀번호 확인란 보기",
      "비밀번호 확인란 숨기기",
    );
  })();

  // 새 비밀번호 설정 폼 비밀번호 보기
  document.getElementById("reset-pw-show")?.addEventListener("change", (e) => {
    const type = e.target.checked ? "text" : "password";
    ["reset-pw-new", "reset-pw-confirm"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.type = type;
    });
  });


  /** 느린 네트워크에서 세션 로드가 잘리며 로그인 화면만 보이는 일 줄이기 */
  const AUTH_GET_SESSION_MS = 30_000;

  /** @returns {Promise<"login" | "authenticated" | "reset-password">} */
  async function showInitialPage() {
    showAppSplashNow();
    setLpAuthBootPending(true);
    try {
      if (!supabase) {
        showOnly("login");
        setAuthGatePanel("login");
        return "login";
      }
      let session = null;
      try {
        const res = await Promise.race([
          getSupabaseSession(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("auth_get_session_timeout")),
              AUTH_GET_SESSION_MS,
            ),
          ),
        ]);
        session = res?.data?.session ?? null;
      } catch (_e) {
        showOnly("login");
        setAuthGatePanel("login");
        return "login";
      }
      if (session) {
        if (isPasswordRecoverySession(session) || hasPasswordRecoveryUrlHint()) {
          goToPasswordResetUi();
          return "reset-password";
        }
        showOnly("signin");
        await enterAuthenticatedApp({ showSplash: true });
        return "authenticated";
      }
      showOnly("login");
      setAuthGatePanel("login");
      return "login";
    } finally {
      setLpAuthBootPending(false);
    }
  }

  lpRerouteInitialPage = showInitialPage;

  async function dismissAppSplash() {
    /** @type {"login" | "authenticated" | "reset-password" | undefined} */
    let bootKind;
    try {
      bootKind = await showInitialPage();
    } catch (_e) {
      runLpShellVisibilityGuard(lpShellRecoveryDeps());
    } finally {
      if (bootKind !== "authenticated") {
        hideAppSplashNow();
      }
    }
  }

  initLpShellStuckGuard(lpShellRecoveryDeps());
  initLpAppResumeSplashCover();

  dismissAppSplash();
}

async function doLogin() {
  const id = document.getElementById("login-id")?.value?.trim() || "";
  const pw = document.getElementById("login-pw")?.value || "";
  const rememberMe =
    document.getElementById("login-remember-me")?.checked !== false;
  const t0 = performance.now();
  lpEnterAppDebugMark("서버 로그인 시작", t0);
  const result = await login(id, pw, { rememberMe });
  lpEnterAppDebugMark("서버 로그인 완료", t0);
  if (result.ok) {
    setLpAuthBootPending(true);
    try {
      await enterAuthenticatedApp({
        showSplash: true,
      });
    } finally {
      setLpAuthBootPending(false);
    }
    if (isLpEnterAppDebugEnabled()) {
      lpEnterAppDebugMark("로그인 버튼→메인 표시 합계", t0);
    }
  } else {
    showToast(result.msg);
  }
}

async function doSignUp() {
  const email = document.getElementById("signup-email")?.value?.trim() || "";
  const pw = document.getElementById("signup-pw")?.value || "";
  const confirm = document.getElementById("signup-pw-confirm")?.value || "";
  if (!email) {
    showToast("이메일을 입력하세요.");
    return;
  }
  if (pw !== confirm) {
    showToast("비밀번호가 서로 달라요.");
    return;
  }
  const result = await signUp(email, pw);
  if (!result.ok) {
    showToast(result.msg);
    return;
  }
  // 이메일 확인(Confirm email)이 켜져 있으면 signUp 직후 session 은 null → 메일 안내
  const session = result.data?.session;
  if (session) {
    setLpAuthBootPending(true);
    try {
      await enterAuthenticatedApp({
        showSplash: true,
      });
    } finally {
      setLpAuthBootPending(false);
    }
    showToast("가입이 완료됐어요.", "메인 화면으로 들어갔어요.");
    return;
  }
  showToast(
    "가입 확인 메일을 보냈어요.",
    "메일의 링크를 눌러 인증한 뒤 아래에서 로그인해 주세요.",
  );
  setAuthGatePanel("login");
  const loginId = document.getElementById("login-id");
  if (loginId) loginId.value = email;
}

async function doForgotPassword() {
  const emailInput = document.getElementById("forgot-pw-email");
  const email = emailInput?.value?.trim() || "";
  try {
    const result = await resetPasswordRequest(email);
    if (result.ok) {
      closeAuthPwRecoveryModal();
      if (emailInput) emailInput.value = "";
      showToast("비밀번호 재설정 메일을 보냈어요.", "이메일을 확인해 주세요.");
    } else {
      showToast(result.msg);
    }
  } catch (_e) {
    showToast("처리 중 오류가 났어요. 잠시 후 다시 시도해 주세요.");
  }
}

async function doResetPassword() {
  const newPw = document.getElementById("reset-pw-new")?.value || "";
  const confirm = document.getElementById("reset-pw-confirm")?.value || "";
  if (newPw !== confirm) {
    showToast("새 비밀번호가 일치하지 않아요.");
    return;
  }
  const result = await updatePasswordForRecovery(newPw);
  if (result.ok) {
    showToast("비밀번호가 변경됐어요.", "새 비밀번호로 로그인해 주세요.");
    try {
      if (isPasswordRecoveryPathname()) {
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.origin}/`,
        );
      }
    } catch (_) {}
    showOnly("login");
    setAuthGatePanel("login");
  } else {
    showToast(result.msg);
  }
}

if (!maybeRedirectImwebConnect()) {
  init();
}

// PWA: 서비스 워커 — load 대기 없이 즉시 등록(첫 방문 설치 가능 조건 빠르게 충족)
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  navigator.serviceWorker.register("/sw.js?v=50").catch(() => {});
}
