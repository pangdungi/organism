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
    const da = a.updatedAt || a.date || "";
    const db = b.updatedAt || b.date || "";
    return db.localeCompare(da);
  });
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content diary-view";
  const mobileViewport =
    typeof window !== "undefined" && window.matchMedia("(max-width: 45.9375rem)").matches;
  if (mobileViewport) {
    el.classList.add("diary-view--mobile");
  }

  if (!mobileViewport) {
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
  } else {
    const header = document.createElement("header");
    header.className = "dream-view-header diary-mobile-header";
    const h = document.createElement("h1");
    h.className = "dream-view-title";
    h.textContent = "감정기록";
    header.appendChild(h);
    el.appendChild(header);
  }

  const tabs = document.createElement("div");
  tabs.className = "time-view-tabs diary-tabs";
  if (!mobileViewport) {
    tabs.innerHTML = `
      <button type="button" class="time-view-tab diary-tab-btn" data-tab="3">감정관리</button>
      <button type="button" class="time-view-tab diary-tab-btn active" data-tab="2">통제일기</button>
      <button type="button" class="time-view-tab diary-tab-btn" data-tab="1">자유일기</button>
    `;
  }
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
    const raw = entries[tabId].entries;
    return [...raw].sort((a, b) => (b.updatedAt || b.date || "").localeCompare(a.updatedAt || a.date || ""));
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

  function isDiaryMobileViewport() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 45.9375rem)").matches;
  }

  /** 모바일: readonly 쓰지 않음 — iOS 등에서 readonly 입력창 탭 시 자판이 안 뜨므로, 항상 편집 가능하게 두어 첫 탭에 자판이 뜨도록 함 */
  function attachMobileTapToEdit(textEl) {
    if (!isDiaryMobileViewport() || !textEl) return;
  }

  function renderLayout() {
    layoutWrap.innerHTML = "";
    const mobile = isDiaryMobileViewport();
    const layout = document.createElement("div");
    layout.className =
      "diary-layout" +
      (!mobile && sidebarCollapsed ? " sidebar-collapsed" : "") +
      (mobile ? " diary-layout--mobile" : "");

    if (currentTabId === "3") {
      ensureTab3Entries(entries);
    }

    const fullEntryList = ensureTabEntries(currentTabId);
    if (fullEntryList.length > 0 && (!currentEntryId || !fullEntryList.some((e) => e.id === currentEntryId))) {
      currentEntryId = fullEntryList[0].id;
    }

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

    const addPageHandler = () => {
      const today = toDateStr(new Date());
      const id = "e_" + Date.now();
      const newEntry =
        currentTabId === "3"
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
        const hit = layoutWrap.querySelector(`[data-entry-id="${id}"]`);
        if (hit) hit.scrollIntoView({ block: "nearest", behavior: "smooth" });
      });
    };

    function getTabLabel(tabId) {
      if (tabId === "3") return "감정관리";
      if (tabId === "2") return "통제일기";
      return "자유일기";
    }

    function getTabIdsWithEntries() {
      const ids = [];
      ["3", "2", "1"].forEach((id) => {
        ensureTabEntries(id);
        const list = id === "3" ? (entries["3"]?.entries || []) : (entries[id]?.entries || []);
        if (list.length > 0) ids.push(id);
      });
      return ids.length ? ids : ["3", "2", "1"];
    }

    function updateMobileTabs() {
      if (!isDiaryMobileViewport()) return;
      const tabIds = getTabIdsWithEntries();
      if (!tabIds.includes(currentTabId)) {
        currentTabId = tabIds[0];
        const list = ensureTabEntries(currentTabId);
        currentEntryId = list.length > 0 ? list[list.length - 1].id : null;
      }
      tabs.innerHTML = tabIds
        .map(
          (id) =>
            `<button type="button" class="time-view-tab diary-tab-btn${id === currentTabId ? " active" : ""}" data-tab="${id}">${getTabLabel(id)}</button>`
        )
        .join("");
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
    }

    function openAddModal() {
      const today = toDateStr(new Date());
      const modal = document.createElement("div");
      modal.className = "diary-add-modal";
      modal.innerHTML = `
        <div class="diary-add-modal-backdrop"></div>
        <div class="diary-add-modal-panel">
          <div class="diary-add-modal-header">
            <h3 class="diary-add-modal-title">일기 추가</h3>
            <button type="button" class="diary-add-modal-close" aria-label="닫기">×</button>
          </div>
          <div class="diary-add-modal-body">
            <p class="diary-add-modal-label">유형</p>
            <div class="diary-add-modal-radios">
              <label class="diary-add-modal-radio"><input type="radio" name="diary-type" value="3" /> 감정관리</label>
              <label class="diary-add-modal-radio"><input type="radio" name="diary-type" value="2" checked /> 통제일기</label>
              <label class="diary-add-modal-radio"><input type="radio" name="diary-type" value="1" /> 자유일기</label>
            </div>
            <p class="diary-add-modal-label">날짜</p>
            <input type="date" class="diary-add-modal-date" value="${today}" />
          </div>
          <div class="diary-add-modal-footer">
            <button type="button" class="diary-add-modal-confirm">확인</button>
          </div>
        </div>
      `;
      const close = () => {
        modal.remove();
      };
      modal.querySelector(".diary-add-modal-backdrop").addEventListener("click", close);
      modal.querySelector(".diary-add-modal-close").addEventListener("click", close);
      modal.querySelector(".diary-add-modal-confirm").addEventListener("click", () => {
        const typeRadio = modal.querySelector('input[name="diary-type"]:checked');
        const tabId = typeRadio ? typeRadio.value : "2";
        const dateInput = modal.querySelector(".diary-add-modal-date");
        const dateStr = dateInput ? dateInput.value : today;
        close();
        const id = "e_" + Date.now();
        ensureTabEntries(tabId);
        const newEntry =
          tabId === "3"
            ? { id, date: dateStr, title: "제목없음", q1: "", q2: "", q3: "", q4: "", updatedAt: new Date().toISOString() }
            : tabId === "2"
              ? {
                  id,
                  date: dateStr,
                  title: "제목없음",
                  content: "",
                  qa: Object.fromEntries(TAB2_QA_TEMPLATE.map((_, i) => [String(i), ""])),
                  updatedAt: new Date().toISOString(),
                }
              : { id, date: dateStr, title: "제목없음", content: "", updatedAt: new Date().toISOString() };
        entries[tabId].entries.push(newEntry);
        saveDiaryEntries(entries);
        openStepModal(newEntry, tabId);
      });
      document.body.appendChild(modal);
    }

    function openStepModal(entry, tabId) {
      const questions =
        tabId === "3"
          ? TAB3_EMOTION_TEMPLATE.map((q, i) => ({ q, placeholder: TAB3_EMOTION_PLACEHOLDERS[i] || "", key: "q" + (i + 1) }))
          : tabId === "2"
            ? TAB2_QA_TEMPLATE.map((q, i) => ({ q, placeholder: "", key: String(i) }))
            : [{ q: "내용", placeholder: "start writing", key: "content" }];
      const answers = {};
      questions.forEach(({ key }) => {
        if (tabId === "2" && entry.qa && entry.qa[key] !== undefined) answers[key] = entry.qa[key];
        else if (tabId === "3" && entry[key] !== undefined) answers[key] = entry[key];
        else if (key === "content") answers[key] = entry.content || "";
        else answers[key] = "";
      });
      let step = 0;
      const total = questions.length;
      const modal = document.createElement("div");
      modal.className = "diary-step-modal";
      const saveCurrentAnswer = () => {
        const { key } = questions[step];
        const ta = modal.querySelector(".diary-step-modal-answer");
        if (ta) answers[key] = ta.value;
        if (tabId === "2") {
          if (!entry.qa) entry.qa = {};
          entry.qa[key] = answers[key] ?? "";
        } else if (tabId === "3") {
          entry[key] = answers[key] ?? "";
        } else {
          entry.content = answers[key] ?? "";
        }
        entry.updatedAt = new Date().toISOString();
        saveDiaryEntries(entries);
      };

      const flushAllAnswersToEntry = () => {
        questions.forEach(({ key }) => {
          const val = answers[key] ?? "";
          if (tabId === "2") {
            if (!entry.qa) entry.qa = {};
            entry.qa[key] = val;
          } else if (tabId === "3") {
            entry[key] = val;
          } else {
            entry.content = val;
          }
        });
        entry.updatedAt = new Date().toISOString();
        saveDiaryEntries(entries);
      };

      const backSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m11 5-8 7 8 7"/><path d="m3 12h18"/></svg>';
      const nextSvg =
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m13 19 8-7-8-7"/><path d="m21 12h-18"/></svg>';

      function renderStep() {
        const { q, placeholder, key } = questions[step];
        const isFirst = step === 0;
        const isLast = step === total - 1;
        modal.innerHTML = `
          <div class="diary-step-modal-backdrop"></div>
          <div class="diary-step-modal-panel">
            <div class="diary-step-modal-header">
              <span class="diary-step-modal-progress">${step + 1} / ${total}</span>
              <button type="button" class="diary-step-modal-close" aria-label="닫기">×</button>
            </div>
            <div class="diary-step-modal-body">
              <p class="diary-step-modal-question">${q}</p>
              <textarea class="diary-step-modal-answer" rows="4" placeholder="${placeholder}">${answers[key] || ""}</textarea>
            </div>
            <div class="diary-step-modal-footer">
              <button type="button" class="diary-step-modal-prev" aria-label="이전" ${isFirst ? " disabled" : ""}>${backSvg}</button>
              <button type="button" class="diary-step-modal-next">${isLast ? "완료" : nextSvg}</button>
            </div>
          </div>
        `;
        const ta = modal.querySelector(".diary-step-modal-answer");
        ta.addEventListener("input", () => {
          answers[key] = ta.value;
        });
        modal.querySelector(".diary-step-modal-close").addEventListener("click", () => modal.remove());
        modal.querySelector(".diary-step-modal-backdrop").addEventListener("click", () => modal.remove());

        modal.querySelector(".diary-step-modal-prev").addEventListener("click", () => {
          if (step === 0) return;
          saveCurrentAnswer();
          step--;
          renderStep();
        });

        modal.querySelector(".diary-step-modal-next").addEventListener("click", () => {
          saveCurrentAnswer();
          if (isLast) {
            const ta = modal.querySelector(".diary-step-modal-answer");
            if (ta) answers[questions[step].key] = ta.value;
            flushAllAnswersToEntry();
            modal.remove();
            currentTabId = tabId;
            currentEntryId = entry.id;
            updateMobileTabs();
            renderLayout();
          } else {
            step++;
            renderStep();
          }
        });
      }
      renderStep();
      document.body.appendChild(modal);
    }

    if (!mobile) {
      const sidebar = document.createElement("aside");
      sidebar.className = "diary-sidebar";

      const sidebarHeader = document.createElement("div");
      sidebarHeader.className = "diary-sidebar-header";
      sidebarHeader.innerHTML = `
        <div class="diary-sidebar-actions">
          <button type="button" class="diary-sidebar-collapse diary-sidebar-collapse-btn">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button type="button" class="diary-sidebar-add-btn" title="페이지 추가">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
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

      layout.appendChild(sidebar);
    } else {
      const bar = document.createElement("div");
      bar.className = "diary-mobile-entry-bar";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "diary-mobile-add-btn diary-mobile-add-btn-primary";
      addBtn.title = "일기 추가";
      addBtn.setAttribute("aria-label", "일기 추가");
      addBtn.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
      addBtn.addEventListener("click", openAddModal);
      bar.appendChild(addBtn);
      layout.appendChild(bar);
    }

    // ----- 오른쪽 콘텐츠 (빈 종이) -----
    const contentArea = document.createElement("div");
    contentArea.className = "diary-content-area";
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "diary-content-scroll";
    const paper = document.createElement("div");
    paper.className = "diary-paper";
    const currentEntry = currentEntryId ? getEntryById(currentTabId, currentEntryId) : null;

    if (mobile && fullEntryList.length > 0) {
      fullEntryList.forEach((entry) => {
        const card = document.createElement("div");
        card.className = "diary-paper diary-paper-qa diary-feed-card" + (currentTabId === "3" ? " diary-paper-tab3" : "");
        const qaHeader = document.createElement("div");
        qaHeader.className = "diary-paper-qa-header";
        const titleInput = document.createElement("input");
        titleInput.type = "text";
        titleInput.className = "diary-paper-meta diary-feed-card-title";
        const displayTitle =
          (entry.title || "").trim() === "제목없음" || !(entry.title || "").trim()
            ? formatDateDisplay(entry.date || toDateStr(new Date()))
            : (entry.title || "").trim();
        titleInput.value = displayTitle;
        titleInput.placeholder = formatDateDisplay(entry.date || toDateStr(new Date()));
        titleInput.addEventListener("input", () => {
          entry.title = (titleInput.value || "").trim() || "제목없음";
          entry.updatedAt = new Date().toISOString();
          saveDiaryEntries(entries);
        });
        titleInput.addEventListener("blur", () => {
          const v = (titleInput.value || "").trim();
          entry.title = v || "제목없음";
          entry.updatedAt = new Date().toISOString();
          saveDiaryEntries(entries);
        });
        qaHeader.appendChild(titleInput);
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "diary-paper-delete-btn diary-paper-delete-btn-qa";
        deleteBtn.title = "삭제";
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        deleteBtn.addEventListener("click", () => {
          const list = ensureTabEntries(currentTabId);
          const idx = list.findIndex((x) => x.id === entry.id);
          if (idx >= 0) {
            list.splice(idx, 1);
            saveDiaryEntries(entries);
            renderLayout();
          }
        });
        qaHeader.appendChild(deleteBtn);
        card.appendChild(qaHeader);
        if (currentTabId === "3") {
          if (!entry.q1 && entry.q1 !== "") entry.q1 = "";
          if (!entry.q2 && entry.q2 !== "") entry.q2 = "";
          if (!entry.q3 && entry.q3 !== "") entry.q3 = "";
          if (!entry.q4 && entry.q4 !== "") entry.q4 = "";
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
            ansArea.value = entry[key] != null ? entry[key] : "";
            const adjustHeight = () => {
              ansArea.style.height = "auto";
              ansArea.style.height = Math.max(60, ansArea.scrollHeight) + "px";
            };
            ansArea.addEventListener("input", () => {
              entry[key] = ansArea.value;
              entry.updatedAt = new Date().toISOString();
              saveDiaryEntries(entries);
              adjustHeight();
            });
            adjustHeight();
            block.appendChild(ansArea);
            card.appendChild(block);
          });
        } else if (currentTabId === "2") {
          if (!entry.qa || typeof entry.qa !== "object") {
            entry.qa = Object.fromEntries(TAB2_QA_TEMPLATE.map((_, i) => [String(i), ""]));
            saveDiaryEntries(entries);
          }
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
            ansArea.value = (entry.qa && entry.qa[String(i)]) || "";
            const adjustHeight = () => {
              ansArea.style.height = "auto";
              ansArea.style.height = Math.max(60, ansArea.scrollHeight) + "px";
            };
            ansArea.addEventListener("input", () => {
              if (!entry.qa) entry.qa = {};
              entry.qa[String(i)] = ansArea.value;
              entry.updatedAt = new Date().toISOString();
              saveDiaryEntries(entries);
              adjustHeight();
            });
            adjustHeight();
            block.appendChild(ansArea);
            card.appendChild(block);
          });
        } else {
          const textarea = document.createElement("textarea");
          textarea.className = "diary-paper-text";
          textarea.placeholder = "start writing";
          textarea.value = entry.content || "";
          textarea.addEventListener("input", () => {
            entry.content = textarea.value;
            entry.updatedAt = new Date().toISOString();
            saveDiaryEntries(entries);
          });
          card.appendChild(textarea);
        }
        scrollWrap.appendChild(card);
      });
    } else if (mobile && fullEntryList.length === 0) {
      const empty = document.createElement("div");
      empty.className = "diary-paper diary-feed-empty";
      empty.textContent = "일기가 없습니다. + 버튼으로 추가하세요.";
      scrollWrap.appendChild(empty);
    } else if (currentTabId === "3" && currentEntry) {
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
      meta.textContent = formatDateDisplay(currentEntry.date || toDateStr(new Date()));
      qaHeader.appendChild(meta);
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "diary-paper-delete-btn diary-paper-delete-btn-qa";
      deleteBtn.title = "페이지 삭제";
      deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
      deleteBtn.addEventListener("click", () => {
        const list = ensureTabEntries("3");
        const idx = list.findIndex((x) => x.id === currentEntry.id);
        if (idx >= 0) {
          list.splice(idx, 1);
          saveDiaryEntries(entries);
          currentEntryId = list.length > 0 ? list[0].id : null;
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
        attachMobileTapToEdit(ansArea);
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
        meta.textContent = formatDateDisplay(currentEntry.date || toDateStr(new Date()));
        qaHeader.appendChild(meta);
        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "diary-paper-delete-btn diary-paper-delete-btn-qa";
        deleteBtn.title = "페이지 삭제";
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        deleteBtn.addEventListener("click", () => {
          const list = ensureTabEntries(currentTabId);
          const idx = list.findIndex((x) => x.id === currentEntry.id);
          if (idx >= 0) {
            list.splice(idx, 1);
            saveDiaryEntries(entries);
            currentEntryId = list.length > 0 ? list[0].id : null;
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
          attachMobileTapToEdit(ansArea);
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
        deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>';
        deleteBtn.addEventListener("click", () => {
          const list = ensureTabEntries(currentTabId);
          const idx = list.findIndex((x) => x.id === currentEntry.id);
          if (idx >= 0) {
            list.splice(idx, 1);
            saveDiaryEntries(entries);
            currentEntryId = list.length > 0 ? list[0].id : null;
            renderLayout();
          }
        });
        titleRow.appendChild(deleteBtn);
        paper.appendChild(titleRow);

        const meta = document.createElement("div");
        meta.className = "diary-paper-meta";
        meta.textContent = formatDateDisplay(currentEntry.date || toDateStr(new Date()));
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
        attachMobileTapToEdit(textarea);
        paper.appendChild(textarea);
      }
      }
    }

    scrollWrap.appendChild(paper);
    contentArea.appendChild(scrollWrap);
    layout.appendChild(contentArea);
    layoutWrap.appendChild(layout);

    filterPageListInPlace(searchQuery);
    if (mobile) updateMobileTabs();
  }

  tabs.querySelectorAll(".diary-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.querySelectorAll(".diary-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTabId = btn.dataset.tab;
      const list = ensureTabEntries(currentTabId);
      currentEntryId = list.length > 0 ? list[0].id : null;
      renderLayout();
    });
  });

  const initialList = ensureTabEntries(currentTabId);
  currentEntryId = initialList.length > 0 ? initialList[0].id : null;
  renderLayout();

  el.appendChild(layoutWrap);
  return el;
}
