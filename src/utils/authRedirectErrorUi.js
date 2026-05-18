import { showToast } from "./showToast.js";

function decodeDesc(s) {
  if (!s) return "";
  try {
    return decodeURIComponent(String(s).replace(/\+/g, " "));
  } catch {
    return String(s);
  }
}

/**
 * Supabase가 인증 실패 시 Site URL로 붙이는 ?error= / #error= 를 처리하고 주소창을 짧게 정리.
 */
export function consumeSupabaseAuthRedirectErrors() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    let err = url.searchParams.get("error") || "";
    let code = url.searchParams.get("error_code") || "";
    let desc = decodeDesc(url.searchParams.get("error_description") || "");

    const rawHash = (window.location.hash || "").replace(/^#/, "");
    if (rawHash && rawHash.includes("=")) {
      const hp = new URLSearchParams(rawHash);
      err = err || hp.get("error") || "";
      code = code || hp.get("error_code") || "";
      desc = desc || decodeDesc(hp.get("error_description") || "");
    }

    if (!err && !code && !desc) return;

    const finish = () => {
      url.searchParams.delete("error");
      url.searchParams.delete("error_code");
      url.searchParams.delete("error_description");
      url.searchParams.delete("error_hint");
      url.hash = "";
      const q = url.searchParams.toString();
      window.history.replaceState(window.history.state, "", `${url.pathname}${q ? `?${q}` : ""}`);
    };

    if (code === "otp_expired" || /invalid or has expired|expired|만료/i.test(desc)) {
      showToast(
        "메일 링크가 만료되었거나 이미 사용됐어요.",
        "비밀번호 재설정을 다시 요청해 주세요.",
      );
      finish();
      return;
    }
    if (code === "access_denied" || err === "access_denied") {
      showToast(
        "이 링크로는 진입할 수 없어요.",
        "메일을 새로 요청했는지, 링크를 한 번만 눌렀는지 확인해 주세요.",
      );
      finish();
      return;
    }

    let msg = "인증 링크를 처리하지 못했어요.";
    if (desc && /[가-힣ㄱ-ㅎㅏ-ㅣ]/.test(desc)) {
      msg = desc;
    } else if (desc) {
      msg = desc;
    }

    showToast(msg);
    finish();
  } catch (_) {}
}
