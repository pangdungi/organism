/**
 * Supabase RPC: lp_admin_* (권한은 DB의 lp_is_app_admin — JWT 이메일 = lp_app_admin_email)
 */
import { supabase } from "../supabase.js";

/**
 * @returns {Promise<{ ok: boolean, error: string | null, data: object[] | null }>}
 */
export async function adminListSubscriptions() {
  if (!supabase) return { ok: false, error: "Supabase가 설정되지 않았습니다.", data: null };
  const { data, error } = await supabase.rpc("lp_admin_list_subscriptions");
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
}

/**
 * @param {string} userId
 * @returns {Promise<{ ok: boolean, error: string | null, data: object | null }>}
 */
export async function adminGrantOneYear(userId) {
  if (!supabase) return { ok: false, error: "Supabase가 설정되지 않았습니다.", data: null };
  const { data, error } = await supabase.rpc("lp_admin_grant_one_year", {
    p_user_id: userId,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

/**
 * @param {string} userId
 * @param {string} status
 * @param {string} accessUntilIso
 * @returns {Promise<{ ok: boolean, error: string | null, data: object | null }>}
 */
export async function adminSetSubscription(userId, status, accessUntilIso) {
  if (!supabase) return { ok: false, error: "Supabase가 설정되지 않았습니다.", data: null };
  const { data, error } = await supabase.rpc("lp_admin_set_subscription", {
    p_user_id: userId,
    p_subscription_status: status,
    p_access_until: accessUntilIso,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data };
}

/**
 * @returns {Promise<{ ok: boolean, error: string | null, data: object[] | null }>}
 */
export async function adminListUserDeletions() {
  if (!supabase) return { ok: false, error: "Supabase가 설정되지 않았습니다.", data: null };
  const { data, error } = await supabase.rpc("lp_admin_list_user_deletions");
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || [] };
}
