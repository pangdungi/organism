import "./main.css";
import { showOnly } from "./pages.js";
import {
  login,
  signUp,
  signOut,
  changePassword,
  resetPasswordRequest,
  updatePasswordForRecovery,
  purgeTimeLedgerLocalOnSignOut,
} from "./auth.js";
import { mountApp } from "./App.js";
import { initOfflineAppGate } from "./utils/offlineAppGate.js";
import { supabase } from "./supabase.js";
import { applyAppFont } from "./views/Idea.js";
import { pullUserPrefsFromSupabase } from "./utils/userHourlySync.js";
import { applyTimeCategoryColors, applyTaskCategoryColors } from "./utils/todoSettings.js";
import { showToast } from "./utils/showToast.js";
import {
  scheduleSilentReminderPushSync,
  ensureVapidRuntimeFallback,
} from "./utils/webPushReminders.js";
import { ensureTimeLedgerStorageReady } from "./utils/timeLedgerEntriesModel.js";
import {
  enforceSubscriptionAccessOrSignOut,
  SUBSCRIPTION_EXPIRED_MESSAGE,
} from "./utils/subscriptionAccess.js";

void ensureVapidRuntimeFallback();

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
  const signupEl = document.getElementById("auth-panel-signup");
  const loginEl = document.getElementById("auth-panel-login");
  if (!signupEl || !loginEl) return;
  const forgot = document.getElementById("forgot-pw-form");
  const change = document.getElementById("change-pw-form");
  if (mode === "signup") {
    signupEl.style.display = "";
    loginEl.style.display = "none";
    if (forgot) forgot.style.display = "none";
    if (change) change.style.display = "none";
  } else {
    signupEl.style.display = "none";
    loginEl.style.display = "";
  }
}

function init() {
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
  document.getElementById("btn-go-login")?.addEventListener("click", () => setAuthGatePanel("login"));
  document.getElementById("btn-go-signup")?.addEventListener("click", () => setAuthGatePanel("signup"));
  document.getElementById("btn-show-change-pw")?.addEventListener("click", () => {
    document.getElementById("forgot-pw-form").style.display = "none";
    document.getElementById("change-pw-form").style.display = "block";
  });
  document.getElementById("btn-show-forgot-pw")?.addEventListener("click", () => {
    document.getElementById("change-pw-form").style.display = "none";
    document.getElementById("forgot-pw-form").style.display = "block";
  });
  document.getElementById("btn-cancel-pw")?.addEventListener("click", () => {
    document.getElementById("change-pw-form").style.display = "none";
  });
  document.getElementById("btn-cancel-forgot")?.addEventListener("click", () => {
    document.getElementById("forgot-pw-form").style.display = "none";
  });
  document.getElementById("btn-change-pw")?.addEventListener("click", doChangePassword);
  document.getElementById("btn-send-reset-mail")?.addEventListener("click", doForgotPassword);
  document.getElementById("btn-reset-pw-submit")?.addEventListener("click", doResetPassword);

  // PASSWORD_RECOVERY: 이메일 링크 클릭 후 새 비밀번호 페이지 표시
  supabase?.auth?.onAuthStateChange?.((event) => {
    if (event === "PASSWORD_RECOVERY") {
      showOnly("reset-password");
      return;
    }
    if (event === "SIGNED_OUT") {
      try {
        sessionStorage.removeItem("lp_active_tab_id");
      } catch (_) {}
      void purgeTimeLedgerLocalOnSignOut();
      document.getElementById("app-screen").innerHTML = "";
      showOnly("login");
      setAuthGatePanel("signup");
    }
  });

  // 로그인 비밀번호 보기
  document.getElementById("login-show-pw")?.addEventListener("change", (e) => {
    const pw = document.getElementById("login-pw");
    if (pw) pw.type = e.target.checked ? "text" : "password";
  });

  document.getElementById("signup-show-pw")?.addEventListener("change", (e) => {
    const type = e.target.checked ? "text" : "password";
    ["signup-pw", "signup-pw-confirm"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.type = type;
    });
  });

  // 비밀번호 변경 폼 비밀번호 보기
  document.getElementById("cp-show-pw")?.addEventListener("change", (e) => {
    const type = e.target.checked ? "text" : "password";
    ["cp-current", "cp-new", "cp-confirm"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.type = type;
    });
  });

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
      if (a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT")) a.blur();
    };
    const observer = new MutationObserver((mutations) => {
      if (!isMobile()) return;
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "hidden") {
          const el = m.target;
          if (!el.hasAttribute?.("hidden") && el.getAttribute?.("class")?.includes("modal")) {
            blurInput();
            [0, 50, 150, 300].forEach((ms) => setTimeout(blurInput, ms));
            break;
          }
        }
      }
    });
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["hidden"] });
  })();

  const AUTH_GET_SESSION_MS = 12_000;

  async function showInitialPage() {
    if (!supabase) {
      showOnly("login");
      setAuthGatePanel("signup");
      return;
    }
    let session = null;
    try {
      const res = await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("auth_get_session_timeout")), AUTH_GET_SESSION_MS),
        ),
      ]);
      session = res?.data?.session ?? null;
    } catch (_e) {
      showOnly("login");
      setAuthGatePanel("signup");
      return;
    }
    if (session) {
      const blockedBySubscription = await enforceSubscriptionAccessOrSignOut();
      if (blockedBySubscription) {
        window.alert(SUBSCRIPTION_EXPIRED_MESSAGE);
        showOnly("login");
        setAuthGatePanel("signup");
        return;
      }
      showOnly("signin");
      /* 시급·appearance·타임존 RPC는 네트워크 지연 시 스플래시가 멈추지 않도록 비동기로만 실행 */
      void pullUserPrefsFromSupabase().catch(() => {});
      await prepareTimeLedgerStorageForCurrentSession();
      mountApp(document.getElementById("app-screen"));
      scheduleSilentReminderPushSync();
      return;
    }
    showOnly("login");
    setAuthGatePanel("signup");
  }

  async function dismissAppSplash() {
    const splash = document.getElementById("app-splash");
    const minVisibleMs = 720;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    try {
      await showInitialPage();
    } catch (_e) {
    } finally {
      const elapsed =
        (typeof performance !== "undefined" ? performance.now() : Date.now()) - t0;
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
      showOnly("login");
      setAuthGatePanel("login");
      return;
    }
    showOnly("signin");
    void pullUserPrefsFromSupabase().catch(() => {});
    await prepareTimeLedgerStorageForCurrentSession();
    mountApp(document.getElementById("app-screen"));
    scheduleSilentReminderPushSync();
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
    const blockedBySubscription = await enforceSubscriptionAccessOrSignOut();
    if (blockedBySubscription) {
      window.alert(SUBSCRIPTION_EXPIRED_MESSAGE);
      showOnly("login");
      setAuthGatePanel("signup");
      return;
    }
    showOnly("signin");
    void pullUserPrefsFromSupabase().catch(() => {});
    await prepareTimeLedgerStorageForCurrentSession();
    mountApp(document.getElementById("app-screen"));
    scheduleSilentReminderPushSync();
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

async function doChangePassword() {
  const email = document.getElementById("cp-email")?.value?.trim() || "";
  const current = document.getElementById("cp-current")?.value || "";
  const newPw = document.getElementById("cp-new")?.value || "";
  const result = await changePassword({ email, currentPassword: current, newPassword: newPw });
  if (result.ok) {
    document.getElementById("change-pw-form").style.display = "none";
    showToast("비밀번호 변경됐어. 다시 로그인해 주세요.");
    showOnly("login");
    setAuthGatePanel("login");
  } else {
    showToast(result.msg);
  }
}

async function doForgotPassword() {
  const email = document.getElementById("forgot-pw-email")?.value?.trim() || "";
  const result = await resetPasswordRequest(email);
  if (result.ok) {
    document.getElementById("forgot-pw-form").style.display = "none";
    document.getElementById("forgot-pw-email").value = "";
    showToast("비밀번호 재설정 메일을 보냈어요.", "이메일을 확인해 주세요.");
  } else {
    showToast(result.msg);
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
    showOnly("login");
    setAuthGatePanel("login");
  } else {
    showToast(result.msg);
  }
}

init();

// PWA: 서비스 워커 등록 (앱 설치·홈 화면 추가 가능)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
