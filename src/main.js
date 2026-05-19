import "./main.css";
import "./styles/lp-app-font.css";
import "./styles/lp-corsica-display.css";
import "./styles/diary.css";
import "./styles/daily.css";
import "./styles/time-ledger.css";
import "./styles/lp-modals.css";
import "./styles/calendar.css";
import "./styles/stamp-calendar.css";
import "./styles/todo-list.css";
import "./styles/kpi-dream.css";
import { showOnly } from "./pages.js";
import {
  login,
  signUp,
  signOut,
  resetPasswordRequest,
  updatePasswordForRecovery,
  purgeTimeLedgerLocalOnSignOut,
} from "./auth.js";
import {
  mountApp,
  LP_LAST_TAB_LOCAL_KEY,
  LP_LAST_TAB_SESSION_KEY,
} from "./App.js";
import { initOfflineAppGate } from "./utils/offlineAppGate.js";
import { supabase } from "./supabase.js";
import { applyAppFont } from "./utils/appUiFont.js";
import { pullUserPrefsFromSupabase } from "./utils/userHourlySync.js";
import {
  applyTimeCategoryColors,
  applyTaskCategoryColors,
} from "./utils/todoSettings.js";
import { showToast } from "./utils/showToast.js";
import { ensureTimeLedgerStorageReady } from "./utils/timeLedgerEntriesModel.js";
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
  fetchSubscriptionGateSnapshot,
  subscriptionInactiveAccessEnded,
  syncSubscriptionAccessAutoSignOut,
} from "./utils/subscriptionAccess.js";

/** 구독 이용 종료일(access_until) 도래 시 자동 로그아웃 — 브라우저 타이머 한도로 분할 예약 */
function wireSubscriptionDeadlineAutoLogout() {
  void syncSubscriptionAccessAutoSignOut(async () => {
    window.alert(SUBSCRIPTION_EXPIRED_MESSAGE);
    await signOut();
  });
}

/**
 * IndexedDB 시간기록은 user_id가 없어 계정과 묶이지 않음.
 * 이전에 sessionStorage에 남은 계정 id와 현재 세션이 다르면 로컬을 비운 뒤 로드한다.
 */
async function prepareTimeLedgerStorageForCurrentSession() {
  if (!supabase) {
    await ensureTimeLedgerStorageReady();
    return;
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user?.id;
  if (!uid) {
    await ensureTimeLedgerStorageReady();
    return;
  }
  let prev = "";
  try {
    prev = sessionStorage.getItem("lp_ledger_uid") || "";
  } catch (_) {}
  if (prev && prev !== uid) {
    await purgeTimeLedgerLocalOnSignOut();
  }
  try {
    sessionStorage.setItem("lp_ledger_uid", uid);
  } catch (_) {}
  await ensureTimeLedgerStorageReady();
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
  consumeSupabaseAuthRedirectErrors();

  const app = document.getElementById("app");
  if (app) app.style.display = "block";

  initOfflineAppGate();

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
      (event === "SIGNED_IN" || event === "INITIAL_SESSION") &&
      session &&
      (isPasswordRecoverySession(session) || hasPasswordRecoveryUrlHint())
    ) {
      goToPasswordResetUi();
      return;
    }
    if (event === "SIGNED_OUT") {
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
    if (!supabase) {
      showOnly("login");
      setAuthGatePanel("login");
      return;
    }
    let session = null;
    try {
      const res = await Promise.race([
        supabase.auth.getSession(),
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
      /* 시급·appearance·타임존 RPC는 네트워크 지연 시 스플래시가 멈추지 않도록 비동기로만 실행 */
      void pullUserPrefsFromSupabase().catch(() => {});
      await prepareTimeLedgerStorageForCurrentSession();
      await mountApp(document.getElementById("app-screen"));
      /* 구독 스냅샷은 스플래시를 막지 않도록 마운트 뒤 확인·자동 로그아웃 예약 */
      void (async () => {
        try {
          const snapPre = await fetchSubscriptionGateSnapshot();
          if (subscriptionInactiveAccessEnded(snapPre)) {
            window.alert(SUBSCRIPTION_EXPIRED_MESSAGE);
            await signOut();
            return;
          }
          wireSubscriptionDeadlineAutoLogout();
        } catch (_) {}
      })();
      return;
    }
    showOnly("login");
    setAuthGatePanel("login");
  }

  async function dismissAppSplash() {
    const splash = document.getElementById("app-splash");
    /* 0: 기동 직후 바로 본화면 — 인위적 대기 없음 */
    const minVisibleMs = 0;
    const t0 =
      typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      await showInitialPage();
    } catch (_e) {
    } finally {
      const elapsed =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) -
        t0;
      const rest = Math.max(0, minVisibleMs - elapsed);
      if (rest > 0) {
        await new Promise((r) => setTimeout(r, rest));
      }
      if (!splash) return;
      splash.classList.add("app-splash--exiting");
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        splash.removeEventListener("transitionend", onTransitionEnd);
        splash.setAttribute("hidden", "");
        splash.setAttribute("aria-hidden", "true");
      };
      const onTransitionEnd = (ev) => {
        if (ev.target === splash && ev.propertyName === "opacity") done();
      };
      splash.addEventListener("transitionend", onTransitionEnd);
      setTimeout(done, 520);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void (async () => {
      if (!supabase) return;
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const snap = await fetchSubscriptionGateSnapshot();
      if (subscriptionInactiveAccessEnded(snap)) {
        window.alert(SUBSCRIPTION_EXPIRED_MESSAGE);
        await signOut();
        return;
      }
      wireSubscriptionDeadlineAutoLogout();
    })();
  });

  dismissAppSplash();
}

async function doLogin() {
  const id = document.getElementById("login-id")?.value?.trim() || "";
  const pw = document.getElementById("login-pw")?.value || "";
  const result = await login(id, pw);
  if (result.ok) {
    const blockedBySubscription = await enforceSubscriptionAccessOrSignOut();
    if (blockedBySubscription) {
      window.alert(SUBSCRIPTION_EXPIRED_MESSAGE);
      await signOut();
      return;
    }
    showOnly("signin");
    void pullUserPrefsFromSupabase().catch(() => {});
    await prepareTimeLedgerStorageForCurrentSession();
    await mountApp(document.getElementById("app-screen"));
    wireSubscriptionDeadlineAutoLogout();
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
    showOnly("signin");
    void pullUserPrefsFromSupabase().catch(() => {});
    await prepareTimeLedgerStorageForCurrentSession();
    await mountApp(document.getElementById("app-screen"));
    showToast("가입이 완료됐어요.", "메인 화면으로 들어갔어요.");
    wireSubscriptionDeadlineAutoLogout();
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

// PWA: 서비스 워커 등록 (앱 설치·홈 화면 추가 가능)
if (
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
