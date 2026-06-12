/**
 * My account - 기본정보, 나의 시급 계산
 */

import { signOut } from "../auth.js";
import { supabase } from "../supabase.js";
import { deleteMyAccountViaEdgeFunction } from "../utils/deleteMyAccount.js";
import { USER_HOURLY_RATE_KEY, readUserHourlyRateLocal, readUserHourlyRateModeLocal, setUserHourlyRateModeLocal, HOURLY_RATE_MODE_CALC, HOURLY_RATE_MODE_DIRECT, applyAppearanceFromServer } from "../utils/userHourlySync.js";
import { setScopedLocalStorageItem, getScopedLocalStorageItem } from "../utils/clientStorageScope.js";
import { showToast } from "../utils/showToast.js";

export { USER_HOURLY_RATE_KEY };

const USER_HOURLY_CALC_INPUTS_KEY = "user_hourly_calc_inputs";

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
  const tabAbort = new AbortController();
  el._lpTabAbortController = tabAbort;

  const mobileViewport =
    typeof window !== "undefined" && window.matchMedia("(max-width: 46rem)").matches;
  if (mobileViewport) {
    el.classList.add("idea-view--mobile");
  }

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

  const grid = document.createElement("div");
  grid.className = "time-dashboard-view idea-widget-grid";

  // ----- 기본 설정 위젯 (아이디) -----
  const basicSettingsWidget = document.createElement("div");
  basicSettingsWidget.className = "time-dashboard-widget idea-widget idea-widget-basic-settings";
  basicSettingsWidget.innerHTML = `
    <div class="time-dashboard-widget-title">기본 설정</div>
    <div class="idea-basic-rows">
      <div class="idea-basic-row">
        <span class="idea-form-label">아이디</span>
        <span class="idea-user-id-value" id="idea-user-id">—</span>
      </div>
    </div>
  `;
  grid.appendChild(basicSettingsWidget);

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
  }

  // ----- 구독 (시급 위젯 위) -----
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
        .select("subscription_status, signup_at, hourly_rate, hourly_rate_mode, appearance")
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
              setScopedLocalStorageItem(USER_HOURLY_RATE_KEY, String(hr));
            } catch (_) {}
            applyHourlyRateToUi(hr);
            document.dispatchEvent(
              new CustomEvent("app-hourly-rate-changed", { detail: { rate: hr } }),
            );
          }
          if (
            data.hourly_rate_mode === HOURLY_RATE_MODE_DIRECT ||
            data.hourly_rate_mode === HOURLY_RATE_MODE_CALC
          ) {
            setUserHourlyRateModeLocal(data.hourly_rate_mode);
            setHourlyModeTab(data.hourly_rate_mode, { skipServer: true });
          }
          if (applyAppearanceFromServer(data.appearance)) {
            try {
              window.dispatchEvent(new CustomEvent("app-colors-changed"));
            } catch (_) {}
          }
        });
    });
  }

  // ----- 나의 시급 (계산 / 직접입력) -----
  const hourlyWidget = document.createElement("div");
  hourlyWidget.className =
    "time-dashboard-widget idea-widget idea-widget-hourly";
  hourlyWidget.innerHTML = `
    <div class="time-dashboard-widget-title">나의 시급</div>
    <div class="idea-hourly-tabs" role="tablist" aria-label="시급 입력 방식">
      <button type="button" class="idea-hourly-tab active" data-hourly-mode="calc" role="tab" aria-selected="true">나의 시급 계산하기</button>
      <button type="button" class="idea-hourly-tab" data-hourly-mode="direct" role="tab" aria-selected="false">직접 입력하기</button>
    </div>
    <div class="idea-hourly-panel idea-hourly-panel--calc" data-hourly-panel="calc" role="tabpanel">
      <form class="idea-hourly-form">
        <div class="idea-hourly-row-inline">
          <div class="idea-form-row">
            <label class="idea-form-label">월 근로소득</label>
            <div class="idea-input-with-unit">
              <input type="text" class="idea-form-input idea-input-monthly-income" placeholder="예: 3000000" inputmode="numeric" autocomplete="off" />
              <span class="idea-input-unit">원</span>
            </div>
          </div>
          <div class="idea-form-row">
            <label class="idea-form-label">월 노동시간</label>
            <div class="idea-input-with-unit">
              <input type="text" class="idea-form-input idea-input-monthly-hours" placeholder="예: 160" inputmode="decimal" autocomplete="off" />
              <span class="idea-input-unit">시간</span>
            </div>
          </div>
        </div>
        <button type="button" class="idea-btn-calc">계산하기</button>
      </form>
    </div>
    <div class="idea-hourly-panel idea-hourly-panel--direct" data-hourly-panel="direct" role="tabpanel" hidden>
      <div class="idea-form-row">
        <label class="idea-form-label" for="idea-input-hourly-direct">시급</label>
        <div class="idea-input-with-unit">
          <input type="text" id="idea-input-hourly-direct" class="idea-form-input idea-input-hourly-direct" placeholder="예: 20000" inputmode="numeric" autocomplete="off" />
          <span class="idea-input-unit">원</span>
        </div>
      </div>
      <p class="idea-form-hint">원하는 시급을 직접 입력한 뒤 저장하세요.</p>
      <button type="button" class="idea-btn-calc idea-btn-save-hourly-direct">저장하기</button>
    </div>
    <div class="idea-hourly-result-wrap">
      <span class="idea-hourly-result-label">나의 시급</span>
      <span class="idea-hourly-result-value">—</span>
      <span class="idea-hourly-result-unit">원</span>
    </div>
  `;
  grid.appendChild(hourlyWidget);

  const logoutWidget = document.createElement("div");
  logoutWidget.className = "time-dashboard-widget idea-widget idea-widget-logout";
  logoutWidget.innerHTML = `
    <button type="button" class="idea-btn-logout">로그아웃</button>
  `;
  grid.appendChild(logoutWidget);
  logoutWidget.querySelector(".idea-btn-logout").addEventListener("click", () => {
    signOut();
  });

  const deleteAccountWidget = document.createElement("div");
  deleteAccountWidget.className = "idea-widget idea-widget-delete-account";
  deleteAccountWidget.innerHTML = `
    <button type="button" class="idea-btn-delete-account">회원 탈퇴</button>
    <p class="idea-delete-account-hint">서버에 저장된 데이터가 모두 삭제되며 복구할 수 없습니다.</p>
  `;
  grid.appendChild(deleteAccountWidget);
  deleteAccountWidget.querySelector(".idea-btn-delete-account")?.addEventListener("click", () => {
    openDeleteAccountModal();
  });

  el.appendChild(grid);

  // 시급 계산 로직
  const monthlyIncomeInput = hourlyWidget.querySelector(
    ".idea-input-monthly-income",
  );
  const monthlyHoursInput = hourlyWidget.querySelector(
    ".idea-input-monthly-hours",
  );
  const directHourlyInput = hourlyWidget.querySelector(
    ".idea-input-hourly-direct",
  );
  const hourlyModeTabs = hourlyWidget.querySelectorAll(".idea-hourly-tab");
  const hourlyCalcPanel = hourlyWidget.querySelector(
    '[data-hourly-panel="calc"]',
  );
  const hourlyDirectPanel = hourlyWidget.querySelector(
    '[data-hourly-panel="direct"]',
  );
  const resultValue = hourlyWidget.querySelector(".idea-hourly-result-value");
  const resultUnit = hourlyWidget.querySelector(".idea-hourly-result-unit");
  const calcBtn = hourlyWidget.querySelector(".idea-btn-calc:not(.idea-btn-save-hourly-direct)");
  const directSaveBtn = hourlyWidget.querySelector(".idea-btn-save-hourly-direct");

  function applyHourlyRateToUi(val) {
    setHourlyResult(val);
    if (directHourlyInput && val != null && val !== "—") {
      const n = Number(val);
      if (Number.isFinite(n) && n > 0) {
        directHourlyInput.value = Math.round(n).toLocaleString("ko-KR");
      }
    }
  }

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

  function formatHoursInput(input) {
    const raw = String(input.value || "")
      .replace(/,/g, "")
      .trim();
    if (!raw) {
      input.value = "";
      return;
    }
    const n = parseFloat(raw);
    if (Number.isNaN(n)) {
      input.value = "";
      return;
    }
    input.value = Number.isInteger(n)
      ? n.toLocaleString("ko-KR")
      : String(n);
  }

  function saveHourlyCalcInputs(income, hours) {
    try {
      setScopedLocalStorageItem(
        USER_HOURLY_CALC_INPUTS_KEY,
        JSON.stringify({ income, hours }),
      );
    } catch (_) {}
  }

  function loadHourlyCalcInputsIntoForm() {
    try {
      const raw = getScopedLocalStorageItem(USER_HOURLY_CALC_INPUTS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      const income = Number(data?.income);
      const hours = Number(data?.hours);
      if (monthlyIncomeInput && Number.isFinite(income) && income > 0) {
        monthlyIncomeInput.value = Math.round(income).toLocaleString("ko-KR");
      }
      if (monthlyHoursInput && Number.isFinite(hours) && hours > 0) {
        monthlyHoursInput.value = Number.isInteger(hours)
          ? hours.toLocaleString("ko-KR")
          : String(hours);
      }
    } catch (_) {}
  }

  if (monthlyIncomeInput) {
    monthlyIncomeInput.addEventListener("input", () =>
      formatNumberInput(monthlyIncomeInput),
    );
    monthlyIncomeInput.addEventListener("blur", () =>
      formatNumberInput(monthlyIncomeInput),
    );
  }
  if (monthlyHoursInput) {
    monthlyHoursInput.addEventListener("input", () =>
      formatHoursInput(monthlyHoursInput),
    );
    monthlyHoursInput.addEventListener("blur", () =>
      formatHoursInput(monthlyHoursInput),
    );
  }

  async function saveHourlyToAccount(hourly, mode) {
    try {
      setScopedLocalStorageItem(USER_HOURLY_RATE_KEY, String(hourly));
    } catch (_) {}
    if (mode === HOURLY_RATE_MODE_DIRECT || mode === HOURLY_RATE_MODE_CALC) {
      setUserHourlyRateModeLocal(mode);
    }
    document.dispatchEvent(
      new CustomEvent("app-hourly-rate-changed", { detail: { rate: hourly } }),
    );
    if (!supabase) return;
    const payload = { p_rate: hourly };
    if (mode === HOURLY_RATE_MODE_DIRECT || mode === HOURLY_RATE_MODE_CALC) {
      payload.p_mode = mode;
    }
    const { error } = await supabase.rpc("set_my_hourly_rate", payload);
    if (error) throw error;
  }

  async function saveHourlyModeOnly(mode) {
    setUserHourlyRateModeLocal(mode);
    if (!supabase) return;
    const saved = readUserHourlyRateLocal();
    const rate = saved ? parseFloat(saved) : null;
    const payload = { p_mode: mode };
    if (rate != null && !Number.isNaN(rate) && rate > 0) payload.p_rate = rate;
    const { error } = await supabase.rpc("set_my_hourly_rate", payload);
    if (error) throw error;
  }

  function setHourlyModeTab(mode, opts = {}) {
    const next =
      mode === HOURLY_RATE_MODE_DIRECT ? HOURLY_RATE_MODE_DIRECT : HOURLY_RATE_MODE_CALC;
    hourlyModeTabs.forEach((tab) => {
      const on = tab.dataset.hourlyMode === next;
      tab.classList.toggle("active", on);
      tab.setAttribute("aria-selected", on ? "true" : "false");
    });
    if (hourlyCalcPanel) hourlyCalcPanel.hidden = next !== HOURLY_RATE_MODE_CALC;
    if (hourlyDirectPanel) hourlyDirectPanel.hidden = next !== HOURLY_RATE_MODE_DIRECT;
    if (!opts.skipServer) void saveHourlyModeOnly(next);
  }

  function calculateHourly() {
    const income = parseNumber(monthlyIncomeInput?.value);
    const hours = parseNumber(monthlyHoursInput?.value);
    if (income <= 0 || hours <= 0) {
      setHourlyResult("—");
      return;
    }
    const hourly = income / hours;
    applyHourlyRateToUi(hourly);
    saveHourlyCalcInputs(income, hours);
    if (monthlyIncomeInput) formatNumberInput(monthlyIncomeInput);
    if (monthlyHoursInput) formatHoursInput(monthlyHoursInput);
    void saveHourlyToAccount(hourly, HOURLY_RATE_MODE_CALC).catch(() => {
      showToast("시급 저장에 실패했습니다.");
    });
  }

  function saveDirectHourly() {
    const hourly = parseNumber(directHourlyInput?.value);
    if (hourly <= 0) {
      showToast("시급을 입력해 주세요.");
      return;
    }
    if (directHourlyInput) formatNumberInput(directHourlyInput);
    applyHourlyRateToUi(hourly);
    void saveHourlyToAccount(hourly, HOURLY_RATE_MODE_DIRECT)
      .then(() => showToast("시급이 저장되었습니다."))
      .catch(() => showToast("시급 저장에 실패했습니다."));
  }

  loadHourlyCalcInputsIntoForm();
  setHourlyModeTab(readUserHourlyRateModeLocal(), { skipServer: true });

  // 저장된 시급 로드
  try {
    const saved = readUserHourlyRateLocal();
    if (saved) {
      const n = parseFloat(saved);
      if (!Number.isNaN(n) && n > 0) applyHourlyRateToUi(n);
    }
  } catch (_) {}

  hourlyModeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.hourlyMode;
      if (!mode) return;
      setHourlyModeTab(mode);
    });
  });

  calcBtn?.addEventListener("click", calculateHourly);
  directSaveBtn?.addEventListener("click", saveDirectHourly);
  if (directHourlyInput) {
    directHourlyInput.addEventListener("input", () =>
      formatNumberInput(directHourlyInput),
    );
    directHourlyInput.addEventListener("blur", () =>
      formatNumberInput(directHourlyInput),
    );
    directHourlyInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        saveDirectHourly();
      }
    });
  }
  [monthlyIncomeInput, monthlyHoursInput].forEach((inp) => {
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
      loadHourlyCalcInputsIntoForm();
      setHourlyModeTab(readUserHourlyRateModeLocal(), { skipServer: true });
      const saved = readUserHourlyRateLocal();
      const rv = el.querySelector(".idea-hourly-result-value");
      const ru = el.querySelector(".idea-hourly-result-unit");
      const directInp = el.querySelector(".idea-input-hourly-direct");
      if (!rv) return;
      if (saved) {
        const n = parseFloat(saved);
        if (!Number.isNaN(n) && n > 0) {
          rv.textContent = new Intl.NumberFormat("ko-KR").format(Math.round(n));
          if (ru) {
            ru.textContent = "원";
            ru.style.visibility = "";
          }
          if (directInp) directInp.value = Math.round(n).toLocaleString("ko-KR");
          return;
        }
      }
      rv.textContent = "—";
      if (ru) ru.style.visibility = "hidden";
    } catch (_) {}
  };

  return el;
}
