/**
 * 꿈·건강·행복·부수입 등 KPI 상위 탭 — 활성 탭에만 삽입.
 * 활성 탭 이름 수정 모달 열기용 — 인라인 SVG(currentColor + kpi-dream.css)
 */
export const KPI_TAB_EDIT_PENCIL_HTML = `
<button type="button" class="dream-tab-edit" title="이름 수정" aria-label="이름 수정">
  <svg class="dream-tab-edit-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="14" height="14" aria-hidden="true">
    <path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
</button>`;

/** KPI 카드 우측 상단 — 탭 연필과 동일 SVG·`.dream-tab-edit` 스타일, 위치만 `.dream-kpi-card-edit` */
export const KPI_CARD_EDIT_PENCIL_HTML = `
<button type="button" class="dream-kpi-card-edit dream-tab-edit" title="KPI 수정" aria-label="KPI 수정">
  <svg class="dream-tab-edit-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="14" height="14" aria-hidden="true">
    <path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
</button>`;

/** 꿈 목표 목록 카드 — KPI 카드 연필과 동일 클래스·스타일 */
export const DREAM_GOAL_EDIT_PENCIL_HTML = `
<button type="button" class="dream-kpi-card-edit dream-tab-edit" title="꿈 목표 수정" aria-label="꿈 목표 수정">
  <svg class="dream-tab-edit-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="14" height="14" aria-hidden="true">
    <path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
</button>`;

export const HEALTH_GOAL_EDIT_PENCIL_HTML = `
<button type="button" class="dream-kpi-card-edit dream-tab-edit" title="건강 목표 수정" aria-label="건강 목표 수정">
  <svg class="dream-tab-edit-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="14" height="14" aria-hidden="true">
    <path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
</button>`;

export const HAPPINESS_GOAL_EDIT_PENCIL_HTML = `
<button type="button" class="dream-kpi-card-edit dream-tab-edit" title="행복 목표 수정" aria-label="행복 목표 수정">
  <svg class="dream-tab-edit-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="14" height="14" aria-hidden="true">
    <path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
</button>`;

export const SIDEINCOME_GOAL_EDIT_PENCIL_HTML = `
<button type="button" class="dream-kpi-card-edit dream-tab-edit" title="부수입 목표 수정" aria-label="부수입 목표 수정">
  <svg class="dream-tab-edit-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="14" height="14" aria-hidden="true">
    <path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" stroke-miterlimit="10" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
  </svg>
</button>`;
