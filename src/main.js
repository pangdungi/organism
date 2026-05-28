import "./main.css";
import "./styles/lp-app-font.css";
import "./styles/diary.css";
import "./styles/daily.css";
import "./styles/time-ledger.css";
import "./styles/lp-modals.css";
import "./styles/calendar.css";
import "./styles/stamp-calendar.css";
import "./styles/todo-list.css";
import "./styles/kpi-dream.css";
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
import { initLpAppShellViewportLock } from "./utils/lpAppShellViewport.js";
import { supabase } from "./supabase.js";
import { getSupabaseSession } from "./utils/supabaseSession.js";
import { applyAppFont } from "./utils/appUiFont.js";
import { prefetchCriticalAppIconAssets } from "./utils/appIconPrefetch.js";
import { setAppSplashMessage } from "./utils/lpAppLoading.js";
applyAppFont();
import { pullUserPrefsFromSupabase } from "./utils/userHourlySync.js";
import {
  applyTimeCategoryColors,
  applyTaskCategoryColors,
} from "./utils/todoSettings.js";
import { showToast } from "./utils/showToast.js";
import { prepareTimeLedgerStorageForBoot, resetTimeLedgerMemoryForAccountSwitch } from "./utils/timeLedgerEntriesModel.js";
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
  enforceSubscriptionAccessOrSignOut,
  SUBSCRIPTION_EXPIRED_MESSAGE,
  runBackgroundSubscriptionGateFromPrefsRow,
} from "./utils/subscriptionAccess.js";
import {
  isLpEnterAppDebugEnabled,
  lpEnterAppDebugMark,
  lpEnterAppDebugSummary,
} from "./utils/lpEnterAppDebug.js";
import { initLpShellStuckGuard, runLpShellVisibilityGuard } from "./utils/lpShellRecovery.js";
import { initLpPwaInstall, refreshLpPwaInstall } from "./utils/lpPwaInstall.js";

async function signOutForSubscriptionExpired() {
  window.alert(SUBSCRIPTION_EXPIRED_MESSAGE);
  await signOut();
}

/** 앱 연 뒤 설정 pull 과 같은 응답으로 구독·기한 타이머 처리(첫 로딩 블로킹 없음) */
function scheduleBackgroundSubscriptionGateAfterPrefsPull() {
  void pullUserPrefsFromSupabase()
    .then((row) =>
      runBackgroundSubscriptionGateFromPrefsRow(row, signOutForSubscriptionExpired),
    )
    .catch(() => {});
}

/**
 * IndexedDB 시간기록은 user_id가 없어 계정과 묶이지 않음.
 * 이전 계정 id와 현재 세션이 다르면 로컬을 비운 뒤 로드한다.
 */
async function prepareTimeLedgerStorageForCurrentSession() {
  if (!supabase) {
    prepareTimeLedgerStorageForBoot();
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
  }

  const {
    data: { session },
  } = await getSupabaseSession();
  const uid = session?.user?.id;
  if (!uid) {
    if (!cachedUid) prepareTimeLedgerStorageForBoot();
    return;
  }

  if (uid !== cachedUid) {
    resetTimeLedgerMemoryForAccountSwitch();
    await ensureClientStorageForAuthUser(uid);
    prepareTimeLedgerStorageForBoot();
    return;
  }

  await ensureClientStorageForAuthUser(uid);
  if (!cachedUid) prepareTimeLedgerStorageForBoot();
}

let lpAppMounted = false;
let lpEnterAppPromise = null;

function setLpAuthBootPending(on) {
  try {
    document.documentElement.classList.toggle("lp-auth-booting", !!on);
  } catch (_) {}
}

function showAppSplashNow() {
  const splash = document.getElementById("app-splash");
  if (!splash) return;
  splash.classList.remove("app-splash--exiting");
  splash.removeAttribute("hidden");
  splash.setAttribute("aria-hidden", "false");
  splash.setAttribute("aria-busy", "true");
  splash.setAttribute("aria-label", "앱 준비 중");
}

function hideAppSplashNow() {
  const splash = document.getElementById("app-splash");
  if (!splash || splash.hasAttribute("hidden")) return;
  splash.classList.add("app-splash--exiting");
  splash.setAttribute("aria-busy", "false");
  let finished = false;
  const done = () => {
    if (finished) return;
    finished = true;
    splash.removeEventListener("transitionend", onTransitionEnd);
    splash.setAttribute("hidden", "");
    splash.setAttribute("aria-hidden", "true");
    try {
      window.__lpMarkBootReady?.();
    } catch (_) {}
  };
  const onTransitionEnd = (ev) => {
    if (ev.target === splash && ev.propertyName === "opacity") done();
  };
  splash.addEventListener("transitionend", onTransitionEnd);
  setTimeout(done, 280);
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
}

/** 저장된 세션·자동 로그인: 앱 먼저 연다. 구독·IDB 정합은 mountApp 뒤 백그라운드 */
async function enterAuthenticatedApp(opts = {}) {
  const { enforceSubscriptionBeforeMount = false, showSplash = false } = opts;
  const screen = document.getElementById("app-screen");
  if (screen?.querySelector(".app-page")) {
    lpAppMounted = true;
    showOnly("signin");
    refreshLpPwaInstall();
    void getSupabaseSession().then(({ data: { session } }) => {
      markTabBootAuthUid(session?.user?.id);
    });
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
      lpAppMounted = true;
      showOnly("signin");
      primeTimeLedgerStorageFromCachedSession();
      finishStep("로컬 캐시 준비");
      await mountApp(screen);
      finishStep("메인 화면 조립(mountApp)");
      setAppSplashMessage("데이터 불러오는 중…");
      await waitForAppBootReady();
      prefetchCriticalAppIconAssets();
      refreshLpPwaInstall();

      void getSupabaseSession().then(({ data: { session } }) => {
        markTabBootAuthUid(session?.user?.id);
      });
      finishStep("세션·탭 표시");

      void (async () => {
        try {
          if (enforceSubscriptionBeforeMount) {
            const blocked = await enforceSubscriptionAccessOrSignOut();
            if (blocked) {
              window.alert(SUBSCRIPTION_EXPIRED_MESSAGE);
              await signOut();
              return;
            }
          }
          await prepareTimeLedgerStorageForCurrentSession();
          scheduleBackgroundSubscriptionGateAfterPrefsPull();
        } catch (_) {}
      })();

      timings.push({
        label: "진입 합계",
        ms: Math.round(performance.now() - t0),
      });
      lpEnterAppDebugMark("진입 합계", t0);
      lpEnterAppDebugSummary(timings);
    } finally {
      hideAppSplashNow();
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
}

function openAuthPwRecoveryModal() {
  const modal = document.getElementById("auth-pw-recovery-modal");
  if (!modal) return;
  modal.removeAttribute("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("auth-pw-modal-open");
  const focusEl = document.getElementById("forgot-pw-email");
  requestAnimationFrame(() => focusEl?.focus?.());
}

function closeAuthPwRecoveryModal() {
  const modal = document.getElementById("auth-pw-recovery-modal");
  if (!modal || modal.hasAttribute("hidden")) return;
  modal.setAttribute("hidden", "");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("auth-pw-modal-open");
}

function init() {
  setLpAuthBootPending(true);
  initAuthUserCrossTabGuard({ isAppMounted: () => lpAppMounted });
  consumeSupabaseAuthRedirectErrors();

  const app = document.getElementById("app");
  if (app) app.style.display = "block";

  initOfflineAppGate();
  initLpAppShellViewportLock();
  initLpPwaInstall();

  applyAppFont();
  applyTimeCategoryColors();
  applyTaskCategoryColors();

  /* 태블릿 세로: 가로 전환 안내 레이어 접근성 */
  (function initTabletLandscapeHintA11y() {
    const el = document.getElementById("tablet-landscape-hint");
    if (!el) return;
    const mq = window.matchMedia(
      "(orientation: portrait) and (min-width: 48.0625rem) and (max-width: 64rem) and (pointer: coarse)",
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

  document.getElementById("btn-do-login")?.addEventListener("click", doLogin);
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
      void enterAuthenticatedApp();
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

  // 모바일: 모달 열릴 때 자동 포커스(키보드) 방지 — 사용자가 입력창 탭할 때만 키보드
  (function initMobileModalNoAutoFocus() {
    const isMobile = () => window.matchMedia("(max-width: 48rem)").matches;
    const blurInput = () => {
      const a = document.activeElement;
      if (
        a &&
        (a.tagName === "INPUT" ||
          a.tagName === "TEXTAREA" ||
          a.tagName === "SELECT")
      )
        a.blur();
    };
    const observer = new MutationObserver((mutations) => {
      if (!isMobile()) return;
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "hidden") {
          const el = m.target;
          if (
            !el.hasAttribute?.("hidden") &&
            el.getAttribute?.("class")?.includes("modal")
          ) {
            blurInput();
            [0, 50, 150, 300].forEach((ms) => setTimeout(blurInput, ms));
            break;
          }
        }
      }
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["hidden"],
    });
  })();

  /** 느린 네트워크에서 세션 로드가 잘리며 로그인 화면만 보이는 일 줄이기 */
  const AUTH_GET_SESSION_MS = 30_000;

  async function showInitialPage() {
    setLpAuthBootPending(true);
    try {
      if (!supabase) {
        showOnly("login");
        setAuthGatePanel("login");
        return;
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
        return;
      }
      if (session) {
        if (isPasswordRecoverySession(session) || hasPasswordRecoveryUrlHint()) {
          goToPasswordResetUi();
          return;
        }
        showOnly("signin");
        await enterAuthenticatedApp();
        return;
      }
      showOnly("login");
      setAuthGatePanel("login");
    } finally {
      setLpAuthBootPending(false);
    }
  }

  lpRerouteInitialPage = showInitialPage;

  async function dismissAppSplash() {
    try {
      await showInitialPage();
    } catch (_e) {
      runLpShellVisibilityGuard(lpShellRecoveryDeps());
    } finally {
      hideAppSplashNow();
    }
  }

  initLpShellStuckGuard(lpShellRecoveryDeps());

  dismissAppSplash();
}

async function doLogin() {
  const id = document.getElementById("login-id")?.value?.trim() || "";
  const pw = document.getElementById("login-pw")?.value || "";
  const t0 = performance.now();
  lpEnterAppDebugMark("서버 로그인 시작", t0);
  const result = await login(id, pw);
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

const LP_PW_RESET_LOG = "[lp pw-reset]";

async function doForgotPassword() {
  console.log(LP_PW_RESET_LOG, "1) 재설정 메일 버튼 클릭");
  const emailInput = document.getElementById("forgot-pw-email");
  const email = emailInput?.value?.trim() || "";
  console.log(LP_PW_RESET_LOG, "2) 입력값", {
    이메일길이: email.length,
    이메일: email || "(비어 있음)",
  });
  try {
    console.log(LP_PW_RESET_LOG, "3) resetPasswordRequest 호출");
    const result = await resetPasswordRequest(email);
    console.log(LP_PW_RESET_LOG, "4) resetPasswordRequest 결과", result);
    if (result.ok) {
      console.log(LP_PW_RESET_LOG, "5) 성공 → 토스트·모달 닫기");
      closeAuthPwRecoveryModal();
      if (emailInput) emailInput.value = "";
      showToast("비밀번호 재설정 메일을 보냈어요.", "이메일을 확인해 주세요.");
    } else {
      console.log(LP_PW_RESET_LOG, "5) 실패 → 토스트(메시지)", result.msg);
      showToast(result.msg);
    }
  } catch (e) {
    console.error(LP_PW_RESET_LOG, "예외 발생", e);
    showToast("처리 중 오류가 났어요. 콘솔 로그를 확인해 주세요.");
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

init();

// PWA: 서비스 워커 — load 대기 없이 즉시 등록(첫 방문 설치 가능 조건 빠르게 충족)
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
