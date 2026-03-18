/**
 * 감정관리 - 탭별로 페이지 목록 사이드바 + 빈 종이 콘텐츠
 * - 새 페이지: 기본 제목 "제목없음"
 * - 제목 미지정(제목없음): 사이드바/종이에 날짜 표시
 * - 제목 지정: 해당 제목 표시
 * - 같은 날이어도 제목이 다르면 별도 데이터
 */

import {
  loadDiaryEntries,
  saveDiaryEntries,
  ensureTab3Entries,
  TAB3_EMOTION_TEMPLATE,
  TAB3_EMOTION_PLACEHOLDERS,
} from "../diaryData.js";

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

/** 기존 날짜 기반 데이터를 entry 배열로 마이그레이션 */
function migrateToEntries(tabData) {
  if (Array.isArray(tabData)) return tabData;
  if (tabData && typeof tabData === "object" && !tabData.entries) {
    return Object.entries(tabData).map(([date, v]) => ({
      id: date,
      date,
      title: "제목없음",
      content: v?.content || "",
      updatedAt: v?.updatedAt || new Date().toISOString(),
    }));
  }
  return tabData?.entries || [];
}

function getTabEntriesList(tabId, all) {
  const tab = all[tabId];
  const list = migrateToEntries(tab);
  return list.sort((a, b) => {
    const da = a.updatedAt || a.date;
    const db = b.updatedAt || b.date;
    return da.localeCompare(db);
  });
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content diary-view";

  const header = document.createElement("header");
  header.className = "dream-view-header";
  const label = document.createElement("span");
  label.className = "dream-view-label";
  label.textContent = "DIARY";
  const h = document.createElement("h1");
  h.className = "dream-view-title";
  h.textContent = "감정관리";
  header.appendChild(label);
  header.appendChild(h);
  el.appendChild(header);

  const tabs = document.createElement("div");
  tabs.className = "time-view-tabs diary-tabs";
  tabs.innerHTML = `
    <button type="button" class="time-view-tab diary-tab-btn" data-tab="3">감정관리</button>
    <button type="button" class="time-view-tab diary-tab-btn active" data-tab="2">통제일기</button>
    <button type="button" class="time-view-tab diary-tab-btn" data-tab="1">자유일기</button>
  `;
  el.appendChild(tabs);

  const layoutWrap = document.createElement("div");
  layoutWrap.className = "diary-layout-wrap";

  let currentTabId = "2";
  let currentEntryId = null;
  let searchQuery = "";
  let isComposing = false;
  let sidebarCollapsed = false;
  let entries = loadDiaryEntries();

  function ensureTabEntries(tabId) {
    if (tabId === "3") {
      ensureTab3Entries(entries);
      const list = entries["3"].entries || [];
      return [...list].sort((a, b) => (b.updatedAt || b.date || "").localeCompare(a.updatedAt || a.date || ""));
    }
    const tab = entries[tabId];
    const needsMigration = !tab || !Array.isArray(tab) && !tab.entries;
    const list = getTabEntriesList(tabId, entries);
    if (!entries[tabId] || !entries[tabId].entries) {
      entries[tabId] = { entries: list };
      if (needsMigration) saveDiaryEntries(entries);
    }
    return entries[tabId].entries;
  }

  function getEntryById(tabId, id) {
    const list = ensureTabEntries(tabId);
    return list.find((e) => e.id === id) || null;
  }

  function getDisplayLabel(entry) {
    if (!entry) return "";
    return (entry.title || "").trim() === "제목없음" || !(entry.title || "").trim()
      ? formatDateDisplay(entry.date)
      : entry.title.trim();
  }

  function filterPageListInPlace(query) {
    const pageList = layoutWrap.querySelector(".diary-page-list");
    if (!pageList) return;
    const q = (query || "").trim().toLowerCase();
    const items = pageList.querySelectorAll(".diary-page-item");
    let visibleCount = 0;
    items.forEach((btn) => {
      const searchText = (btn.dataset.searchText || "").toLowerCase();
      const matches = !q || searchText.includes(q);
      btn.style.display = matches ? "" : "none";
      if (matches) visibleCount++;
    });
    let noResult = pageList.querySelector(".diary-search-no-result");
    if (visibleCount === 0 && q) {
      if (!noResult) {
        noResult = document.createElement("div");
        noResult.className = "diary-search-no-result";
        noResult.textContent = "검색 결과가 없습니다.";
        pageList.appendChild(noResult);
      }
      noResult.style.display = "";
    } else if (noResult) {
      noResult.style.display = "none";
    }
  }

  function renderLayout() {
    layoutWrap.innerHTML = "";
    const layout = document.createElement("div");
    layout.className = "diary-layout" + (sidebarCollapsed ? " sidebar-collapsed" : "");

    const sidebar = document.createElement("aside");
    sidebar.className = "diary-sidebar";

    if (currentTabId === "3") {
      ensureTab3Entries(entries);
    }
    {
      const fullEntryList = ensureTabEntries(currentTabId);
      const q = (searchQuery || "").trim().toLowerCase();
      const getEntrySearchText = (e) => {
        let s = (e.title || "") + (e.content || "") + (e.date || "");
        if (e.qa && typeof e.qa === "object") {
          s += Object.values(e.qa).join(" ");
        }
        if (e.q1 != null || e.q2 != null || e.q3 != null || e.q4 != null) {
          s += (e.q1 || "") + (e.q2 || "") + (e.q3 || "") + (e.q4 || "");
        }
        return s.toLowerCase();
      };
      const entryList = q
        ? fullEntryList.filter((e) => getEntrySearchText(e).includes(q))
        : fullEntryList;

      const addPageHandler = () => {
        const today = toDateStr(new Date());
        const id = "e_" + Date.now();
        const newEntry = currentTabId === "3"
          ? { id, date: today, title: "제목없음", q1: "", q2: "", q3: "", q4: "", updatedAt: new Date().toISOString() }
          : {
              id,
              date: today,
              title: "제목없음",
              content: "",
              qa: currentTabId === "2" ? Object.fromEntries(TAB2_QA_TEMPLATE.map((_, i) => [String(i), ""])) : undefined,
              updatedAt: new Date().toISOString(),
            };
        ensureTabEntries(currentTabId);
        entries[currentTabId].entries.push(newEntry);
        saveDiaryEntries(entries);
        currentEntryId = id;
        renderLayout();
        requestAnimationFrame(() => {
          const el = layoutWrap.querySelector(`[data-entry-id="${id}"]`);
          if (el) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        });
      };

      const sidebarHeader = document.createElement("div");
      sidebarHeader.className = "diary-sidebar-header";
      sidebarHeader.innerHTML = `
        <div class="diary-sidebar-actions">
          <button type="button" class="diary-sidebar-collapse diary-sidebar-collapse-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button type="button" class="diary-sidebar-add-btn" title="페이지 추가">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          </button>
        </div>
      `;
      sidebarHeader.querySelector(".diary-sidebar-collapse").addEventListener("click", () => {
        sidebarCollapsed = !sidebarCollapsed;
        renderLayout();
      });
      sidebarHeader.querySelector(".diary-sidebar-add-btn").addEventListener("click", addPageHandler);
      sidebar.appendChild(sidebarHeader);

      const searchRow = document.createElement("div");
      searchRow.className = "diary-search-row";
      const searchInput = document.createElement("input");
      searchInput.type = "text";
      searchInput.className = "diary-search-input";
      searchInput.placeholder = "페이지 검색...";
      searchInput.value = searchQuery;
      searchInput.addEventListener("compositionstart", () => {
        isComposing = true;
      });
      searchInput.addEventListener("compositionend", (e) => {
        isComposing = false;
        searchQuery = e.target.value;
        filterPageListInPlace(searchQuery);
      });
      searchInput.addEventListener("input", () => {
        searchQuery = searchInput.value;
        if (!isComposing) filterPageListInPlace(searchQuery);
      });
      searchRow.appendChild(searchInput);
      sidebar.appendChild(searchRow);

      const pageListScrollWrap = document.createElement("div");
      pageListScrollWrap.className = "diary-page-list-scroll-wrap";

      const pageList = document.createElement("div");
      pageList.className = "diary-page-list";

      fullEntryList.forEach((entry) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "diary-page-item" + (entry.id === currentEntryId ? " active" : "");
        btn.textContent = getDisplayLabel(entry);
        btn.dataset.entryId = entry.id;
        btn.dataset.searchText = getEntrySearchText(entry);
        btn.addEventListener("click", () => {
          currentEntryId = entry.id;
          renderLayout();
        });
        pageList.appendChild(btn);
      });

      pageListScrollWrap.appendChild(pageList);
      sidebar.appendChild(pageListScrollWrap);

      const pageListFooter = document.createElement("div");
      pageListFooter.className = "diary-page-list-footer";
      sidebar.appendChild(pageListFooter);

      layout.appendChild(sidebar);
    }

    // ----- 오른쪽 콘텐츠 (빈 종이) -----
    const contentArea = document.createElement("div");
    contentArea.className = "diary-content-area";
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "diary-content-scroll";
    const paper = document.createElement("div");
    paper.className = "diary-paper";
    const currentEntry = currentEntryId ? getEntryById(currentTabId, currentEntryId) : null;

    if (currentTabId === "3" && currentEntry) {
      paper.className = "diary-paper diary-paper-qa diary-paper-tab3";
      if (!currentEntry.q1 && currentEntry.q1 !== "") currentEntry.q1 = "";
      if (!currentEntry.q2 && currentEntry.q2 !== "") currentEntry.q2 = "";
      if (!currentEntry.q3 && currentEntry.q3 !== "") currentEntry.q3 = "";
      if (!currentEntry.q4 && currentEntry.q4 !== "") currentEntry.q4 = "";
      const titleRow = document.createElement("div");
      titleRow.className = "diary-paper-title-row diary-paper-qa-title-row";
      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.className = "diary-paper-title-input diary-paper-qa-title-input";
      titleInput.value = formatDateDisplay(currentEntry.date || toDateStr(new Date()));
      titleInput.readOnly = true;
      titleInput.style.background = "transparent";
      titleRow.appendChild(titleInput);
      paper.appendChild(titleRow);
      const qaHeader = document.createElement("div");
      qaHeader.className = "diary-paper-qa-header";
      const meta = document.createElement("div");
      meta.className = "diary-paper-meta";
      if (currentEntry.updatedAt) {
        const d = new Date(currentEntry.updatedAt);
        const today = new Date();
        const isToday = d.toDateString() === today.toDateString();
        const timeStr = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
        meta.textContent = isToday ? `마지막 수정: 오늘 ${timeStr}` : `마지막 수정: ${d.toLocaleDateString("ko-KR")} ${timeStr}`;
      } else {
        meta.textContent = "새 일기";
      }
      qaHeader.appendChild(meta);
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "diary-paper-delete-btn diary-paper-delete-btn-qa";
      deleteBtn.title = "페이지 삭제";
      deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
      deleteBtn.addEventListener("click", () => {
        const list = ensureTabEntries("3");
        const idx = list.findIndex((x) => x.id === currentEntry.id);
        if (idx >= 0) {
          list.splice(idx, 1);
          saveDiaryEntries(entries);
          currentEntryId = list.length > 0 ? (list[Math.max(0, idx - 1)] || list[0]).id : null;
          renderLayout();
        }
      });
      qaHeader.appendChild(deleteBtn);
      paper.appendChild(qaHeader);
      TAB3_EMOTION_TEMPLATE.forEach((label, i) => {
        const key = "q" + (i + 1);
        const block = document.createElement("div");
        block.className = "diary-qa-block";
        const qHead = document.createElement("div");
        qHead.className = "diary-qa-question";
        qHead.textContent = label;
        block.appendChild(qHead);
        const ansArea = document.createElement("textarea");
        ansArea.className = "diary-qa-answer";
        ansArea.placeholder = TAB3_EMOTION_PLACEHOLDERS[i] || "";
        ansArea.value = currentEntry[key] != null ? currentEntry[key] : "";
        const adjustHeight = () => {
          ansArea.style.height = "auto";
          ansArea.style.height = Math.max(60, ansArea.scrollHeight) + "px";
        };
        ansArea.addEventListener("input", () => {
          const t = getEntryById(currentTabId, currentEntryId);
          if (t) {
            t[key] = ansArea.value;
            t.updatedAt = new Date().toISOString();
            saveDiaryEntries(entries);
          }
          adjustHeight();
        });
        adjustHeight();
        block.appendChild(ansArea);
        paper.appendChild(block);
      });
    } else if (currentTabId !== "3") {
      if (currentEntry) {
      if (currentTabId === "2") {
        if (!currentEntry.qa || typeof currentEntry.qa !== "object") {
          currentEntry.qa = Object.fromEntries(TAB2_QA_TEMPLATE.map((_, i) => [String(i), ""]));
          saveDiaryEntries(entries);
        }
        paper.className = "diary-paper diary-paper-qa";
        const titleRow = document.createElement("div");
        titleRow.className = "diary-paper-title-row diary-paper-qa-title-row";
        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.className = "diary-paper-title-input diary-paper-qa-title-input";
        const displayTitle =
          (currentEntry.title || "").trim() === "제목없음" || !(currentEntry.title || "").trim()
            ? formatDateDisplay(currentEntry.date || toDateStr(new Date()))
            : currentEntry.title.trim();
        titleInput.value = displayTitle;
        titleInput.placeholder = formatDateDisplay(currentEntry.date || toDateStr(new Date()));
        const applyQaTitle = () => {
          const t = getEntryById(currentTabId, currentEntryId);
          if (t) {
            const v = (titleInput.value || "").trim();
            t.title = v || "제목없음";
            t.updatedAt = new Date().toISOString();
            saveDiaryEntries(entries);
            renderLayout();
          }
        };
        titleInput.addEventListener("input", () => {
          const t = getEntryById(currentTabId, currentEntryId);
          if (t) {
            const v = (titleInput.value || "").trim();
            t.title = v || "제목없음";
            t.updatedAt = new Date().toISOString();
            saveDiaryEntries(entries);
          }
        });
        titleInput.addEventListener("blur", applyQaTitle);
        titleInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            titleInput.blur();
          }
        });
        titleRow.appendChild(titleInput);
        paper.appendChild(titleRow);

        const qaHeader = document.createElement("div");
        qaHeader.className = "diary-paper-qa-header";
        const meta = document.createElement("div");
        meta.className = "diary-paper-meta";
        if (currentEntry.updatedAt) {
          const d = new Date(currentEntry.updatedAt);
          const today = new Date();
          const isToday = d.toDateString() === today.toDateString();
          const timeStr = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
          meta.textContent = isToday ? `마지막 수정: 오늘 ${timeStr}` : `마지막 수정: ${d.toLocaleDateString("ko-KR")} ${timeStr}`;
        } else {
          meta.textContent = "새 일기";
        }
        qaHeader.appendChild(meta);
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "diary-paper-delete-btn diary-paper-delete-btn-qa";
        deleteBtn.title = "페이지 삭제";
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        deleteBtn.addEventListener("click", () => {
          const list = ensureTabEntries(currentTabId);
          const idx = list.findIndex((x) => x.id === currentEntry.id);
          if (idx >= 0) {
            list.splice(idx, 1);
            saveDiaryEntries(entries);
            currentEntryId = list.length > 0 ? (list[Math.max(0, idx - 1)] || list[0]).id : null;
            renderLayout();
          }
        });
        qaHeader.appendChild(deleteBtn);
        paper.appendChild(qaHeader);
        TAB2_QA_TEMPLATE.forEach((question, i) => {
          const block = document.createElement("div");
          block.className = "diary-qa-block";
          const qHead = document.createElement("div");
          qHead.className = "diary-qa-question";
          qHead.textContent = question;
          block.appendChild(qHead);
          const ansArea = document.createElement("textarea");
          ansArea.className = "diary-qa-answer";
          ansArea.placeholder = "";
          ansArea.value = (currentEntry.qa && currentEntry.qa[String(i)]) || "";
          const adjustHeight = () => {
            ansArea.style.height = "auto";
            ansArea.style.height = Math.max(60, ansArea.scrollHeight) + "px";
          };
          ansArea.addEventListener("input", () => {
            const t = getEntryById(currentTabId, currentEntryId);
            if (t) {
              if (!t.qa) t.qa = {};
              t.qa[String(i)] = ansArea.value;
              t.updatedAt = new Date().toISOString();
              saveDiaryEntries(entries);
            }
            adjustHeight();
          });
          adjustHeight();
          block.appendChild(ansArea);
          paper.appendChild(block);
        });
      } else {
        const titleRow = document.createElement("div");
        titleRow.className = "diary-paper-title-row";
        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.className = "diary-paper-title-input";
        const displayTitleFree =
          (currentEntry.title || "").trim() === "제목없음" || !(currentEntry.title || "").trim()
            ? formatDateDisplay(currentEntry.date || toDateStr(new Date()))
            : currentEntry.title.trim();
        titleInput.value = displayTitleFree;
        titleInput.placeholder = formatDateDisplay(currentEntry.date || toDateStr(new Date()));
        titleInput.addEventListener("input", () => {
          const t = getEntryById(currentTabId, currentEntryId);
          if (t) {
            t.title = titleInput.value.trim() || "제목없음";
            t.updatedAt = new Date().toISOString();
            saveDiaryEntries(entries);
          }
        });
        const applyTitle = () => {
          const t = getEntryById(currentTabId, currentEntryId);
          if (t) {
            t.title = (titleInput.value || "").trim() || "제목없음";
            t.updatedAt = new Date().toISOString();
            saveDiaryEntries(entries);
            renderLayout();
          }
        };
        titleInput.addEventListener("blur", applyTitle);
        titleInput.addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            titleInput.blur();
          }
        });
        titleRow.appendChild(titleInput);
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "diary-paper-delete-btn";
        deleteBtn.title = "페이지 삭제";
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        deleteBtn.addEventListener("click", () => {
          const list = ensureTabEntries(currentTabId);
          const idx = list.findIndex((x) => x.id === currentEntry.id);
          if (idx >= 0) {
            list.splice(idx, 1);
            saveDiaryEntries(entries);
            currentEntryId = list.length > 0 ? (list[Math.max(0, idx - 1)] || list[0]).id : null;
            renderLayout();
          }
        });
        titleRow.appendChild(deleteBtn);
        paper.appendChild(titleRow);

        const meta = document.createElement("div");
        meta.className = "diary-paper-meta";
        if (currentEntry.updatedAt) {
          const d = new Date(currentEntry.updatedAt);
          const today = new Date();
          const isToday = d.toDateString() === today.toDateString();
          const timeStr = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
          meta.textContent = isToday ? `마지막 수정: 오늘 ${timeStr}` : `마지막 수정: ${d.toLocaleDateString("ko-KR")} ${timeStr}`;
        } else {
          meta.textContent = "새 일기";
        }
        paper.appendChild(meta);

        const textarea = document.createElement("textarea");
        textarea.className = "diary-paper-text";
        textarea.placeholder = "start writing";
        textarea.value = currentEntry.content || "";
        textarea.addEventListener("input", () => {
          const t = getEntryById(currentTabId, currentEntryId);
          if (t) {
            t.content = textarea.value;
            t.updatedAt = new Date().toISOString();
            saveDiaryEntries(entries);
          }
        });
        paper.appendChild(textarea);
      }
      }
    }

    scrollWrap.appendChild(paper);
    contentArea.appendChild(scrollWrap);
    layout.appendChild(contentArea);
    layoutWrap.appendChild(layout);

    filterPageListInPlace(searchQuery);
  }

  tabs.querySelectorAll(".diary-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.querySelectorAll(".diary-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTabId = btn.dataset.tab;
      const list = ensureTabEntries(currentTabId);
      currentEntryId = list.length > 0 ? list[list.length - 1].id : null;
      renderLayout();
    });
  });

  const initialList = ensureTabEntries("1");
  currentEntryId = initialList.length > 0 ? initialList[0].id : null;
  renderLayout();

  el.appendChild(layoutWrap);
  return el;
}
