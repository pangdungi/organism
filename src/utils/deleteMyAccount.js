import { supabase } from "../supabase.js";

/**
 * Edge Function delete-my-account 호출 (배포·CORS 필요).
 * 성공 시 서버에서 auth 유저 삭제 → 연관 public 행은 CASCADE.
 */
export async function deleteMyAccountViaEdgeFunction() {
  if (!supabase) {
    return { ok: false, msg: "연결되지 않았습니다." };
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    return { ok: false, msg: "로그인 세션이 없습니다." };
  }
  const base = String(import.meta.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "");
  if (!base || !anon) {
    return { ok: false, msg: "앱 설정을 확인할 수 없습니다." };
  }

  let res;
  try {
    res = await fetch(`${base}/functions/v1/delete-my-account`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        apikey: anon,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
  } catch (_) {
    return {
      ok: false,
      msg: "탈퇴 서버에 연결할 수 없습니다. 네트워크를 확인하거나 잠시 후 다시 시도해 주세요.",
    };
  }

  let body = {};
  try {
    body = await res.json();
  } catch (_) {
    /* ignore */
  }

  if (!res.ok) {
    const detail =
      typeof body.detail === "string"
        ? body.detail
        : typeof body.error === "string"
          ? body.error
          : "";
    if (res.status === 404) {
      return {
        ok: false,
        msg: "탈퇴 기능이 아직 서버에 연결되지 않았습니다. 관리자에게 문의해 주세요.",
      };
    }
    return {
      ok: false,
      msg: detail || "탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  return { ok: true };
}
