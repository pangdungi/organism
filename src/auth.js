import { supabase } from "./supabase.js";
import { showOnly } from "./pages.js";
import {
  purgeTimeLedgerLocalData,
  reloadTimeLedgerStorageForActiveUser,
  resetTimeLedgerMemoryForAccountSwitch,
} from "./utils/timeLedgerEntriesModel.js";
import { clearTimeLedgerTaskOptionsLocalStorage } from "./utils/timeTaskOptionsModel.js";
import { clearWorkScheduleMemAndLegacy, resetWorkScheduleMemory } from "./utils/workScheduleModel.js";
import { clearDiaryMemAndLegacy } from "./diaryData.js";
import { clearTodoSectionTasksMemAndLegacy } from "./utils/todoSectionTasksModel.js";
import { clearTodoSubtasksMemAndLegacy } from "./utils/todoSubtasks.js";
import { clearTodoSettingsAndCustomSectionsOnSignOut } from "./utils/todoSettings.js";
import { clearAllKpiUiSessions } from "./utils/kpiViewUiSession.js";
import { flushAllPendingTimeDailyBudgetSync } from "./utils/timeDailyBudgetSupabase.js";
import {
  getPasswordRecoveryRedirectUrl,
  getSignupEmailRedirectUrl,
} from "./utils/authEmailRedirect.js";
import { clearSupabaseSessionCache, primeSupabaseSession } from "./utils/supabaseSession.js";
import { clearSubscriptionAccessAutoSignOutSchedule } from "./utils/subscriptionAccess.js";
import { clearUserHourlyRateLocal } from "./utils/userHourlySync.js";
import {
  getActiveClientStorageUserId,
  migrateAllRegisteredLegacyLocalStorage,
  removeLegacyUnscopedLocalStorageKeys,
  setActiveClientStorageUserId,
} from "./utils/clientStorageScope.js";
import { setAuthRememberMePreference } from "./utils/authRememberMe.js";

async function resetInMemoryClientDataForAccountSwitch() {
  clearTimeLedgerTaskOptionsLocalStorage();
  resetWorkScheduleMemory();
  clearDiaryMemAndLegacy();
  clearTodoSectionTasksMemAndLegacy();
  clearTodoSubtasksMemAndLegacy();
  clearAllKpiUiSessions();
  await reloadTimeLedgerStorageForActiveUser();
}

/** 로그아웃·세션 만료 시 해당 계정 로컬 캐시·메모리 정리 (다른 계정 캐시는 유지) */
export async function purgeTimeLedgerLocalOnSignOut() {
  let uid = "";
  try {
    uid =
      getActiveClientStorageUserId() ||
      localStorage.getItem(LP_LAST_AUTH_UID_KEY) ||
      sessionStorage.getItem(LP_LEDGER_UID_SESSION_KEY) ||
      "";
  } catch (_) {}
  try {
    flushAllPendingTimeDailyBudgetSync();
  } catch (_) {}
  if (uid) {
    /* 계정별 localStorage 캐시(KPI 등)는 유지 — 재로그인·서버 pull 표시용 */
    await purgeTimeLedgerLocalData(uid);
  } else {
    resetTimeLedgerMemoryForAccountSwitch();
  }
  clearTimeLedgerTaskOptionsLocalStorage();
  clearWorkScheduleMemAndLegacy();
  clearDiaryMemAndLegacy();
  clearTodoSectionTasksMemAndLegacy();
  clearTodoSubtasksMemAndLegacy();
  clearTodoSettingsAndCustomSectionsOnSignOut();
  clearUserHourlyRateLocal();
  clearAllKpiUiSessions();
  setActiveClientStorageUserId("");
  try {
    sessionStorage.clear();
  } catch (_) {}
  /* lp_last_auth_uid 는 유지 — 다음 로그인 시 prev≠next 로 계정 전환·옛 공용 키 이전 차단 */
}

const LP_LAST_AUTH_UID_KEY = "lp_last_auth_uid";
const LP_LEDGER_UID_SESSION_KEY = "lp_ledger_uid";
const LP_AUTH_CROSS_TAB_CHANNEL = "lp-auth-user-changed";

/** 이 탭에서 앱을 연 때의 로그인 사용자 id (다른 탭에서 계정만 바뀌면 감지) */
let tabBootAuthUid = "";
let authSwitchReloading = false;

export function markTabBootAuthUid(uid) {
  tabBootAuthUid = String(uid || "").trim();
}

export function getTabBootAuthUid() {
  return tabBootAuthUid;
}

function reloadForAuthUserChange() {
  if (authSwitchReloading) return;
  authSwitchReloading = true;
  try {
    flushAllPendingTimeDailyBudgetSync();
  } catch (_) {}
  try {
    const ch = new BroadcastChannel(LP_AUTH_CROSS_TAB_CHANNEL);
    ch.postMessage({ type: "reload", ts: Date.now() });
    ch.close();
  } catch (_) {}
  location.reload();
}

/**
 * 다른 탭·같은 탭에서 로그인 사용자 id가 바뀌면 즉시 새로고침(메모리·화면 초기화).
 * @returns {boolean} 새로고침을 시작했으면 true
 */
export function maybeReloadForAuthUserChange(session, { appMounted }) {
  const uid = String(session?.user?.id || "").trim();
  if (!uid || !appMounted) return false;
  const boot = getTabBootAuthUid();
  if (!boot || boot === uid) return false;
  reloadForAuthUserChange();
  return true;
}

/** storage·BroadcastChannel — 다른 탭에서 계정 전환·로컬 비울 때 이 탭도 새로고침 */
export function initAuthUserCrossTabGuard({ isAppMounted }) {
  if (typeof window === "undefined") return;

  window.addEventListener("storage", (e) => {
    if (!isAppMounted()) return;
    const boot = getTabBootAuthUid();
    if (!boot) return;
    if (e.key === null) {
      reloadForAuthUserChange();
      return;
    }
    if (e.key === LP_LAST_AUTH_UID_KEY) {
      const next = String(e.newValue || "").trim();
      if (next && next !== boot) reloadForAuthUserChange();
    }
  });

  try {
    const ch = new BroadcastChannel(LP_AUTH_CROSS_TAB_CHANNEL);
    ch.addEventListener("message", (ev) => {
      if (!isAppMounted()) return;
      if (ev?.data?.type === "reload") reloadForAuthUserChange();
    });
  } catch (_) {}
}

/**
 * 로그인·자동 로그인 시 활성 계정 id 설정. 로컬 데이터는 계정별 키로 분리 저장.
 * lp_last_auth_uid 는 localStorage 에 두어 탭·재접속 후에도 이전 사용자와 구분.
 */
export async function ensureClientStorageForAuthUser(uid) {
  const next = String(uid || "").trim();
  if (!next) {
    setActiveClientStorageUserId("");
    return;
  }
  let prev = "";
  try {
    prev =
      localStorage.getItem(LP_LAST_AUTH_UID_KEY) ||
      sessionStorage.getItem(LP_LEDGER_UID_SESSION_KEY) ||
      "";
  } catch (_) {}
  if (prev && prev !== next) {
    removeLegacyUnscopedLocalStorageKeys();
  }
  setActiveClientStorageUserId(next);
  if (prev && prev !== next) {
    await resetInMemoryClientDataForAccountSwitch();
  } else if (prev === next) {
    migrateAllRegisteredLegacyLocalStorage(next);
  } else {
    /* prev 없음(최초 설치 등) — 공용 키만 현재 계정으로 1회 이전 */
    migrateAllRegisteredLegacyLocalStorage(next);
  }
  try {
    localStorage.setItem(LP_LAST_AUTH_UID_KEY, next);
    sessionStorage.setItem(LP_LEDGER_UID_SESSION_KEY, next);
  } catch (_) {}
}

/** Supabase Auth 가 넘기는 영문 메시지를 사용자용 한국어로 */
function toKoAuthError(raw) {
  if (!raw || typeof raw !== "string") return "요청에 실패했어요. 잠시 후 다시 시도해 주세요.";
  const t = raw.trim();
  const cooldown = t.match(
    /For security purposes, you can only request this after (\d+) seconds\.?/i,
  );
  if (cooldown) return `보안을 위해 ${cooldown[1]}초 뒤에 다시 시도해 주세요.`;
  if (/email rate limit exceeded|too many requests/i.test(t)) {
    return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
  }
  if (/already registered|already been registered|User already exists/i.test(t)) {
    return "이미 가입된 이메일이에요.";
  }
  if (/invalid email|Unable to validate email/i.test(t)) {
    return "이메일 형식을 확인해 주세요.";
  }
  if (/Email not confirmed|email address is not confirmed/i.test(t)) {
    return "이메일 인증을 먼저 완료해 주세요.";
  }
  if (/Invalid login credentials|invalid_grant/i.test(t)) {
    return "아이디(이메일) 또는 비밀번호가 틀려요.";
  }
  if (/Password should be at least|Password is too short|weak password/i.test(t)) {
    return "비밀번호는 6자 이상으로 설정해 주세요.";
  }
  if (/Signups not allowed/i.test(t)) {
    return "현재 새 계정 가입이 제한되어 있어요.";
  }
  if (/[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(t)) return t;
  return "처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
}

/** 이메일·비밀번호로 회원가입 (이메일 확인이 켜져 있으면 세션 없을 수 있음) */
export async function signUp(email, password) {
  if (!email?.trim() || !password) {
    return { ok: false, msg: "이메일과 비밀번호를 입력하세요." };
  }
  if (password.length < 6) {
    return { ok: false, msg: "비밀번호는 6자 이상이어야 해요." };
  }
  if (!supabase) {
    return { ok: false, msg: "서버를 재시작해 주세요. (.env가 로드되지 않았습니다)" };
  }
  const emailRedirectTo = getSignupEmailRedirectUrl();
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo },
  });
  if (error) {
    return { ok: false, msg: toKoAuthError(error.message) };
  }
  const uid = data?.session?.user?.id || data?.user?.id;
  if (uid) {
    await ensureClientStorageForAuthUser(uid);
    primeSupabaseSession(data?.session ?? null);
  }
  return { ok: true, data };
}

export async function login(email, password, options = {}) {
  const rememberMe = options.rememberMe !== false;
  if (!email?.trim() || !password) {
    return { ok: false, msg: "아이디와 비밀번호를 입력하세요." };
  }
  if (!supabase) {
    return { ok: false, msg: "서버를 재시작해 주세요. (.env가 로드되지 않았습니다)" };
  }
  setAuthRememberMePreference(rememberMe);
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    return { ok: false, msg: "아이디(이메일) 또는 현재 비밀번호가 틀려요." };
  }
  const uid = data?.session?.user?.id || data?.user?.id;
  if (uid) {
    await ensureClientStorageForAuthUser(uid);
    primeSupabaseSession(data?.session ?? null);
  }
  return { ok: true, data };
}

function resetAuthGatePasswordToggle(buttonId, inputId, labelShow) {
  const btn = document.getElementById(buttonId);
  const input = document.getElementById(inputId);
  const iconShow = btn?.querySelector(".login-pw-toggle__icon--show");
  const iconHide = btn?.querySelector(".login-pw-toggle__icon--hide");
  if (!input) return;
  input.type = "password";
  if (!btn) return;
  btn.setAttribute("aria-pressed", "false");
  btn.setAttribute("aria-label", labelShow);
  iconShow?.removeAttribute("hidden");
  iconHide?.setAttribute("hidden", "");
}

/** 로그아웃·세션 종료 후 로그인·가입 입력칸 비움 (이전 계정 정보 잔留 방지) */
export function clearAuthGateForms() {
  const ids = [
    "login-id",
    "login-pw",
    "signup-email",
    "signup-pw",
    "signup-pw-confirm",
  ];
  ids.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  resetAuthGatePasswordToggle("login-pw-toggle", "login-pw", "비밀번호 보기");
  resetAuthGatePasswordToggle("signup-pw-toggle", "signup-pw", "비밀번호 보기");
  resetAuthGatePasswordToggle(
    "signup-pw-confirm-toggle",
    "signup-pw-confirm",
    "비밀번호 확인란 보기",
  );
}

export async function signOut() {
  clearSubscriptionAccessAutoSignOutSchedule();
  clearSupabaseSessionCache();
  try {
    flushAllPendingTimeDailyBudgetSync();
  } catch (_) {}
  try {
    const el = document.getElementById("app-screen");
    if (el) el.innerHTML = "";
  } catch (_) {}
  showOnly("login");
  clearAuthGateForms();
  if (supabase) await supabase.auth.signOut();
  await purgeTimeLedgerLocalOnSignOut();
}

/** 비밀번호 재설정 메일 요청 (가입 이메일로 링크 발송) */
export async function resetPasswordRequest(email) {
  if (!email?.trim()) {
    return { ok: false, msg: "이메일을 입력하세요." };
  }
  if (!supabase) {
    return { ok: false, msg: "연결되지 않았습니다." };
  }
  const redirectTo = getPasswordRecoveryRedirectUrl();
  const { data, error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  void data;
  if (error) {
    return { ok: false, msg: toKoAuthError(error.message) };
  }
  return { ok: true };
}

/** 비밀번호 재설정 링크 클릭 후 새 비밀번호 설정 */
export async function updatePasswordForRecovery(newPassword) {
  if (!newPassword || newPassword.length < 6) {
    return { ok: false, msg: "비밀번호는 6자 이상이어야 해요." };
  }
  if (!supabase) {
    return { ok: false, msg: "연결되지 않았습니다." };
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    return { ok: false, msg: toKoAuthError(error.message) };
  }
  await supabase.auth.signOut();
  return { ok: true };
}

export async function changePassword({ email, currentPassword, newPassword }) {
  if (!email?.trim() || !currentPassword || !newPassword) {
    return { ok: false, msg: "모든 칸을 입력하세요." };
  }
  if (newPassword !== document.getElementById("cp-confirm")?.value) {
    return { ok: false, msg: "새 비밀번호가 일치하지 않아요." };
  }
  if (!supabase) return { ok: false, msg: "연결되지 않았습니다." };
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password: currentPassword,
  });
  if (signInError) {
    return { ok: false, msg: "아이디(이메일) 또는 현재 비밀번호가 틀려요." };
  }
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) return { ok: false, msg: toKoAuthError(updateError.message) };
  await supabase.auth.signOut();
  return { ok: true };
}
