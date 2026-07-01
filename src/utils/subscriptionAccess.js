/**
 * user_subscriptions: access_until 경과 시 이용 불가(클라이언트).
 * 직접 로그인 직후 차단, 기한 도래 시 자동 로그아웃 예약 등에 사용.
 */
import { supabase } from "../supabase.js";

export const SUBSCRIPTION_EXPIRED_MESSAGE = "이용기간이 종료되었습니다.";
export const SUBSCRIPTION_NO_ACCESS_MESSAGE = "이용 권한이 없습니다.";
export const SUBSCRIPTION_NO_ACCESS_HINT =
  "아임웹에서 이용권을 구매한 뒤, 결제하신 이메일로 로그인해 주세요.";
export const SUBSCRIPTION_RENEWAL_SHOP_URL = "https://doodledoodle.me/";
/** 나의 계정 — 갱신권 구매 노출: 이용 종료일까지 이 일수 이하일 때 */
export const SUBSCRIPTION_RENEWAL_SHOW_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 갱신권 구매 페이지를 새 탭으로 연다 */
export function openSubscriptionRenewalShop() {
  try {
    window.open(SUBSCRIPTION_RENEWAL_SHOP_URL, "_blank", "noopener,noreferrer");
  } catch (_) {
    window.location.href = SUBSCRIPTION_RENEWAL_SHOP_URL;
  }
}

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

  return subscriptionSnapFromPrefsRow(data);
}

/** user_subscriptions 행 → 구독 게이트 스냅샷 */
export function subscriptionSnapFromPrefsRow(row) {
  if (!row || typeof row !== "object") return null;
  return {
    status: String(row.subscription_status || "").toLowerCase(),
    accessUntil: row.access_until ?? null,
  };
}

/** access_until까지 남은 시간(ms). 없거나 잘못된 값이면 null */
export function subscriptionMsUntilAccessEnd(snap) {
  if (!snap?.accessUntil) return null;
  const endMs = new Date(snap.accessUntil).getTime();
  if (Number.isNaN(endMs)) return null;
  return endMs - Date.now();
}

/** 1년 이용권(active) — 만료·갱신 안내 대상 */
export function subscriptionRenewalEligible(snap) {
  return String(snap?.status || "").toLowerCase() === "active";
}

/** 로그인 차단 모달 문구·갱신 버튼 */
export function subscriptionBlockedModalOptions(snap) {
  if (subscriptionRenewalEligible(snap)) {
    return {
      message: SUBSCRIPTION_EXPIRED_MESSAGE,
      warnMessage: "갱신권 구매 후 다시 로그인해 주세요.",
      showRenewal: true,
    };
  }
  return {
    message: SUBSCRIPTION_NO_ACCESS_MESSAGE,
    warnMessage: SUBSCRIPTION_NO_ACCESS_HINT,
    showRenewal: false,
  };
}

/** 나의 계정 — 1년 이용권(active) + 만료 5일 이내 */
export function subscriptionRenewalOfferDue(snap) {
  if (!subscriptionRenewalEligible(snap)) return false;
  const msLeft = subscriptionMsUntilAccessEnd(snap);
  if (msLeft == null) return false;
  return msLeft <= SUBSCRIPTION_RENEWAL_SHOW_DAYS * MS_PER_DAY;
}

/** access_until 경과 시 이용 불가 (inactive·active 공통) */
export function subscriptionAccessEnded(snap) {
  if (!snap || !snap.accessUntil) return false;
  const endMs = new Date(snap.accessUntil).getTime();
  if (Number.isNaN(endMs)) return false;
  return Date.now() > endMs;
}

/** @deprecated subscriptionAccessEnded 와 동일 — 이름 호환 */
export function subscriptionInactiveAccessEnded(snap) {
  return subscriptionAccessEnded(snap);
}

/**
 * 로그인된 사용자가 inactive이면서 이용 종료일이 지났으면 true.
 */
export async function enforceSubscriptionAccessOrSignOut() {
  const snap = await fetchSubscriptionGateSnapshot();
  return subscriptionAccessEnded(snap);
}

/**
 * inactive + access_until 이 아직 미래면 그 시각까지 자동 로그아웃 예약(분할 타이머).
 * 기한 도래 또는 이미 지난 경우 signOutFn 호출.
 * @param {() => Promise<void>} signOutFn — 보통 auth.signOut (세션 정리 포함)
 * @param {{ status: string, accessUntil: string | null } | null} [snapOpt] — 있으면 재조회 생략
 */
export async function syncSubscriptionAccessAutoSignOut(signOutFn, snapOpt) {
  clearSubscriptionAccessAutoSignOutSchedule();
  const snap = snapOpt ?? (await fetchSubscriptionGateSnapshot());
  if (!snap) return;

  if (subscriptionAccessEnded(snap)) {
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

/**
 * 앱 연 뒤 설정 pull 응답으로 구독 확인(추가 네트워크 없음). 만료 시 signOutFn, 아니면 기한 타이머 예약.
 * @param {Record<string, unknown> | null | undefined} row
 * @param {() => Promise<void>} signOutFn
 */
export async function runBackgroundSubscriptionGateFromPrefsRow(row, signOutFn) {
  const snap = subscriptionSnapFromPrefsRow(row);
  if (!snap) return;
  if (subscriptionAccessEnded(snap)) {
    await signOutFn();
    return;
  }
  await syncSubscriptionAccessAutoSignOut(signOutFn, snap);
}
