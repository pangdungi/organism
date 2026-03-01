/**
 * 감정일기 - 탭별로 페이지 목록 사이드바 + 빈 종이 콘텐츠
 * - 새 페이지: 기본 제목 "제목없음"
 * - 제목 미지정(제목없음): 사이드바/종이에 날짜 표시
 * - 제목 지정: 해당 제목 표시
 * - 같은 날이어도 제목이 다르면 별도 데이터
 */

import {
  loadDiaryEntries,
  saveDiaryEntries,
  getEmotionList,
  ensureEmotionTabData,
  TAB3_DEFAULT_EMOTIONS,
  TAB3_EMOTION_TEMPLATE,
} from "../diaryData.js";

/** 탭 3 감정일기 - 감정별 설명 (사용자가 이해하기 쉽도록) */
const TAB3_EMOTION_DESCRIPTIONS = {
  공포:
    "공포는 어떤 위험에 대한 반응이에요. 공포를 느끼기 시작하면 위험 대상에 주의와 지각이 집중되면서, 그 상황을 빨리 벗어나려고 투쟁-도피 반응이 일어나요.",
  불안:
    "불안은 뭔가 나쁜 일이 일어날 것이라는 일반적 기대에서 비롯되는 감정이에요. 뚜렷한 이유 없이 생겨나거나 위협 요소가 특별히 발견되지 않아도 생겨나요. 주로 주관적 심리적 요인이 크고, 강한 스트레스를 지속적으로 경험하게 됩니다.",
  근심:
    "근심은 해결되지 않은 문제거리를 두고 계속 속을 태우는 것이에요.",
  걱정:
    "걱정은 어떤 일이 잘못될까 봐 계속 불안해하는 것이에요.",
  기쁨:
    "기쁨은 무형이든 유형이든 자신이 원하는 것을 얻어 강렬하게 유쾌한 상태예요.",
  황홀감:
    "황홀감은 긍정적 감정의 극치예요.",
  행복:
    "행복은 특정한 이유가 없이 삶에 대한 전반적인 만족이에요. 오래 지속된다는 점에서 기쁨과 달라요.",
  즐거움:
    "즐거움은 어떤 것이 너무 마음에 들거나 경험하는 과정에서 얻게 되는, 특히 만족으로 인한 기쁨이에요.",
  고마움:
    "고마움은 자신에게 일어난 일이 다른 사람 덕분이라 느낄 때 생기는 감정이에요.",
  그리움:
    "그리움은 만나고 싶거나 보고 싶은 마음이 애틋하고 간절한 상태예요.",
  기특함:
    "기특함은 대상의 뛰어남 또는 특별함에 대한 기쁨이에요.",
  감동:
    "감동은 타인의 감정이나 의도에 마음이 움직여 생겨나는 감정이에요.",
  사랑:
    "사랑은 누군가를 애틋하게 그리워하고 열렬히 좋아하는 마음이에요.",
  신뢰감:
    "신뢰감은 타인을 믿을 수 있다고 생각하고 의지하는 마음이에요.",
  자부심:
    "자부심은 자신의 긍정적 측면을 지지하는 긍정적 결과가 인정받았을 때 느끼는 감정이에요.",
  자신감:
    "자신감은 내가 어떤 일을 잘 해낼 수 있다는 내 능력에 대한 믿음이에요.",
  자존심:
    "자존심은 자신의 가치나 품위를 지키려는 마음이에요.",
  자격지심:
    "자격지심은 나는 부족하다는 느낌이 남들 눈에 들킬까 봐 두려운 것, 즉 내 부족함이 들킬까 생기는 두려움이에요.",
  열등감:
    "열등감은 타인과의 비교에서 자신을 남보다 늘 못하다고 평가하는 마음이에요.",
  슬픔:
    "슬픔은 상실에 대한 반응이에요. 결과를 바꿀 수 없는 상실에 대한 무력감이에요.",
  우울:
    "우울은 분명한 이유가 없음에도 오랜 기간에 걸쳐 지속되는, 즐거움이 없고 무력하고 의욕이 없는 상태예요.",
  분노:
    "분노는 나를 위협하거나 피해를 유발한 상대에 대한 공격성을 수반하는 감정이에요. 주로 나와 내 것에 대한 비하적 공격에 의해 생겨나요.",
  억울함:
    "억울함은 자신이 경험한 일이 공정하지 못하거나 부당하다는 생각이 들어 분노하거나 답답해하는 감정이에요.",
  괘씸함:
    "괘씸함은 상대로부터 모욕을 당했을 때 느끼는 화난 감정이에요.",
  서운함:
    "서운함은 어떤 사람이 자신의 기대에 미치지 못할 때 느끼는 감정이에요. 화를 내고 따지기엔 명분이 없거나 그러고 싶지 않을 때 생겨나요.",
  섭섭함:
    "섭섭함은 상대방에 대한 기대가 충족되지 못한 데서 오는 불만이나 못마땅함이에요.",
  미움:
    "미움은 상대방이 하는 짓이 마음에 들지 않고 싫은 감정이에요.",
  얄미움:
    "얄미움은 누군가 매우 얄궂고 영리해서 마음에 안 드는 감정이에요.",
  시샘:
    "시샘은 남을 부러워한 나머지 그 사람이 미워지기까지 하는 감정이에요.",
  부러움:
    "부러움은 내가 갖지 못한 것을 가진 그 사람처럼 되고 싶은 바람이에요.",
  혐오:
    "혐오는 기분 나쁜 대상이 내 영역이나 신체 안에 들어올 수 있다는 인지에서 경험되는 극도의 불쾌감이에요.",
  괴로움:
    "괴로움은 견디기 어렵고 스트레스를 받는 상태예요.",
  부담감:
    "부담감은 무언가 짐처럼 느껴져 힘든 상태예요.",
  따분함:
    "따분함은 일정 기간 별다른 일이 없어 평온하다 못해 자극과 각성이 필요한 지경에 이른 상태예요.",
  지겨움:
    "지겨움은 같은 상태가 오래 지속되어 진저리가 날 정도로 싫증이 나는 상태예요.",
  안도감:
    "안도감은 불안한 마음이 사라진 다음에 느끼는 감정이에요.",
  편안감:
    "편안감은 일정 기간 동안 근심, 걱정 없이 평화가 지속되는 감정 상태예요.",
  외로움:
    "외로움은 혼자가 돼서 적적하고 쓸쓸한 상태예요.",
  난처함:
    "난처함은 사회적 기대에 어긋나거나 상황에 맞지 않게 행동해서 이러지도 저러지도 못하는 상태예요.",
  후련함:
    "후련함은 맺혀던 일이나 답답하던 것이 풀려서 시원한 상태예요.",
  부끄러움:
    "부끄러움은 보여주고 싶지 않은 내 모습이 노출됐을 때 오는 감정이에요.",
  죄책감:
    "죄책감은 주로 내가 한 행동이 누군가에게 피해를 줬거나 내 기준에 어긋났을 때, 내가 틀렸다는 걸 내가 아는 느낌이에요.",
  아쉬움:
    "아쉬움은 어떤 기대가 충족이 안 됐을 때 느끼는 감정이에요.",
  수치심:
    "수치심은 내 존재 자체가 결함이라는 느낌이에요. 내가 한 행동보다 나 자체를 잘못된 것으로 봐요.",
  짜증:
    "짜증은 마음에 들지 않다 못해 화가 나는 감정이에요.",
  원망:
    "원망은 상대에 대한 기대가 충족이 안 됐을 때의 화남의 원인을 상대방에게 돌릴 때 느끼는 감정이에요.",
};

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

/** 탭 3 감정일기: 해당 감정의 일기 목록 반환 */
function getEmotionEntries(emotionId, all) {
  const tab = all["3"];
  if (!tab || !tab.emotions || typeof tab.emotions !== "object") {
    return [];
  }
  const list = tab.emotions[emotionId] || [];
  return Array.isArray(list)
    ? [...list].sort((a, b) => (b.updatedAt || b.date || "").localeCompare(a.updatedAt || a.date || ""))
    : [];
}

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content diary-view";

  const h = document.createElement("h2");
  h.textContent = "감정일기";
  el.appendChild(h);

  const tabs = document.createElement("div");
  tabs.className = "time-view-tabs diary-tabs";
  tabs.innerHTML = `
    <button type="button" class="time-view-tab active" data-tab="2">통제일기</button>
    <button type="button" class="time-view-tab" data-tab="1">자유일기</button>
    <button type="button" class="time-view-tab" data-tab="3">감정일기</button>
    <button type="button" class="time-view-tab" data-tab="4">탭 4</button>
    <button type="button" class="time-view-tab" data-tab="5">탭 5</button>
  `;
  el.appendChild(tabs);

  const layoutWrap = document.createElement("div");
  layoutWrap.className = "diary-layout-wrap";

  const addEmotionModal = document.createElement("div");
  addEmotionModal.className = "diary-add-emotion-modal";
  addEmotionModal.hidden = true;
  addEmotionModal.innerHTML = `
    <div class="diary-add-emotion-backdrop"></div>
    <div class="diary-add-emotion-panel">
      <div class="diary-add-emotion-header">
        <h3 class="diary-add-emotion-title">새 감정 추가</h3>
      </div>
      <div class="diary-add-emotion-body">
        <input type="text" class="diary-add-emotion-input" placeholder="감정 이름을 입력하세요" autocomplete="off" />
      </div>
      <div class="diary-add-emotion-actions">
        <button type="button" class="diary-add-emotion-btn diary-add-emotion-btn-cancel">취소</button>
        <button type="button" class="diary-add-emotion-btn diary-add-emotion-btn-confirm">확인</button>
      </div>
    </div>
  `;
  el.appendChild(addEmotionModal);

  const addEmotionInput = addEmotionModal.querySelector(".diary-add-emotion-input");
  const addEmotionBackdrop = addEmotionModal.querySelector(".diary-add-emotion-backdrop");
  const addEmotionCancelBtn = addEmotionModal.querySelector(".diary-add-emotion-btn-cancel");
  const addEmotionConfirmBtn = addEmotionModal.querySelector(".diary-add-emotion-btn-confirm");

  function openAddEmotionModal(onConfirm) {
    addEmotionInput.value = "";
    addEmotionModal.hidden = false;
    addEmotionInput.focus();

    function close() {
      addEmotionModal.hidden = true;
      addEmotionBackdrop.removeEventListener("click", close);
      addEmotionCancelBtn.removeEventListener("click", close);
      addEmotionConfirmBtn.removeEventListener("click", onConfirmClick);
      addEmotionInput.removeEventListener("keydown", onKeydown);
    }

    function onConfirmClick() {
      const name = addEmotionInput.value.trim();
      close();
      onConfirm(name);
    }

    function onKeydown(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        onConfirmClick();
      } else if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    }

    addEmotionBackdrop.addEventListener("click", close);
    addEmotionCancelBtn.addEventListener("click", close);
    addEmotionConfirmBtn.addEventListener("click", onConfirmClick);
    addEmotionInput.addEventListener("keydown", onKeydown);
  }

  let currentTabId = "2";
  let currentEntryId = null;
  let currentEmotionId = "공포";
  let sidebarCollapsed = false;
  let searchQuery = "";
  let searchOpen = false;
  let isComposing = false;
  let entries = loadDiaryEntries();

  function ensureTabEntries(tabId) {
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

  function filterEmotionListInPlace(query) {
    const emotionListEl = layoutWrap.querySelector(".diary-emotion-list");
    if (!emotionListEl) return;
    const q = (query || "").trim().toLowerCase();
    const wraps = emotionListEl.querySelectorAll(".diary-emotion-item-wrap");
    let visibleCount = 0;
    wraps.forEach((wrap) => {
      const btn = wrap.querySelector(".diary-emotion-item");
      const emotion = (btn?.textContent || "").trim();
      const matches = !q || emotion.toLowerCase().includes(q);
      wrap.style.display = matches ? "" : "none";
      if (matches) visibleCount++;
    });
    let noResult = emotionListEl.querySelector(".diary-search-no-result");
    if (visibleCount === 0 && q) {
      if (!noResult) {
        noResult = document.createElement("div");
        noResult.className = "diary-search-no-result";
        noResult.textContent = "검색 결과가 없습니다.";
        emotionListEl.appendChild(noResult);
      }
      noResult.style.display = "";
    } else if (noResult) {
      noResult.style.display = "none";
    }
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
      ensureEmotionTabData(entries);
      const fullEmotionList = getEmotionList(entries);
      const q = (searchQuery || "").trim().toLowerCase();

      const sidebarHeader = document.createElement("div");
      sidebarHeader.className = "diary-sidebar-header";
      sidebarHeader.innerHTML = `
        <span class="diary-sidebar-title">감정</span>
        <div class="diary-sidebar-actions">
          <button type="button" class="diary-search-btn" title="검색">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
          <button type="button" class="diary-sidebar-collapse-btn" title="${sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}">${sidebarCollapsed ? "»" : "«"}</button>
        </div>
      `;
      const searchBtn = sidebarHeader.querySelector(".diary-search-btn");
      searchBtn.addEventListener("click", () => {
        searchOpen = !searchOpen;
        renderLayout();
      });
      sidebarHeader.querySelector(".diary-sidebar-collapse-btn").addEventListener("click", () => {
        sidebarCollapsed = !sidebarCollapsed;
        renderLayout();
      });
      sidebar.appendChild(sidebarHeader);

      if (searchOpen) {
        const searchRow = document.createElement("div");
        searchRow.className = "diary-search-row";
        const searchInput = document.createElement("input");
        searchInput.type = "text";
        searchInput.className = "diary-search-input";
        searchInput.placeholder = "감정 검색...";
        searchInput.value = searchQuery;
        searchInput.addEventListener("compositionstart", () => {
          isComposing = true;
        });
        searchInput.addEventListener("compositionend", (e) => {
          isComposing = false;
          searchQuery = e.target.value;
          filterEmotionListInPlace(searchQuery);
        });
        searchInput.addEventListener("input", () => {
          searchQuery = searchInput.value;
          if (!isComposing) filterEmotionListInPlace(searchQuery);
        });
        searchInput.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            searchOpen = false;
            renderLayout();
          }
        });
        searchRow.appendChild(searchInput);
        sidebar.appendChild(searchRow);
        requestAnimationFrame(() => searchInput.focus());
      }

      const emotionListWrap = document.createElement("div");
      emotionListWrap.className = "diary-emotion-list-wrap";
      const emotionListEl = document.createElement("div");
      emotionListEl.className = "diary-page-list diary-emotion-list";
      fullEmotionList.forEach((emotion) => {
        const isUserAdded = !TAB3_DEFAULT_EMOTIONS.includes(emotion);
        const wrap = document.createElement("div");
        wrap.className = "diary-emotion-item-wrap" + (isUserAdded ? " diary-emotion-item-user" : "");

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "diary-page-item diary-emotion-item" + (emotion === currentEmotionId ? " active" : "");
        btn.textContent = emotion;
        btn.dataset.emotionId = emotion;
        btn.addEventListener("click", () => {
          currentEmotionId = emotion;
          renderLayout();
        });
        wrap.appendChild(btn);

        if (isUserAdded) {
          const delBtn = document.createElement("button");
          delBtn.type = "button";
          delBtn.className = "diary-emotion-delete";
          delBtn.innerHTML = "×";
          delBtn.title = "삭제";
          delBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            ensureEmotionTabData(entries);
            const tab = entries["3"];
            tab.emotionList = tab.emotionList.filter((e) => e !== emotion);
            delete tab.emotions[emotion];
            if (currentEmotionId === emotion) {
              currentEmotionId = tab.emotionList[0] || "공포";
            }
            saveDiaryEntries(entries);
            renderLayout();
          });
          wrap.appendChild(delBtn);
        }

        emotionListEl.appendChild(wrap);
      });
      emotionListWrap.appendChild(emotionListEl);

      const addEmotionWrap = document.createElement("div");
      addEmotionWrap.className = "diary-add-emotion-wrap";
      const addEmotionBtn = document.createElement("button");
      addEmotionBtn.type = "button";
      addEmotionBtn.className = "diary-add-page diary-add-emotion";
      addEmotionBtn.innerHTML = '<span class="diary-add-page-icon">+</span> 감정추가하기';
      addEmotionBtn.addEventListener("click", () => {
        openAddEmotionModal((name) => {
          if (name && !fullEmotionList.includes(name)) {
            ensureEmotionTabData(entries);
            entries["3"].emotionList.push(name);
            entries["3"].emotions[name] = [];
            saveDiaryEntries(entries);
            currentEmotionId = name;
            renderLayout();
          }
        });
      });
      addEmotionWrap.appendChild(addEmotionBtn);
      sidebar.appendChild(emotionListWrap);
      sidebar.appendChild(addEmotionWrap);
      layout.appendChild(sidebar);
    } else {
      const fullEntryList = ensureTabEntries(currentTabId);
      const q = (searchQuery || "").trim().toLowerCase();
      const getEntrySearchText = (e) => {
        let s = (e.title || "") + (e.content || "") + (e.date || "");
        if (e.qa && typeof e.qa === "object") {
          s += Object.values(e.qa).join(" ");
        }
        return s.toLowerCase();
      };
      const entryList = q
        ? fullEntryList.filter((e) => getEntrySearchText(e).includes(q))
        : fullEntryList;

      const sidebarHeader = document.createElement("div");
      sidebarHeader.className = "diary-sidebar-header";
      sidebarHeader.innerHTML = `
        <span class="diary-sidebar-title">Pages</span>
        <div class="diary-sidebar-actions">
          <button type="button" class="diary-search-btn" title="검색">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
          </button>
          <button type="button" class="diary-sidebar-collapse-btn" title="${sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기"}">${sidebarCollapsed ? "»" : "«"}</button>
        </div>
      `;
      const searchBtn = sidebarHeader.querySelector(".diary-search-btn");
      searchBtn.addEventListener("click", () => {
        searchOpen = !searchOpen;
        renderLayout();
      });
      sidebarHeader.querySelector(".diary-sidebar-collapse-btn").addEventListener("click", () => {
        sidebarCollapsed = !sidebarCollapsed;
        renderLayout();
      });
      sidebar.appendChild(sidebarHeader);

      if (searchOpen) {
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
        searchInput.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            searchOpen = false;
            renderLayout();
          }
        });
        searchRow.appendChild(searchInput);
        sidebar.appendChild(searchRow);
        requestAnimationFrame(() => searchInput.focus());
      }

      const addPageWrap = document.createElement("div");
      addPageWrap.className = "diary-add-page-wrap";
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "diary-add-page";
      addBtn.innerHTML = '<span class="diary-add-page-icon">+</span> Add page';
      addBtn.addEventListener("click", () => {
        const today = toDateStr(new Date());
        const id = "e_" + Date.now();
        const newEntry = {
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
      });
      addPageWrap.appendChild(addBtn);
      sidebar.appendChild(addPageWrap);

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
    const collapseZone = document.createElement("div");
    collapseZone.className = "diary-collapse-zone";
    collapseZone.title = sidebarCollapsed ? "사이드바 펼치기" : "사이드바 접기";
    const collapsePopBtn = document.createElement("button");
    collapsePopBtn.type = "button";
    collapsePopBtn.className = "diary-collapse-pop";
    collapsePopBtn.textContent = sidebarCollapsed ? "»" : "«";
    collapsePopBtn.addEventListener("click", () => {
      sidebarCollapsed = !sidebarCollapsed;
      renderLayout();
    });
    collapseZone.appendChild(collapsePopBtn);
    contentArea.appendChild(collapseZone);
    const scrollWrap = document.createElement("div");
    scrollWrap.className = "diary-content-scroll";
    const paper = document.createElement("div");
    paper.className = "diary-paper";

    if (currentTabId === "3") {
      paper.className = "diary-paper diary-paper-emotion-feed";
      ensureEmotionTabData(entries);
      const emotionEntries = getEmotionEntries(currentEmotionId, entries);

      const desc = TAB3_EMOTION_DESCRIPTIONS[currentEmotionId];
      if (desc) {
        const descEl = document.createElement("div");
        descEl.className = "diary-emotion-description";
        descEl.textContent = desc;
        paper.appendChild(descEl);
      }

      const addEntryWrap = document.createElement("div");
      addEntryWrap.className = "diary-emotion-add-wrap";
      const templateInputs = [];
      TAB3_EMOTION_TEMPLATE.forEach((label, i) => {
        const labelEl = document.createElement("label");
        labelEl.className = "diary-emotion-template-label";
        labelEl.textContent = label;
        const textarea = document.createElement("textarea");
        textarea.className = "diary-emotion-add-input";
        textarea.placeholder = "";
        textarea.rows = 2;
        textarea.dataset.q = String(i + 1);
        templateInputs.push(textarea);
        addEntryWrap.appendChild(labelEl);
        addEntryWrap.appendChild(textarea);
      });
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "diary-emotion-add-btn";
      addBtn.textContent = "추가";
      addBtn.addEventListener("click", () => {
        const q1 = (templateInputs[0]?.value || "").trim();
        const q2 = (templateInputs[1]?.value || "").trim();
        const q3 = (templateInputs[2]?.value || "").trim();
        if (q1 || q2 || q3) {
          const id = "em_" + Date.now();
          const today = toDateStr(new Date());
          const newEntry = {
            id,
            date: today,
            emotion: currentEmotionId,
            q1,
            q2,
            q3,
            updatedAt: new Date().toISOString(),
          };
          ensureEmotionTabData(entries);
          if (!entries["3"].emotions[currentEmotionId]) entries["3"].emotions[currentEmotionId] = [];
          entries["3"].emotions[currentEmotionId].unshift(newEntry);
          saveDiaryEntries(entries);
          templateInputs.forEach((inp) => { inp.value = ""; });
          renderLayout();
        }
      });
      addEntryWrap.appendChild(addBtn);
      paper.appendChild(addEntryWrap);

      const feedWrap = document.createElement("div");
      feedWrap.className = "diary-emotion-feed";
      emotionEntries.forEach((entry) => {
        const card = document.createElement("div");
        card.className = "diary-emotion-card";
        const meta = document.createElement("div");
        meta.className = "diary-emotion-card-date";
        meta.textContent = formatDateDisplay(entry.date || "") + (entry.updatedAt ? " " + new Date(entry.updatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "");
        const contentWrap = document.createElement("div");
        contentWrap.className = "diary-emotion-card-content-wrap";
        const hasTemplate = entry.q1 !== undefined || entry.q2 !== undefined || entry.q3 !== undefined;
        if (hasTemplate) {
          TAB3_EMOTION_TEMPLATE.forEach((label, i) => {
            const val = entry["q" + (i + 1)] || "";
            if (val) {
              const block = document.createElement("div");
              block.className = "diary-emotion-card-block";
              const blockLabel = document.createElement("div");
              blockLabel.className = "diary-emotion-card-block-label";
              blockLabel.textContent = label;
              const blockContent = document.createElement("div");
              blockContent.className = "diary-emotion-card-block-content";
              blockContent.textContent = val;
              block.appendChild(blockLabel);
              block.appendChild(blockContent);
              contentWrap.appendChild(block);
            }
          });
        } else {
          const legacyContent = document.createElement("div");
          legacyContent.className = "diary-emotion-card-content";
          legacyContent.textContent = entry.content || "";
          contentWrap.appendChild(legacyContent);
        }
        const actionsWrap = document.createElement("div");
        actionsWrap.className = "diary-emotion-card-actions";
        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "diary-emotion-card-edit";
        editBtn.title = "수정";
        editBtn.textContent = "수정";
        editBtn.addEventListener("click", () => {
          card.classList.add("is-editing");
          const editWrap = card.querySelector(".diary-emotion-card-edit-wrap");
          if (editWrap) editWrap.hidden = false;
          contentWrap.hidden = true;
        });
        const delBtn = document.createElement("button");
        delBtn.type = "button";
        delBtn.className = "diary-emotion-card-delete";
        delBtn.title = "삭제";
        delBtn.textContent = "×";
        delBtn.addEventListener("click", () => {
          const list = entries["3"].emotions[currentEmotionId] || [];
          const idx = list.findIndex((e) => e.id === entry.id);
          if (idx >= 0) {
            list.splice(idx, 1);
            saveDiaryEntries(entries);
            renderLayout();
          }
        });
        actionsWrap.appendChild(editBtn);
        actionsWrap.appendChild(delBtn);

        const editWrap = document.createElement("div");
        editWrap.className = "diary-emotion-card-edit-wrap";
        editWrap.hidden = true;
        const editInputs = [];
        TAB3_EMOTION_TEMPLATE.forEach((label, i) => {
          const labelEl = document.createElement("label");
          labelEl.className = "diary-emotion-template-label";
          labelEl.textContent = label;
          const textarea = document.createElement("textarea");
          textarea.className = "diary-emotion-edit-input";
          textarea.rows = 2;
          const val = entry["q" + (i + 1)];
          textarea.value = val !== undefined ? val : (i === 0 && entry.content ? entry.content : "");
          editInputs.push(textarea);
          editWrap.appendChild(labelEl);
          editWrap.appendChild(textarea);
        });
        const saveCancelWrap = document.createElement("div");
        saveCancelWrap.className = "diary-emotion-card-save-cancel";
        const saveBtn = document.createElement("button");
        saveBtn.type = "button";
        saveBtn.className = "diary-emotion-save-btn";
        saveBtn.textContent = "저장";
        saveBtn.addEventListener("click", () => {
          const list = entries["3"].emotions[currentEmotionId] || [];
          const e = list.find((x) => x.id === entry.id);
          if (e) {
            e.q1 = (editInputs[0]?.value || "").trim();
            e.q2 = (editInputs[1]?.value || "").trim();
            e.q3 = (editInputs[2]?.value || "").trim();
            e.updatedAt = new Date().toISOString();
            saveDiaryEntries(entries);
            renderLayout();
          }
        });
        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "diary-emotion-cancel-btn";
        cancelBtn.textContent = "취소";
        cancelBtn.addEventListener("click", () => {
          card.classList.remove("is-editing");
          editWrap.hidden = true;
          contentWrap.hidden = false;
        });
        saveCancelWrap.appendChild(saveBtn);
        saveCancelWrap.appendChild(cancelBtn);
        editWrap.appendChild(saveCancelWrap);

        card.appendChild(meta);
        card.appendChild(contentWrap);
        card.appendChild(editWrap);
        card.appendChild(actionsWrap);
        feedWrap.appendChild(card);
      });
      if (emotionEntries.length === 0) {
        const empty = document.createElement("div");
        empty.className = "diary-emotion-feed-empty";
        empty.textContent = "아직 일기가 없습니다. 위 템플릿을 작성하고 추가해보세요.";
        feedWrap.appendChild(empty);
      }
      paper.appendChild(feedWrap);
    } else {
      const currentEntry = currentEntryId ? getEntryById(currentTabId, currentEntryId) : null;

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
      } else {
        const empty = document.createElement("div");
        empty.className = "diary-paper-empty";
        empty.textContent = "'+ Add page'로 새 일기를 추가하세요.";
        paper.appendChild(empty);
      }
    }

    scrollWrap.appendChild(paper);
    contentArea.appendChild(scrollWrap);
    layout.appendChild(contentArea);
    layoutWrap.appendChild(layout);

    if (searchOpen) {
      if (currentTabId === "3") {
        filterEmotionListInPlace(searchQuery);
      } else {
        filterPageListInPlace(searchQuery);
      }
    }
  }

  tabs.querySelectorAll(".time-view-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.querySelectorAll(".time-view-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTabId = btn.dataset.tab;
      if (currentTabId === "3") {
        currentEntryId = null;
        ensureEmotionTabData(entries);
        currentEmotionId = getEmotionList(entries)[0] || "공포";
      } else {
        const list = ensureTabEntries(currentTabId);
        currentEntryId = list.length > 0 ? list[list.length - 1].id : null;
      }
      renderLayout();
    });
  });

  const initialList = ensureTabEntries("1");
  currentEntryId = initialList.length > 0 ? initialList[0].id : null;
  renderLayout();

  el.appendChild(layoutWrap);
  return el;
}
