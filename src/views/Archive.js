/**
 * 아카이브 - 시간기록 메모·태그 목록 (미니멀)
 * 기본: 선택한 월만 표시(부하 완화). 검색어가 있으면 월과 무관하게 전체 기록에서 검색.
 */

import { loadTimeRows, parseTagsFromFeedback } from "./Time.js";
import { updateTimeLedgerEntryFeedbackById } from "../utils/timeLedgerEntriesModel.js";
import { showToast } from "../utils/showToast.js";
import { hydrateTimeLedgerEntriesForArchiveMonth } from "../utils/timeLedgerEntriesSupabase.js";

function formatArchiveDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return "—";
  const s = dateStr.trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (m) return `${m[1]}. ${parseInt(m[2], 10)}. ${parseInt(m[3], 10)}.`;
  return s;
}

function formatArchiveTime(startTime) {
  if (!startTime || typeof startTime !== "string") return "—";
  const m = startTime.match(/[T\s](\d{1,2}):(\d{2})/);
  if (m) return `${String(parseInt(m[1], 10)).padStart(2, "0")}:${m[2]}`;
  return startTime;
}

/** YYYY-MM-DD 등 → 연·월 일치 */
function recordInCalendarMonth(r, year, month) {
  const s = (r.date || "").trim().replace(/\//g, "-");
  const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
  if (!m) return false;
  return parseInt(m[1], 10) === year && parseInt(m[2], 10) === month;
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content archive-view";

  const header = document.createElement("header");
  header.className = "archive-header dream-view-header-wrap";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "ARCHIVE";
  const h = document.createElement("h1");
  h.className = "dream-view-title archive-title";
  h.textContent = "아카이브";
  header.appendChild(label);
  header.appendChild(h);

  const now = new Date();
  let filterYear = now.getFullYear();
  let filterMonth = now.getMonth() + 1;

  const searchRow = document.createElement("div");
  searchRow.className = "archive-search-row";

  const searchWrap = document.createElement("div");
  searchWrap.className = "archive-search-wrap";
  const searchIcon = document.createElement("span");
  searchIcon.className = "archive-search-icon";
  searchIcon.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>';
  searchIcon.setAttribute("aria-hidden", "true");
  const searchInput = document.createElement("input");
  searchInput.type = "search";
  searchInput.className = "archive-search-input";
  searchInput.placeholder = "날짜, 시간, 메모, 태그로 검색";
  searchInput.setAttribute("aria-label", "검색");
  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);

  const monthWrap = document.createElement("div");
  monthWrap.className = "time-filter-month-wrap archive-month-filter";
  monthWrap.setAttribute("data-filter-wrap", "month");
  monthWrap.innerHTML = `
    <div class="asset-cashflow-dropdown-wrap">
      <button type="button" class="time-period-trigger asset-cashflow-trigger" id="archive-month-trigger">${filterMonth}월</button>
      <div class="time-period-panel asset-cashflow-panel" id="archive-month-panel">
        ${Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          return `<div class="time-period-option" data-value="${m}">${m}월</div>`;
        }).join("")}
      </div>
    </div>
    <div class="asset-cashflow-year-nav">
      <button type="button" class="asset-cashflow-year-btn" aria-label="이전 연도">&lt;</button>
      <span class="asset-cashflow-year-display">${filterYear}</span>
      <button type="button" class="asset-cashflow-year-btn" aria-label="다음 연도">&gt;</button>
    </div>
  `;

  const monthTrigger = monthWrap.querySelector("#archive-month-trigger");
  const monthPanel = monthWrap.querySelector("#archive-month-panel");
  const monthDropdownWrap = monthWrap.querySelector(".asset-cashflow-dropdown-wrap");
  const yearDisplay = monthWrap.querySelector(".asset-cashflow-year-display");
  const yearPrevBtn = monthWrap.querySelector(".asset-cashflow-year-btn:first-child");
  const yearNextBtn = monthWrap.querySelector(".asset-cashflow-year-btn:last-child");

  monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
    o.classList.toggle("is-selected", o.dataset.value === String(filterMonth));
  });

  searchRow.appendChild(searchWrap);
  searchRow.appendChild(monthWrap);
  header.appendChild(searchRow);
  el.appendChild(header);

  const listSection = document.createElement("section");
  listSection.className = "archive-list-section";
  const listEl = document.createElement("div");
  listEl.className = "archive-list";

  function buildRecords() {
    const rows = loadTimeRows();
    return rows
      .filter(
        (r) =>
          (r.feedback || "").trim() !== "" ||
          (Array.isArray(r.memoTags) && r.memoTags.length > 0),
      )
      .map((r) => ({
        id: String(r.id || "").trim(),
        date: r.date || "",
        startTime: r.startTime || "",
        memo: (r.feedback || "").trim(),
        tags:
          Array.isArray(r.memoTags) && r.memoTags.length > 0
            ? r.memoTags
            : parseTagsFromFeedback(r.feedback || ""),
      }))
      .sort((a, b) => {
        const da = a.date + (a.startTime || "");
        const db = b.date + (b.startTime || "");
        return db.localeCompare(da);
      });
  }

  let fullRecords = buildRecords();
  let archiveMonthSyncGen = 0;

  function refreshFullRecords() {
    fullRecords = buildRecords();
  }

  function syncArchiveMonthWithServer() {
    if (!el.isConnected) return;
    const gen = ++archiveMonthSyncGen;
    listEl.classList.add("archive-list--syncing");
    void hydrateTimeLedgerEntriesForArchiveMonth(filterYear, filterMonth)
      .catch((e) => console.warn("[archive] month sync", e))
      .finally(() => {
        if (gen !== archiveMonthSyncGen || !el.isConnected) return;
        listEl.classList.remove("archive-list--syncing");
        refreshFullRecords();
        renderList();
      });
  }

  function openArchiveMemoModal(record) {
    const entryId = record.id;
    if (!entryId) {
      showToast("이 기록을 편집할 수 없습니다.", "저장된 행 id가 없어요.");
      return;
    }

    const modal = document.createElement("div");
    modal.className = "todo-list-modal archive-memo-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "archive-memo-modal-title");

    const backdrop = document.createElement("div");
    backdrop.className = "todo-list-modal-backdrop";

    const panel = document.createElement("div");
    panel.className = "todo-list-modal-panel";

    const header = document.createElement("div");
    header.className = "todo-list-modal-header";
    const title = document.createElement("h3");
    title.className = "todo-list-modal-title";
    title.id = "archive-memo-modal-title";
    title.textContent = "메모";
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "todo-list-modal-close";
    closeBtn.setAttribute("aria-label", "닫기");
    closeBtn.textContent = "×";
    header.appendChild(title);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "todo-list-modal-body";
    const lbl = document.createElement("p");
    lbl.className = "todo-list-modal-label";
    lbl.textContent = `${formatArchiveDate(record.date)} · ${formatArchiveTime(record.startTime)}`;
    const ta = document.createElement("textarea");
    ta.className = "archive-memo-modal-textarea";
    ta.rows = 4;
    ta.placeholder = "메모";
    ta.value = record.memo || "";
    body.appendChild(lbl);
    body.appendChild(ta);

    const footer = document.createElement("div");
    footer.className = "todo-list-modal-footer archive-memo-modal-footer";
    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "todo-list-modal-cancel archive-memo-modal-delete";
    delBtn.textContent = "삭제";
    const saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.className = "todo-list-modal-confirm";
    saveBtn.textContent = "저장";
    footer.appendChild(delBtn);
    footer.appendChild(saveBtn);

    modal.appendChild(backdrop);
    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(footer);
    modal.appendChild(panel);

    function close() {
      document.removeEventListener("keydown", onDocKey);
      modal.remove();
      el.style.overflow = "";
    }

    function onDocKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }

    function applyResult(res) {
      if (!res.ok) {
        showToast(res.msg || "저장할 수 없습니다.");
        return;
      }
      refreshFullRecords();
      renderList();
      close();
    }

    function save() {
      applyResult(updateTimeLedgerEntryFeedbackById(entryId, ta.value));
    }

    function onDelete() {
      applyResult(updateTimeLedgerEntryFeedbackById(entryId, ""));
    }

    backdrop.addEventListener("click", close);
    closeBtn.addEventListener("click", close);
    saveBtn.addEventListener("click", save);
    delBtn.addEventListener("click", onDelete);
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
      }
    });

    el.appendChild(modal);
    el.style.overflow = "hidden";
    document.addEventListener("keydown", onDocKey);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(ta.value.length, ta.value.length);
    });
  }

  function filterRecords(records, query) {
    const q = (query || "").trim().toLowerCase();
    if (!q) return records;
    return records.filter((r) => {
      const dateStr = formatArchiveDate(r.date).toLowerCase();
      const timeStr = formatArchiveTime(r.startTime).toLowerCase();
      const memo = (r.memo || "").toLowerCase();
      const tagsStr = (r.tags || []).join(" ").toLowerCase();
      return (
        dateStr.includes(q) ||
        timeStr.includes(q) ||
        memo.includes(q) ||
        tagsStr.includes(q)
      );
    });
  }

  function getRecordsToDisplay() {
    const q = searchInput.value.trim();
    if (q) {
      return { records: filterRecords(fullRecords, q), mode: "search" };
    }
    return {
      records: fullRecords.filter((r) => recordInCalendarMonth(r, filterYear, filterMonth)),
      mode: "month",
    };
  }

  function renderList() {
    const { records, mode } = getRecordsToDisplay();
    listEl.innerHTML = "";
    if (records.length === 0) {
      const empty = document.createElement("p");
      empty.className = "archive-empty";
      empty.textContent =
        mode === "search" ? "검색 결과가 없습니다." : "이 달에 표시할 메모가 없습니다.";
      listEl.appendChild(empty);
      return;
    }
    records.forEach((r) => {
      const card = document.createElement("article");
      card.className = "archive-card archive-card--interactive";
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute("aria-label", "메모 편집");
      const dateEl = document.createElement("time");
      dateEl.className = "archive-card-date";
      dateEl.textContent = formatArchiveDate(r.date);
      const timeEl = document.createElement("span");
      timeEl.className = "archive-card-time";
      timeEl.textContent = formatArchiveTime(r.startTime);
      const meta = document.createElement("div");
      meta.className = "archive-card-meta";
      meta.appendChild(dateEl);
      meta.appendChild(timeEl);
      const memoEl = document.createElement("p");
      memoEl.className = "archive-card-memo";
      memoEl.textContent = r.memo || "";
      card.appendChild(meta);
      card.appendChild(memoEl);
      if (r.tags && r.tags.length > 0) {
        const tagWrap = document.createElement("div");
        tagWrap.className = "archive-card-tags";
        r.tags.forEach((tag) => {
          const pill = document.createElement("span");
          pill.className = "archive-tag-pill";
          pill.textContent = tag;
          tagWrap.appendChild(pill);
        });
        card.appendChild(tagWrap);
      }
      function openMemo() {
        openArchiveMemoModal(r);
      }
      card.addEventListener("click", openMemo);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openMemo();
        }
      });
      listEl.appendChild(card);
    });
  }

  function closeMonthPanel() {
    monthPanel?.classList.remove("is-open");
    monthDropdownWrap?.classList.remove("is-open");
    document.removeEventListener("click", onDocClick);
  }

  function onDocClick(e) {
    if (!monthDropdownWrap?.contains(e.target)) closeMonthPanel();
  }

  monthTrigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const opening = !monthPanel.classList.contains("is-open");
    monthPanel.classList.toggle("is-open");
    monthDropdownWrap.classList.toggle("is-open");
    if (opening) {
      setTimeout(() => document.addEventListener("click", onDocClick), 0);
    } else {
      document.removeEventListener("click", onDocClick);
    }
  });
  monthPanel.querySelectorAll(".time-period-option").forEach((o) => {
    o.addEventListener("click", (e) => {
      e.stopPropagation();
      filterMonth = parseInt(o.dataset.value, 10);
      monthTrigger.textContent = `${filterMonth}월`;
      closeMonthPanel();
      monthPanel.querySelectorAll(".time-period-option").forEach((opt) => {
        opt.classList.toggle("is-selected", opt.dataset.value === String(filterMonth));
      });
      renderList();
      syncArchiveMonthWithServer();
    });
  });
  yearPrevBtn.addEventListener("click", () => {
    filterYear -= 1;
    yearDisplay.textContent = filterYear;
    renderList();
    syncArchiveMonthWithServer();
  });
  yearNextBtn.addEventListener("click", () => {
    filterYear += 1;
    yearDisplay.textContent = filterYear;
    renderList();
    syncArchiveMonthWithServer();
  });

  renderList();
  syncArchiveMonthWithServer();

  searchInput.addEventListener("input", () => {
    renderList();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      renderList();
      searchInput.blur();
    }
  });

  listSection.appendChild(listEl);
  el.appendChild(listSection);

  return el;
}
