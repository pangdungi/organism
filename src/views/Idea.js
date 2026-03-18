/**
 * My account - 기본정보, 나의 시급계산하기, 색상 설정
 */

import { signOut } from "../auth.js";
import { supabase } from "../supabase.js";
import { getTodoSettings, saveTodoSettings, getCustomSections, DEFAULT_SECTION_COLORS, DEFAULT_TIME_CATEGORY_COLORS, DEFAULT_TASK_CATEGORY_COLORS, applyTimeCategoryColors, applyTaskCategoryColors } from "../utils/todoSettings.js";
import { createColorPickerRow } from "../utils/todoSettingsModal.js";

export const USER_HOURLY_RATE_KEY = "user_hourly_rate";
export const APP_FONT_KEY = "app_font_family";

export const FONT_OPTIONS = [
  { value: "scdream3", label: "에스코어 드림 3" },
  { value: "nexonlv1", label: "NEXON Lv1 Gothic" },
  { value: "nexonlv2", label: "NEXON Lv2 Gothic" },
  { value: "pretendard", label: "Pretendard" },
  { value: "notoserifkr", label: "Noto Serif KR" },
  { value: "notosanskr", label: "Noto Sans KR" },
];

export function applyAppFont() {
  try {
    const saved = localStorage.getItem(APP_FONT_KEY) || "scdream3";
    let fontFamily = '"S-Core Dream 3", -apple-system, sans-serif';
    if (saved === "scdream2" || saved === "scdream3") {
      fontFamily = '"S-Core Dream 3", -apple-system, sans-serif';
    } else if (saved === "nexonlv1") {
      fontFamily = '"NEXON Lv1 Gothic", -apple-system, sans-serif';
    } else if (saved === "nexonlv2" || saved === "leeseoyun") {
      fontFamily = '"NEXON Lv2 Gothic", -apple-system, sans-serif';
    } else if (saved === "pretendard") {
      fontFamily = '"Pretendard", -apple-system, sans-serif';
    } else if (saved === "notoserifkr") {
      fontFamily = '"Noto Serif KR", serif';
    } else if (saved === "notosanskr") {
      fontFamily = '"Noto Sans KR", -apple-system, sans-serif';
    } else {
      fontFamily = '"S-Core Dream 3", -apple-system, sans-serif';
    }
    document.documentElement.style.setProperty("--app-font-family", fontFamily);
    if (saved === "nexonlv1") {
      document.documentElement.dataset.appFont = "nexonlv1";
    } else if (saved === "nexonlv2" || saved === "leeseoyun") {
      document.documentElement.dataset.appFont = "nexonlv2";
    } else if (saved === "pretendard") {
      document.documentElement.dataset.appFont = "pretendard";
    } else if (saved === "notoserifkr") {
      document.documentElement.dataset.appFont = "notoserifkr";
    } else if (saved === "notosanskr") {
      document.documentElement.dataset.appFont = "notosanskr";
    } else {
      delete document.documentElement.dataset.appFont;
    }
  } catch (_) {}
}

function formatPrice(amount) {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("ko-KR").format(Math.round(amount)) + " 원";
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

  // ----- 기본 설정 위젯 (아이디, 웹사이트 폰트, 로그아웃) -----
  const savedFont = (() => {
    try {
      const v = localStorage.getItem(APP_FONT_KEY);
      if (v === "nexonlv2" || v === "leeseoyun") return "nexonlv2";
      if (v === "pretendard") return "pretendard";
      if (v === "notoserifkr") return "notoserifkr";
      return v === "scdream2" ? "scdream3" : v || "scdream3";
    } catch (_) {
      return "scdream3";
    }
  })();
  const currentFontOption = FONT_OPTIONS.find((o) => o.value === savedFont) || FONT_OPTIONS[0];
  const basicSettingsWidget = document.createElement("div");
  basicSettingsWidget.className = "time-dashboard-widget idea-widget idea-widget-basic-settings";
  basicSettingsWidget.innerHTML = `
    <div class="time-dashboard-widget-title">기본 설정</div>
    <div class="idea-basic-rows">
      <div class="idea-basic-row">
        <span class="idea-form-label">아이디</span>
        <span class="idea-user-id-value" id="idea-user-id">—</span>
      </div>
      <div class="idea-basic-row idea-font-logout-row">
        <label class="idea-form-label">웹사이트 폰트</label>
        <div class="idea-font-dropdown">
          <button type="button" class="idea-font-trigger" aria-haspopup="listbox" aria-expanded="false" aria-label="폰트 선택">
            <span class="idea-font-trigger-label">${currentFontOption.label}</span>
            <span class="idea-font-trigger-icon" aria-hidden="true">▼</span>
          </button>
          <div class="idea-font-panel" role="listbox" hidden>
            ${FONT_OPTIONS.map((o) => `
              <div class="idea-font-option" role="option" data-value="${o.value}" aria-selected="${o.value === savedFont}">
                ${o.value === savedFont ? '<span class="idea-font-option-check">✓</span>' : ""}
                <span class="idea-font-option-label">${o.label}</span>
              </div>
            `).join("")}
          </div>
        </div>
        <button type="button" class="idea-btn-logout">로그아웃</button>
      </div>
    </div>
  `;
  grid.appendChild(basicSettingsWidget);

  basicSettingsWidget.querySelector(".idea-btn-logout").addEventListener("click", () => {
    signOut();
  });

  // 로그인된 사용자 ID 비동기 로드
  if (typeof supabase !== "undefined" && supabase?.auth) {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const idEl = document.getElementById("idea-user-id");
      if (idEl && session?.user?.email) {
        idEl.textContent = session.user.email;
      }
    });
  }

  const fontDropdown = basicSettingsWidget.querySelector(".idea-font-dropdown");
  const fontTrigger = basicSettingsWidget.querySelector(".idea-font-trigger");
  const fontTriggerLabel = basicSettingsWidget.querySelector(".idea-font-trigger-label");
  const fontPanel = basicSettingsWidget.querySelector(".idea-font-panel");
  const fontOptions = basicSettingsWidget.querySelectorAll(".idea-font-option");

  function closeFontPanel() {
    fontPanel.hidden = true;
    fontTrigger.setAttribute("aria-expanded", "false");
  }

  fontTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = !fontPanel.hidden;
    if (isOpen) {
      closeFontPanel();
    } else {
      fontPanel.hidden = false;
      fontTrigger.setAttribute("aria-expanded", "true");
      const onDocClick = () => {
        closeFontPanel();
        document.removeEventListener("click", onDocClick);
      };
      requestAnimationFrame(() => document.addEventListener("click", onDocClick));
    }
  });

  fontOptions.forEach((opt) => {
    opt.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = opt.dataset.value;
      try {
        localStorage.setItem(APP_FONT_KEY, val);
        applyAppFont();
      } catch (_) {}
      const chosen = FONT_OPTIONS.find((o) => o.value === val);
      if (chosen) fontTriggerLabel.textContent = chosen.label;
      fontOptions.forEach((o) => {
        o.setAttribute("aria-selected", o.dataset.value === val ? "true" : "false");
        o.querySelector(".idea-font-option-check")?.remove();
        if (o.dataset.value === val) {
          const check = document.createElement("span");
          check.className = "idea-font-option-check";
          check.textContent = "✓";
          o.insertBefore(check, o.firstChild);
        }
      });
      closeFontPanel();
    });
  });

  fontPanel.addEventListener("click", (e) => e.stopPropagation());

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
    { id: "", label: "—" },
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
          <h4 class="todo-settings-block-title">작업 카테고리 (세부)</h4>
          <div class="idea-colors-task-cols">
            <div class="idea-colors-rows idea-colors-rows-task-left"></div>
            <div class="idea-colors-rows idea-colors-rows-task-right"></div>
          </div>
        </div>
      </div>
      <button type="button" class="todo-settings-save idea-colors-save">저장</button>
    </div>
  `;
  const listRowsEl = colorWidget.querySelector(".idea-colors-rows-list");
  const timeRowsEl = colorWidget.querySelector(".idea-colors-rows-time");
  const taskRowsLeftEl = colorWidget.querySelector(".idea-colors-rows-task-left");
  const taskRowsRightEl = colorWidget.querySelector(".idea-colors-rows-task-right");
  const colorSaveBtn = colorWidget.querySelector(".idea-colors-save");

  getSections().forEach((sec) => {
    const row = createColorPickerRow(sec.id, sec.label, sectionColors[sec.id], (color) => {
      sectionColors[sec.id] = color;
    });
    listRowsEl.appendChild(row);
  });
  TIME_CATEGORY_SECTIONS.forEach((sec) => {
    const defaultColor = DEFAULT_TIME_CATEGORY_COLORS[sec.id];
    const row = createColorPickerRow(sec.id, sec.label, timeCategoryColors[sec.id] || defaultColor, (color) => {
      timeCategoryColors[sec.id] = color;
    });
    timeRowsEl.appendChild(row);
  });
  TASK_CATEGORY_SECTIONS.forEach((sec, idx) => {
    const defaultColor = DEFAULT_TASK_CATEGORY_COLORS[sec.id];
    const row = createColorPickerRow(sec.id, sec.label, taskCategoryColors[sec.id] ?? defaultColor, (color) => {
      taskCategoryColors[sec.id] = color;
    });
    if (idx < 5) taskRowsLeftEl.appendChild(row);
    else taskRowsRightEl.appendChild(row);
  });

  colorSaveBtn.addEventListener("click", () => {
    saveTodoSettings({
      ...getTodoSettings(),
      sectionColors,
      timeCategoryColors,
      taskCategoryColors,
    });
    applyTimeCategoryColors();
    applyTaskCategoryColors();
    document.dispatchEvent(new CustomEvent("app-colors-changed"));
    colorSaveBtn.textContent = "저장됨";
    setTimeout(() => { colorSaveBtn.textContent = "저장"; }, 1500);
  });

  grid.appendChild(colorWidget);
  el.appendChild(grid);

  // 시급 계산 로직
  const tabs = hourlyWidget.querySelectorAll(".idea-hourly-tab");
  const salaryRows = hourlyWidget.querySelectorAll(".idea-row-salary");
  const freelanceRows = hourlyWidget.querySelectorAll(".idea-row-freelance");
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
        resultUnit.textContent = " 원";
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
    salaryRows.forEach((r) => (r.style.display = m === "salary" ? "" : "none"));
    freelanceRows.forEach(
      (r) => (r.style.display = m === "freelance" ? "" : "none"),
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
    if (hourly > 0) saveHourlyToAccount(hourly);
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
