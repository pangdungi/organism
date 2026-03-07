/**
 * My account - 기본정보, 나의 시급계산하기
 */

export const USER_HOURLY_RATE_KEY = "user_hourly_rate";
export const APP_FONT_KEY = "app_font_family";

export const FONT_OPTIONS = [
  { value: "scdream3", label: "에스코어 드림 3" },
  { value: "leeseoyun", label: "이서윤체" },
  { value: "pretendard", label: "Pretendard" },
];

export function applyAppFont() {
  try {
    const saved = localStorage.getItem(APP_FONT_KEY) || "scdream3";
    let fontFamily = '"S-Core Dream 3", -apple-system, sans-serif';
    if (saved === "scdream2" || saved === "scdream3") {
      fontFamily = '"S-Core Dream 3", -apple-system, sans-serif';
    } else if (saved === "leeseoyun") {
      fontFamily = '"이서윤체", -apple-system, sans-serif';
    } else if (saved === "pretendard") {
      fontFamily = '"Pretendard", -apple-system, sans-serif';
    } else {
      fontFamily = '"Noto Sans KR", -apple-system, sans-serif';
    }
    document.documentElement.style.setProperty("--app-font-family", fontFamily);
    if (saved === "leeseoyun") {
      document.documentElement.dataset.appFont = "leeseoyun";
    } else if (saved === "pretendard") {
      document.documentElement.dataset.appFont = "pretendard";
    } else {
      delete document.documentElement.dataset.appFont;
    }
  } catch (_) {}
}

function formatPrice(amount) {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("ko-KR").format(Math.round(amount)) + "원";
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content idea-view";

  const title = document.createElement("h2");
  title.textContent = "My account";
  title.className = "idea-view-title";
  el.appendChild(title);

  const grid = document.createElement("div");
  grid.className = "time-dashboard-view idea-widget-grid";

  // ----- 기본정보 위젯 -----
  const basicInfoWidget = document.createElement("div");
  basicInfoWidget.className = "time-dashboard-widget idea-widget idea-widget-basic";
  const savedFont = (() => {
    try {
      const v = localStorage.getItem(APP_FONT_KEY);
      if (v === "leeseoyun") return "leeseoyun";
      if (v === "pretendard") return "pretendard";
      return v === "scdream2" ? "scdream3" : (v || "scdream3");
    } catch (_) {
      return "scdream3";
    }
  })();
  basicInfoWidget.innerHTML = `
    <div class="time-dashboard-widget-title">기본정보</div>
    <div class="idea-font-row">
      <label class="idea-form-label">웹사이트 폰트</label>
      <select class="idea-form-select idea-font-select">
        ${FONT_OPTIONS.map((o) => `<option value="${o.value}" ${savedFont === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
    </div>
    <div class="idea-basic-placeholder">기본정보를 입력할 수 있습니다.</div>
  `;
  grid.appendChild(basicInfoWidget);

  const fontSelect = basicInfoWidget.querySelector(".idea-font-select");
  fontSelect?.addEventListener("change", () => {
    const val = fontSelect.value;
    try {
      localStorage.setItem(APP_FONT_KEY, val);
      applyAppFont();
    } catch (_) {}
  });

  // ----- 나의 시급계산하기 위젯 -----
  const hourlyWidget = document.createElement("div");
  hourlyWidget.className = "time-dashboard-widget idea-widget idea-widget-hourly";
  hourlyWidget.innerHTML = `
    <div class="time-dashboard-widget-title">나의 시급계산하기</div>
    <div class="idea-hourly-tabs">
      <button type="button" class="idea-hourly-tab active" data-mode="salary">월급직</button>
      <button type="button" class="idea-hourly-tab" data-mode="freelance">프리랜서</button>
    </div>
    <form class="idea-hourly-form">
      <div class="idea-form-row idea-row-salary">
        <label class="idea-form-label">월급 (원)</label>
        <input type="text" class="idea-form-input idea-input-amount" placeholder="예: 3000000" inputmode="numeric" />
      </div>
      <div class="idea-form-row idea-row-salary">
        <label class="idea-form-label">월 근무시간 (시간)</label>
        <input type="text" class="idea-form-input idea-input-hours" placeholder="예: 160" inputmode="numeric" />
      </div>
      <div class="idea-form-row idea-row-freelance" style="display:none">
        <label class="idea-form-label">월 예상 수입 (원)</label>
        <input type="text" class="idea-form-input idea-input-monthly" placeholder="예: 5000000" inputmode="numeric" />
      </div>
      <div class="idea-form-row idea-row-freelance" style="display:none">
        <label class="idea-form-label">월 근무시간 (시간)</label>
        <input type="text" class="idea-form-input idea-input-freelance-hours" placeholder="예: 160" inputmode="numeric" />
      </div>
      <div class="idea-form-row idea-row-freelance idea-freelance-divider" style="display:none">
        <span class="idea-form-hint">또는 건당 기준</span>
      </div>
      <div class="idea-form-row idea-row-freelance" style="display:none">
        <label class="idea-form-label">건당 금액 (원)</label>
        <input type="text" class="idea-form-input idea-input-project-fee" placeholder="예: 500000" inputmode="numeric" />
      </div>
      <div class="idea-form-row idea-row-freelance" style="display:none">
        <label class="idea-form-label">예상 소요시간 (시간)</label>
        <input type="text" class="idea-form-input idea-input-duration" placeholder="예: 20" inputmode="numeric" />
      </div>
      <button type="button" class="idea-btn-calc">계산하기</button>
      <div class="idea-hourly-result-wrap">
        <span class="idea-hourly-result-label">나의 시급</span>
        <span class="idea-hourly-result-value">—</span>
      </div>
    </form>
  `;
  grid.appendChild(hourlyWidget);

  el.appendChild(grid);

  // 시급 계산 로직
  const tabs = hourlyWidget.querySelectorAll(".idea-hourly-tab");
  const salaryRows = hourlyWidget.querySelectorAll(".idea-row-salary");
  const freelanceRows = hourlyWidget.querySelectorAll(".idea-row-freelance");
  const amountInput = hourlyWidget.querySelector(".idea-input-amount");
  const hoursInput = hourlyWidget.querySelector(".idea-input-hours");
  const monthlyInput = hourlyWidget.querySelector(".idea-input-monthly");
  const freelanceHoursInput = hourlyWidget.querySelector(".idea-input-freelance-hours");
  const projectInput = hourlyWidget.querySelector(".idea-input-project-fee");
  const durationInput = hourlyWidget.querySelector(".idea-input-duration");
  const resultValue = hourlyWidget.querySelector(".idea-hourly-result-value");
  const calcBtn = hourlyWidget.querySelector(".idea-btn-calc");

  let mode = "salary"; // salary | freelance

  function parseNumber(str) {
    const cleaned = String(str || "").replace(/,/g, "").replace(/\s/g, "");
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
    salaryRows.forEach((r) => (r.style.display = m === "salary" ? "" : "none"));
    freelanceRows.forEach((r) => (r.style.display = m === "freelance" ? "" : "none"));
    resultValue.textContent = "—";
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

  function saveHourlyToAccount(hourly) {
    try {
      localStorage.setItem(USER_HOURLY_RATE_KEY, String(hourly));
    } catch (_) {}
  }

  function calculateHourly() {
    let hourly = 0;
    if (mode === "salary") {
      const amount = parseNumber(amountInput.value);
      const hours = parseNumber(hoursInput.value);
      if (amount <= 0 || hours <= 0) {
        resultValue.textContent = "—";
        return;
      }
      hourly = amount / hours;
      resultValue.textContent = formatPrice(hourly);
    } else {
      const fee = parseNumber(projectInput.value);
      const duration = parseNumber(durationInput.value);
      if (fee > 0 && duration > 0) {
        hourly = fee / duration;
        resultValue.textContent = formatPrice(hourly);
      } else {
        const amount = parseNumber(monthlyInput.value);
        const hours = parseNumber(freelanceHoursInput.value);
        if (amount <= 0 || hours <= 0) {
          resultValue.textContent = "—";
          return;
        }
        hourly = amount / hours;
        resultValue.textContent = formatPrice(hourly);
      }
    }
    if (hourly > 0) saveHourlyToAccount(hourly);
  }

  // 저장된 시급 로드
  try {
    const saved = localStorage.getItem(USER_HOURLY_RATE_KEY);
    if (saved) {
      const n = parseFloat(saved);
      if (!Number.isNaN(n) && n > 0) resultValue.textContent = formatPrice(n);
    }
  } catch (_) {}

  calcBtn.addEventListener("click", calculateHourly);
  [hoursInput, amountInput, monthlyInput, freelanceHoursInput, projectInput, durationInput].forEach((inp) => {
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
