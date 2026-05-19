/**
 * user_subscriptions: inactive + access_until 경과 시 이용 불가(클라이언트).
 * 직접 로그인 직후 차단, 기한 도래 시 자동 로그아웃 예약 등에 사용.
 */
import { supabase } from "../supabase.js";

export const SUBSCRIPTION_EXPIRED_MESSAGE = "이용기간이 종료되었습니다.";

/** setTimeout 최대 지연(브라우저 한도) — 더 긴 기간은 콜백에서 재예약 */
const MAX_TIMER_MS = 2147483647;

let subscriptionSignOutTimerId = null;

export function clearSubscriptionAccessAutoSignOutSchedule() {
  if (subscriptionSignOutTimerId != null) {
    clearTimeout(subscriptionSignOutTimerId);
    subscriptionSignOutTimerId = null;
  }
}

/**
 * @returns {Promise<{ status: string, accessUntil: string | null } | null>}
 */
export async function fetchSubscriptionGateSnapshot() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user?.id) return null;

  const { data, error } = await supabase
    .from("user_subscriptions")
    .select("subscription_status, access_until")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (error || !data) return null;

  return {
    status: String(data.subscription_status || "").toLowerCase(),
    accessUntil: data.access_until ?? null,
  };
}

/** inactive + 이용 종료일 경과 */
export function subscriptionInactiveAccessEnded(snap) {
  if (!snap || snap.status !== "inactive" || !snap.accessUntil) return false;
  const endMs = new Date(snap.accessUntil).getTime();
  if (Number.isNaN(endMs)) return false;
  return Date.now() > endMs;
}

/**
 * 로그인된 사용자가 inactive이면서 이용 종료일이 지났으면 true.
 */
export async function enforceSubscriptionAccessOrSignOut() {
  const snap = await fetchSubscriptionGateSnapshot();
  return subscriptionInactiveAccessEnded(snap);
}

/**
 * inactive + access_until 이 아직 미래면 그 시각까지 자동 로그아웃 예약(분할 타이머).
 * 기한 도래 또는 이미 지난 경우 signOutFn 호출.
 * @param {() => Promise<void>} signOutFn — 보통 auth.signOut (세션 정리 포함)
 */
export async function syncSubscriptionAccessAutoSignOut(signOutFn) {
  clearSubscriptionAccessAutoSignOutSchedule();
  const snap = await fetchSubscriptionGateSnapshot();
  if (!snap) return;

  if (subscriptionInactiveAccessEnded(snap)) {
    await signOutFn();
    return;
  }

  if (snap.status !== "inactive" || !snap.accessUntil) return;

  const endMs = new Date(snap.accessUntil).getTime();
  if (Number.isNaN(endMs)) return;

  const now = Date.now();
  if (now >= endMs) {
    await signOutFn();
    return;
  }

  const msLeft = endMs - now;
  const delay = Math.min(msLeft, MAX_TIMER_MS);
  subscriptionSignOutTimerId = setTimeout(() => {
    subscriptionSignOutTimerId = null;
    void syncSubscriptionAccessAutoSignOut(signOutFn);
  }, delay);
}
