import { supabase } from "./supabase.js";
import { showOnly } from "./pages.js";

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
    return { ok: false, msg: error.message || "메일 발송에 실패했어요." };
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
    return { ok: false, msg: error.message || "비밀번호 변경에 실패했어요." };
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
  if (updateError) return { ok: false, msg: updateError.message };
  await supabase.auth.signOut();
  return { ok: true };
}
