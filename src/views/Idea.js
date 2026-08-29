/**
 * My account - 기본정보, 나의 시급 계산
 */

import { signOut, changePassword } from "../auth.js";
import { supabase } from "../supabase.js";
import { openDeleteAccountModal } from "../utils/deleteAccountModal.js";
import { USER_HOURLY_RATE_KEY, readUserHourlyRateLocal, readUserHourlyRateModeLocal, setUserHourlyRateModeLocal, HOURLY_RATE_MODE_CALC, HOURLY_RATE_MODE_DIRECT, applyAppearanceFromServer } from "../utils/userHourlySync.js";
import {
  UI_FONT_PICKER_OPTIONS,
  applyUiFontFromServerRow,
  fontStackForDef,
  normalizeUiFontId,
  readUiFontIdLocal,
  saveUserUiFontToSupabase,
} from "../utils/appUiFont.js";
import { setScopedLocalStorageItem, getScopedLocalStorageItem } from "../utils/clientStorageScope.js";
import { showToast } from "../utils/showToast.js";
import {
  SUBSCRIPTION_EXPIRED_MESSAGE,
  SUBSCRIPTION_NO_ACCESS_HINT,
  SUBSCRIPTION_RENEWAL_SHOP_URL,
  subscriptionAccessEnded,
  subscriptionRenewalEligible,
  subscriptionRenewalOfferDue,
  subscriptionSnapFromPrefsRow,
} from "../utils/subscriptionAccess.js";

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

  // ----- UI 글꼴 (그리운·온글잎 등 — 캘린더 월·날짜 숫자는 제외) -----
  const fontWidget = document.createElement("div");
  fontWidget.className =
    "time-dashboard-widget idea-widget idea-widget-ui-font";
  const fontTitle = document.createElement("div");
  fontTitle.className = "time-dashboard-widget-title";
  fontTitle.textContent = "글꼴";
  fontWidget.appendChild(fontTitle);
  const fontHint = document.createElement("p");
  fontHint.className = "idea-form-hint idea-ui-font-hint";
  fontHint.textContent =
    "앱 본문·버튼·입력창 등에 적용됩니다. 캘린더 월 이름·날짜 숫자는 그대로입니다.";
  fontWidget.appendChild(fontHint);

  const fontDropdown = document.createElement("div");
  fontDropdown.className =
    "idea-app-font-dropdown-slot idea-ui-font-dropdown";
  const fontTrigger = document.createElement("button");
  fontTrigger.type = "button";
  fontTrigger.className = "idea-ui-font-dropdown-trigger";
  fontTrigger.setAttribute("aria-haspopup", "listbox");
  fontTrigger.setAttribute("aria-expanded", "false");
  fontTrigger.setAttribute("aria-label", "앱 글꼴 선택");
  const fontTriggerValue = document.createElement("span");
  fontTriggerValue.className = "idea-ui-font-dropdown-value";
  fontTrigger.appendChild(fontTriggerValue);
  const fontPanel = document.createElement("div");
  fontPanel.className = "idea-ui-font-dropdown-panel";
  fontPanel.hidden = true;
  fontPanel.setAttribute("role", "listbox");
  fontPanel.setAttribute("aria-label", "앱 글꼴 목록");
  let fontSaving = false;
  let fontPanelOpen = false;

  function fontDefById(fontId) {
    const id = normalizeUiFontId(fontId);
    return (
      UI_FONT_PICKER_OPTIONS.find((d) => d.id === id) ||
      UI_FONT_PICKER_OPTIONS[0]
    );
  }

  function applyFontPreview(el, def) {
    if (!el || !def) return;
    el.style.fontFamily = fontStackForDef(def);
    el.style.fontWeight = String(def.weight ?? 400);
    el.textContent = def.label;
  }

  function closeFontPanel() {
    fontPanelOpen = false;
    fontPanel.hidden = true;
    fontDropdown.classList.remove("is-open");
    fontTrigger.setAttribute("aria-expanded", "false");
    if (fontPanel.parentNode !== fontDropdown) {
      fontDropdown.appendChild(fontPanel);
    }
  }

  function layoutFontPanel() {
    const r = fontTrigger.getBoundingClientRect();
    const gap = 4;
    const maxH = Math.max(
      120,
      Math.min(window.innerHeight - r.bottom - gap - 12, 280),
    );
    fontPanel.style.position = "fixed";
    fontPanel.style.left = `${Math.max(8, r.left)}px`;
    fontPanel.style.top = `${r.bottom + gap}px`;
    fontPanel.style.width = `${Math.max(160, r.width)}px`;
    fontPanel.style.maxHeight = `${maxH}px`;
    fontPanel.style.zIndex = "13050";
  }

  function openFontPanel() {
    fontPanelOpen = true;
    document.body.appendChild(fontPanel);
    fontPanel.hidden = false;
    fontDropdown.classList.add("is-open");
    fontTrigger.setAttribute("aria-expanded", "true");
    layoutFontPanel();
  }

  function syncFontPickerSelection(fontId) {
    const def = fontDefById(fontId);
    applyFontPreview(fontTriggerValue, def);
    fontPanel.querySelectorAll(".idea-ui-font-dropdown-option").forEach((btn) => {
      btn.classList.toggle("is-selected", btn.dataset.fontId === def.id);
      btn.setAttribute(
        "aria-selected",
        btn.dataset.fontId === def.id ? "true" : "false",
      );
    });
  }

  function saveFontChoice(fontId) {
    const def = fontDefById(fontId);
    if (!def || fontSaving) return;
    fontSaving = true;
    void saveUserUiFontToSupabase(def.id)
      .then((res) => {
        if (!res.ok) {
          showToast("글꼴 저장에 실패했습니다.");
          syncFontPickerSelection(readUiFontIdLocal());
          return;
        }
        syncFontPickerSelection(res.id);
        if (res.mismatched) {
          showToast(
            "선택한 글꼴이 아직 서버에 등록되지 않아 저장되지 않았습니다.",
          );
          return;
        }
        showToast("글꼴이 적용되었습니다.");
      })
      .finally(() => {
        fontSaving = false;
      });
  }

  UI_FONT_PICKER_OPTIONS.forEach((def) => {
    const opt = document.createElement("button");
    opt.type = "button";
    opt.className = "idea-ui-font-dropdown-option";
    opt.dataset.fontId = def.id;
    opt.setAttribute("role", "option");
    applyFontPreview(opt, def);
    opt.addEventListener("click", () => {
      closeFontPanel();
      saveFontChoice(def.id);
    });
    fontPanel.appendChild(opt);
  });

  fontTrigger.addEventListener("click", () => {
    if (fontPanelOpen) closeFontPanel();
    else openFontPanel();
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!fontPanelOpen) return;
      if (fontDropdown.contains(e.target) || fontPanel.contains(e.target)) {
        return;
      }
      closeFontPanel();
    },
    { signal: tabAbort.signal },
  );
  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape" && fontPanelOpen) closeFontPanel();
    },
    { signal: tabAbort.signal },
  );
  window.addEventListener(
    "resize",
    () => {
      if (fontPanelOpen) layoutFontPanel();
    },
    { signal: tabAbort.signal },
  );
  tabAbort.signal.addEventListener("abort", () => {
    closeFontPanel();
    fontPanel.remove();
  });

  fontDropdown.append(fontTrigger, fontPanel);
  fontWidget.appendChild(fontDropdown);
  syncFontPickerSelection(readUiFontIdLocal());
  grid.appendChild(fontWidget);

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
      <p class="idea-subscription-renewal" id="idea-subscription-renewal" hidden>
        <a
          class="idea-btn-renewal"
          id="idea-subscription-renewal-link"
          href="${SUBSCRIPTION_RENEWAL_SHOP_URL}"
          target="_blank"
          rel="noopener noreferrer"
        >갱신권 구매하기</a>
      </p>
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
      const renewalEl = document.getElementById("idea-subscription-renewal");
      if (!session?.user?.id || !statusEl || !passEl) return;
      supabase
        .from("user_subscriptions")
        .select(
          "subscription_status, signup_at, access_until, hourly_rate, hourly_rate_mode, appearance, ui_font_id",
        )
        .eq("user_id", session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          if (error || !data) {
            statusEl.textContent = "—";
            passEl.hidden = true;
            if (renewalEl) renewalEl.hidden = true;
            return;
          }
          const snap = subscriptionSnapFromPrefsRow(data);
          const expired = subscriptionAccessEnded(snap);
          const showRenewal = subscriptionRenewalOfferDue(snap);
          if (expired) {
            if (subscriptionRenewalEligible(snap)) {
              statusEl.textContent = "이용 만료";
              passEl.textContent = data.access_until
                ? `이용 종료일 ${formatDateKo(data.access_until)}`
                : SUBSCRIPTION_EXPIRED_MESSAGE;
            } else {
              statusEl.textContent = "이용 권한 없음";
              passEl.textContent = SUBSCRIPTION_NO_ACCESS_HINT;
            }
            passEl.hidden = false;
            if (renewalEl) renewalEl.hidden = !showRenewal;
          } else if (data.subscription_status === "active") {
            statusEl.textContent = "구독중";
            const start = formatDateKo(data.signup_at);
            const end = formatDateKo(data.access_until);
            passEl.textContent = end
              ? `1년 이용권 (${start} ~ ${end})`
              : `1년 이용권 (${start} ~)`;
            passEl.hidden = false;
            if (renewalEl) renewalEl.hidden = !showRenewal;
          } else {
            statusEl.textContent = "체험 이용중";
            const end = formatDateKo(data.access_until);
            passEl.textContent = end ? `체험 기간 (~ ${end})` : "체험 기간 이용 중";
            passEl.hidden = false;
            if (renewalEl) renewalEl.hidden = !showRenewal;
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
          applyUiFontFromServerRow(data);
          syncFontPickerSelection(readUiFontIdLocal());
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

  // ----- 비밀번호 변경 -----
  const passwordWidget = document.createElement("div");
  passwordWidget.className =
    "time-dashboard-widget idea-widget idea-widget-password";
  passwordWidget.innerHTML = `
    <div class="time-dashboard-widget-title">비밀번호 변경</div>
    <form class="idea-password-form" id="idea-password-form" autocomplete="off">
      <div class="idea-form-row">
        <label class="idea-form-label" for="idea-pw-current">현재 비밀번호</label>
        <input type="password" id="idea-pw-current" class="idea-form-input idea-pw-current" autocomplete="current-password" placeholder="현재 비밀번호" />
      </div>
      <div class="idea-form-row">
        <label class="idea-form-label" for="idea-pw-new">새 비밀번호</label>
        <input type="password" id="idea-pw-new" class="idea-form-input idea-pw-new" autocomplete="new-password" placeholder="6자 이상" />
      </div>
      <div class="idea-form-row">
        <label class="idea-form-label" for="idea-pw-confirm">새 비밀번호 확인</label>
        <input type="password" id="idea-pw-confirm" class="idea-form-input idea-pw-confirm" autocomplete="new-password" placeholder="한 번 더 입력" />
      </div>
      <button type="submit" class="idea-btn-calc idea-btn-change-password">변경하기</button>
    </form>
  `;
  grid.appendChild(passwordWidget);

  const passwordForm = passwordWidget.querySelector("#idea-password-form");
  const pwCurrent = passwordWidget.querySelector(".idea-pw-current");
  const pwNew = passwordWidget.querySelector(".idea-pw-new");
  const pwConfirm = passwordWidget.querySelector(".idea-pw-confirm");
  const pwSubmit = passwordWidget.querySelector(".idea-btn-change-password");
  let passwordSaving = false;

  passwordForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    if (passwordSaving) return;
    void (async () => {
      passwordSaving = true;
      if (pwSubmit) pwSubmit.disabled = true;
      try {
        let email = "";
        try {
          const { data: { session } } = await supabase.auth.getSession();
          email = session?.user?.email || "";
        } catch (_) {}
        if (!email) {
          showToast("로그인 정보를 확인할 수 없어요.");
          return;
        }
        const result = await changePassword({
          email,
          currentPassword: pwCurrent?.value || "",
          newPassword: pwNew?.value || "",
          confirmPassword: pwConfirm?.value || "",
        });
        if (!result.ok) {
          showToast(result.msg);
          return;
        }
        if (pwCurrent) pwCurrent.value = "";
        if (pwNew) pwNew.value = "";
        if (pwConfirm) pwConfirm.value = "";
        showToast("비밀번호가 변경됐어요.");
      } finally {
        passwordSaving = false;
        if (pwSubmit) pwSubmit.disabled = false;
      }
    })();
  });

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
      syncFontPickerSelection(readUiFontIdLocal());
    } catch (_) {}
  };

  return el;
}
