import "./main.css";
import { showOnly } from "./pages.js";
import { login, signOut, changePassword, resetPasswordRequest, updatePasswordForRecovery } from "./auth.js";
import { mountApp } from "./App.js";
import { supabase } from "./supabase.js";
import { applyAppFont } from "./views/Idea.js";
import { applyTimeCategoryColors, applyTaskCategoryColors } from "./utils/todoSettings.js";

function init() {
  applyAppFont();
  applyTimeCategoryColors();
  applyTaskCategoryColors();
  const goLogin = () => showOnly("login");
  document.getElementById("btn-login")?.addEventListener("click", goLogin);
  document.getElementById("btn-login-hero")?.addEventListener("click", goLogin);
  document.getElementById("btn-login-cta")?.addEventListener("click", goLogin);
  document.getElementById("btn-do-login")?.addEventListener("click", doLogin);
  document.getElementById("btn-show-change-pw")?.addEventListener("click", () => {
    document.getElementById("forgot-pw-form").style.display = "none";
    document.getElementById("change-pw-form").style.display = "block";
  });
  document.getElementById("btn-show-forgot-pw")?.addEventListener("click", () => {
    document.getElementById("change-pw-form").style.display = "none";
    document.getElementById("forgot-pw-form").style.display = "block";
  });
  document.getElementById("btn-cancel-pw")?.addEventListener("click", () => {
    document.getElementById("change-pw-form").style.display = "none";
  });
  document.getElementById("btn-cancel-forgot")?.addEventListener("click", () => {
    document.getElementById("forgot-pw-form").style.display = "none";
  });
  document.getElementById("btn-change-pw")?.addEventListener("click", doChangePassword);
  document.getElementById("btn-send-reset-mail")?.addEventListener("click", doForgotPassword);
  document.getElementById("btn-reset-pw-submit")?.addEventListener("click", doResetPassword);

  // PASSWORD_RECOVERY: 이메일 링크 클릭 후 새 비밀번호 페이지 표시
  supabase?.auth?.onAuthStateChange?.((event) => {
    if (event === "PASSWORD_RECOVERY") {
      showOnly("reset-password");
    }
  });

  // 로그인 비밀번호 보기
  document.getElementById("login-show-pw")?.addEventListener("change", (e) => {
    const pw = document.getElementById("login-pw");
    if (pw) pw.type = e.target.checked ? "text" : "password";
  });

  // 비밀번호 변경 폼 비밀번호 보기
  document.getElementById("cp-show-pw")?.addEventListener("change", (e) => {
    const type = e.target.checked ? "text" : "password";
    ["cp-current", "cp-new", "cp-confirm"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.type = type;
    });
  });

  // 새 비밀번호 설정 폼 비밀번호 보기
  document.getElementById("reset-pw-show")?.addEventListener("change", (e) => {
    const type = e.target.checked ? "text" : "password";
    ["reset-pw-new", "reset-pw-confirm"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.type = type;
    });
  });

  const app = document.getElementById("app");
  if (app) app.style.display = "block";

  async function showInitialPage() {
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        showOnly("signin");
        mountApp(document.getElementById("app-screen"));
        return;
      }
    }
    showOnly("signin");
    mountApp(document.getElementById("app-screen"));
  }
  showInitialPage();
}

async function doLogin() {
  const id = document.getElementById("login-id")?.value?.trim() || "";
  const pw = document.getElementById("login-pw")?.value || "";
  const result = await login(id, pw);
  if (result.ok) {
    showOnly("signin");
    mountApp(document.getElementById("app-screen"));
  } else {
    alert(result.msg);
  }
}

async function doChangePassword() {
  const email = document.getElementById("cp-email")?.value?.trim() || "";
  const current = document.getElementById("cp-current")?.value || "";
  const newPw = document.getElementById("cp-new")?.value || "";
  const result = await changePassword({ email, currentPassword: current, newPassword: newPw });
  if (result.ok) {
    document.getElementById("change-pw-form").style.display = "none";
    alert("비밀번호 변경됐어. 다시 로그인해 주세요.");
    showOnly("login");
  } else {
    alert(result.msg);
  }
}

async function doForgotPassword() {
  const email = document.getElementById("forgot-pw-email")?.value?.trim() || "";
  const result = await resetPasswordRequest(email);
  if (result.ok) {
    document.getElementById("forgot-pw-form").style.display = "none";
    document.getElementById("forgot-pw-email").value = "";
    alert("비밀번호 재설정 메일을 보냈어요. 이메일을 확인해 주세요.");
  } else {
    alert(result.msg);
  }
}

async function doResetPassword() {
  const newPw = document.getElementById("reset-pw-new")?.value || "";
  const confirm = document.getElementById("reset-pw-confirm")?.value || "";
  if (newPw !== confirm) {
    alert("새 비밀번호가 일치하지 않아요.");
    return;
  }
  const result = await updatePasswordForRecovery(newPw);
  if (result.ok) {
    alert("비밀번호가 변경됐어요. 새 비밀번호로 로그인해 주세요.");
    showOnly("login");
  } else {
    alert(result.msg);
  }
}

init();

// PWA: 서비스 워커 등록 (앱 설치·홈 화면 추가 가능)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
