/**
 * My account - 기본정보, 나의 시급 계산
 */

import { signOut } from "../auth.js";
import { supabase } from "../supabase.js";
import { deleteMyAccountViaEdgeFunction } from "../utils/deleteMyAccount.js";
import { USER_HOURLY_RATE_KEY, applyAppearanceFromServer } from "../utils/userHourlySync.js";
import {
  LP_APP_FONT_OPTIONS,
  applyAppFont,
  getStoredAppFontId,
  setAppFontId,
} from "../utils/appUiFont.js";
import { showToast } from "../utils/showToast.js";

export { USER_HOURLY_RATE_KEY, applyAppFont };

function formatPrice(amount) {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("ko-KR").format(Math.round(amount)) + " 원";
}

function formatDateKo(iso) {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/** signup_at 기준 N일 후 (DB interval '365 days' 와 동일하게 ms로 가산) */
function addDaysFromIso(iso, days) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setTime(d.getTime() + days * 24 * 60 * 60 * 1000);
  return d;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content idea-view";

  const mobileViewport =
    typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches;
  if (mobileViewport) {
    el.classList.add("idea-view--mobile");
  }

  if (!mobileViewport) {
    const header = document.createElement("header");
    header.className = "dream-view-header";
    const label = document.createElement("span");
    label.className = "dream-view-label";
    label.textContent = "MY ACCOUNT";
    const title = document.createElement("h1");
    title.className = "dream-view-title idea-view-title";
    title.textContent = "나의 계정";
    header.appendChild(label);
    header.appendChild(title);
    el.appendChild(header);
  }
  /* 모바일: 상단 MY ACCOUNT·나의 계정 제거 — 위젯 그리드부터 */

  const grid = document.createElement("div");
  grid.className = "time-dashboard-view idea-widget-grid";

  // ----- 기본 설정 위젯 (아이디, 화면 글꼴, 로그아웃) -----
  const basicSettingsWidget = document.createElement("div");
  basicSettingsWidget.className = "time-dashboard-widget idea-widget idea-widget-basic-settings";
  basicSettingsWidget.innerHTML = `
    <div class="time-dashboard-widget-title">기본 설정</div>
    <div class="idea-basic-rows">
      <div class="idea-basic-row">
        <span class="idea-form-label">아이디</span>
        <span class="idea-user-id-value" id="idea-user-id">—</span>
      </div>
      <div class="idea-basic-row idea-font-settings-row">
        <label class="idea-form-label" for="idea-app-font-select">화면 글꼴</label>
        <select id="idea-app-font-select" class="idea-app-font-select" aria-label="앱 화면 글꼴"></select>
      </div>
      <div class="idea-logout-row">
        <button type="button" class="idea-btn-logout">로그아웃</button>
      </div>
      <div class="idea-delete-account-block">
        <button type="button" class="idea-btn-delete-account">회원 탈퇴</button>
        <p class="idea-delete-account-hint">서버에 저장된 데이터가 모두 삭제되며 복구할 수 없습니다.</p>
      </div>
    </div>
  `;
  grid.appendChild(basicSettingsWidget);

  const fontSelect = basicSettingsWidget.querySelector("#idea-app-font-select");
  if (fontSelect) {
    LP_APP_FONT_OPTIONS.forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      fontSelect.appendChild(o);
    });
    fontSelect.value = getStoredAppFontId();
    fontSelect.addEventListener("change", () => {
      setAppFontId(fontSelect.value);
    });
  }

  basicSettingsWidget.querySelector(".idea-btn-logout").addEventListener("click", () => {
    signOut();
  });

  function openDeleteAccountModal() {
    const wrap = document.createElement("div");
    wrap.className = "idea-delete-account-modal";
    wrap.innerHTML = `
      <div class="idea-delete-account-modal-backdrop" aria-hidden="true"></div>
      <div class="idea-delete-account-modal-panel" role="dialog" aria-modal="true" aria-labelledby="idea-delete-account-title">
        <div class="idea-delete-account-modal-header">
          <h3 class="idea-delete-account-modal-title" id="idea-delete-account-title">회원 탈퇴</h3>
          <button type="button" class="idea-delete-account-modal-close" aria-label="닫기">×</button>
        </div>
        <div class="idea-delete-account-modal-body">
          <p class="idea-delete-account-modal-warn">탈퇴 시 이 계정의 <strong>모든 서버 데이터</strong>가 삭제됩니다. 되돌릴 수 없습니다.</p>
          <p class="idea-delete-account-modal-label">비밀번호 확인</p>
          <input type="password" class="idea-form-input idea-delete-account-modal-pw" autocomplete="current-password" placeholder="현재 비밀번호" />
        </div>
        <div class="idea-delete-account-modal-footer">
          <button type="button" class="idea-delete-account-modal-cancel">취소</button>
          <button type="button" class="idea-delete-account-modal-submit">탈퇴하기</button>
        </div>
      </div>
    `;
    const close = () => wrap.remove();
    wrap.querySelector(".idea-delete-account-modal-close").addEventListener("click", close);
    wrap.querySelector(".idea-delete-account-modal-cancel").addEventListener("click", close);
    const pwInput = wrap.querySelector(".idea-delete-account-modal-pw");
    const submitBtn = wrap.querySelector(".idea-delete-account-modal-submit");
    submitBtn.addEventListener("click", async () => {
      if (!supabase) {
        showToast("연결되지 않았습니다.");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const email = session?.user?.email?.trim();
      const pw = pwInput?.value || "";
      if (!email) {
        showToast("세션을 확인할 수 없습니다.");
        return;
      }
      if (!pw) {
        showToast("비밀번호를 입력해 주세요.");
        return;
      }
      submitBtn.disabled = true;
      try {
        const { error: reAuthErr } = await supabase.auth.signInWithPassword({ email, password: pw });
        if (reAuthErr) {
          showToast("비밀번호가 일치하지 않습니다.");
          return;
        }
        const del = await deleteMyAccountViaEdgeFunction();
        if (!del.ok) {
          showToast(del.msg || "탈퇴에 실패했습니다.");
          return;
        }
        close();
        showToast("탈퇴가 완료되었습니다.");
        await signOut();
      } finally {
        submitBtn.disabled = false;
      }
    });
    document.body.appendChild(wrap);
    pwInput?.focus();
  }

  basicSettingsWidget.querySelector(".idea-btn-delete-account")?.addEventListener("click", () => {
    openDeleteAccountModal();
  });

  // ----- 구독 (로그아웃 아래 구분선 다음 · 시급 위젯 위) -----
  const subscriptionWidget = document.createElement("div");
  subscriptionWidget.className =
    "time-dashboard-widget idea-widget idea-widget-subscription";
  subscriptionWidget.innerHTML = `
    <div class="time-dashboard-widget-title">구독</div>
    <div class="idea-subscription-body">
      <div class="idea-basic-row idea-subscription-row">
        <span class="idea-form-label">구독상태</span>
        <span class="idea-user-id-value idea-subscription-status" id="idea-subscription-status">—</span>
      </div>
      <p class="idea-subscription-pass" id="idea-subscription-pass" hidden></p>
    </div>
  `;
  grid.appendChild(subscriptionWidget);

  if (typeof supabase !== "undefined" && supabase?.auth) {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const idEl = document.getElementById("idea-user-id");
      if (idEl && session?.user?.email) {
        idEl.textContent = session.user.email;
      }
      const statusEl = document.getElementById("idea-subscription-status");
      const passEl = document.getElementById("idea-subscription-pass");
      if (!session?.user?.id || !statusEl || !passEl) return;
      supabase
        .from("user_subscriptions")
        .select("subscription_status, signup_at, hourly_rate")
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) {
            statusEl.textContent = "—";
            passEl.hidden = true;
            return;
          }
          if (data.subscription_status === "active") {
            statusEl.textContent = "구독중";
            const start = formatDateKo(data.signup_at);
            const endD = addDaysFromIso(data.signup_at, 365);
            const end = endD ? formatDateKo(endD.toISOString()) : "—";
            passEl.textContent = `1년 이용권 (${start} ~ ${end})`;
            passEl.hidden = false;
          } else {
            statusEl.textContent = "작업중";
            passEl.hidden = true;
          }
          const hr = data.hourly_rate != null ? Number(data.hourly_rate) : NaN;
          if (!Number.isNaN(hr) && hr > 0) {
            try {
              localStorage.setItem(USER_HOURLY_RATE_KEY, String(hr));
            } catch (_) {}
            const rv = document.querySelector(".idea-hourly-result-value");
            const ru = document.querySelector(".idea-hourly-result-unit");
            if (rv) {
              rv.textContent = new Intl.NumberFormat("ko-KR").format(Math.round(hr));
              if (ru) {
                ru.textContent = "원";
                ru.style.visibility = "";
              }
            }
            document.dispatchEvent(
              new CustomEvent("app-hourly-rate-changed", { detail: { rate: hr } }),
            );
          }
          if (applyAppearanceFromServer(data.appearance)) {
            try {
              window.dispatchEvent(new CustomEvent("app-colors-changed"));
            } catch (_) {}
          }
        });
    });
  }

  // ----- 나의 시급계산하기 위젯 (모바일: 표시) -----
  const hourlyWidget = document.createElement("div");
  hourlyWidget.className =
    "time-dashboard-widget idea-widget idea-widget-hourly";
  hourlyWidget.innerHTML = `
    <div class="time-dashboard-widget-title">나의 시급 계산하기</div>
    <div class="idea-hourly-tabs">
      <button type="button" class="idea-hourly-tab active" data-mode="salary">월급직</button>
      <button type="button" class="idea-hourly-tab" data-mode="freelance">프리랜서</button>
    </div>
    <form class="idea-hourly-form">
      <div class="idea-salary-row-inline">
        <div class="idea-form-row idea-row-salary">
          <label class="idea-form-label">월급(원)</label>
          <div class="idea-input-with-unit">
            <input type="text" class="idea-form-input idea-input-amount" placeholder="예: 3000000" inputmode="numeric" />
            <span class="idea-input-unit">원</span>
          </div>
        </div>
        <div class="idea-form-row idea-row-salary">
          <label class="idea-form-label">월 근무시간(시간)</label>
          <div class="idea-input-with-unit">
            <input type="text" class="idea-form-input idea-input-hours" placeholder="예: 160" inputmode="numeric" />
            <span class="idea-input-unit">h</span>
          </div>
        </div>
      </div>
      <div class="idea-freelance-row-inline" style="display:none">
        <div class="idea-form-row idea-row-freelance">
          <label class="idea-form-label">월 예상 수입(원)</label>
          <div class="idea-input-with-unit">
            <input type="text" class="idea-form-input idea-input-monthly" placeholder="예: 5000000" inputmode="numeric" />
            <span class="idea-input-unit">원</span>
          </div>
        </div>
        <div class="idea-form-row idea-row-freelance">
          <label class="idea-form-label">월 근무시간(시간)</label>
          <div class="idea-input-with-unit">
            <input type="text" class="idea-form-input idea-input-freelance-hours" placeholder="예: 160" inputmode="numeric" />
            <span class="idea-input-unit">h</span>
          </div>
        </div>
      </div>
      <div class="idea-form-row idea-row-freelance idea-freelance-divider" style="display:none">
        <span class="idea-form-hint">또는 건당 기준</span>
      </div>
      <div class="idea-freelance-row-inline idea-freelance-per-case" style="display:none">
        <div class="idea-form-row idea-row-freelance">
          <label class="idea-form-label">건당 금액(원)</label>
          <div class="idea-input-with-unit">
            <input type="text" class="idea-form-input idea-input-project-fee" placeholder="예: 500000" inputmode="numeric" />
            <span class="idea-input-unit">원</span>
          </div>
        </div>
        <div class="idea-form-row idea-row-freelance">
          <label class="idea-form-label">예상 소요시간(시간)</label>
          <div class="idea-input-with-unit">
            <input type="text" class="idea-form-input idea-input-duration" placeholder="예: 20" inputmode="numeric" />
            <span class="idea-input-unit">h</span>
          </div>
        </div>
      </div>
      <button type="button" class="idea-btn-calc">계산하기</button>
      <div class="idea-hourly-result-wrap">
        <span class="idea-hourly-result-label">나의 시급</span>
        <span class="idea-hourly-result-value">—</span>
        <span class="idea-hourly-result-unit">원</span>
      </div>
    </form>
  `;
  grid.appendChild(hourlyWidget);
  el.appendChild(grid);

  // 시급 계산 로직
  const tabs = hourlyWidget.querySelectorAll(".idea-hourly-tab");
  const freelanceBlocks = hourlyWidget.querySelectorAll(
    ".idea-freelance-row-inline, .idea-freelance-divider",
  );
  const amountInput = hourlyWidget.querySelector(".idea-input-amount");
  const hoursInput = hourlyWidget.querySelector(".idea-input-hours");
  const monthlyInput = hourlyWidget.querySelector(".idea-input-monthly");
  const freelanceHoursInput = hourlyWidget.querySelector(
    ".idea-input-freelance-hours",
  );
  const projectInput = hourlyWidget.querySelector(".idea-input-project-fee");
  const durationInput = hourlyWidget.querySelector(".idea-input-duration");
  const resultValue = hourlyWidget.querySelector(".idea-hourly-result-value");
  const resultUnit = hourlyWidget.querySelector(".idea-hourly-result-unit");
  const calcBtn = hourlyWidget.querySelector(".idea-btn-calc");

  function setHourlyResult(val) {
    if (val == null || val === "—") {
      resultValue.textContent = "—";
      if (resultUnit) resultUnit.style.visibility = "hidden";
    } else {
      resultValue.textContent = new Intl.NumberFormat("ko-KR").format(Math.round(val));
      if (resultUnit) {
        resultUnit.textContent = "원";
        resultUnit.style.visibility = "";
      }
    }
  }

  let mode = "salary"; // salary | freelance

  function parseNumber(str) {
    const cleaned = String(str || "")
      .replace(/,/g, "")
      .replace(/\s/g, "");
    const n = parseFloat(cleaned);
    return Number.isNaN(n) ? 0 : n;
  }

  function formatNumberInput(input) {
    const val = input.value.replace(/\D/g, "");
    if (!val) {
      input.value = "";
      return;
    }
    const n = parseFloat(val);
    if (!Number.isNaN(n)) input.value = n.toLocaleString("ko-KR");
  }

  function switchMode(m) {
    mode = m;
    tabs.forEach((t) => t.classList.toggle("active", t.dataset.mode === m));
    const salaryWrap = hourlyWidget.querySelector(".idea-salary-row-inline");
    if (salaryWrap) salaryWrap.style.display = m === "salary" ? "" : "none";
    freelanceBlocks.forEach(
      (b) => (b.style.display = m === "freelance" ? "" : "none"),
    );
    setHourlyResult("—");
  }

  tabs.forEach((t) => {
    t.addEventListener("click", () => switchMode(t.dataset.mode));
  });

  [amountInput, monthlyInput, projectInput].forEach((inp) => {
    if (inp) {
      inp.addEventListener("input", () => formatNumberInput(inp));
      inp.addEventListener("blur", () => formatNumberInput(inp));
    }
  });

  async function saveHourlyToAccount(hourly) {
    try {
      localStorage.setItem(USER_HOURLY_RATE_KEY, String(hourly));
    } catch (_) {}
    document.dispatchEvent(
      new CustomEvent("app-hourly-rate-changed", { detail: { rate: hourly } }),
    );
    if (!supabase) return;
    const { error } = await supabase.rpc("set_my_hourly_rate", { p_rate: hourly });
  }

  function calculateHourly() {
    let hourly = 0;
    if (mode === "salary") {
      const amount = parseNumber(amountInput.value);
      const hours = parseNumber(hoursInput.value);
      if (amount <= 0 || hours <= 0) {
        setHourlyResult("—");
        return;
      }
      hourly = amount / hours;
      setHourlyResult(hourly);
    } else {
      const fee = parseNumber(projectInput.value);
      const duration = parseNumber(durationInput.value);
      if (fee > 0 && duration > 0) {
        hourly = fee / duration;
        setHourlyResult(hourly);
      } else {
        const amount = parseNumber(monthlyInput.value);
        const hours = parseNumber(freelanceHoursInput.value);
        if (amount <= 0 || hours <= 0) {
          setHourlyResult("—");
          return;
        }
        hourly = amount / hours;
        setHourlyResult(hourly);
      }
    }
    if (hourly > 0) void saveHourlyToAccount(hourly);
  }

  // 저장된 시급 로드
  try {
    const saved = localStorage.getItem(USER_HOURLY_RATE_KEY);
    if (saved) {
      const n = parseFloat(saved);
      if (!Number.isNaN(n) && n > 0) setHourlyResult(n);
    }
  } catch (_) {}

  calcBtn.addEventListener("click", calculateHourly);
  [
    hoursInput,
    amountInput,
    monthlyInput,
    freelanceHoursInput,
    projectInput,
    durationInput,
  ].forEach((inp) => {
    if (inp) {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          calculateHourly();
        }
      });
    }
  });

  window.__lpIdeaSoftRefresh = () => {
    try {
      if (!el.isConnected) return;
      const saved = localStorage.getItem(USER_HOURLY_RATE_KEY);
      const rv = el.querySelector(".idea-hourly-result-value");
      const ru = el.querySelector(".idea-hourly-result-unit");
      if (!rv) return;
      if (saved) {
        const n = parseFloat(saved);
        if (!Number.isNaN(n) && n > 0) {
          rv.textContent = new Intl.NumberFormat("ko-KR").format(Math.round(n));
          if (ru) {
            ru.textContent = "원";
            ru.style.visibility = "";
          }
          return;
        }
      }
      rv.textContent = "—";
      if (ru) ru.style.visibility = "hidden";
    } catch (_) {}
  };

  return el;
}
