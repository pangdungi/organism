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
  pullStampTypesFromSupabase,
  pullWorkScheduleFromSupabase,
  pushStampTypesAfterSettingsSave,
  upsertStampCalendarEntryFromModal,
  deleteStampCalendarEntryFromModal,
} from "../utils/workScheduleSupabase.js";
import { showToast } from "../utils/showToast.js";
import { showConfirmModal } from "../utils/confirmModal.js";
import { initModalNativeDateFieldsIn } from "../utils/modalNativeDateField.js";
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
export const WORK_SCHEDULE_SETTINGS_ICON_SVG =
  '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10"><path d="m19.845 13.561c.1-.505.155-1.027.155-1.561s-.055-1.056-.155-1.561l1.806-1.489c.502-.414.632-1.132.307-1.696l-.869-1.508c-.325-.564-1.011-.811-1.62-.582l-2.198.825c-.779-.684-1.689-1.218-2.691-1.559l-.385-2.316c-.108-.643-.663-1.114-1.314-1.114h-1.738c-.651 0-1.206.471-1.313 1.114l-.386 2.316c-1.002.341-1.912.875-2.691 1.559l-2.198-.825c-.61-.228-1.295.018-1.62.582l-.87 1.508c-.325.564-.195 1.282.307 1.696l1.806 1.489c-.1.505-.155 1.026-.155 1.561s.055 1.056.155 1.561l-1.806 1.489c-.502.414-.632 1.132-.307 1.696l.869 1.508c.325.564 1.011.811 1.62.582l2.198-.825c.779.684 1.689 1.218 2.691 1.559l.385 2.316c.109.643.664 1.114 1.315 1.114h1.738c.651 0 1.206-.471 1.313-1.114l.385-2.316c1.002-.341 1.913-.875 2.691-1.559l2.198.825c.609.229 1.295-.017 1.62-.582l.869-1.508c.325-.564.196-1.282-.307-1.696z"/><circle cx="12.012" cy="12" r="3"/></g></svg>';

const ENTRY_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isStampUuid(s) {
  return typeof s === "string" && ENTRY_ID_RE.test(s.trim());
}

function normalizeTypeEntry(o) {
  if (typeof o === "string")
    return {
      id: "",
      name: (o || "").trim(),
      start: "",
      end: "",
      kind: TYPE_KIND_WORK,
      isBuiltin: DEFAULT_TYPE_NAMES.has((o || "").trim()),
      addedAt: 0,
    };
  const ar = o.addedAt;
  const addedAt =
    typeof ar === "number" && Number.isFinite(ar) ? ar : 0;
  const name = (o.name || "").trim();
  const id = (o.id != null ? String(o.id).trim() : "") || "";
  return {
    id: isStampUuid(id) ? id : "",
    name,
    start: (o.start != null ? String(o.start) : "").trim(),
    end: (o.end != null ? String(o.end) : "").trim(),
    kind: TYPE_KIND_WORK,
    isBuiltin: !!o.isBuiltin || DEFAULT_TYPE_NAMES.has(name),
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
    id: "",
    name: o.name,
    start: o.start || "",
    end: o.end || "",
    kind: TYPE_KIND_WORK,
    isBuiltin: true,
    addedAt: 0,
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
                ...fromStorage,
                name: d.name,
                isBuiltin: true,
              }
            : { ...d },
        );
        seen.add(d.name);
      }
      for (const o of normalized) {
        if (seen.has(o.name)) continue;
        merged.push({ ...o });
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
    id: o.id || "",
    name: o.name,
    start: (o.start || "").trim(),
    end: (o.end || "").trim(),
    kind: TYPE_KIND_WORK,
    isBuiltin: !!o.isBuiltin,
    addedAt:
      typeof o.addedAt === "number" && Number.isFinite(o.addedAt)
        ? o.addedAt
        : 0,
  }));
}

function persistWorkTypeDraftToMem(rawList) {
  const next = sortTypeOptionsList(
    rawList.map((o) => {
      const name = (o.name || "").trim();
      let id = (o.id != null ? String(o.id).trim() : "") || "";
      if (!isStampUuid(id)) {
        id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : "";
      }
      return {
        id,
        name,
        start: (o.start || "").trim(),
        end: (o.end || "").trim(),
        kind: TYPE_KIND_WORK,
        isBuiltin: !!o.isBuiltin || DEFAULT_TYPE_NAMES.has(name),
        addedAt:
          typeof o.addedAt === "number" && Number.isFinite(o.addedAt)
            ? o.addedAt
            : 0,
      };
    }),
  );
  writeWorkScheduleTypeOptionsRawToMem(next);
}

function loadRows() {
  return readWorkScheduleRowsFromMem();
}

function saveRowsToMem(rows) {
  return writeWorkScheduleRowsToMem(rows);
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

async function pullStampCalendarForUi() {
  if (!supabase) return;
  try {
    await pullWorkScheduleFromSupabase({
      includeTypes: true,
      includeEntries: true,
    });
  } catch (_) {}
}

export async function openWorkScheduleTypeSettingsModal() {
    await pullStampCalendarForUi();
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
    function normalizeDraftPersistShape(arr = draftTypes) {
      return sortTypeOptionsList(
        arr.map((o) => normalizeTypeEntry(o)).filter((o) => o.name),
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

    async function openStampEditPopover(entryName, isProtected) {
      try {
        await pullStampTypesFromSupabase();
      } catch (_) {}
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
      t.isBuiltin = DEFAULT_TYPE_NAMES.has(newName);
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
        id:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : "",
        name,
        start: "",
        end: "",
        kind: TYPE_KIND_WORK,
        isBuiltin: false,
        addedAt: Date.now(),
      });
      draftTypes.sort(compareTypeEntriesForPersist);
      addInput.value = "";
      addInput.blur();
      renderTypeListsFromDraft();
      workListEl.scrollTop = 0;
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
        return;
      }
      void (async () => {
        try {
          persistWorkTypeDraftToMem(draftTypes);
          const res = await pushStampTypesAfterSettingsSave();
          if (res && res.ok === false && res.error) {
            showToast(
              "저장에 실패했습니다.",
              String(res.error?.message || res.error || "다시 시도해 주세요."),
            );
            return;
          }
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
      })();
    });

    async function tryCloseModal() {
      if (!stampPopover.hidden) {
        closeStampEditPopover();
        return;
      }
      if (draftComparableSnapshot() !== lastSavedComparable) {
        const ok = await showConfirmModal({
          title: "저장하지 않고 닫기",
          message: "저장하지 않은 변경이 있습니다.",
          warnMessage: "저장 없이 닫으면 변경 내용이 버려집니다.",
          confirmText: "닫기",
          cancelText: "취소",
        });
        if (!ok) return;
      }
      detachTypeSettingsModal();
    }

    modal
      .querySelector(".work-schedule-type-settings-close")
      .addEventListener("click", tryCloseModal);

    renderTypeListsFromDraft();
    document.body.appendChild(modal);
}

/**
 * 스탬프 등록/수정 모달.
 * saveAsCalendarTodo: true면 스탬프 캘린더가 아니라 onCalendarTodoSaved 콜백만 호출(캘린더 할일 추가).
 */
export async function openWorkScheduleDayEntryModal(initialDateKey, opts = {}) {
  const {
    editRowId = null,
    saveAsCalendarTodo = false,
    onCalendarTodoSaved = null,
    onAfterStampSave = null,
  } = opts;
  await pullStampCalendarForUi();
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
  modal.className = "todo-list-modal work-schedule-day-entry-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "work-schedule-day-entry-title");

  const backdrop = document.createElement("div");
  backdrop.className = "todo-list-modal-backdrop";

  const panel = document.createElement("div");
  panel.className =
    "todo-list-modal-panel work-schedule-day-entry-modal-panel";

  const header = document.createElement("div");
  header.className = "todo-list-modal-header";
  const title = document.createElement("h3");
  title.id = "work-schedule-day-entry-title";
  title.className = "todo-list-modal-title";
  title.textContent = resolvedEditId ? "스탬프 수정" : "스탬프 등록";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "todo-list-modal-close";
  closeBtn.setAttribute("aria-label", "닫기");
  closeBtn.innerHTML = "&times;";
  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "todo-list-modal-body work-schedule-day-entry-body";

  const fieldDate = document.createElement("div");
  fieldDate.className = "time-task-log-field";
  const labelDateText = document.createElement("label");
  labelDateText.textContent = "일자";
  const dateWrap = document.createElement("div");
  dateWrap.className = "time-task-log-date-native-wrap";
  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.className = "todo-task-edit-start";
  dateInput.setAttribute("aria-label", "일자");
  dateInput.value = dateKey;
  const dateOverlay = document.createElement("span");
  dateOverlay.className = "time-task-log-date-overlay";
  dateOverlay.setAttribute("aria-hidden", "true");
  dateWrap.appendChild(dateInput);
  dateWrap.appendChild(dateOverlay);
  fieldDate.appendChild(labelDateText);
  fieldDate.appendChild(dateWrap);

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

  function dockDayEntrySelectList() {
    if (listEl.parentElement !== selectWrap) {
      selectWrap.appendChild(listEl);
    }
  }

  function onDayEntrySelectDocDown(ev) {
    if (selectWrap.contains(ev.target) || listEl.contains(ev.target)) return;
    closeDayEntrySelectList();
  }

  function applyDayEntrySelectListFixedLayout() {
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

  function syncDayEntrySelectListPosition() {
    if (!dayEntrySelectListOpen) return;
    applyDayEntrySelectListFixedLayout();
  }

  const onDayEntrySelectReposition = () => syncDayEntrySelectListPosition();

  function closeDayEntrySelectList() {
    if (!dayEntrySelectListOpen) return;
    dayEntrySelectListOpen = false;
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
    dockDayEntrySelectList();
  }

  function openDayEntrySelectList() {
    if (dayEntrySelectListOpen) return;
    dayEntrySelectListOpen = true;
    triggerBtn.setAttribute("aria-expanded", "true");
    if (listEl.parentElement !== document.body) {
      document.body.appendChild(listEl);
    }
    applyDayEntrySelectListFixedLayout();
    listEl.hidden = false;
    document.addEventListener("pointerdown", onDayEntrySelectDocDown, true);
    window.addEventListener("resize", onDayEntrySelectReposition, true);
    window.addEventListener("scroll", onDayEntrySelectReposition, true);
    panel.addEventListener("scroll", onDayEntrySelectReposition, true);
    body.addEventListener("scroll", onDayEntrySelectReposition, true);
    requestAnimationFrame(syncDayEntrySelectListPosition);
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
      li.className = "time-task-select-item";
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

  function stampOptionsForDayEntry() {
    const full = getWorkTypeOptionsFull();
    const out = [];
    const seen = new Set();
    full.forEach((o) => {
      const n = (o.name || "").trim();
      if (!n || seen.has(n)) return;
      seen.add(n);
      const id = (o.id || "").trim();
      out.push({
        value: isStampUuid(id) ? id : n,
        label: n,
      });
    });
    return out;
  }

  function resolveStampSelectValueFromRow(row) {
    if (!row) return "";
    const sid = String(row.stampId || "").trim();
    if (isStampUuid(sid)) return sid;
    const wt = String(row.workType || "").trim();
    if (!wt) return "";
    const hit = getWorkTypeOptionsFull().find((o) => o.name === wt);
    if (hit?.id && isStampUuid(hit.id)) return hit.id;
    return wt;
  }

  function fillDayEntrySelect(preserveValue) {
    closeDayEntrySelectList();
    spanType.textContent = "스탬프";
    triggerBtn.setAttribute("aria-label", "스탬프 유형");
    dayEntryTypeOptions = stampOptionsForDayEntry();
    const pv = (preserveValue || "").trim();
    const match = dayEntryTypeOptions.find(
      (o) => o.value === pv || o.label === pv,
    );
    dayEntryTypeValue = match ? match.value : "";
    renderDayEntryTypeListOptions();
    updateDayEntryTriggerLabel();
  }

  fillDayEntrySelect(
    resolvedEditId && existingRow
      ? resolveStampSelectValueFromRow(existingRow)
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

  body.appendChild(fieldDate);
  body.appendChild(labelType);

  const footer = document.createElement("div");
  footer.className =
    "todo-list-modal-footer todo-task-edit-footer--actions";
  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "time-task-log-delete-btn";
  deleteBtn.textContent = "삭제";
  deleteBtn.setAttribute("aria-label", "이 스탬프 일정 삭제");
  deleteBtn.hidden = saveAsCalendarTodo || !resolvedEditId;
  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.className = "todo-list-modal-confirm";
  saveBtn.textContent = "저장";
  footer.appendChild(deleteBtn);
  footer.appendChild(saveBtn);

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

  async function onSave() {
    const wd = normalizeWorkDateKey(dateInput.value || "");
    const sel = (getDayEntryTypeSelectValue() || "").trim();
    const typeHit = getWorkTypeOptionsFull().find(
      (o) => o.id === sel || o.name === sel,
    );
    const typeName = (typeHit?.name || sel).trim();
    if (!wd || wd.length < 10) {
      window.alert("일자를 선택해 주세요.");
      return;
    }
    if (!typeName) {
      window.alert("스탬프를 선택해 주세요.");
      return;
    }
    if (saveAsCalendarTodo) {
      try {
        onCalendarTodoSaved?.({ dateKey: wd, name: typeName });
      } catch (_) {}
      closeModal();
      return;
    }
    const stampId =
      typeHit?.id && isStampUuid(typeHit.id) ? typeHit.id : "";
    if (!stampId) {
      window.alert(
        "스탬프 설정에서 «저장»한 뒤 다시 시도해 주세요. (스탬프 목록이 서버와 맞지 않습니다.)",
      );
      return;
    }
    const baseFields = {
      workDate: wd,
      workType: typeName,
      stampId,
      startTime: "",
      endTime: "",
      hoursWorked: "",
    };
    let rowToPush;
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
      rowToPush = rows.find((r) => String(r.id) === resolvedEditId);
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
      rowToPush = newRow;
    }
    saveRowsToMem(rows);
    const pushRes = await upsertStampCalendarEntryFromModal(rowToPush);
    if (!pushRes?.ok) {
      try {
        showToast(
          "서버에 저장하지 못했습니다.",
          "잠시 후 다시 시도해 주세요.",
        );
      } catch (_) {}
      return;
    }
    const dp = wd.split("-");
    if (dp.length === 3) {
      const cy = parseInt(dp[0], 10);
      const cm = parseInt(dp[1], 10) - 1;
      if (Number.isFinite(cy) && Number.isFinite(cm) && cm >= 0 && cm <= 11) {
        setWorkScheduleMonthlyViewCursor(cy, cm);
      }
    }
    closeModal();
    try {
      onAfterStampSave?.();
    } catch (_) {}
  }

  closeBtn.addEventListener("click", closeModal);
  deleteBtn.addEventListener("click", () => {
    if (!resolvedEditId || saveAsCalendarTodo) return;
    void (async () => {
      const rows = getMergedInitialRows().filter(
        (r) => String(r.id) !== resolvedEditId,
      );
      saveRowsToMem(rows);
      const delRes = await deleteStampCalendarEntryFromModal(resolvedEditId);
      if (!delRes?.ok) {
        try {
          showToast(
            "서버에서 삭제하지 못했습니다.",
            "잠시 후 다시 시도해 주세요.",
          );
        } catch (_) {}
        return;
      }
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
      try {
        onAfterStampSave?.();
      } catch (_) {}
    })();
  });
  saveBtn.addEventListener("click", () => void onSave());
  document.addEventListener("keydown", onKeyDown);

  document.body.appendChild(modal);
  initModalNativeDateFieldsIn(modal);
  requestAnimationFrame(() => {
    const panelH = panel.offsetHeight;
    if (panelH > 0) panel.style.minHeight = `${panelH}px`;
    triggerBtn.focus();
  });
}

/** 캘린더 날짜 버블: 스탬프 선택 후 해당 날짜 할일로 추가 */
export async function openCalendarStampTodoModal(dateKey, opts = {}) {
  await openWorkScheduleDayEntryModal(dateKey, {
    saveAsCalendarTodo: true,
    onCalendarTodoSaved: opts.onSaved,
  });
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
  settingsBtn.setAttribute("aria-label", "스탬프 설정");
  settingsBtn.title = "스탬프 설정";
  settingsBtn.innerHTML = WORK_SCHEDULE_SETTINGS_ICON_SVG;

  settingsBtn.addEventListener("click", () => void openWorkScheduleTypeSettingsModal());
  const footerSlot = getAppFooterActionsSlot();
  if (footerSlot) {
    settingsBtn.className = APP_FOOTER_ICON_BTN_CLASS;
    footerSlot.appendChild(settingsBtn);
  }

  function workTypePillClassForName(typeName) {
    const n = (typeName || "").trim();
    if (!n) return "";
    const entry = getWorkTypeOptionsFull().find((o) => o.name === n);
    if (!entry) return "is-ws-pill-default";
    if (DEFAULT_TYPE_NAMES.has(n)) return "is-ws-pill-builtin";
    return "is-ws-pill-work";
  }

  const contentWrap = document.createElement("div");
  contentWrap.className = "work-schedule-content-wrap calendar-content-wrap";
  el.appendChild(contentWrap);

  async function openMonthlyDayEntryModal(initialDateKey, editRowId = null) {
    await openWorkScheduleDayEntryModal(initialDateKey, {
      editRowId,
      onAfterStampSave: renderMonthlyView,
    });
  }

  function renderMonthlyView() {
    setWorkScheduleMonthlyLiveRerender(renderMonthlyView);
    contentWrap.innerHTML = "";
    contentWrap.appendChild(
      renderMonthlyContent({
        typeOnly: true,
        typePillClassForName: workTypePillClassForName,
        onDayClick: (key) => void openMonthlyDayEntryModal(key, null),
        onEntryClick: ({ dateKey: dk, rowId }) =>
          void openMonthlyDayEntryModal(dk, rowId),
        onMonthLabelClick: ({ year, month }) =>
          void openMonthlyDayEntryModal(
            defaultDateKeyForCalendarMonth(year, month),
            null,
          ),
      }),
    );
  }

  function refreshMonthlyView(reason = "") {
    wsUiLog("refreshMonthlyView", { reason });
    renderMonthlyView();
  }

  /** App.setActiveTab: pull 후 두 번째 renderMain 대신 — 같은 달·스와이프 상태 유지 */
  window.__lpWorkScheduleSoftRefresh = () => {
    if (!el.isConnected) return;
    const monthly = contentWrap.querySelector(".work-schedule-monthly-content");
    if (typeof monthly?._lpSoftRefreshAfterPull === "function") {
      monthly._lpSoftRefreshAfterPull();
    }
  };

  /* 서버 pull: 탭 진입·설정·날짜/스탬프 모달. push: 저장·삭제·유형 확정 시. */
  if (supabase) {
    refreshMonthlyView("mount-initial-supabase");
  } else {
    refreshMonthlyView("mount-initial-no-supabase");
  }

  return el;
}
