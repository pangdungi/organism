/**
 * 감정일기 - 탭별 날짜 단위 기록
 * - 사이드바·본문 헤더에는 날짜만 표시, 제목 입력 없음
 * - 같은 날짜에 여러 페이지(항목) 가능
 */

import {
  loadDiaryEntries,
  saveDiaryEntries,
  ensureTab3Entries,
  newDiaryEntryId,
  isDiaryEntryUuid,
  TAB3_EMOTION_TEMPLATE,
  TAB3_EMOTION_PLACEHOLDERS,
} from "../diaryData.js";
import { hydrateDiaryFromCloud, deleteDiaryEntryFromSupabase } from "../utils/diarySupabase.js";
import { getAppFooterActionsSlot, APP_FOOTER_ICON_BTN_CLASS } from "../utils/appFooterShell.js";

/** 탭 2 통제일기 Q&A 템플릿 */
const TAB2_QA_TEMPLATE = [
  "오늘 내가 자제하지 못한 나쁜 습관은 무엇인가?",
  "어떻게 해야 더 나아질 수 있는가?",
  "지금 내 행동은 좋은 것인가?",
  "어떻게 스스로를 향상시킬 것인가?",
  "지금 이 순간에 대한 명확한 판단은?",
  "지금 이 순간에 맞는 상식적 행동은?",
  "일이 잘 되어갈 때의 감사한 태도",
  "통제할 수 없는 것",
  "통제할 수 있는 것",
];

/** 푸터·짧은 표기 */
function diaryTabLabel(tabId) {
  if (tabId === "3") return "감정";
  if (tabId === "2") return "통제";
  return "자유";
}

/** 모달 제목 등 긴 표기 */
function diaryTabModalTitle(tabId) {
  if (tabId === "3") return "감정일기";
  if (tabId === "2") return "통제일기";
  return "자유일기";
}

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr || dateStr.length < 10) return "";
  const [y, m, d] = dateStr.split("-");
  return `${y}/${m}/${d}`;
}

function normalizeDiaryDateStr(dateVal) {
  if (!dateVal) return "";
  return String(dateVal).replace(/\//g, "-").slice(0, 10);
}

/** 일기 날짜 내림차순, 같은 날짜면 id 내림차순 */
function compareDiaryEntriesNewestFirst(a, b) {
  const byDate = (b.date || "").localeCompare(a.date || "");
  if (byDate !== 0) return byDate;
  return (b.id || "").localeCompare(a.id || "");
}

/** Q&A 답 영역: 폭 변경 시 autosize 재실행(내부 스크롤 없을 때 잘림 방지) */
function attachDiaryQaAnswerResizeSync(ansEl, adjustHeight) {
  if (!ansEl || typeof ResizeObserver === "undefined") return;
  const block =
    ansEl.closest(".diary-qa-block") ||
    ansEl.closest(".time-task-log-field") ||
    ansEl.closest("[data-lp-diary-qa-block]");
  if (!block) return;
  const ro = new ResizeObserver(() => {
    if (!ansEl.isConnected) {
      ro.disconnect();
      return;
    }
    adjustHeight();
  });
  ro.observe(block);
}

/** 기존 날짜 기반 데이터를 entry 배열로 마이그레이션 */
function migrateToEntries(tabData) {
  if (Array.isArray(tabData)) return tabData;
  if (tabData && typeof tabData === "object" && !tabData.entries) {
    return Object.entries(tabData).map(([date, v]) => ({
      id: date,
      date,
      title: "제목없음",
      content: v?.content || "",
    }));
  }
  return tabData?.entries || [];
}

function getTabEntriesList(tabId, all) {
  const tab = all[tabId];
  const list = migrateToEntries(tab);
  return list.sort(compareDiaryEntriesNewestFirst);
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content diary-view";
  const mobileViewport =
    typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches;
  if (mobileViewport) {
    el.classList.add("diary-view--mobile");
  }

  const inner = document.createElement("div");
  inner.className = "diary-view-inner";
  el.appendChild(inner);

  /** 상단 한 줄: 전역 lp-search-bar + 새 일기(+) — 탭 전환은 앱 푸터 */
  const topTools = document.createElement("div");
  topTools.className = "diary-top-tools";
  const searchBar = document.createElement("div");
  searchBar.className = "lp-search-bar diary-top-inline-search";
  const searchBarRow = document.createElement("div");
  searchBarRow.className = "lp-search-bar__row";
  const searchInput = document.createElement("input");
  searchInput.type = "text";
  searchInput.className = "lp-search-bar__input";
  searchInput.autocomplete = "off";
  searchInput.setAttribute("aria-label", "날짜·내용 검색");
  searchBarRow.appendChild(searchInput);
  searchBar.appendChild(searchBarRow);
  /** 캘린더 일간 네비(.calendar-nav-controls .calendar-1day-nav-add)와 동일 클래스 */
  const topToolsNavControls = document.createElement("div");
  topToolsNavControls.className = "calendar-nav-controls";
  const topAddBtn = document.createElement("button");
  topAddBtn.type = "button";
  topAddBtn.className = "calendar-1day-nav-add";
  topAddBtn.title = "새 일기 작성";
  topAddBtn.setAttribute("aria-label", "새 일기 작성");
  topAddBtn.textContent = "+";
  topToolsNavControls.appendChild(topAddBtn);
  topTools.appendChild(searchBar);
  topTools.appendChild(topToolsNavControls);

  inner.appendChild(topTools);

  const layoutWrap = document.createElement("div");
  layoutWrap.className = "diary-layout-wrap";
  inner.appendChild(layoutWrap);

  let currentTabId = "2";
  let currentEntryId = null;
  let searchQuery = "";
  let isComposing = false;
  let entries = loadDiaryEntries();

  (function mountDiary() {
    searchInput.addEventListener("compositionstart", () => {
      isComposing = true;
    });
    searchInput.addEventListener("compositionend", (e) => {
      isComposing = false;
      searchQuery = e.target.value;
      renderLayout();
    });
    searchInput.addEventListener("input", () => {
      searchQuery = searchInput.value;
      if (!isComposing) renderLayout();
    });

  function notifyServerDeletedEntry(entryId) {
    if (isDiaryEntryUuid(entryId)) {
      void deleteDiaryEntryFromSupabase(entryId).catch(() => {});
    }
  }

  function ensureTabEntries(tabId) {
    if (tabId === "3") {
      ensureTab3Entries(entries);
      const list = entries["3"].entries || [];
      return [...list].sort(compareDiaryEntriesNewestFirst);
    }
    const tab = entries[tabId];
    const needsMigration = !tab || !Array.isArray(tab) && !tab.entries;
    const list = getTabEntriesList(tabId, entries);
    if (!entries[tabId] || !entries[tabId].entries) {
      entries[tabId] = { entries: list };
      if (needsMigration) saveDiaryEntries(entries, { skipCloud: true });
    }
    const raw = entries[tabId].entries;
    return [...raw].sort(compareDiaryEntriesNewestFirst);
  }

  function getTabEntriesRaw(tabId) {
    if (tabId === "3") {
      ensureTab3Entries(entries);
      return entries["3"].entries || [];
    }
    ensureTabEntries(tabId);
    return entries[tabId]?.entries || [];
  }

  function getEntryById(tabId, id) {
    const list = ensureTabEntries(tabId);
    return list.find((e) => e.id === id) || null;
  }

  function getDisplayLabel(entry) {
    if (!entry) return "";
    const d = normalizeDiaryDateStr(entry.date);
    return d ? formatDateDisplay(d) : formatDateDisplay(entry.date) || "";
  }

  /** 날짜 표시 + 숨김 date 입력 + 달력 버튼(데스크톱·모바일 공통) */
  function createDiaryDateEditor(entry, tabId, variant, styleOpts = {}) {
    const lpModal = styleOpts.lpModal === true;
    const bareEmotion = tabId === "3";
    const row = document.createElement("div");
    if (!lpModal) {
      row.className = bareEmotion ? "" : "diary-date-edit-row";
    } else {
      row.className = "diary-date-edit-row diary-date-edit-row--lp-modal";
    }
    const norm = (s) => normalizeDiaryDateStr(s) || toDateStr(new Date());
    const inp = document.createElement("input");
    inp.type = "date";
    inp.className =
      lpModal ? "diary-date-edit-input-native" : bareEmotion ? "" : "diary-date-edit-input-native";
    inp.setAttribute("aria-hidden", "true");
    inp.tabIndex = -1;
    inp.value = norm(entry.date);
    const display = document.createElement("span");
    display.className = bareEmotion ? "" : "diary-date-edit-display";
    if (!bareEmotion) {
      if (variant === "qa-header") {
        display.classList.add("diary-paper-meta", "diary-paper-qa-header-title");
      } else if (variant === "feed") {
        display.classList.add("diary-feed-card-title");
        display.setAttribute("aria-label", "일기 날짜");
      } else if (variant === "free") {
        display.classList.add("diary-paper-date");
        display.setAttribute("aria-label", "일기 날짜");
        display.style.marginBottom = "0";
      } else if (variant === "step") {
        display.classList.add("diary-step-modal-date-display");
      }
    } else if (variant === "qa-header" || variant === "free") {
      display.setAttribute("aria-label", "일기 날짜");
    }
    display.textContent = formatDateDisplay(inp.value);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = bareEmotion ? "" : "diary-date-cal-btn";
    btn.title = "날짜 변경";
    btn.setAttribute("aria-label", "날짜 선택");
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
    btn.addEventListener("click", () => {
      try {
        if (typeof inp.showPicker === "function") inp.showPicker();
        else inp.click();
      } catch (_) {
        inp.click();
      }
    });
    inp.addEventListener("change", () => {
      const v = inp.value;
      if (!v) return;
      display.textContent = formatDateDisplay(v);
      if (norm(entry.date) === v) return;
      entry.date = v;
      saveDiaryEntries(entries, { skipCloud: true });
      renderLayout();
    });
    row.appendChild(display);
    row.appendChild(btn);
    row.appendChild(inp);

    if (lpModal) {
      const field = document.createElement("div");
      field.className = "time-task-log-field";
      const lab = document.createElement("label");
      lab.textContent = "날짜";
      const card = document.createElement("div");
      card.className = "lp-modal-datetime-card";
      card.appendChild(row);
      field.appendChild(lab);
      field.appendChild(card);
      return field;
    }

    return row;
  }

  function diaryDateLabelText(entry) {
    const d = normalizeDiaryDateStr(entry.date) || entry.date;
    return formatDateDisplay(d) || formatDateDisplay(toDateStr(new Date()));
  }

  function createDiaryEditButton(onClick, bareMainCss = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = bareMainCss ? "" : "diary-paper-edit-btn";
    btn.title = "수정";
    btn.setAttribute("aria-label", "일기 수정");
    btn.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="m16.5 3.5 4.5 4.5-12 12H4v-4.5l12-12Z"/></svg>';
    btn.addEventListener("click", onClick);
    return btn;
  }

  function isDiaryMobileViewport() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 48rem)").matches;
  }

  /** 모바일: readonly 쓰지 않음 — iOS 등에서 readonly 입력창 탭 시 자판이 안 뜨므로, 항상 편집 가능하게 두어 첫 탭에 자판이 뜨도록 함 */
  function attachMobileTapToEdit(textEl) {
    if (!isDiaryMobileViewport() || !textEl) return;
  }

  /** 본문·피드·작성/편집 모달: 날짜·Q&A·자유일기 (readOnly 시 미리보기 + 연필) */
  function mountDiaryPaperForm(paper, entry, tabId, opts = {}) {
    const {
      onDelete,
      showDelete = true,
      readOnly = false,
      onEdit,
      feedCard = false,
      lpModalForm = false,
    } = opts;
    const lpForm = lpModalForm && !readOnly;
    if (feedCard && entry && entry.id) paper.dataset.entryId = String(entry.id);
    if (tabId === "3") {
      if (lpForm) {
        paper.className = "diary-modal-paper-root";
      } else if (feedCard) {
        paper.className = "diary-feed-card";
      } else {
        paper.className = "";
      }
      if (!entry.q1 && entry.q1 !== "") entry.q1 = "";
      if (!entry.q2 && entry.q2 !== "") entry.q2 = "";
      if (!entry.q3 && entry.q3 !== "") entry.q3 = "";
      if (!entry.q4 && entry.q4 !== "") entry.q4 = "";
      const qaHeader = document.createElement("div");
      if (readOnly) {
        /* 통제일기와 동일: 피드·본문 모두 .diary-paper-edit-btn 계열로 스타일 적용 */
        qaHeader.className = "diary-paper-qa-header";
        const dateSpan = document.createElement("span");
        dateSpan.className = feedCard
          ? "diary-paper-meta diary-feed-card-title"
          : "diary-paper-meta diary-paper-qa-header-title";
        dateSpan.setAttribute("aria-label", "일기 날짜");
        dateSpan.textContent = diaryDateLabelText(entry);
        qaHeader.appendChild(dateSpan);
        if (typeof onEdit === "function") {
          const eb = createDiaryEditButton(onEdit);
          eb.classList.add("diary-paper-edit-btn-qa");
          qaHeader.appendChild(eb);
        }
      } else {
        qaHeader.className = lpForm ? "diary-modal-paper-header-row" : "";
        const dateRow = createDiaryDateEditor(entry, tabId, "qa-header", { lpModal: lpForm });
        qaHeader.appendChild(dateRow);
        if (showDelete && typeof onDelete === "function") {
          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = lpForm ? "time-task-log-delete-btn" : "";
          deleteBtn.title = "해당 기록 삭제";
          deleteBtn.setAttribute("aria-label", "해당 기록 삭제");
          deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
          deleteBtn.addEventListener("click", onDelete);
          qaHeader.appendChild(deleteBtn);
        }
      }
      paper.appendChild(qaHeader);
      TAB3_EMOTION_TEMPLATE.forEach((label, i) => {
        const key = "q" + (i + 1);
        const block = document.createElement("div");
        block.className = lpForm ? "time-task-log-field" : "";
        block.setAttribute("data-lp-diary-qa-block", "");
        const qHead = document.createElement(lpForm ? "label" : "div");
        qHead.className = "";
        qHead.textContent = label;
        block.appendChild(qHead);
        if (readOnly) {
          const ansEl = document.createElement("textarea");
          ansEl.className = lpForm ? "time-task-log-feedback" : "";
          ansEl.readOnly = true;
          ansEl.tabIndex = -1;
          ansEl.setAttribute("aria-label", "답변");
          ansEl.value = entry[key] != null ? entry[key] : "";
          const adjustRo = () => {
            ansEl.style.height = "auto";
            ansEl.style.height = Math.max(60, ansEl.scrollHeight) + "px";
          };
          block.appendChild(ansEl);
          paper.appendChild(block);
          adjustRo();
          attachDiaryQaAnswerResizeSync(ansEl, adjustRo);
        } else {
          const ansArea = document.createElement("textarea");
          ansArea.className = lpForm ? "time-task-log-feedback" : "";
          ansArea.placeholder = TAB3_EMOTION_PLACEHOLDERS[i] || "";
          ansArea.value = entry[key] != null ? entry[key] : "";
          const adjustHeight = () => {
            ansArea.style.height = "auto";
            ansArea.style.height = Math.max(60, ansArea.scrollHeight) + "px";
          };
          ansArea.addEventListener("input", () => {
            entry[key] = ansArea.value;
            saveDiaryEntries(entries, { skipCloud: true });
            adjustHeight();
          });
          block.appendChild(ansArea);
          paper.appendChild(block);
          adjustHeight();
          attachDiaryQaAnswerResizeSync(ansArea, adjustHeight);
          attachMobileTapToEdit(ansArea);
        }
      });
      return;
    }
    if (tabId === "2") {
      if (!entry.qa || typeof entry.qa !== "object") {
        entry.qa = Object.fromEntries(TAB2_QA_TEMPLATE.map((_, i) => [String(i), ""]));
        saveDiaryEntries(entries, { skipCloud: true });
      }
      paper.className =
        (lpForm ? "diary-paper diary-modal-paper-root diary-paper-qa" : "diary-paper diary-paper-qa") +
        (feedCard ? " diary-feed-card" : "");
      const qaHeader = document.createElement("div");
      qaHeader.className = lpForm ? "diary-modal-paper-header-row diary-paper-qa-header" : "diary-paper-qa-header";
      if (readOnly) {
        const dateSpan = document.createElement("span");
        dateSpan.className = feedCard
          ? "diary-paper-meta diary-feed-card-title"
          : "diary-paper-meta diary-paper-qa-header-title";
        dateSpan.setAttribute("aria-label", "일기 날짜");
        dateSpan.textContent = diaryDateLabelText(entry);
        qaHeader.appendChild(dateSpan);
        if (typeof onEdit === "function") {
          const eb = createDiaryEditButton(onEdit);
          eb.classList.add("diary-paper-edit-btn-qa");
          qaHeader.appendChild(eb);
        }
      } else {
        const dateRow = createDiaryDateEditor(entry, tabId, "qa-header", { lpModal: lpForm });
        qaHeader.appendChild(dateRow);
        if (showDelete && typeof onDelete === "function") {
          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = lpForm ? "time-task-log-delete-btn" : "diary-paper-delete-btn diary-paper-delete-btn-qa";
          deleteBtn.title = "해당 기록 삭제";
          deleteBtn.setAttribute("aria-label", "해당 기록 삭제");
          deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
          deleteBtn.addEventListener("click", onDelete);
          qaHeader.appendChild(deleteBtn);
        }
      }
      paper.appendChild(qaHeader);
      TAB2_QA_TEMPLATE.forEach((question, i) => {
        const block = document.createElement("div");
        block.className = lpForm ? "time-task-log-field" : "diary-qa-block";
        const qHead = document.createElement(lpForm ? "label" : "div");
        qHead.className = lpForm ? "" : "diary-qa-question";
        qHead.textContent = question;
        block.appendChild(qHead);
        if (readOnly) {
          const ansEl = document.createElement("textarea");
          ansEl.className = lpForm ? "time-task-log-feedback" : "diary-qa-answer diary-qa-answer-readonly";
          ansEl.readOnly = true;
          ansEl.tabIndex = -1;
          ansEl.setAttribute("aria-label", "답변");
          ansEl.value = (entry.qa && entry.qa[String(i)]) || "";
          const adjustRo = () => {
            ansEl.style.height = "auto";
            ansEl.style.height = Math.max(60, ansEl.scrollHeight) + "px";
          };
          block.appendChild(ansEl);
          paper.appendChild(block);
          adjustRo();
          attachDiaryQaAnswerResizeSync(ansEl, adjustRo);
        } else {
          const ansArea = document.createElement("textarea");
          ansArea.className = lpForm ? "time-task-log-feedback" : "diary-qa-answer";
          ansArea.placeholder = "";
          ansArea.value = (entry.qa && entry.qa[String(i)]) || "";
          const adjustHeight = () => {
            ansArea.style.height = "auto";
            ansArea.style.height = Math.max(60, ansArea.scrollHeight) + "px";
          };
          ansArea.addEventListener("input", () => {
            if (!entry.qa) entry.qa = {};
            entry.qa[String(i)] = ansArea.value;
            saveDiaryEntries(entries, { skipCloud: true });
            adjustHeight();
          });
          block.appendChild(ansArea);
          paper.appendChild(block);
          adjustHeight();
          attachDiaryQaAnswerResizeSync(ansArea, adjustHeight);
          attachMobileTapToEdit(ansArea);
        }
      });
      return;
    }
    if (tabId === "1") {
      paper.className =
        (lpForm ? "diary-paper diary-modal-paper-root" : "diary-paper") + (feedCard ? " diary-feed-card" : "");
      const titleRow = document.createElement("div");
      titleRow.className = lpForm ? "diary-modal-paper-header-row diary-paper-title-row" : "diary-paper-title-row";
      if (readOnly) {
        const dateSpan = document.createElement("span");
        if (feedCard) {
          dateSpan.className = "diary-paper-meta diary-feed-card-title";
          dateSpan.setAttribute("aria-label", "일기 날짜");
        } else {
          dateSpan.className = "diary-paper-date";
          dateSpan.setAttribute("aria-label", "일기 날짜");
          dateSpan.style.marginBottom = "0";
        }
        dateSpan.textContent = diaryDateLabelText(entry);
        titleRow.appendChild(dateSpan);
        if (typeof onEdit === "function") {
          const eb = createDiaryEditButton(onEdit);
          if (feedCard) eb.classList.add("diary-paper-edit-btn-qa");
          titleRow.appendChild(eb);
        }
      } else {
        const dateRow = createDiaryDateEditor(entry, tabId, "free", { lpModal: lpForm });
        titleRow.appendChild(dateRow);
        if (showDelete && typeof onDelete === "function") {
          const deleteBtn = document.createElement("button");
          deleteBtn.type = "button";
          deleteBtn.className = lpForm ? "time-task-log-delete-btn" : "diary-paper-delete-btn";
          deleteBtn.title = "해당 기록 삭제";
          deleteBtn.setAttribute("aria-label", "해당 기록 삭제");
          deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
          deleteBtn.addEventListener("click", onDelete);
          titleRow.appendChild(deleteBtn);
        }
      }
      paper.appendChild(titleRow);
      if (readOnly) {
        const body = document.createElement("div");
        body.className = "diary-paper-text diary-paper-text-readonly";
        body.textContent = entry.content || "";
        paper.appendChild(body);
      } else {
        const textarea = document.createElement("textarea");
        textarea.className = lpForm ? "time-task-log-feedback" : "diary-paper-text";
        textarea.placeholder = "start writing";
        textarea.value = entry.content || "";
        textarea.addEventListener("input", () => {
          entry.content = textarea.value;
          saveDiaryEntries(entries, { skipCloud: true });
        });
        attachMobileTapToEdit(textarea);
        paper.appendChild(textarea);
      }
    }
  }

  /** opts.draft: 목록에 아직 없는 새 일기 — 「추가」에서만 push·저장, X·배경은 취소 */
  function openDiaryComposeModal(entryOrId, tabId, opts = {}) {
    const draft = opts.draft === true;
    let entry;
    let entryId;
    if (draft) {
      entry = entryOrId;
      if (!entry || entry.id == null) return;
      entryId = entry.id;
    } else {
      entryId = entryOrId;
      entry = getTabEntriesRaw(tabId).find((e) => e.id === entryId);
    }
    if (!entry) return;
    document.querySelectorAll(".diary-desktop-compose-modal").forEach((m) => m.remove());
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal diary-desktop-compose-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const backdrop = document.createElement("div");
    backdrop.className = "diary-desktop-compose-modal-backdrop";
    const panel = document.createElement("div");
    panel.className = "diary-desktop-compose-modal-panel";
    panel.addEventListener("click", (e) => e.stopPropagation());
    const modalHeader = document.createElement("div");
    modalHeader.className = "time-task-setup-header diary-desktop-compose-modal-header";
    const modalTitle = document.createElement("h3");
    modalTitle.className = "time-task-setup-title";
    modalTitle.textContent = diaryTabModalTitle(tabId);
    const closeModalOnly = () => {
      modal.remove();
      renderLayout();
    };
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "time-task-setup-close diary-desktop-compose-modal-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.title = "닫기";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeModalOnly);
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeBtn);
    const scroll = document.createElement("div");
    scroll.className = "diary-desktop-compose-modal-scroll";
    const paper = document.createElement("div");
    mountDiaryPaperForm(paper, entry, tabId, { showDelete: false, lpModalForm: true });
    scroll.appendChild(paper);
    const footer = document.createElement("div");
    footer.className = "diary-desktop-compose-modal-footer";
    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "time-task-log-submit diary-desktop-compose-modal-confirm";
    confirmBtn.textContent = "추가";
    confirmBtn.addEventListener("click", () => {
      if (draft) {
        const rawList = getTabEntriesRaw(tabId);
        rawList.push(entry);
        saveDiaryEntries(entries);
      }
      currentEntryId = entryId;
      currentTabId = tabId;
      modal.remove();
      renderLayout();
      requestAnimationFrame(() => {
        const hit = layoutWrap.querySelector(`[data-entry-id="${entryId}"]`);
        if (hit) hit.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
    footer.appendChild(confirmBtn);
    panel.appendChild(modalHeader);
    panel.appendChild(scroll);
    panel.appendChild(footer);
    modal.appendChild(backdrop);
    modal.appendChild(panel);
    document.body.appendChild(modal);
  }

  function openDiaryEditModal(entryId, tabId) {
    const entry = getTabEntriesRaw(tabId).find((e) => e.id === entryId);
    if (!entry) return;
    document.querySelectorAll(".diary-desktop-compose-modal").forEach((m) => m.remove());
    const modal = document.createElement("div");
    modal.className = "time-task-setup-modal diary-desktop-compose-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    const backdrop = document.createElement("div");
    backdrop.className = "diary-desktop-compose-modal-backdrop";
    const panel = document.createElement("div");
    panel.className = "diary-desktop-compose-modal-panel";
    panel.addEventListener("click", (e) => e.stopPropagation());
    const modalHeader = document.createElement("div");
    modalHeader.className = "time-task-setup-header diary-desktop-compose-modal-header";
    const modalTitle = document.createElement("h3");
    modalTitle.className = "time-task-setup-title";
    modalTitle.textContent = diaryTabModalTitle(tabId);
    const closeModalOnly = () => {
      modal.remove();
      renderLayout();
    };
    const handleEditModalDelete = () => {
      const list = getTabEntriesRaw(tabId);
      const idx = list.findIndex((x) => x.id === entry.id);
      if (idx >= 0) {
        list.splice(idx, 1);
        saveDiaryEntries(entries, { skipCloud: true });
        notifyServerDeletedEntry(entry.id);
        currentEntryId = list.length > 0 ? list[0].id : null;
      }
      modal.remove();
      renderLayout();
    };
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "time-task-setup-close diary-desktop-compose-modal-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.title = "닫기";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", closeModalOnly);
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeBtn);
    const scroll = document.createElement("div");
    scroll.className = "diary-desktop-compose-modal-scroll";
    const paper = document.createElement("div");
    mountDiaryPaperForm(paper, entry, tabId, {
      showDelete: tabId !== "3",
      onDelete: handleEditModalDelete,
      lpModalForm: true,
    });
    scroll.appendChild(paper);
    const footer = document.createElement("div");
    footer.className = "diary-desktop-compose-modal-footer";
    if (tabId === "3") {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "time-task-log-delete-btn";
      deleteBtn.title = "해당 기록 삭제";
      deleteBtn.setAttribute("aria-label", "해당 기록 삭제");
      deleteBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
      deleteBtn.addEventListener("click", handleEditModalDelete);
      footer.appendChild(deleteBtn);
    }
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "time-task-log-submit diary-desktop-compose-modal-confirm";
    saveBtn.textContent = "수정";
    saveBtn.addEventListener("click", () => {
      saveDiaryEntries(entries);
      currentEntryId = entryId;
      currentTabId = tabId;
      modal.remove();
      renderLayout();
      requestAnimationFrame(() => {
        const hit = layoutWrap.querySelector(`[data-entry-id="${entryId}"]`);
        if (hit) hit.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    });
    footer.appendChild(saveBtn);
    panel.appendChild(modalHeader);
    panel.appendChild(scroll);
    panel.appendChild(footer);
    modal.appendChild(backdrop);
    modal.appendChild(panel);
    document.body.appendChild(modal);
  }

  const DIARY_FOOTER_TAB_ORDER = ["3", "2", "1"];

  function syncDiaryFooterSubtabs() {
    document.querySelectorAll("[data-diary-subtab]").forEach((b) => {
      const id = b.getAttribute("data-diary-subtab");
      b.setAttribute("aria-pressed", id === currentTabId ? "true" : "false");
    });
  }

  function mountDiaryFooterSubtabs() {
    const slot = getAppFooterActionsSlot();
    if (!slot) return;
    for (const id of DIARY_FOOTER_TAB_ORDER) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = APP_FOOTER_ICON_BTN_CLASS;
      b.setAttribute("data-diary-subtab", id);
      b.textContent = diaryTabLabel(id);
      b.title = diaryTabModalTitle(id);
      b.setAttribute("aria-label", diaryTabModalTitle(id));
      b.addEventListener("click", () => {
        currentTabId = id;
        const list = ensureTabEntries(currentTabId);
        currentEntryId = list.length > 0 ? list[0].id : null;
        renderLayout();
      });
      slot.appendChild(b);
    }
  }

  function renderLayout() {
    layoutWrap.dataset.diaryTab = currentTabId;
    layoutWrap.innerHTML = "";
    searchInput.value = searchQuery;
    searchInput.placeholder = currentTabId === "3" ? "" : "날짜·내용 검색...";
    const mobile = isDiaryMobileViewport();
    /* 데스크톱·모바일 동일: 날짜 사이드바 없이 카드 피드만 스크롤 */
    inner.classList.remove("diary-view-inner--desktop-mac-diary");
    el.classList.remove("diary-view--desktop-mac-diary");
    const layout = document.createElement("div");
    layout.className =
      "diary-layout diary-layout--feed-only" +
      (!mobile ? " diary-layout--no-sidebar" : "") +
      (mobile ? " diary-layout--mobile" : "");

    if (currentTabId === "3") {
      ensureTab3Entries(entries);
    }

    if (!DIARY_FOOTER_TAB_ORDER.includes(currentTabId)) {
      currentTabId = "2";
    }

    const fullEntryList = ensureTabEntries(currentTabId);
    if (fullEntryList.length > 0 && (!currentEntryId || !fullEntryList.some((e) => e.id === currentEntryId))) {
      currentEntryId = fullEntryList[0].id;
    }

    const getEntrySearchText = (e) => {
      let s = (e.content || "") + (e.date || "");
      if (e.qa && typeof e.qa === "object") {
        s += Object.values(e.qa).join(" ");
      }
      if (e.q1 != null || e.q2 != null || e.q3 != null || e.q4 != null) {
        s += (e.q1 || "") + (e.q2 || "") + (e.q3 || "") + (e.q4 || "");
      }
      return s.toLowerCase();
    };

    const qTrim = (searchQuery || "").trim().toLowerCase();
    /** 항목이 있으면 모바일·데스크톱 공통 카드 피드(스크롤) */
    const cardFeedMode = fullEntryList.length > 0;
    const cardFeedEntries =
      cardFeedMode && qTrim
        ? fullEntryList.filter((e) => getEntrySearchText(e).includes(qTrim))
        : fullEntryList;

    const addPageHandler = () => {
      const today = toDateStr(new Date());
      ensureTabEntries(currentTabId);
      const rawList = getTabEntriesRaw(currentTabId);
      const id = newDiaryEntryId();
      const newEntry =
        currentTabId === "3"
          ? { id, date: today, title: "제목없음", q1: "", q2: "", q3: "", q4: "" }
          : {
              id,
              date: today,
              title: "제목없음",
              content: "",
              qa: currentTabId === "2" ? Object.fromEntries(TAB2_QA_TEMPLATE.map((_, i) => [String(i), ""])) : undefined,
            };
      openDiaryComposeModal(newEntry, currentTabId, { draft: true });
    };

    topAddBtn.onclick = () => {
      addPageHandler();
    };

    // ----- 본문: 스크롤 영역만 (사이드바 없음) -----
    const contentArea = document.createElement("div");
    contentArea.className = "diary-content-area";
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "diary-content-scroll";
    const paper = document.createElement("div");
    paper.className = currentTabId === "3" ? "" : "diary-paper";
    const currentEntry = currentEntryId ? getEntryById(currentTabId, currentEntryId) : null;

    if (cardFeedMode) {
      if (qTrim && cardFeedEntries.length === 0) {
        const noResult = document.createElement("div");
        noResult.className = "diary-search-no-result";
        noResult.textContent = "검색 결과가 없습니다.";
        scrollWrap.appendChild(noResult);
      } else {
      cardFeedEntries.forEach((entry) => {
        const card = document.createElement("div");
        mountDiaryPaperForm(card, entry, currentTabId, {
          readOnly: true,
          showDelete: false,
          feedCard: true,
          onEdit: () => openDiaryEditModal(entry.id, currentTabId),
        });
        scrollWrap.appendChild(card);
      });
      }
    } else if (currentTabId === "3" && currentEntry) {
      mountDiaryPaperForm(paper, currentEntry, "3", {
        readOnly: true,
        showDelete: false,
        onEdit: () => openDiaryEditModal(currentEntry.id, "3"),
      });
    } else if (currentTabId === "2" && currentEntry) {
      mountDiaryPaperForm(paper, currentEntry, "2", {
        readOnly: true,
        showDelete: false,
        onEdit: () => openDiaryEditModal(currentEntry.id, "2"),
      });
    } else if (currentTabId === "1" && currentEntry) {
      mountDiaryPaperForm(paper, currentEntry, "1", {
        readOnly: true,
        showDelete: false,
        onEdit: () => openDiaryEditModal(currentEntry.id, "1"),
      });
    }

    if (!cardFeedMode) {
      const showMainPaper =
        (currentTabId === "3" && currentEntry) ||
        (currentTabId === "2" && currentEntry) ||
        (currentTabId === "1" && currentEntry);
      if (showMainPaper) {
        scrollWrap.appendChild(paper);
      }
    }
    contentArea.appendChild(scrollWrap);
    layout.appendChild(contentArea);
    layoutWrap.appendChild(layout);

    syncDiaryFooterSubtabs();
  }

    mountDiaryFooterSubtabs();
    const initialList = ensureTabEntries(currentTabId);
    currentEntryId = initialList.length > 0 ? initialList[0].id : null;
    renderLayout();

    void hydrateDiaryFromCloud()
      .catch(() => {})
      .finally(() => {
        entries = loadDiaryEntries();
        const alist = ensureTabEntries(currentTabId);
        if (currentEntryId && !alist.some((e) => e.id === currentEntryId)) {
          currentEntryId = alist.length > 0 ? alist[0].id : null;
        }
        renderLayout();
      });
  })();

  return el;
}
