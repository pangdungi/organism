import { supabase } from "./supabase.js";
import { showOnly } from "./pages.js";
import { purgeTimeLedgerLocalData } from "./utils/timeLedgerEntriesModel.js";
import { clearTimeLedgerTaskOptionsLocalStorage } from "./utils/timeTaskOptionsModel.js";

/** 로그아웃·세션 만료·구독 만료 signOut 시 로컬 시간가계부·과제 캐시 제거 (다른 계정과 섞임 방지) */
export async function purgeTimeLedgerLocalOnSignOut() {
  await purgeTimeLedgerLocalData();
  clearTimeLedgerTaskOptionsLocalStorage();
  try {
    sessionStorage.removeItem("lp_ledger_uid");
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
  const redirectTo = `${window.location.origin}${window.location.pathname || "/"}`;
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    return { ok: false, msg: toKoAuthError(error.message) };
  }
  return { ok: true, data };
}

export async function login(email, password) {
  if (!email?.trim() || !password) {
    return { ok: false, msg: "아이디와 비밀번호를 입력하세요." };
  }
  if (!supabase) {
    return { ok: false, msg: "서버를 재시작해 주세요. (.env가 로드되지 않았습니다)" };
  }
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) {
    return { ok: false, msg: "아이디(이메일) 또는 현재 비밀번호가 틀려요." };
  }
  return { ok: true, data };
}

export async function signOut() {
  if (supabase) await supabase.auth.signOut();
  await purgeTimeLedgerLocalOnSignOut();
  document.getElementById("app-screen").innerHTML = "";
  showOnly("login");
}

/** 비밀번호 재설정 메일 요청 (가입 이메일로 링크 발송) */
export async function resetPasswordRequest(email) {
  if (!email?.trim()) {
    return { ok: false, msg: "이메일을 입력하세요." };
  }
  if (!supabase) {
    return { ok: false, msg: "연결되지 않았습니다." };
  }
  const redirectTo = `${window.location.origin}${window.location.pathname || "/"}`;
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
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
