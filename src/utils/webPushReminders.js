/**
 * 할일 리마인더 Web Push — 탭을 닫아도 서버(cron)가 같은 분에 푸시 발송
 * 필요: VITE_VAPID_PUBLIC_KEY, Supabase 마이그레이션(user_push_subscriptions), Edge Function 배포
 * 공개 키는 vite.config `define`으로도 주입됨(Vercel process.env 대응).
 */
/* global __LP_VAPID_PUBLIC_KEY__ */
import { supabase } from "../supabase.js";
import { syncUserIanaTimezoneToSupabase } from "./userHourlySync.js";

const TABLE = "user_push_subscriptions";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function hasWebPushSupport() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    (location.protocol === "https:" || location.hostname === "localhost")
  );
}

export function getVapidPublicKey() {
  const fromBuild = typeof __LP_VAPID_PUBLIC_KEY__ === "string" ? __LP_VAPID_PUBLIC_KEY__.trim() : "";
  if (fromBuild) return fromBuild;
  const k = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  return typeof k === "string" && k.trim().length > 0 ? k.trim() : "";
}

export function reminderPushStatusLabel() {
  if (!hasWebPushSupport()) return "이 기기·브라우저에서는 미지원";
  if (!getVapidPublicKey()) return "VAPID 키 미설정 (배포 환경 확인)";
  switch (Notification.permission) {
    case "granted":
      return "알림 허용됨";
    case "denied":
      return "알림 차단됨 — 브라우저 설정에서 허용해 주세요";
    default:
      return "알림 꺼짐 — 아래 버튼으로 켤 수 있어요";
  }
}

/** 사용자 제스처(버튼 클릭) 안에서 호출 */
export async function registerReminderPushFromUserGesture() {
  try {
    if (!hasWebPushSupport()) {
      return { ok: false, msg: "이 브라우저에서는 Web Push를 쓸 수 없어요." };
    }
    const vapid = getVapidPublicKey();
    if (!vapid) {
      return {
        ok: false,
        msg: "알림 설정(공개 키)이 빠졌어요. 사이트를 만든 쪽 환경 변수를 확인해 주세요.",
      };
    }
    if (!supabase) {
      return { ok: false, msg: "Supabase가 연결되지 않았어요." };
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, msg: "알림 권한이 필요해요." };
    }

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapid),
        });
      } catch (e) {
        const m = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
        console.warn("[web-push] subscribe", m);
        return {
          ok: false,
          msg:
            "이 기기에서 푸시 구독에 실패했어요. Chrome으로 시도하거나, 알림 공개 키가 서버와 짝이 맞는지 확인해 주세요. (" +
            m.slice(0, 120) +
            ")",
        };
      }
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) {
      return { ok: false, msg: "로그인이 필요해요." };
    }

    const key256 = sub.getKey("p256dh");
    const keyAuth = sub.getKey("auth");
    if (!key256 || !keyAuth) {
      return { ok: false, msg: "구독 정보를 읽을 수 없어요." };
    }

    const row = {
      user_id: uid,
      endpoint: sub.endpoint,
      p256dh: arrayBufferToBase64Url(key256),
      auth: arrayBufferToBase64Url(keyAuth),
      user_agent: (typeof navigator !== "undefined" && navigator.userAgent
        ? navigator.userAgent.slice(0, 500)
        : "") || "",
    };

    const { error } = await supabase.from(TABLE).upsert(row, {
      onConflict: "user_id,endpoint",
    });
    if (error) {
      console.warn("[web-push]", error.message);
      return {
        ok: false,
        msg: "서버에 알림 주소를 저장하지 못했어요: " + (error.message || "알 수 없음"),
      };
    }
    await syncUserIanaTimezoneToSupabase();
    return {
      ok: true,
      msg: "알림을 켰어요. 서버에 이 기기 주소가 등록됐어요.",
    };
  } catch (e) {
    const m = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
    console.warn("[web-push]", m);
    return { ok: false, msg: "알림 켜기 중 오류: " + m.slice(0, 200) };
  }
}

/** 이미 허용된 세션에서 구독만 서버에 맞춤 (조용히) */
export async function trySilentReminderPushIfAlreadyGranted() {
  if (!hasWebPushSupport() || Notification.permission !== "granted") return;
  const vapid = getVapidPublicKey();
  if (!vapid || !supabase) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
    }
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const key256 = sub.getKey("p256dh");
    const keyAuth = sub.getKey("auth");
    if (!key256 || !keyAuth) return;
    await supabase.from(TABLE).upsert(
      {
        user_id: uid,
        endpoint: sub.endpoint,
        p256dh: arrayBufferToBase64Url(key256),
        auth: arrayBufferToBase64Url(keyAuth),
        user_agent: (navigator.userAgent || "").slice(0, 500),
      },
      { onConflict: "user_id,endpoint" },
    );
    await syncUserIanaTimezoneToSupabase();
  } catch (_) {}
}

export function scheduleSilentReminderPushSync() {
  const run = () => {
    setTimeout(() => {
      void trySilentReminderPushIfAlreadyGranted();
    }, 1800);
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}
