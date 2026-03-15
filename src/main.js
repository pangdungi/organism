import "./main.css";
import { showOnly } from "./pages.js";
import { login, signOut, changePassword } from "./auth.js";
import { mountApp } from "./App.js";
import { supabase } from "./supabase.js";
import { applyAppFont } from "./views/Idea.js";

function init() {
  applyAppFont();
  const goLogin = () => showOnly("login");
  document.getElementById("btn-login")?.addEventListener("click", goLogin);
  document.getElementById("btn-login-hero")?.addEventListener("click", goLogin);
  document.getElementById("btn-login-cta")?.addEventListener("click", goLogin);
  document.getElementById("btn-do-login")?.addEventListener("click", doLogin);
  document.getElementById("btn-show-change-pw")?.addEventListener("click", () => {
    document.getElementById("change-pw-form").style.display = "block";
  });
  document.getElementById("btn-cancel-pw")?.addEventListener("click", () => {
    document.getElementById("change-pw-form").style.display = "none";
  });
  document.getElementById("btn-change-pw")?.addEventListener("click", doChangePassword);

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

init();

// PWA: 서비스 워커 등록 (앱 설치·홈 화면 추가 가능)
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
