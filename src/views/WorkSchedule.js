/**
 * 스탬프 캘린더 — 날짜별 스탬프(유형) 표시
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
import { showToast } from "../utils/showToast.js";
import { workScheduleDiagLog } from "../utils/workScheduleDiag.js";
import { applyWorkScheduleRowTimesFromTypes, normalizeWorkDateKey } from "../utils/workScheduleEntryResolve.js";
import {
  readWorkScheduleRowsFromMem,
  writeWorkScheduleRowsToMem,
  readWorkScheduleTypeOptionsRawFromMem,
  writeWorkScheduleTypeOptionsRawToMem,
} from "../utils/workScheduleModel.js";
import {
  APP_FOOTER_ICON_BTN_CLASS,
  getAppFooterActionsSlot,
} from "../utils/appFooterShell.js";

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
/** 근무 유형(스탬프) — kind 컬럼은 호환용으로 두되 클라이언트에서는 항상 work 로 취급 */
const TYPE_KIND_WORK = "work";
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

/** 툴바 설정(톱니): 아이콘은 currentColor · 푸터는 APP_FOOTER_ICON_BTN_CLASS 만 사용 */
const WORK_SCHEDULE_SETTINGS_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m19.845 13.561c.1-.505.155-1.027.155-1.561s-.055-1.056-.155-1.561l1.806-1.489c.502-.414.632-1.132.307-1.696l-.869-1.508c-.325-.564-1.011-.811-1.62-.582l-2.198.825c-.779-.684-1.689-1.218-2.691-1.559l-.385-2.316c-.108-.643-.663-1.114-1.314-1.114h-1.738c-.651 0-1.206.471-1.313 1.114l-.386 2.316c-1.002.341-1.912.875-2.691 1.559l-2.198-.825c-.61-.228-1.295.018-1.62.582l-.87 1.508c-.325.564-.195 1.282.307 1.696l1.806 1.489c-.1.505-.155 1.026-.155 1.561s.055 1.056.155 1.561l-1.806 1.489c-.502.414-.632 1.132-.307 1.696l.869 1.508c.325.564 1.011.811 1.62.582l2.198-.825c.779.684 1.689 1.218 2.691 1.559l.385 2.316c.109.643.664 1.114 1.315 1.114h1.738c.651 0 1.206-.471 1.313-1.114l.385-2.316c1.002-.341 1.913-.875 2.691-1.559l2.198.825c.609.229 1.295-.017 1.62-.582l.869-1.508c.325-.564.196-1.282-.307-1.696z"/><circle cx="12.012" cy="12" r="3"/></g></svg>';

function normalizeTypeEntry(o) {
  if (typeof o === "string")
    return {
      name: (o || "").trim(),
      start: "",
      end: "",
      kind: TYPE_KIND_WORK,
      addedAt: 0,
    };
  const ar = o.addedAt;
  const addedAt =
    typeof ar === "number" && Number.isFinite(ar) ? ar : 0;
  return {
    name: (o.name || "").trim(),
    start: (o.start != null ? String(o.start) : "").trim(),
    end: (o.end != null ? String(o.end) : "").trim(),
    kind: TYPE_KIND_WORK,
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
 * 저장·표시 순서: 사용자 추가(최신이 위) → 연차·휴가·정규근무
 */
function compareTypeEntriesForPersist(a, b) {
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
          kind: TYPE_KIND_WORK,
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

/** 표시 목록 스냅샷과 동일한 객체로 유형 목록만 복제(모달 드래프트용). */
function cloneWorkTypeOptionsForDraft() {
  return getWorkTypeOptionsFull().map((o) => ({
    name: o.name,
    start: (o.start || "").trim(),
    end: (o.end || "").trim(),
    kind: TYPE_KIND_WORK,
    addedAt:
      typeof o.addedAt === "number" && Number.isFinite(o.addedAt)
        ? o.addedAt
        : 0,
  }));
}

function persistWorkTypeDraftToMemAndSync(rawList) {
  const next = sortTypeOptionsList(
    rawList.map((o) => ({
      name: (o.name || "").trim(),
      start: (o.start || "").trim(),
      end: (o.end || "").trim(),
      kind: TYPE_KIND_WORK,
      addedAt:
        typeof o.addedAt === "number" && Number.isFinite(o.addedAt)
          ? o.addedAt
          : 0,
    })),
  );
  writeWorkScheduleTypeOptionsRawToMem(next);
  notifyWorkScheduleSaved({ types: true });
}

/** 유형 표시명 변경 시 일정 행의 workType 문자열이 옛 이름을 가리키면 캘린더가 안 바뀜 → 저장 시 같이 갱신 */
function cascadeWorkScheduleEntriesWorkTypeRenames(renamePairs) {
  if (!Array.isArray(renamePairs) || renamePairs.length === 0) return false;
  let next = readWorkScheduleRowsFromMem();
  let changed = false;
  for (const pair of renamePairs) {
    const from = String(pair?.from || "").trim();
    const to = String(pair?.to || "").trim();
    if (!from || !to || from === to) continue;
    next = next.map((r) => {
      const wt = String(r?.workType || "").trim();
      if (wt !== from) return r;
      changed = true;
      return { ...r, workType: to };
    });
  }
  if (changed) {
    saveRows(next);
  }
  return changed;
}

/**
 * 예: 일정은 "생리"인데 유형만 "🩸 생리"로 바뀐 뒤 저장된 경우 — 유일한 후보면 행 문자열을 맞춤
 * (두 유형이 같은 짧은 문자열을 포함하면 스킵)
 */
function repairWorkScheduleRowsWorkTypeByUniqueSuperstring(typeNameList) {
  const names = Array.from(
    new Set(
      (Array.isArray(typeNameList) ? typeNameList : [])
        .map((n) => String(n || "").trim())
        .filter(Boolean),
    ),
  );
  if (!names.length) return false;
  const rows = readWorkScheduleRowsFromMem();
  let changed = false;
  const next = rows.map((r) => {
    const wt = String(r?.workType || "").trim();
    if (!wt || names.includes(wt)) return r;
    const candidates = names.filter((n) => n.includes(wt));
    if (candidates.length !== 1) return r;
    changed = true;
    return { ...r, workType: candidates[0] };
  });
  if (changed) {
    saveRows(next);
  }
  return changed;
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
  settingsBtn.setAttribute("aria-label", "스탬프 설정");
  settingsBtn.title = "스탬프 설정";
  settingsBtn.innerHTML = WORK_SCHEDULE_SETTINGS_ICON_SVG;

  async function openWorkTypeSettingsModal() {
    try {
      await pullWorkScheduleFromSupabase({ includeTypes: true });
    } catch (_) {}
    const modal = document.createElement("div");
    modal.className =
      "work-schedule-type-settings-modal todo-list-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-labelledby", "work-schedule-type-settings-title");
    modal.innerHTML = `
      <div class="work-schedule-type-settings-backdrop todo-list-modal-backdrop"></div>
      <div class="work-schedule-type-settings-panel work-schedule-type-settings-panel--single todo-list-modal-panel">
        <div class="work-schedule-type-settings-header todo-list-modal-header">
          <h3 class="work-schedule-type-settings-title todo-list-modal-title" id="work-schedule-type-settings-title">스탬프 설정</h3>
          <button type="button" class="work-schedule-type-settings-close todo-list-modal-close" aria-label="닫기">&times;</button>
        </div>
        <div class="work-schedule-type-settings-body-single todo-list-modal-body">
          <div class="work-schedule-type-settings-add-block time-task-log-field">
            <div class="work-schedule-type-settings-add-one work-schedule-type-settings-name-row">
              <input type="text" class="work-schedule-type-settings-input-name time-add-task-name" placeholder="이름" maxlength="50" autocomplete="off" />
              <button type="button" class="work-schedule-type-settings-add-btn todo-list-modal-cancel">추가</button>
            </div>
            <div class="work-schedule-type-settings-list time-task-setup-list-scroll" data-work-list></div>
          </div>
        </div>
        <div class="work-schedule-type-settings-footer todo-list-modal-footer">
          <button type="button" class="todo-list-modal-confirm work-schedule-type-settings-save-btn">저장</button>
        </div>
        <div class="work-schedule-type-settings-stamp-edit-popover" hidden>
          <div class="work-schedule-type-settings-stamp-edit-backdrop"></div>
          <div class="work-schedule-type-settings-stamp-edit-dialog todo-list-modal-panel" role="dialog" aria-modal="true" aria-labelledby="work-schedule-stamp-edit-title">
            <div class="todo-list-modal-header">
              <h3 class="todo-list-modal-title" id="work-schedule-stamp-edit-title">스탬프</h3>
              <button type="button" class="work-schedule-type-settings-stamp-edit-dismiss todo-list-modal-close" aria-label="닫기">&times;</button>
            </div>
            <div class="todo-list-modal-body work-schedule-type-settings-stamp-edit-body">
              <label class="work-schedule-day-entry-label todo-task-edit-label work-schedule-type-settings-stamp-edit-label">
                <span class="work-schedule-day-entry-label-text">이름</span>
                <input type="text" class="work-schedule-type-settings-stamp-edit-name time-add-task-name" maxlength="50" autocomplete="off" />
              </label>
              <p class="work-schedule-type-settings-stamp-edit-hint"></p>
            </div>
            <div class="todo-list-modal-footer work-schedule-type-settings-stamp-edit-footer-editable">
              <button type="button" class="todo-list-modal-cancel work-schedule-type-settings-stamp-edit-delete">삭제</button>
              <button type="button" class="todo-list-modal-confirm work-schedule-type-settings-stamp-edit-save">저장</button>
            </div>
          </div>
        </div>
      </div>
    `;
    const workListEl = modal.querySelector("[data-work-list]");
    const addInput = modal.querySelector(".work-schedule-type-settings-input-name");
    const addBtn = modal.querySelector(".work-schedule-type-settings-add-btn");
    const saveBtn = modal.querySelector(".work-schedule-type-settings-save-btn");
    const stampPopover = modal.querySelector(
      ".work-schedule-type-settings-stamp-edit-popover",
    );
    const stampEditBackdrop = modal.querySelector(
      ".work-schedule-type-settings-stamp-edit-backdrop",
    );
    const stampEditName = modal.querySelector(
      ".work-schedule-type-settings-stamp-edit-name",
    );
    const stampEditHint = modal.querySelector(
      ".work-schedule-type-settings-stamp-edit-hint",
    );
    const stampEditDelete = modal.querySelector(
      ".work-schedule-type-settings-stamp-edit-delete",
    );
    const stampEditSave = modal.querySelector(
      ".work-schedule-type-settings-stamp-edit-save",
    );
    const stampEditDismiss = modal.querySelector(
      ".work-schedule-type-settings-stamp-edit-dismiss",
    );
    const stampEditFooterEditable = modal.querySelector(
      ".work-schedule-type-settings-stamp-edit-footer-editable",
    );

    /** 모달 안에서만 조작하고, 「저장」 시에 한 번 메모 반영 → 서버 동기화 */
    const draftTypes = cloneWorkTypeOptionsForDraft();
    draftTypes.sort(compareTypeEntriesForPersist);
    const pendingWorkTypeRenames = [];

    function normalizeDraftPersistShape(arr = draftTypes) {
      return sortTypeOptionsList(
        arr.map((o) => ({
          name: (o.name || "").trim(),
          start: (o.start || "").trim(),
          end: (o.end || "").trim(),
          kind: TYPE_KIND_WORK,
          addedAt:
            typeof o.addedAt === "number" && Number.isFinite(o.addedAt)
              ? o.addedAt
              : 0,
        })),
      );
    }

    function draftComparableSnapshot() {
      return JSON.stringify(
        normalizeDraftPersistShape().map((t) => ({
          n: t.name,
          k: t.kind,
          s: t.start || "",
          e: t.end || "",
          a:
            typeof t.addedAt === "number" && Number.isFinite(t.addedAt)
              ? t.addedAt
              : 0,
        })),
      );
    }

    let lastSavedComparable = draftComparableSnapshot();

    let stampEditOrigName = "";

    function closeStampEditPopover() {
      stampPopover.hidden = true;
      stampEditOrigName = "";
      stampEditHint.textContent = "";
      stampEditHint.hidden = true;
    }

    function openStampEditPopover(entryName, isProtected) {
      stampEditOrigName = entryName;
      stampEditName.value = entryName;
      if (isProtected) {
        stampEditName.disabled = true;
        stampEditHint.textContent =
          "기본 스탬프는 이름 변경·삭제가 제한됩니다.";
        stampEditHint.hidden = false;
        stampEditFooterEditable.hidden = true;
      } else {
        stampEditName.disabled = false;
        stampEditHint.hidden = true;
        stampEditHint.textContent = "";
        stampEditFooterEditable.hidden = false;
      }
      stampPopover.hidden = false;
      if (!isProtected) {
        requestAnimationFrame(() => {
          try {
            stampEditName.focus();
            stampEditName.select();
          } catch (_) {}
        });
      } else {
        try {
          stampEditDismiss.focus();
        } catch (_) {}
      }
    }

    function detachTypeSettingsModal() {
      document.removeEventListener("keydown", onTypeSettingsModalKeyDown);
      try {
        window.dispatchEvent(new CustomEvent("work-schedule-settings-closed"));
      } catch (_) {}
      modal.remove();
    }

    function onTypeSettingsModalKeyDown(e) {
      if (e.key !== "Escape" || !modal.isConnected) return;
      e.preventDefault();
      if (!stampPopover.hidden) {
        closeStampEditPopover();
        return;
      }
      tryCloseModal();
    }
    document.addEventListener("keydown", onTypeSettingsModalKeyDown);

    stampEditBackdrop.addEventListener("click", closeStampEditPopover);
    stampEditDismiss.addEventListener("click", closeStampEditPopover);
    stampEditDelete.addEventListener("click", () => {
      if (!stampEditOrigName || DEFAULT_TYPE_NAMES.has(stampEditOrigName))
        return;
      const idx = draftTypes.findIndex((o) => o.name === stampEditOrigName);
      if (idx === -1) {
        closeStampEditPopover();
        return;
      }
      draftTypes.splice(idx, 1);
      closeStampEditPopover();
      renderTypeListsFromDraft();
    });
    stampEditSave.addEventListener("click", () => {
      const origName = stampEditOrigName;
      const newName = (stampEditName.value || "").trim();
      if (!origName || DEFAULT_TYPE_NAMES.has(origName)) {
        closeStampEditPopover();
        return;
      }
      if (!newName) {
        try {
          showToast(
            "이름을 비워둘 수 없습니다.",
            "이름을 입력해 주세요.",
          );
        } catch (_) {}
        return;
      }
      if (newName === origName) {
        closeStampEditPopover();
        return;
      }
      if (DEFAULT_TYPE_NAMES.has(newName)) {
        try {
          showToast(
            "기본 유형 이름과 겹칩니다.",
            "다른 이름을 사용해 주세요.",
          );
        } catch (_) {}
        return;
      }
      if (
        draftTypes.some(
          (t) =>
            String(t.name).trim() !== origName &&
            String(t.name).trim() === newName,
        )
      ) {
        try {
          showToast(
            "이미 있는 이름입니다.",
            "다른 이름을 사용해 주세요.",
          );
        } catch (_) {}
        return;
      }
      const t = draftTypes.find((x) => String(x.name) === origName);
      if (!t) {
        closeStampEditPopover();
        return;
      }
      t.name = newName;
      pendingWorkTypeRenames.push({ from: origName, to: newName });
      draftTypes.sort(compareTypeEntriesForPersist);
      closeStampEditPopover();
      renderTypeListsFromDraft();
    });
    stampEditName.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      stampEditSave.click();
    });

    function renderTypeListsFromDraft() {
      draftTypes.sort(compareTypeEntriesForPersist);

      workListEl.replaceChildren();
      draftTypes.forEach((entry) => {
        const isProtected = DEFAULT_TYPE_NAMES.has(entry.name);
        const row = document.createElement("div");
        row.className =
          "work-schedule-type-settings-row work-schedule-type-settings-row--simple time-task-setup-item" +
          (isProtected ? " is-protected" : "");
        row.setAttribute("role", "button");
        row.tabIndex = 0;
        row.setAttribute(
          "aria-label",
          `${entry.name}, 스탬프 편집 열기`,
        );

        const nameSpan = document.createElement("span");
        nameSpan.className =
          "work-schedule-type-settings-name time-task-setup-item-name";
        nameSpan.textContent = entry.name;

        function openRowEditor(ev) {
          if (ev) ev.preventDefault();
          openStampEditPopover(entry.name, isProtected);
        }
        row.addEventListener("click", openRowEditor);
        row.addEventListener("keydown", (ev) => {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          if (ev.key === " ") ev.preventDefault();
          openRowEditor(ev);
        });

        row.appendChild(nameSpan);
        workListEl.appendChild(row);
      });
    }

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
      if (draftTypes.some((o) => o.name === name)) {
        try {
          showToast(
            "이미 있는 이름입니다.",
            "다른 이름을 사용해 주세요.",
          );
        } catch (_) {}
        return;
      }
      if (DEFAULT_TYPE_NAMES.has(name)) {
        try {
          showToast(
            "기본 유형과 같은 이름은 쓸 수 없습니다.",
            "다른 이름을 입력해 주세요.",
          );
        } catch (_) {}
        return;
      }
      draftTypes.push({
        name,
        start: "",
        end: "",
        kind: TYPE_KIND_WORK,
        addedAt: Date.now(),
      });
      draftTypes.sort(compareTypeEntriesForPersist);
      addInput.value = "";
      addInput.blur();
      renderTypeListsFromDraft();
      workListEl.scrollTop = 0;
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

    saveBtn.addEventListener("click", () => {
      if (!stampPopover.hidden) {
        try {
          showToast(
            "스탬프 편집을 마쳐 주세요.",
            "작은 창에서 저장 또는 취소를 눌러 닫은 뒤 다시 시도해 주세요.",
          );
        } catch (_) {}
        try {
          stampEditName.focus();
        } catch (_) {}
        return;
      }
      const renamesSnapshot = pendingWorkTypeRenames.slice();
      try {
        persistWorkTypeDraftToMemAndSync(draftTypes);
        pendingWorkTypeRenames.length = 0;
        cascadeWorkScheduleEntriesWorkTypeRenames(renamesSnapshot);
        repairWorkScheduleRowsWorkTypeByUniqueSuperstring(
          draftTypes.map((t) => String(t?.name || "").trim()).filter(Boolean),
        );
        lastSavedComparable = draftComparableSnapshot();
        detachTypeSettingsModal();
      } catch (err) {
        try {
          showToast(
            "저장에 실패했습니다.",
            String(err?.message || err || "다시 시도해 주세요."),
          );
        } catch (_) {}
      }
    });

    function tryCloseModal() {
      if (!stampPopover.hidden) {
        closeStampEditPopover();
        return;
      }
      if (draftComparableSnapshot() !== lastSavedComparable) {
        if (
          !window.confirm(
            "저장하지 않은 변경이 있습니다. 저장 없이 닫으면 버려집니다. 닫을까요?",
          )
        )
          return;
      }
      detachTypeSettingsModal();
    }

    modal
      .querySelector(".work-schedule-type-settings-close")
      .addEventListener("click", tryCloseModal);

    renderTypeListsFromDraft();
    document.body.appendChild(modal);
    addInput.focus();
  }

  function workTypePillClassForName(typeName) {
    const n = (typeName || "").trim();
    if (!n) return "";
    const entry = getWorkTypeOptionsFull().find((o) => o.name === n);
    if (!entry) return "is-ws-pill-default";
    if (DEFAULT_TYPE_NAMES.has(n)) return "is-ws-pill-builtin";
    return "is-ws-pill-work";
  }


  settingsBtn.addEventListener("click", openWorkTypeSettingsModal);
  const footerSlot = getAppFooterActionsSlot();
  if (footerSlot) {
    settingsBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    footerSlot.appendChild(settingsBtn);
  }

  const contentWrap = document.createElement("div");
  contentWrap.className = "work-schedule-content-wrap calendar-content-wrap";
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
    modal.className =
      "work-schedule-type-settings-modal work-schedule-day-entry-modal todo-list-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "work-schedule-day-entry-title");

    const backdrop = document.createElement("div");
    backdrop.className =
      "work-schedule-type-settings-backdrop todo-list-modal-backdrop";

    const panel = document.createElement("div");
    panel.className =
      "work-schedule-type-settings-panel work-schedule-day-entry-modal-panel todo-list-modal-panel";

    const header = document.createElement("div");
    header.className =
      "work-schedule-type-settings-header todo-list-modal-header";
    const title = document.createElement("h3");
    title.id = "work-schedule-day-entry-title";
    title.className =
      "work-schedule-type-settings-title todo-list-modal-title";
    title.textContent = resolvedEditId ? "스탬프 수정" : "스탬프 등록";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className =
      "work-schedule-type-settings-close todo-list-modal-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.innerHTML = "&times;";
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "work-schedule-day-entry-body todo-list-modal-body";

    const labelDate = document.createElement("label");
    labelDate.className =
      "work-schedule-day-entry-label todo-task-edit-label";
    const spanDate = document.createElement("span");
    spanDate.className = "work-schedule-day-entry-label-text";
    spanDate.textContent = "일자";
    const dateInput = document.createElement("input");
    dateInput.type = "date";
    dateInput.className =
      "work-schedule-day-entry-date time-add-task-name";
    dateInput.value = dateKey;
    labelDate.appendChild(spanDate);
    labelDate.appendChild(dateInput);

    const labelType = document.createElement("label");
    labelType.className =
      "work-schedule-day-entry-label todo-task-edit-label";
    const spanType = document.createElement("span");
    spanType.className = "work-schedule-day-entry-label-text";

    const selectWrap = document.createElement("div");
    selectWrap.className = "work-schedule-day-entry-custom-select";
    const triggerBtn = document.createElement("button");
    triggerBtn.type = "button";
    triggerBtn.className =
      "work-schedule-day-entry-custom-select-trigger time-add-task-name";
    triggerBtn.id = "work-schedule-day-entry-type-trigger";
    triggerBtn.setAttribute("aria-haspopup", "listbox");
    triggerBtn.setAttribute("aria-expanded", "false");
    const listEl = document.createElement("ul");
    listEl.className =
      "work-schedule-day-entry-custom-select-list time-task-select-list";
    listEl.id = "work-schedule-day-entry-type-list";
    listEl.setAttribute("role", "listbox");
    listEl.setAttribute("aria-labelledby", triggerBtn.id);
    triggerBtn.setAttribute("aria-controls", listEl.id);
    listEl.hidden = true;

    let dayEntryTypeOptions = [];
    let dayEntryTypeValue = "";
    let dayEntrySelectListOpen = false;

    function onDayEntrySelectDocDown(ev) {
      if (selectWrap.contains(ev.target) || listEl.contains(ev.target)) return;
      closeDayEntrySelectList();
    }

    function syncDayEntrySelectListPosition() {
      if (!dayEntrySelectListOpen || listEl.hidden) return;
      const tR = triggerBtn.getBoundingClientRect();
      if (tR.width < 1 && tR.height < 1) return;
      const gap = 4;
      const vpH =
        typeof window !== "undefined" && Number.isFinite(window.innerHeight)
          ? window.innerHeight
          : 0;
      const remPx = parseFloat(
        getComputedStyle(document.documentElement).fontSize || "16",
      );
      const maxListPx = 14 * (Number.isFinite(remPx) ? remPx : 16);
      /* 모달·패널 밖으로 나가도 보이게 fixed + 트리거 바로 아래만(제목 안 가림) */
      const spaceBelowVp =
        vpH > 0 ? Math.max(0, vpH - tR.bottom - gap) : maxListPx;
      const maxH = Math.max(72, Math.min(maxListPx, spaceBelowVp));

      listEl.style.position = "fixed";
      listEl.style.boxSizing = "border-box";
      listEl.style.left = `${Math.round(tR.left)}px`;
      listEl.style.width = `${Math.round(tR.width)}px`;
      listEl.style.right = "auto";
      listEl.style.top = `${Math.round(tR.bottom + gap)}px`;
      listEl.style.bottom = "auto";
      listEl.style.zIndex = "10070";
      listEl.style.maxHeight = `${Math.round(maxH)}px`;
      listEl.style.overflowY = "auto";
      listEl.style.marginTop = "";
      listEl.style.marginBottom = "";
    }

    const onDayEntrySelectReposition = () => syncDayEntrySelectListPosition();

    function closeDayEntrySelectList() {
      if (!dayEntrySelectListOpen) return;
      dayEntrySelectListOpen = false;
      try {
        selectWrap.appendChild(listEl);
      } catch (_) {}
      listEl.hidden = true;
      triggerBtn.setAttribute("aria-expanded", "false");
      try {
        document.removeEventListener("pointerdown", onDayEntrySelectDocDown, true);
      } catch (_) {}
      window.removeEventListener("resize", onDayEntrySelectReposition, true);
      window.removeEventListener("scroll", onDayEntrySelectReposition, true);
      try {
        panel.removeEventListener("scroll", onDayEntrySelectReposition, true);
      } catch (_) {}
      try {
        body.removeEventListener("scroll", onDayEntrySelectReposition, true);
      } catch (_) {}
      listEl.style.position = "";
      listEl.style.left = "";
      listEl.style.top = "";
      listEl.style.bottom = "";
      listEl.style.width = "";
      listEl.style.right = "";
      listEl.style.marginTop = "";
      listEl.style.marginBottom = "";
      listEl.style.maxHeight = "";
      listEl.style.zIndex = "";
      listEl.style.overflowY = "";
      listEl.style.boxSizing = "";
    }

    function openDayEntrySelectList() {
      if (dayEntrySelectListOpen) return;
      dayEntrySelectListOpen = true;
      listEl.hidden = false;
      try {
        document.body.appendChild(listEl);
      } catch (_) {}
      triggerBtn.setAttribute("aria-expanded", "true");
      document.addEventListener("pointerdown", onDayEntrySelectDocDown, true);
      window.addEventListener("resize", onDayEntrySelectReposition, true);
      window.addEventListener("scroll", onDayEntrySelectReposition, true);
      panel.addEventListener("scroll", onDayEntrySelectReposition, true);
      body.addEventListener("scroll", onDayEntrySelectReposition, true);
      requestAnimationFrame(() => {
        requestAnimationFrame(syncDayEntrySelectListPosition);
      });
    }

    function toggleDayEntrySelectList() {
      if (dayEntrySelectListOpen) closeDayEntrySelectList();
      else openDayEntrySelectList();
    }

    function updateDayEntryTriggerLabel() {
      const opt = dayEntryTypeOptions.find((o) => o.value === dayEntryTypeValue);
      triggerBtn.textContent = opt ? opt.label : "선택";
      triggerBtn.classList.toggle("is-placeholder-choice", !dayEntryTypeValue);
    }

    function renderDayEntryTypeListOptions() {
      listEl.innerHTML = "";
      dayEntryTypeOptions.forEach((opt) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute(
          "aria-selected",
          opt.value === dayEntryTypeValue ? "true" : "false",
        );
        li.className =
          "work-schedule-day-entry-custom-select-option time-task-select-item";
        if (!opt.value) li.classList.add("is-placeholder");
        li.dataset.value = opt.value;
        li.textContent = opt.label;
        li.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          dayEntryTypeValue = opt.value;
          closeDayEntrySelectList();
          renderDayEntryTypeListOptions();
          updateDayEntryTriggerLabel();
        });
        listEl.appendChild(li);
      });
      if (dayEntrySelectListOpen) {
        requestAnimationFrame(syncDayEntrySelectListPosition);
      }
    }

    function getDayEntryTypeSelectValue() {
      return dayEntryTypeValue;
    }

    triggerBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDayEntrySelectList();
    });

    selectWrap.appendChild(triggerBtn);
    selectWrap.appendChild(listEl);

    function typeNamesForStampDayEntry() {
      const full = getWorkTypeOptionsFull();
      const out = [];
      const seen = new Set();
      full.forEach((o) => {
        const n = (o.name || "").trim();
        if (!n || seen.has(n)) return;
        seen.add(n);
        out.push(n);
      });
      return out;
    }

    function fillDayEntrySelect(preserveValue) {
      closeDayEntrySelectList();
      spanType.textContent = "스탬프";
      triggerBtn.setAttribute("aria-label", "스탬프 유형");
      const names = typeNamesForStampDayEntry();
      dayEntryTypeOptions = names.map((n) => ({ value: n, label: n }));
      const pv = (preserveValue || "").trim();
      dayEntryTypeValue = pv && names.includes(pv) ? pv : "";
      renderDayEntryTypeListOptions();
      updateDayEntryTriggerLabel();
    }

    fillDayEntrySelect(
      resolvedEditId && existingRow
        ? (existingRow.workType || "").trim()
        : "",
    );

    function onWorkScheduleSettingsClosedRefreshEntryTypes() {
      try {
        if (!modal.isConnected) return;
      } catch (_) {
        return;
      }
      fillDayEntrySelect(dayEntryTypeValue);
    }
    window.addEventListener(
      "work-schedule-settings-closed",
      onWorkScheduleSettingsClosedRefreshEntryTypes,
    );

    labelType.appendChild(spanType);
    labelType.appendChild(selectWrap);

    body.appendChild(labelDate);
    body.appendChild(labelType);

    const footer = document.createElement("div");
    footer.className = "todo-list-modal-footer work-schedule-day-entry-footer";
    const footerPrimary = document.createElement("div");
    footerPrimary.className = "work-schedule-day-entry-footer-primary";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "todo-list-modal-confirm work-schedule-day-entry-save";
    saveBtn.textContent = "저장";
    footerPrimary.appendChild(saveBtn);
    const deleteWrap = document.createElement("div");
    deleteWrap.className = "work-schedule-day-entry-delete-wrap";
    deleteWrap.hidden = !resolvedEditId;
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className =
      "work-schedule-day-entry-delete-link todo-list-modal-cancel";
    deleteBtn.textContent = "삭제";
    deleteBtn.setAttribute("aria-label", "이 스탬프 일정 삭제");
    deleteWrap.appendChild(deleteBtn);
    footer.appendChild(footerPrimary);
    footer.appendChild(deleteWrap);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    modal.appendChild(backdrop);
    modal.appendChild(panel);

    function closeModal() {
      closeDayEntrySelectList();
      try {
        window.removeEventListener(
          "work-schedule-settings-closed",
          onWorkScheduleSettingsClosedRefreshEntryTypes,
        );
      } catch (_) {}
      try {
        document.removeEventListener("keydown", onKeyDown);
      } catch (_) {}
      modal.remove();
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        if (dayEntrySelectListOpen) {
          closeDayEntrySelectList();
          return;
        }
        closeModal();
      }
    }

    function onSave() {
      const wd = normalizeWorkDateKey(dateInput.value || "");
      const typeName = (getDayEntryTypeSelectValue() || "").trim();
      if (!wd || wd.length < 10) {
        window.alert("일자를 선택해 주세요.");
        return;
      }
      if (!typeName) {
        window.alert("스탬프 유형을 선택해 주세요.");
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
      triggerBtn.focus();
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
