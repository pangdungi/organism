/**
 * 서비스 워커가 푸시 수신 시 postMessage → 앱 안 확인 팝업(할 일 이름)
 * 리스너는 창당 한 번만
 */
import { showToast } from "./showToast.js";

let listenerInstalled = false;

const LOG = "[lp-reminder-app]";

/** 앱이 켜진 상태(시스템 알림 대신 팝업만 뜰 때)용 짧은 알림음 */
function playReminderBeep() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const run = () => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.1, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.start(t);
      o.stop(t + 0.25);
    };
    if (ctx.state === "suspended") {
      ctx.resume().then(run).catch(() => {});
    } else {
      run();
    }
  } catch (_) {}
}

export function initPushReminderInAppPopup() {
  if (listenerInstalled) return;
  if (typeof navigator === "undefined" || !navigator.serviceWorker?.addEventListener) return;
  listenerInstalled = true;
  const ctrl = navigator.serviceWorker.controller;
  console.log(LOG, "리스너 설치됨", "controller:", ctrl ? ctrl.scriptURL : "(없음 — SW가 이 페이지를 아직 안 잡았을 수 있음)");
  navigator.serviceWorker.addEventListener("message", (event) => {
    const d = event.data;
    console.log(LOG, "message 수신", d);
    if (!d || d.type !== "lp-reminder") return;
    const taskName = String(d.body || "").trim() || "할일";
    console.log(LOG, "팝업 표시 시도", taskName);
    try {
      playReminderBeep();
      showToast(taskName);
      console.log(LOG, "showToast 호출 완료");
    } catch (e) {
      console.warn(LOG, "showToast 실패", e);
    }
  });
}
