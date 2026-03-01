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
  showOnly("main");
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
