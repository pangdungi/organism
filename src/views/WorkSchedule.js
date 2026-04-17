/**
 * 근무표 - 근무 일정 관리
 * 근무시간, 근무유형, 근무일, 시간(근무표), 메모
 */
import { renderMonthlyContent, setWorkScheduleMonthlyViewCursor } from "./WorkScheduleMonthly.js";
import { supabase } from "../supabase.js";
import { hydrateWorkScheduleFromCloud } from "../utils/workScheduleSupabase.js";
import { workScheduleDiagLog } from "../utils/workScheduleDiag.js";
import { applyWorkScheduleRowTimesFromTypes, normalizeWorkDateKey } from "../utils/workScheduleEntryResolve.js";
import {
  readWorkScheduleRowsFromMem,
  writeWorkScheduleRowsToMem,
  readWorkScheduleTypeOptionsRawFromMem,
  writeWorkScheduleTypeOptionsRawToMem,
} from "../utils/workScheduleModel.js";

function wsUiLog(...args) {
  workScheduleDiagLog("[ui]", ...args);
}

let _workScheduleHydrateGeneration = 0;

function notifyWorkScheduleSaved() {
  try {
    window.dispatchEvent(new CustomEvent("work-schedule-saved"));
  } catch (_) {}
}

/** 로컬 Date → YYYY-MM-DD (월별 캘린더와 동일 규칙) */
function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 월 라벨 클릭 시 기본 근무일: 보는 달이 이번 달이면 오늘, 아니면 그 달 1일 */
function defaultDateKeyForCalendarMonth(year, monthIndex0) {
  const now = new Date();
  if (now.getFullYear() === year && now.getMonth() === monthIndex0) {
    return formatLocalYmd(now);
  }
  const m = String(monthIndex0 + 1).padStart(2, "0");
  return `${year}-${m}-01`;
}

/** 기본 근무유형 순서: 연차 → 휴가 → 정규근무 (연차·휴가는 00:00-00:00, 수정 불가) */
const DEFAULT_WORK_TYPE_OPTIONS = [
  { name: "연차", start: "00:00", end: "00:00" },
  { name: "휴가", start: "00:00", end: "00:00" },
  { name: "정규근무", start: "", end: "" },
];
/** 수정·삭제 불가 (UI에서 시작/마감 입력 없음, 삭제 버튼 없음) */
const READONLY_WORK_TYPES = ["연차", "휴가"];
const CALC_PROTECTED_WORK_TYPES = [];
const PROTECTED_WORK_TYPES = READONLY_WORK_TYPES;
const WORK_TYPE_DISPLAY_ORDER = DEFAULT_WORK_TYPE_OPTIONS.map((o) => o.name);

const DELETE_ICON =
  '<svg class="time-task-delete-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

function normalizeTypeEntry(o) {
  if (typeof o === "string") return { name: (o || "").trim(), start: "", end: "" };
  return {
    name: (o.name || "").trim(),
    start: (o.start != null ? String(o.start) : "").trim(),
    end: (o.end != null ? String(o.end) : "").trim(),
  };
}

const ALLOWED_WORK_TYPE_NAMES = new Set(DEFAULT_WORK_TYPE_OPTIONS.map((o) => o.name));

function getWorkTypeOptionsFull() {
  const defaultFull = DEFAULT_WORK_TYPE_OPTIONS.map((o) => ({ name: o.name, start: o.start || "", end: o.end || "" }));
  try {
    const arr = readWorkScheduleTypeOptionsRawFromMem();
    if (Array.isArray(arr) && arr.length > 0) {
      const normalized = arr.map(normalizeTypeEntry).filter((o) => o.name);
      const seen = new Set();
      const merged = [];
      for (const d of defaultFull) {
        const fromStorage = normalized.find((o) => o.name === d.name);
        merged.push(fromStorage ? { name: d.name, start: fromStorage.start || d.start, end: fromStorage.end || d.end } : d);
        seen.add(d.name);
      }
      for (const o of normalized) {
        if (seen.has(o.name)) continue;
        merged.push({ name: o.name, start: o.start || "", end: o.end || "" });
        seen.add(o.name);
      }
      merged.sort((a, b) => {
        const i = WORK_TYPE_DISPLAY_ORDER.indexOf(a.name);
        const j = WORK_TYPE_DISPLAY_ORDER.indexOf(b.name);
        if (i < 0 && j < 0) return 0;
        if (i < 0) return 1;
        if (j < 0) return -1;
        return i - j;
      });
      return merged;
    }
  } catch (_) {}
  return defaultFull;
}

function getWorkTypeOptions() {
  return getWorkTypeOptionsFull().map((o) => o.name);
}

function addWorkTypeOption(name, start, end) {
  const full = getWorkTypeOptionsFull();
  const trimmed = (name || "").trim();
  if (!trimmed) return full;
  if (full.some((o) => o.name === trimmed)) return full;
  const newEntry = { name: trimmed, start: (start != null ? String(start) : "").trim(), end: (end != null ? String(end) : "").trim() };
  full.unshift(newEntry);
  writeWorkScheduleTypeOptionsRawToMem(full);
  notifyWorkScheduleSaved();
  return full;
}

function updateWorkTypeOption(name, start, end) {
  if (READONLY_WORK_TYPES.includes(name)) return getWorkTypeOptionsFull();
  const full = getWorkTypeOptionsFull();
  const idx = full.findIndex((o) => o.name === name);
  if (idx < 0) return full;
  full[idx] = { name, start: (start != null ? String(start) : "").trim(), end: (end != null ? String(end) : "").trim() };
  writeWorkScheduleTypeOptionsRawToMem(full);
  notifyWorkScheduleSaved();
  return full;
}

function removeWorkTypeOption(name) {
  if (PROTECTED_WORK_TYPES.includes(name)) return getWorkTypeOptionsFull();
  const full = getWorkTypeOptionsFull().filter((o) => o.name !== name);
  writeWorkScheduleTypeOptionsRawToMem(full);
  notifyWorkScheduleSaved();
  return full;
}

function loadRows() {
  return readWorkScheduleRowsFromMem();
}

function saveRows(rows) {
  const withIds = writeWorkScheduleRowsToMem(rows);
  notifyWorkScheduleSaved();
  return withIds;
}

/** "09:00" 또는 "2026-03-13 09:00" 형태에서 시각(0~24) 추출. 날짜의 2026 등이 시간으로 잡히지 않도록 HH:MM 패턴만 사용 */
function parseTimeToHours(str) {
  if (!str || typeof str !== "string") return null;
  const s = str.trim();
  const withColon = s.match(/(\d{1,2}):(\d{2})\s*$/);
  if (withColon) {
    const h = parseInt(withColon[1], 10) || 0;
    const m = parseInt(withColon[2], 10) || 0;
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) return h + m / 60;
  }
  const timeOnly = s.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const h = parseInt(timeOnly[1], 10) || 0;
    const m = parseInt(timeOnly[2], 10) || 0;
    if (h >= 0 && h <= 24 && m >= 0 && m < 60) return h + m / 60;
  }
  return null;
}

/** "09:00~18:00" 형태에서 [시작, 마감] 파싱. 하위 호환용 */
function parseNameToStartEnd(name) {
  if (!name || typeof name !== "string") return { startTime: "", endTime: "" };
  const parts = name.trim().split("~");
  const start = (parts[0] || "").trim();
  const end = (parts[1] || "").trim();
  return { startTime: start, endTime: end };
}

/** 저장된 행에서 시작/마감 추출 (name "09:00~18:00" 하위 호환) */
function normalizeRowStartEnd(row) {
  if (row.startTime != null && row.endTime != null && row.startTime !== "" && row.endTime !== "") {
    return { ...row, startTime: String(row.startTime).trim(), endTime: String(row.endTime).trim() };
  }
  const { startTime, endTime } = parseNameToStartEnd(row.name || "");
  return { ...row, startTime, endTime };
}

/** 근무일·시작시간 기준 오름차순(날짜 필터와 동일 — 오래된 날이 위) */
function compareWorkScheduleRowsByDateTimeAsc(a, b) {
  const da = normalizeWorkDateKey(a?.workDate || "");
  const db = normalizeWorkDateKey(b?.workDate || "");
  const aOk = da.length >= 10;
  const bOk = db.length >= 10;
  if (aOk && bOk && da !== db) return da.localeCompare(db);
  if (aOk && !bOk) return -1;
  if (!aOk && bOk) return 1;
  const sa = String(a?.startTime || "").trim();
  const sb = String(b?.startTime || "").trim();
  if (sa !== sb) return sa.localeCompare(sb);
  return String(a?.endTime || "").localeCompare(String(b?.endTime || ""));
}

/** 근무표 초기 행: 저장된 데이터만(시간가계부 근무하기 자동 반영 없음) */
function getMergedInitialRows() {
  const saved = loadRows().map(normalizeRowStartEnd);
  const merged = applyWorkScheduleRowTimesFromTypes(saved);
  merged.sort(compareWorkScheduleRowsByDateTimeAsc);
  return merged;
}

/** 시작/마감 문자열(HH:MM)으로 근무 시간(hours) 계산 */
function durationFromStartEnd(startStr, endStr) {
  const startH = parseTimeToHours(startStr);
  const endH = parseTimeToHours(endStr);
  if (startH == null || endH == null) return null;
  return endH > startH ? endH - startH : 24 - startH + endH;
}

export function render(opts = {}) {
  const mobile = !!opts.mobile;
  wsUiLog("render() enter", { mobile });
  const el = document.createElement("div");
  el.className = mobile
    ? "app-tab-panel-content work-schedule-view calendar-view calendar-view--mobile-workschedule"
    : "app-tab-panel-content work-schedule-view";

  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "work-schedule-settings-btn";
  settingsBtn.setAttribute("aria-label", "근무유형 설정");
  settingsBtn.title = "근무유형 설정";
  settingsBtn.innerHTML =
    '<img src="/toolbaricons/settings.svg" alt="" class="work-schedule-settings-icon" width="20" height="20">';

  const header = document.createElement("div");
  if (mobile) {
    header.className =
      "calendar-view-header dream-view-header-wrap work-schedule-header work-schedule-header--mobile-tab";
    const headerInner = document.createElement("div");
    headerInner.className =
      "work-schedule-header-inner work-schedule-header-inner--mobile-tab";
    const titleWrap = document.createElement("div");
    titleWrap.className = "work-schedule-header-title-wrap";
    const label = document.createElement("span");
    label.className = "dream-view-label";
    label.textContent = "WORK";
    const h = document.createElement("h1");
    h.className = "dream-view-title calendar-view-title";
    h.textContent = "근무표";
    titleWrap.appendChild(label);
    titleWrap.appendChild(h);
    headerInner.appendChild(titleWrap);
    headerInner.appendChild(settingsBtn);
    header.appendChild(headerInner);
  } else {
    header.className = "work-schedule-header dream-view-header-wrap";
    const headerInner = document.createElement("div");
    headerInner.className = "work-schedule-header-inner";
    const titleWrap = document.createElement("div");
    titleWrap.className = "work-schedule-header-title-wrap";
    const label = document.createElement("span");
    label.className = "dream-view-label";
    label.textContent = "WORK SCHEDULE";
    const h = document.createElement("h1");
    h.className = "dream-view-title";
    h.textContent = "근무표";
    titleWrap.appendChild(label);
    titleWrap.appendChild(h);
    headerInner.appendChild(titleWrap);
    headerInner.appendChild(settingsBtn);
    header.appendChild(headerInner);
  }
  el.appendChild(header);

  function openWorkTypeSettingsModal() {
    function escapeHtml(s) {
      const div = document.createElement("div");
      div.textContent = s == null ? "" : String(s);
      return div.innerHTML;
    }
    const modal = document.createElement("div");
    modal.className = "work-schedule-type-settings-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-labelledby", "work-schedule-type-settings-title");
    modal.innerHTML = `
      <div class="work-schedule-type-settings-backdrop"></div>
      <div class="work-schedule-type-settings-panel">
        <div class="work-schedule-type-settings-header">
          <h3 class="work-schedule-type-settings-title" id="work-schedule-type-settings-title">근무유형 설정</h3>
          <button type="button" class="work-schedule-type-settings-close" aria-label="닫기">&times;</button>
        </div>
        <div class="work-schedule-type-settings-list-head">
          <span class="work-schedule-type-settings-th-name">근무유형</span>
          <span class="work-schedule-type-settings-th-start">시작</span>
          <span class="work-schedule-type-settings-th-end">마감</span>
          <span class="work-schedule-type-settings-th-action" aria-hidden="true"></span>
        </div>
        <div class="work-schedule-type-settings-list" data-type-list></div>
        <div class="work-schedule-type-settings-add">
          <input type="text" class="work-schedule-type-settings-input" placeholder="근무유형" maxlength="50" autocomplete="off" />
          <input type="text" class="work-schedule-type-settings-add-start" placeholder="시작" maxlength="8" autocomplete="off" />
          <input type="text" class="work-schedule-type-settings-add-end" placeholder="마감" maxlength="8" autocomplete="off" />
          <button type="button" class="work-schedule-type-settings-add-btn">추가</button>
        </div>
      </div>
    `;
    const listEl = modal.querySelector("[data-type-list]");
    const addInput = modal.querySelector(".work-schedule-type-settings-input");
    const addStartInput = modal.querySelector(".work-schedule-type-settings-add-start");
    const addEndInput = modal.querySelector(".work-schedule-type-settings-add-end");
    const addBtn = modal.querySelector(".work-schedule-type-settings-add-btn");

    function renderTypeList() {
      const full = getWorkTypeOptionsFull();
      const sorted = [...full].sort((a, b) => {
        const i = WORK_TYPE_DISPLAY_ORDER.indexOf(a.name);
        const j = WORK_TYPE_DISPLAY_ORDER.indexOf(b.name);
        if (i < 0 && j < 0) return 0;
        if (i < 0) return 1;
        if (j < 0) return -1;
        return i - j;
      });
      listEl.innerHTML = "";
      sorted.forEach((entry) => {
        const isReadonly = READONLY_WORK_TYPES.includes(entry.name);
        const row = document.createElement("div");
        row.className = "work-schedule-type-settings-row" + (isReadonly ? " is-protected" : "");
        if (isReadonly) {
          row.innerHTML =
            `<span class="work-schedule-type-settings-name">${escapeHtml(entry.name)}</span>` +
            `<span class="work-schedule-type-settings-row-no-time">${escapeHtml(entry.start || "00:00")}</span>` +
            `<span class="work-schedule-type-settings-row-no-time">${escapeHtml(entry.end || "00:00")}</span>` +
            `<span class="work-schedule-type-settings-row-action" aria-hidden="true"></span>`;
        } else {
          row.innerHTML =
            `<span class="work-schedule-type-settings-name">${escapeHtml(entry.name)}</span>` +
            `<input type="text" class="work-schedule-type-settings-row-start" value="${escapeHtml(entry.start || "")}" />` +
            `<input type="text" class="work-schedule-type-settings-row-end" value="${escapeHtml(entry.end || "")}" />` +
            `<span class="work-schedule-type-settings-row-action">` +
            `<button type="button" class="work-schedule-type-settings-del" title="삭제">${DELETE_ICON}</button>` +
            `</span>`;
          const startInp = row.querySelector(".work-schedule-type-settings-row-start");
          const endInp = row.querySelector(".work-schedule-type-settings-row-end");
          const commit = () => {
            updateWorkTypeOption(entry.name, startInp?.value ?? "", endInp?.value ?? "");
          };
          startInp?.addEventListener("blur", commit);
          endInp?.addEventListener("blur", commit);
          const delBtn = row.querySelector(".work-schedule-type-settings-del");
          if (delBtn) {
            delBtn.addEventListener("click", () => {
              removeWorkTypeOption(entry.name);
              renderTypeList();
            });
          }
        }
        listEl.appendChild(row);
      });
    }

    addBtn.addEventListener("click", () => {
      const name = (addInput.value || "").trim();
      if (!name) return;
      addWorkTypeOption(
        name,
        (addStartInput?.value || "").trim(),
        (addEndInput?.value || "").trim(),
      );
      addInput.value = "";
      if (addStartInput) addStartInput.value = "";
      if (addEndInput) addEndInput.value = "";
      renderTypeList();
    });
    addInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addBtn.click();
      }
    });

    const close = () => modal.remove();
    modal.querySelector(".work-schedule-type-settings-backdrop").addEventListener("click", close);
    modal.querySelector(".work-schedule-type-settings-close").addEventListener("click", close);

    renderTypeList();
    document.body.appendChild(modal);
    addInput.focus();
  }

  settingsBtn.addEventListener("click", openWorkTypeSettingsModal);

  const contentWrap = document.createElement("div");
  contentWrap.className = mobile
    ? "work-schedule-content-wrap calendar-content-wrap"
    : "work-schedule-content-wrap";
  el.appendChild(contentWrap);

  /** 월별보기: 날짜·근무유형 선택 → 근무표에 행 추가(시작·마감은 유형 기본값) */
  function openMonthlyDayEntryModal(initialDateKey) {
    const dateKey = normalizeWorkDateKey(initialDateKey || "") || formatLocalYmd(new Date());
    document.querySelectorAll(".work-schedule-day-entry-modal").forEach((n) => n.remove());

    const modal = document.createElement("div");
    modal.className = "work-schedule-type-settings-modal work-schedule-day-entry-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "work-schedule-day-entry-title");

    const backdrop = document.createElement("div");
    backdrop.className = "work-schedule-type-settings-backdrop";

    const panel = document.createElement("div");
    panel.className = "work-schedule-type-settings-panel work-schedule-day-entry-modal-panel";

    const header = document.createElement("div");
    header.className = "work-schedule-type-settings-header";
    const title = document.createElement("h3");
    title.id = "work-schedule-day-entry-title";
    title.className = "work-schedule-type-settings-title";
    title.textContent = "근무 등록";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "work-schedule-type-settings-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.innerHTML = "&times;";
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "work-schedule-day-entry-body";

    const labelDate = document.createElement("label");
    labelDate.className = "work-schedule-day-entry-label";
    const spanDate = document.createElement("span");
    spanDate.className = "work-schedule-day-entry-label-text";
    spanDate.textContent = "근무일";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.className = "work-schedule-day-entry-date";
    dateInput.value = dateKey;
    labelDate.appendChild(spanDate);
    labelDate.appendChild(dateInput);

    const labelType = document.createElement("label");
    labelType.className = "work-schedule-day-entry-label";
    const spanType = document.createElement("span");
    spanType.className = "work-schedule-day-entry-label-text";
    spanType.textContent = "근무유형";
    const select = document.createElement("select");
    select.className = "work-schedule-day-entry-select";
    select.setAttribute("aria-label", "근무유형");
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "선택";
    select.appendChild(opt0);
    const seenTypeNames = new Set();
    getWorkTypeOptions().forEach((name) => {
      const n = (name || "").trim();
      if (!n || seenTypeNames.has(n)) return;
      seenTypeNames.add(n);
      const o = document.createElement("option");
      o.value = n;
      o.textContent = n;
      select.appendChild(o);
    });
    const existingForDay = getMergedInitialRows().filter(
      (r) => normalizeWorkDateKey(r.workDate || "") === dateKey,
    );
    const preloadType = existingForDay.length ? (existingForDay[0].workType || "").trim() : "";
    if (preloadType && [...select.options].some((op) => op.value === preloadType)) {
      select.value = preloadType;
    }
    labelType.appendChild(spanType);
    labelType.appendChild(select);

    body.appendChild(labelDate);
    body.appendChild(labelType);

    const footer = document.createElement("div");
    footer.className = "todo-list-modal-footer work-schedule-day-entry-footer";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "todo-list-modal-cancel work-schedule-day-entry-cancel";
    cancelBtn.textContent = "취소";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "todo-list-modal-confirm work-schedule-day-entry-save";
    saveBtn.textContent = "저장";
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    modal.appendChild(backdrop);
    modal.appendChild(panel);

    function closeModal() {
      try {
        document.removeEventListener("keydown", onKeyDown);
      } catch (_) {}
      modal.remove();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
      }
    }

    function onSave() {
      const wd = normalizeWorkDateKey(dateInput.value || "");
      const typeName = (select.value || "").trim();
      if (!wd || wd.length < 10) {
        window.alert("근무일을 선택해 주세요.");
        return;
      }
      if (!typeName) {
        window.alert("근무유형을 선택해 주세요.");
        return;
      }
      const full = getWorkTypeOptionsFull();
      const entry = full.find((o) => o.name === typeName);
      let startTime = "";
      let endTime = "";
      if (READONLY_WORK_TYPES.includes(typeName)) {
        startTime = "00:00";
        endTime = "00:00";
      } else if (entry) {
        startTime = (entry.start || "").trim();
        endTime = (entry.end || "").trim();
      }
      let hoursWorked = "";
      if (startTime && endTime) {
        const dur = durationFromStartEnd(startTime, endTime);
        if (dur != null && dur > 0) hoursWorked = String(Math.round(dur * 100) / 100);
      }
      const newRow = {
        id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : undefined,
        workDate: wd,
        workType: typeName,
        startTime,
        endTime,
        hoursWorked,
        hours: "",
        memo: "",
      };
      /* 같은 근무일에 행이 여러 줄 쌓이지 않도록: 해당 날짜 기존 행은 모두 제거 후 한 줄로 덮어씀 */
      const rows = getMergedInitialRows().filter((r) => normalizeWorkDateKey(r.workDate || "") !== wd);
      rows.push(newRow);
      rows.sort(compareWorkScheduleRowsByDateTimeAsc);
      saveRows(rows);
      /* 저장한 근무일이 속한 달로 커서 고정 — 모달 직후 월별보기가 오늘 달로 돌아가는 현상 방지 */
      const dp = wd.split("-");
      if (dp.length === 3) {
        const cy = parseInt(dp[0], 10);
        const cm = parseInt(dp[1], 10) - 1;
        if (Number.isFinite(cy) && Number.isFinite(cm) && cm >= 0 && cm <= 11) {
          setWorkScheduleMonthlyViewCursor(cy, cm);
        }
      }
      closeModal();

      renderMonthlyView();
    }

    backdrop.addEventListener("click", closeModal);
    closeBtn.addEventListener("click", closeModal);
    cancelBtn.addEventListener("click", closeModal);
    saveBtn.addEventListener("click", onSave);
    document.addEventListener("keydown", onKeyDown);

    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      select.focus();
    });
  }

  function renderMonthlyView() {
    contentWrap.innerHTML = "";
    contentWrap.appendChild(
      renderMonthlyContent({
        typeOnly: true,
        onDayClick: (key) => openMonthlyDayEntryModal(key),
        onMonthLabelClick: ({ year, month }) =>
          openMonthlyDayEntryModal(defaultDateKeyForCalendarMonth(year, month)),
      }),
    );
  }

  function refreshMonthlyView(reason = "") {
    wsUiLog("refreshMonthlyView", { reason });
    renderMonthlyView();
  }

  const hydrateGen = ++_workScheduleHydrateGeneration;
  /* Supabase: hydrate 완료 후 1회 갱신(App 부팅 시에도 hydrateWorkScheduleFromCloud 가 돌아 있음). */
  if (supabase) {
    wsUiLog("mount: 즉시 표시 + hydrate, gen=", hydrateGen);
    refreshMonthlyView("mount-initial-supabase");
    void hydrateWorkScheduleFromCloud()
      .catch((err) => {
        return { anyChanged: false };
      })
      .then((hydrateResult) => {
        if (hydrateGen !== _workScheduleHydrateGeneration) {
          wsUiLog("hydrate SKIP (superseded by newer mount)", hydrateGen, "current=", _workScheduleHydrateGeneration);
          return;
        }
        if (!el.isConnected) {
          wsUiLog("hydrate SKIP (panel no longer in document)");
          return;
        }
        wsUiLog("hydrate 완료 → 월별 캘린더 1회 갱신", hydrateResult);
        refreshMonthlyView("after-hydrate");
      });
  } else {
    wsUiLog("mount: Supabase 없음 → 로컬만 즉시 표시", hydrateGen);
    refreshMonthlyView("mount-initial-no-supabase");
  }

  return el;
}
