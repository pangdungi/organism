/**
 * 할일 리마인더 Web Push — 탭을 닫아도 서버(cron)가 같은 분에 푸시 발송
 * 필요: VITE_VAPID_PUBLIC_KEY, Supabase 마이그레이션(user_push_subscriptions), Edge Function 배포
 * 공개 키: prebuild가 process.env → vapid-public.build.json, vite.config define, import.meta.env 순.
 */
/* global __LP_VAPID_PUBLIC_KEY__ */
import vapidBuild from "../vapid-public.build.json";
import { supabase } from "../supabase.js";
import { syncUserIanaTimezoneToSupabase } from "./userHourlySync.js";

const TABLE = "user_push_subscriptions";

/** `/vapid-public.json` fetch로 채움 — 메인 JS만 캐시된 폰에서도 키 복구 */
let runtimePublicKey = "";
let ensureVapidRuntimePromise = null;

function resetEnsureVapidRuntimeFetch() {
  ensureVapidRuntimePromise = null;
}

function getVapidPublicKeyFromBundle() {
  const fromJson = typeof vapidBuild?.publicKey === "string" ? vapidBuild.publicKey.trim() : "";
  if (fromJson) return fromJson;
  const fromDefine = typeof __LP_VAPID_PUBLIC_KEY__ === "string" ? __LP_VAPID_PUBLIC_KEY__.trim() : "";
  if (fromDefine) return fromDefine;
  const k = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  return typeof k === "string" && k.trim().length > 0 ? k.trim() : "";
}

/**
 * 번들에 키가 없을 때만 네트워크에서 `public/vapid-public.json` 로드.
 * 끝나면 `lp-vapid-ready` 이벤트로 UI 갱신 가능.
 */
export function ensureVapidRuntimeFallback() {
  if (ensureVapidRuntimePromise) return ensureVapidRuntimePromise;
  ensureVapidRuntimePromise = (async () => {
    if (getVapidFromHtmlBoot() || getVapidPublicKeyFromBundle()) return;
    if (runtimePublicKey) return;
    try {
      const r = await fetch("/vapid-public.json", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const k = String(j.publicKey || "")
        .trim()
        .replace(/\s+/g, "");
      if (k) runtimePublicKey = k;
    } catch {
      /* ignore */
    } finally {
      try {
        window.dispatchEvent(new CustomEvent("lp-vapid-ready"));
      } catch {
        /* ignore */
      }
    }
  })();
  return ensureVapidRuntimePromise;
}

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

function getVapidFromHtmlBoot() {
  if (typeof window === "undefined") return "";
  const w = window.__LP_VAPID_HTML__;
  if (typeof w === "string" && w.trim()) return w.trim();
  try {
    if (typeof document !== "undefined") {
      const meta = document.querySelector('meta[name="lp-vapid-public-key"]');
      const c = meta?.getAttribute("content");
      if (c && String(c).trim()) return String(c).trim();
    }
  } catch {
    /* ignore */
  }
  return "";
}

export function getVapidPublicKey() {
  const fromHtml = getVapidFromHtmlBoot();
  if (fromHtml) return fromHtml;
  if (runtimePublicKey) return runtimePublicKey;
  return getVapidPublicKeyFromBundle();
}

export function reminderPushStatusLabel() {
  if (!hasWebPushSupport()) return "이 기기·브라우저에서는 미지원";
  if (!getVapidPublicKey()) return "알림 꺼짐 — 아래 버튼으로 허용·연결해 주세요";
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
    await ensureVapidRuntimeFallback();
    if (!hasWebPushSupport()) {
      return { ok: false, msg: "이 브라우저에서는 Web Push를 쓸 수 없어요." };
    }
    if (!supabase) {
      return { ok: false, msg: "Supabase가 연결되지 않았어요." };
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") {
      return { ok: false, msg: "알림 권한이 필요해요." };
    }
    if (!getVapidPublicKey()) resetEnsureVapidRuntimeFetch();
    await ensureVapidRuntimeFallback();
    const vapid = getVapidPublicKey();
    if (!vapid) {
      return {
        ok: false,
        msg: "푸시 연결 정보를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.",
      };
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
  await ensureVapidRuntimeFallback();
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
