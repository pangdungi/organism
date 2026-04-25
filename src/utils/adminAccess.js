/**
 * 관리자 전용 UI — 로그인 user.email(소문자·trim)이 아래와 같을 때만 true.
 * VITE_APP_ADMIN_EMAIL 이 있으면 그 값을 쓰고, 없으면 앱 기본 관리자 메일(아래)을 씀.
 * 비밀번호는 Supabase Auth에서만 검증(클라이언트에 비번 저장 없음).
 */

import { supabase } from "../supabase.js";

/** .env 미설정 시에도 지정 관리자 계정으로 메뉴가 보이게 함. 배포에서 바꾸려면 VITE_APP_ADMIN_EMAIL */
const DEFAULT_APP_ADMIN_EMAIL = "dbsgpwls416@gmail.com";

function adminEmailConfig() {
  const fromEnv = String(import.meta.env.VITE_APP_ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();
  if (fromEnv) return fromEnv;
  return DEFAULT_APP_ADMIN_EMAIL;
}

/**
 * @param {import("@supabase/supabase-js").User | null | undefined} user
 */
export function isAppAdminUser(user) {
  const want = adminEmailConfig();
  if (!want) return false;
  const em = (user?.email || "").trim().toLowerCase();
  return em === want;
}

/**
 * @param {import("@supabase/supabase-js").Session | null | undefined} session
 */
export function isAppAdminSession(session) {
  return isAppAdminUser(session?.user);
}

/**
 * @returns {Promise<boolean>}
 */
export async function isCurrentUserAppAdmin() {
  if (!supabase) return false;
  try {
    const { data: { session } = {} } = await supabase.auth.getSession();
    return isAppAdminSession(session);
  } catch (_) {
    return false;
  }
}
