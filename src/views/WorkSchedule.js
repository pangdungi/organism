/**
 * 근무-식단표 - 근무 일정 관리
 * 근무시간, 근무유형, 근무일, 시간, 메모
 */
import {
  renderMonthlyContent,
  setWorkScheduleMonthlyLiveRerender,
  setWorkScheduleMonthlyViewCursor,
} from "./WorkScheduleMonthly.js";
import { supabase } from "../supabase.js";
import {
  attachWorkScheduleSaveListener,
  pullWorkScheduleFromSupabase,
} from "../utils/workScheduleSupabase.js";
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

function notifyWorkScheduleSaved(detail) {
  try {
    window.dispatchEvent(
      new CustomEvent("work-schedule-saved", { detail: detail || {} }),
    );
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

/** 기본 근무유형 순서: 연차 → 휴가 → 정규근무 (시간 없음·표시만) */
const TYPE_KIND_WORK = "work";
const TYPE_KIND_DIET = "diet";
const DEFAULT_WORK_TYPE_OPTIONS = [
  { name: "연차", start: "", end: "", kind: TYPE_KIND_WORK },
  { name: "휴가", start: "", end: "", kind: TYPE_KIND_WORK },
  { name: "정규근무", start: "", end: "", kind: TYPE_KIND_WORK },
];
const DEFAULT_TYPE_NAMES = new Set(
  DEFAULT_WORK_TYPE_OPTIONS.map((o) => o.name),
);
/** 수정·삭제 불가 (기본 행) */
const READONLY_WORK_TYPES = ["연차", "휴가"];
const CALC_PROTECTED_WORK_TYPES = [];
const PROTECTED_WORK_TYPES = READONLY_WORK_TYPES;
const WORK_TYPE_DISPLAY_ORDER = DEFAULT_WORK_TYPE_OPTIONS.map((o) => o.name);

const DELETE_ICON =
  '<svg class="time-task-delete-icon" viewBox="0 0 16 16" width="16" height="16"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';

function normalizeTypeEntry(o) {
  if (typeof o === "string")
    return {
      name: (o || "").trim(),
      start: "",
      end: "",
      kind: TYPE_KIND_WORK,
      addedAt: 0,
    };
  const kind =
    String(o.kind || "").trim() === TYPE_KIND_DIET
      ? TYPE_KIND_DIET
      : TYPE_KIND_WORK;
  const ar = o.addedAt;
  const addedAt =
    typeof ar === "number" && Number.isFinite(ar) ? ar : 0;
  return {
    name: (o.name || "").trim(),
    start: (o.start != null ? String(o.start) : "").trim(),
    end: (o.end != null ? String(o.end) : "").trim(),
    kind,
    addedAt,
  };
}

/** addedAt 큰 값(최근 추가)이 앞에 오도록 */
function compareByAddedAtDescThenName(a, b) {
  const ta =
    typeof a.addedAt === "number" && Number.isFinite(a.addedAt) ? a.addedAt : 0;
  const tb =
    typeof b.addedAt === "number" && Number.isFinite(b.addedAt) ? b.addedAt : 0;
  if (ta !== tb) return tb - ta;
  return a.name.localeCompare(b.name, "ko");
}

/**
 * 저장·표시 순서: 근무(사용자 추가·최신이 위) → 연차·휴가·정규근무 → 식단(최신이 위)
 * — 추가 직후 바로 보이도록 커스텀을 기본 3종 위에 둠
 */
function compareTypeEntriesForPersist(a, b) {
  const aDiet = a.kind === TYPE_KIND_DIET;
  const bDiet = b.kind === TYPE_KIND_DIET;
  if (aDiet !== bDiet) return aDiet ? 1 : -1;

  if (aDiet && bDiet) return compareByAddedAtDescThenName(a, b);

  const aDef = DEFAULT_TYPE_NAMES.has(a.name);
  const bDef = DEFAULT_TYPE_NAMES.has(b.name);
  if (aDef !== bDef) return aDef ? 1 : -1;

  if (!aDef && !bDef) return compareByAddedAtDescThenName(a, b);

  const i = WORK_TYPE_DISPLAY_ORDER.indexOf(a.name);
  const j = WORK_TYPE_DISPLAY_ORDER.indexOf(b.name);
  return i - j;
}

function getWorkTypeOptionsFull() {
  const defaultFull = DEFAULT_WORK_TYPE_OPTIONS.map((o) => ({
    name: o.name,
    start: o.start || "",
    end: o.end || "",
    kind: TYPE_KIND_WORK,
  }));
  try {
    const arr = readWorkScheduleTypeOptionsRawFromMem();
    if (Array.isArray(arr) && arr.length > 0) {
      const normalized = arr.map(normalizeTypeEntry).filter((o) => o.name);
      const seen = new Set();
      const merged = [];
      for (const d of defaultFull) {
        const fromStorage = normalized.find((o) => o.name === d.name);
        merged.push(
          fromStorage
            ? {
                name: d.name,
                start: fromStorage.start || d.start,
                end: fromStorage.end || d.end,
                kind: TYPE_KIND_WORK,
              }
            : { ...d },
        );
        seen.add(d.name);
      }
      for (const o of normalized) {
        if (seen.has(o.name)) continue;
        merged.push({
          name: o.name,
          start: o.start || "",
          end: o.end || "",
          kind: o.kind === TYPE_KIND_DIET ? TYPE_KIND_DIET : TYPE_KIND_WORK,
          addedAt:
            typeof o.addedAt === "number" && Number.isFinite(o.addedAt)
              ? o.addedAt
              : 0,
        });
        seen.add(o.name);
      }
      merged.sort(compareTypeEntriesForPersist);
      return merged;
    }
  } catch (_) {}
  return defaultFull;
}

function sortTypeOptionsList(list) {
  return list.slice().sort(compareTypeEntriesForPersist);
}

function addWorkTypeOption(name, kind) {
  const full = getWorkTypeOptionsFull();
  const trimmed = (name || "").trim();
  if (!trimmed) return full;
  if (full.some((o) => o.name === trimmed)) return full;
  if (DEFAULT_TYPE_NAMES.has(trimmed)) return full;
  const k = kind === TYPE_KIND_DIET ? TYPE_KIND_DIET : TYPE_KIND_WORK;
  const newEntry = {
    name: trimmed,
    start: "",
    end: "",
    kind: k,
    addedAt: Date.now(),
  };
  const next = sortTypeOptionsList([...full, newEntry]);
  writeWorkScheduleTypeOptionsRawToMem(next);
  notifyWorkScheduleSaved({ types: true });
  return next;
}

function removeWorkTypeOption(name) {
  if (DEFAULT_TYPE_NAMES.has(name)) return getWorkTypeOptionsFull();
  const full = getWorkTypeOptionsFull().filter((o) => o.name !== name);
  writeWorkScheduleTypeOptionsRawToMem(full);
  notifyWorkScheduleSaved({ types: true });
  return full;
}

function loadRows() {
  return readWorkScheduleRowsFromMem();
}

function saveRows(rows) {
  const withIds = writeWorkScheduleRowsToMem(rows);
  notifyWorkScheduleSaved({ entries: true });
  return withIds;
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
  const ta = String(a?.workType || "").trim();
  const tb = String(b?.workType || "").trim();
  if (ta !== tb) return ta.localeCompare(tb);
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

/** 근무표 초기 행: 저장된 데이터만(시간가계부 근무하기 자동 반영 없음) */
function getMergedInitialRows() {
  const saved = loadRows().map(normalizeRowStartEnd);
  const merged = applyWorkScheduleRowTimesFromTypes(saved);
  merged.sort(compareWorkScheduleRowsByDateTimeAsc);
  return merged;
}

export function render(opts = {}) {
  attachWorkScheduleSaveListener();
  const mobile = !!opts.mobile;
  wsUiLog("render() enter", { mobile });
  const el = document.createElement("div");
  el.className = mobile
    ? "app-tab-panel-content work-schedule-view calendar-view calendar-view--mobile-workschedule"
    : "app-tab-panel-content work-schedule-view";

  const settingsBtn = document.createElement("button");
  settingsBtn.type = "button";
  settingsBtn.className = "work-schedule-settings-btn";
  settingsBtn.setAttribute("aria-label", "근무-식단 유형 설정");
  settingsBtn.title = "근무-식단 유형 설정";
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
    label.textContent = "WORK · MEALS";
    const h = document.createElement("h1");
    h.className = "dream-view-title calendar-view-title";
    h.textContent = "근무-식단표";
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
    label.textContent = "WORK & MEAL PLAN";
    const h = document.createElement("h1");
    h.className = "dream-view-title";
    h.textContent = "근무-식단표";
    titleWrap.appendChild(label);
    titleWrap.appendChild(h);
    headerInner.appendChild(titleWrap);
    headerInner.appendChild(settingsBtn);
    header.appendChild(headerInner);
  }
  el.appendChild(header);

  async function openWorkTypeSettingsModal() {
    try {
      await pullWorkScheduleFromSupabase({ includeTypes: true });
    } catch (_) {}
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
      <div class="work-schedule-type-settings-panel work-schedule-type-settings-panel--dual">
        <div class="work-schedule-type-settings-header">
          <h3 class="work-schedule-type-settings-title" id="work-schedule-type-settings-title">근무-식단 유형 설정</h3>
          <button type="button" class="work-schedule-type-settings-close" aria-label="닫기">&times;</button>
        </div>
        <div class="work-schedule-type-settings-body-dual">
          <div class="work-schedule-type-settings-add-block">
            <div class="work-schedule-type-settings-kind-row">
              <label class="work-schedule-type-settings-radio"><input type="radio" name="ws-add-kind" value="work" checked /> 근무유형</label>
              <label class="work-schedule-type-settings-radio"><input type="radio" name="ws-add-kind" value="diet" /> 식단</label>
            </div>
            <div class="work-schedule-type-settings-add-one">
              <input type="text" class="work-schedule-type-settings-input-name" placeholder="이름" maxlength="50" autocomplete="off" />
              <button type="button" class="work-schedule-type-settings-add-btn">추가</button>
            </div>
          </div>
          <div class="work-schedule-type-settings-dual-cols">
            <div class="work-schedule-type-settings-col work-schedule-type-settings-col--work">
              <div class="work-schedule-type-settings-col-head">근무유형</div>
              <div class="work-schedule-type-settings-list" data-work-list></div>
            </div>
            <div class="work-schedule-type-settings-col work-schedule-type-settings-col--diet">
              <div class="work-schedule-type-settings-col-head">식단</div>
              <div class="work-schedule-type-settings-list" data-diet-list></div>
            </div>
          </div>
        </div>
      </div>
    `;
    const workListEl = modal.querySelector("[data-work-list]");
    const dietListEl = modal.querySelector("[data-diet-list]");
    const addInput = modal.querySelector(".work-schedule-type-settings-input-name");
    const addBtn = modal.querySelector(".work-schedule-type-settings-add-btn");

    function renderTypeList() {
      const full = getWorkTypeOptionsFull();
      const workRows = full.filter((o) => o.kind !== TYPE_KIND_DIET);
      const dietRows = full.filter((o) => o.kind === TYPE_KIND_DIET);

      workListEl.innerHTML = "";
      workRows.forEach((entry) => {
        const isProtected = DEFAULT_TYPE_NAMES.has(entry.name);
        const row = document.createElement("div");
        row.className =
          "work-schedule-type-settings-row work-schedule-type-settings-row--simple" +
          (isProtected ? " is-protected" : "");
        if (isProtected) {
          row.innerHTML =
            `<span class="work-schedule-type-settings-name">${escapeHtml(entry.name)}</span>` +
            `<span class="work-schedule-type-settings-row-action" aria-hidden="true"></span>`;
        } else {
          row.innerHTML =
            `<span class="work-schedule-type-settings-name">${escapeHtml(entry.name)}</span>` +
            `<span class="work-schedule-type-settings-row-action">` +
            `<button type="button" class="work-schedule-type-settings-del" title="삭제">${DELETE_ICON}</button>` +
            `</span>`;
          row
            .querySelector(".work-schedule-type-settings-del")
            ?.addEventListener("click", () => {
              removeWorkTypeOption(entry.name);
              renderTypeList();
            });
        }
        workListEl.appendChild(row);
      });

      dietListEl.innerHTML = "";
      dietRows.forEach((entry) => {
        const row = document.createElement("div");
        row.className =
          "work-schedule-type-settings-row work-schedule-type-settings-row--simple is-diet-row";
        row.innerHTML =
          `<span class="work-schedule-type-settings-name">${escapeHtml(entry.name)}</span>` +
          `<span class="work-schedule-type-settings-row-action">` +
          `<button type="button" class="work-schedule-type-settings-del" title="삭제">${DELETE_ICON}</button>` +
          `</span>`;
        row
          .querySelector(".work-schedule-type-settings-del")
          ?.addEventListener("click", () => {
            removeWorkTypeOption(entry.name);
            renderTypeList();
          });
        dietListEl.appendChild(row);
      });
    }

    function getSelectedAddKind() {
      const r = modal.querySelector('input[name="ws-add-kind"]:checked');
      return r && r.value === "diet" ? TYPE_KIND_DIET : TYPE_KIND_WORK;
    }

    /* 한글 IME: Enter가 조합 확정과 겹치면 값이 둘로 나뉘어 저장되는 경우가 있어 조합 중·229는 무시 */
    let addInputImeComposing = false;
    addInput.addEventListener("compositionstart", () => {
      addInputImeComposing = true;
    });
    addInput.addEventListener("compositionend", () => {
      addInputImeComposing = false;
    });

    function commitAddFromInput() {
      if (addInputImeComposing) return;
      const name = (addInput.value || "").trim();
      if (!name) return;
      const kindAdded = getSelectedAddKind();
      addWorkTypeOption(name, kindAdded);
      addInput.value = "";
      addInput.blur();
      renderTypeList();
      const listEl =
        kindAdded === TYPE_KIND_DIET ? dietListEl : workListEl;
      listEl.scrollTop = 0;
      requestAnimationFrame(() => {
        try {
          addInput.focus();
        } catch (_) {}
      });
    }

    addBtn.addEventListener("click", () => {
      commitAddFromInput();
    });
    addInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      if (e.isComposing || e.keyCode === 229 || addInputImeComposing) return;
      e.preventDefault();
      commitAddFromInput();
    });

    const close = () => modal.remove();
    modal.querySelector(".work-schedule-type-settings-backdrop").addEventListener("click", close);
    modal.querySelector(".work-schedule-type-settings-close").addEventListener("click", close);

    renderTypeList();
    document.body.appendChild(modal);
    addInput.focus();
  }

  function workTypePillClassForName(typeName) {
    const n = (typeName || "").trim();
    if (!n) return "";
    const entry = getWorkTypeOptionsFull().find((o) => o.name === n);
    if (!entry) return "is-ws-pill-default";
    if (entry.kind === TYPE_KIND_DIET) return "is-ws-pill-diet";
    if (DEFAULT_TYPE_NAMES.has(n)) return "is-ws-pill-builtin";
    return "is-ws-pill-work";
  }

  settingsBtn.addEventListener("click", openWorkTypeSettingsModal);

  const contentWrap = document.createElement("div");
  contentWrap.className = mobile
    ? "work-schedule-content-wrap calendar-content-wrap"
    : "work-schedule-content-wrap";
  el.appendChild(contentWrap);

  /** 월별보기: 날짜 셀 → 새 행 추가 / 근무 칩 → 해당 행 수정·삭제 */
  function openMonthlyDayEntryModal(initialDateKey, editRowId = null) {
    const rowsAll = getMergedInitialRows();
    const existingRow =
      editRowId != null && String(editRowId).trim()
        ? rowsAll.find((r) => String(r.id) === String(editRowId).trim())
        : null;
    const resolvedEditId = existingRow ? String(existingRow.id) : null;

    const dateKey =
      normalizeWorkDateKey(
        existingRow?.workDate || initialDateKey || "",
      ) || formatLocalYmd(new Date());
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
    title.textContent = resolvedEditId ? "근무·식단 수정" : "근무·식단 등록";
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
    spanDate.textContent = "일자";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.className = "work-schedule-day-entry-date";
    dateInput.value = dateKey;
    labelDate.appendChild(spanDate);
    labelDate.appendChild(dateInput);

    const kindRow = document.createElement("div");
    kindRow.className =
      "work-schedule-type-settings-kind-row work-schedule-day-entry-kind-row";
    const labelRadioWork = document.createElement("label");
    labelRadioWork.className = "work-schedule-type-settings-radio";
    const radioWork = document.createElement("input");
    radioWork.type = "radio";
    radioWork.name = "ws-day-entry-kind";
    radioWork.value = "work";
    const spanRw = document.createElement("span");
    spanRw.textContent = "근무유형";
    labelRadioWork.appendChild(radioWork);
    labelRadioWork.appendChild(spanRw);
    const labelRadioDiet = document.createElement("label");
    labelRadioDiet.className = "work-schedule-type-settings-radio";
    const radioDiet = document.createElement("input");
    radioDiet.type = "radio";
    radioDiet.name = "ws-day-entry-kind";
    radioDiet.value = "diet";
    const spanRd = document.createElement("span");
    spanRd.textContent = "식단";
    labelRadioDiet.appendChild(radioDiet);
    labelRadioDiet.appendChild(spanRd);
    kindRow.appendChild(labelRadioWork);
    kindRow.appendChild(labelRadioDiet);

    const labelType = document.createElement("label");
    labelType.className = "work-schedule-day-entry-label";
    const spanType = document.createElement("span");
    spanType.className = "work-schedule-day-entry-label-text";
    const select = document.createElement("select");
    select.className = "work-schedule-day-entry-select";

    function getDayEntrySelectedKind() {
      return radioDiet.checked ? TYPE_KIND_DIET : TYPE_KIND_WORK;
    }

    function typeNamesForDayEntryKind(kind) {
      const full = getWorkTypeOptionsFull();
      const list =
        kind === TYPE_KIND_DIET
          ? full.filter((o) => o.kind === TYPE_KIND_DIET)
          : full.filter((o) => o.kind !== TYPE_KIND_DIET);
      const out = [];
      const seen = new Set();
      list.forEach((o) => {
        const n = (o.name || "").trim();
        if (!n || seen.has(n)) return;
        seen.add(n);
        out.push(n);
      });
      return out;
    }

    function fillDayEntrySelect(kind, preserveValue) {
      const labelText = kind === TYPE_KIND_DIET ? "식단" : "근무유형";
      spanType.textContent = labelText;
      select.setAttribute("aria-label", labelText);
      select.innerHTML = "";
      const opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "선택";
      select.appendChild(opt0);
      typeNamesForDayEntryKind(kind).forEach((n) => {
        const o = document.createElement("option");
        o.value = n;
        o.textContent = n;
        select.appendChild(o);
      });
      const pv = (preserveValue || "").trim();
      if (pv && [...select.options].some((op) => op.value === pv)) {
        select.value = pv;
      } else {
        select.value = "";
      }
    }

    let initialKind = TYPE_KIND_WORK;
    if (resolvedEditId && existingRow) {
      const wt0 = (existingRow.workType || "").trim();
      const ent0 = getWorkTypeOptionsFull().find((o) => o.name === wt0);
      if (ent0 && ent0.kind === TYPE_KIND_DIET) initialKind = TYPE_KIND_DIET;
    }
    if (initialKind === TYPE_KIND_DIET) {
      radioDiet.checked = true;
      radioWork.checked = false;
    } else {
      radioWork.checked = true;
      radioDiet.checked = false;
    }
    fillDayEntrySelect(
      initialKind,
      resolvedEditId && existingRow
        ? (existingRow.workType || "").trim()
        : "",
    );

    radioWork.addEventListener("change", () => {
      if (radioWork.checked) fillDayEntrySelect(TYPE_KIND_WORK, "");
    });
    radioDiet.addEventListener("change", () => {
      if (radioDiet.checked) fillDayEntrySelect(TYPE_KIND_DIET, "");
    });

    labelType.appendChild(spanType);
    labelType.appendChild(select);

    body.appendChild(labelDate);
    body.appendChild(kindRow);
    body.appendChild(labelType);

    const footer = document.createElement("div");
    footer.className = "todo-list-modal-footer work-schedule-day-entry-footer";
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "todo-list-modal-cancel work-schedule-day-entry-delete";
    deleteBtn.textContent = "삭제";
    deleteBtn.hidden = !resolvedEditId;
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "todo-list-modal-confirm work-schedule-day-entry-save";
    saveBtn.textContent = "저장";
    footer.appendChild(deleteBtn);
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
        window.alert("일자를 선택해 주세요.");
        return;
      }
      if (!typeName) {
        window.alert(
          getDayEntrySelectedKind() === TYPE_KIND_DIET
            ? "식단 유형을 선택해 주세요."
            : "근무유형을 선택해 주세요.",
        );
        return;
      }
      const baseFields = {
        workDate: wd,
        workType: typeName,
        startTime: "",
        endTime: "",
        hoursWorked: "",
      };
      let rows;
      if (resolvedEditId && existingRow) {
        rows = getMergedInitialRows().map((r) =>
          String(r.id) === resolvedEditId
            ? {
                ...r,
                ...baseFields,
                id: r.id,
                hours: r.hours != null ? r.hours : "",
                memo: r.memo != null ? r.memo : "",
              }
            : r,
        );
      } else {
        const newRow = {
          id:
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : undefined,
          ...baseFields,
          hours: "",
          memo: "",
        };
        rows = [...getMergedInitialRows(), newRow];
        rows.sort(compareWorkScheduleRowsByDateTimeAsc);
      }
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
    deleteBtn.addEventListener("click", () => {
      if (!resolvedEditId) return;
      const rows = getMergedInitialRows().filter(
        (r) => String(r.id) !== resolvedEditId,
      );
      saveRows(rows);
      const keepWd =
        normalizeWorkDateKey(dateInput.value || "") ||
        normalizeWorkDateKey(initialDateKey || "") ||
        dateKey;
      const dp = keepWd.split("-");
      if (dp.length === 3) {
        const cy = parseInt(dp[0], 10);
        const cm = parseInt(dp[1], 10) - 1;
        if (Number.isFinite(cy) && Number.isFinite(cm) && cm >= 0 && cm <= 11) {
          setWorkScheduleMonthlyViewCursor(cy, cm);
        }
      }
      closeModal();
      renderMonthlyView();
    });
    saveBtn.addEventListener("click", onSave);
    document.addEventListener("keydown", onKeyDown);

    document.body.appendChild(modal);
    requestAnimationFrame(() => {
      select.focus();
    });
  }

  function renderMonthlyView() {
    setWorkScheduleMonthlyLiveRerender(renderMonthlyView);
    contentWrap.innerHTML = "";
    contentWrap.appendChild(
      renderMonthlyContent({
        typeOnly: true,
        typePillClassForName: workTypePillClassForName,
        onDayClick: (key) => openMonthlyDayEntryModal(key, null),
        onEntryClick: ({ dateKey: dk, rowId }) =>
          openMonthlyDayEntryModal(dk, rowId),
        onMonthLabelClick: ({ year, month }) =>
          openMonthlyDayEntryModal(defaultDateKeyForCalendarMonth(year, month), null),
      }),
    );
  }

  function refreshMonthlyView(reason = "") {
    wsUiLog("refreshMonthlyView", { reason });
    renderMonthlyView();
  }

  /* 서버 pull 은 App 탭 전환(hydrateWorkScheduleFromCloud) 시에만. 본화면은 mem·DOM만, 서버 쓰기는 저장/삭제/유형 변경. */
  if (supabase) {
    refreshMonthlyView("mount-initial-supabase");
  } else {
    refreshMonthlyView("mount-initial-no-supabase");
  }

  return el;
}
