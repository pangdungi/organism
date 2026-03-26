/**
 * My account - 기본정보, 나의 시급계산하기, 색상 설정
 */

import { signOut } from "../auth.js";
import { supabase } from "../supabase.js";
import {
  USER_HOURLY_RATE_KEY,
  pushAppearanceToSupabase,
  applyAppearanceFromServer,
} from "../utils/userHourlySync.js";

export { USER_HOURLY_RATE_KEY };
import { getTodoSettings, saveTodoSettings, getCustomSections, DEFAULT_SECTION_COLORS, DEFAULT_TIME_CATEGORY_COLORS, DEFAULT_TASK_CATEGORY_COLORS, applyTimeCategoryColors, applyTaskCategoryColors } from "../utils/todoSettings.js";
import { createColorPickerRow } from "../utils/todoSettingsModal.js";
import { showToast } from "../utils/showToast.js";
import {
  registerReminderPushFromUserGesture,
  reminderPushStatusLabel,
  hasWebPushSupport,
  getVapidPublicKey,
  ensureVapidRuntimeFallback,
} from "../utils/webPushReminders.js";

/** 한글 NEXON Lv1 고정 — 웹사이트 폰트 설정 제거됨 */
export function applyAppFont() {
  try {
    const stack =
      '"Space Grotesk", "NEXON Lv1 Gothic", -apple-system, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
    document.documentElement.style.setProperty("--app-font-family", stack);
  } catch (_) {}
}

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

  // ----- 기본 설정 위젯 (아이디, 로그아웃) — 웹사이트 폰트 설정 제거(한글 NEXON 고정) -----
  const basicSettingsWidget = document.createElement("div");
  basicSettingsWidget.className = "time-dashboard-widget idea-widget idea-widget-basic-settings";
  basicSettingsWidget.innerHTML = `
    <div class="time-dashboard-widget-title">기본 설정</div>
    <div class="idea-basic-rows">
      <div class="idea-basic-row">
        <span class="idea-form-label">아이디</span>
        <span class="idea-user-id-value" id="idea-user-id">—</span>
      </div>
      <div class="idea-logout-row">
        <button type="button" class="idea-btn-logout">로그아웃</button>
      </div>
    </div>
  `;
  grid.appendChild(basicSettingsWidget);

  basicSettingsWidget.querySelector(".idea-btn-logout").addEventListener("click", () => {
    signOut();
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

  // ----- 할일 리마인더 Web Push (탭 종료 후에도 cron + 푸시) -----
  const reminderPushWidget = document.createElement("div");
  reminderPushWidget.className =
    "time-dashboard-widget idea-widget idea-widget-reminder-push";
  reminderPushWidget.innerHTML = `
    <div class="time-dashboard-widget-title">할일 리마인더 알림</div>
    <div class="idea-basic-rows">
      <div class="idea-basic-row">
        <span class="idea-form-label">상태</span>
        <span class="idea-user-id-value idea-reminder-push-status" id="idea-reminder-push-status"></span>
      </div>
      <p class="idea-reminder-push-hint" id="idea-reminder-push-hint"></p>
      <div class="idea-logout-row">
        <button type="button" class="idea-btn-logout idea-btn-reminder-push-enable" id="idea-btn-reminder-push">브라우저 알림 켜기</button>
      </div>
    </div>
  `;
  grid.appendChild(reminderPushWidget);

  const reminderStatusEl = reminderPushWidget.querySelector("#idea-reminder-push-status");
  const reminderHintEl = reminderPushWidget.querySelector("#idea-reminder-push-hint");
  const reminderBtn = reminderPushWidget.querySelector("#idea-btn-reminder-push");
  function syncReminderPushAccountUi() {
    if (reminderStatusEl) reminderStatusEl.textContent = reminderPushStatusLabel();
    if (reminderHintEl) {
      reminderHintEl.textContent = !hasWebPushSupport()
        ? "이 브라우저·환경에서는 Web Push가 제한될 수 있어요. HTTPS의 Chrome·Edge 등을 권장해요."
        : "리마인더 날짜·시간은 이 기기(브라우저) 타임존 기준으로 맞춰져요. 서버에는 VAPID·Edge 함수·1분 주기 호출이 필요해요.";
    }
    if (reminderBtn) {
      /* 키는 런타임 fetch 후 채워질 수 있어, 지원만 되면 누르게 함(클릭 시 ensure + 구독) */
      const canTry = hasWebPushSupport();
      reminderBtn.disabled = !canTry;
      reminderBtn.style.opacity = !canTry ? "0.55" : "";
      reminderBtn.style.cursor = !canTry ? "not-allowed" : "";
    }
  }
  void ensureVapidRuntimeFallback().then(() => syncReminderPushAccountUi());
  syncReminderPushAccountUi();
  reminderBtn?.addEventListener("click", async () => {
    const r = await registerReminderPushFromUserGesture();
    showToast(r.msg);
    syncReminderPushAccountUi();
  });

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
          applyAppearanceFromServer(data.appearance);
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

  // ----- 색상 설정 위젯 -----
  const FIXED_SECTIONS = [
    { id: "braindump", label: "브레인 덤프" },
    { id: "dream", label: "꿈" },
    { id: "sideincome", label: "부수입" },
    { id: "health", label: "건강" },
    { id: "happy", label: "행복" },
  ];
  const TIME_CATEGORY_SECTIONS = [
    { id: "productive", label: "생산" },
    { id: "nonproductive", label: "비생산" },
    { id: "other", label: "기타" },
  ];
  /** 시간가계부 작업(세부) 카테고리 - 꿈/부수입/행복/건강은 리스트 색상과 통일이라 제외 */
  const TASK_CATEGORY_SECTIONS = [
    { id: "", label: "그외" },
    { id: "pleasure", label: "쾌락충족" },
    { id: "dreamblocking", label: "꿈을 방해하는 일" },
    { id: "unhappiness", label: "불행" },
    { id: "unhealthy", label: "비건강" },
    { id: "moneylosing", label: "돈을 잃는 일" },
    { id: "work", label: "근무" },
    { id: "sleep", label: "수면" },
  ];
  function getSections() {
    return [...FIXED_SECTIONS, ...getCustomSections()];
  }

  const settings = getTodoSettings();
  let sectionColors = { ...settings.sectionColors };
  let timeCategoryColors = { ...settings.timeCategoryColors };
  let taskCategoryColors = { ...(settings.taskCategoryColors || DEFAULT_TASK_CATEGORY_COLORS) };

  const colorWidget = document.createElement("div");
  colorWidget.className = "time-dashboard-widget idea-widget idea-widget-colors hide-on-mobile";
  colorWidget.innerHTML = `
    <div class="todo-settings-block idea-colors-block">
      <div class="idea-colors-columns">
        <div class="idea-colors-col">
          <h4 class="todo-settings-block-title">리스트 색상</h4>
          <div class="idea-colors-rows idea-colors-rows-list"></div>
        </div>
        <div class="idea-colors-col">
          <h4 class="todo-settings-block-title">생산성(시간가계부)</h4>
          <div class="idea-colors-rows idea-colors-rows-time"></div>
        </div>
        <div class="idea-colors-col idea-colors-col-task">
          <h4 class="todo-settings-block-title">작업 카테고리(세부)</h4>
          <div class="idea-colors-task-cols">
            <div class="idea-colors-rows idea-colors-rows-task-left"></div>
            <div class="idea-colors-rows idea-colors-rows-task-right"></div>
          </div>
        </div>
      </div>
    </div>
  `;
  const listRowsEl = colorWidget.querySelector(".idea-colors-rows-list");
  const timeRowsEl = colorWidget.querySelector(".idea-colors-rows-time");
  const taskRowsLeftEl = colorWidget.querySelector(".idea-colors-rows-task-left");
  const taskRowsRightEl = colorWidget.querySelector(".idea-colors-rows-task-right");

  function saveColors() {
    saveTodoSettings({
      ...getTodoSettings(),
      sectionColors,
      timeCategoryColors,
      taskCategoryColors,
    });
    applyTimeCategoryColors();
    applyTaskCategoryColors();
    document.dispatchEvent(new CustomEvent("app-colors-changed"));
    void pushAppearanceToSupabase();
  }

  getSections().forEach((sec) => {
    const row = createColorPickerRow(sec.id, sec.label, sectionColors[sec.id], (color) => {
      sectionColors[sec.id] = color;
      saveColors();
    });
    listRowsEl.appendChild(row);
  });
  TIME_CATEGORY_SECTIONS.forEach((sec) => {
    const defaultColor = DEFAULT_TIME_CATEGORY_COLORS[sec.id];
    const row = createColorPickerRow(sec.id, sec.label, timeCategoryColors[sec.id] || defaultColor, (color) => {
      timeCategoryColors[sec.id] = color;
      saveColors();
    });
    timeRowsEl.appendChild(row);
  });
  TASK_CATEGORY_SECTIONS.forEach((sec, idx) => {
    const defaultColor = DEFAULT_TASK_CATEGORY_COLORS[sec.id];
    const row = createColorPickerRow(sec.id, sec.label, taskCategoryColors[sec.id] ?? defaultColor, (color) => {
      taskCategoryColors[sec.id] = color;
      saveColors();
    });
    if (idx < 5) taskRowsLeftEl.appendChild(row);
    else taskRowsRightEl.appendChild(row);
  });

  grid.appendChild(colorWidget);
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
    if (error) console.warn("[set_my_hourly_rate]", error.message);
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

  return el;
}
