/**
 * user_subscriptions: inactive + access_until 경과 시 앱 이용 불가 (클라이언트 게이트)
 */
import { supabase } from "../supabase.js";

export const SUBSCRIPTION_EXPIRED_MESSAGE = "이용기간이 종료되었습니다.";

/**
 * 로그인된 사용자가 inactive이면서 이용 종료일이 지났으면 세션 종료 후 true.
 * 그 외(행 없음, active, trial 유효 등)는 false.
 */
export async function enforceSubscriptionAccessOrSignOut() {
  if (!supabase) return false;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return false;

  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("subscription_status, access_until")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !data) return false;

  const status = String(data.subscription_status || "").toLowerCase();
  if (status !== "inactive") return false;

  const until = data.access_until;
  if (!until) return false;

  const endMs = new Date(until).getTime();
  if (Number.isNaN(endMs)) return false;

  if (Date.now() <= endMs) return false;

  await supabase.auth.signOut();
  return true;
}
