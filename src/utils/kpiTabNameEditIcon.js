/**
 * 꿈·건강·행복·부수입 등 KPI — 목표·카드·활성 탭 수정 버튼
 * 아이콘: public/toolbaricons/kpi-edit-modify.png (대화창 첨부 ellipsis-vertical)
 * 색: kpi-dream.css `.dream-tab-edit` currentColor (#c4c9d1 → hover #94a3b8)
 */

const KPI_EDIT_MODIFY_ICON_HTML = `<span class="dream-tab-edit-icon dream-tab-edit-icon-mask" aria-hidden="true"></span>`;

function kpiEditButtonHtml(className, title, ariaLabel) {
  return `<button type="button" class="${className}" title="${title}" aria-label="${ariaLabel}">
  ${KPI_EDIT_MODIFY_ICON_HTML}
</button>`;
}

/** KPI 상위 탭 — 활성 탭 이름 수정 */
export const KPI_TAB_EDIT_PENCIL_HTML = kpiEditButtonHtml(
  "dream-tab-edit",
  "이름 수정",
  "이름 수정",
);

/** KPI 카드·목표 카드 수정 버튼 — 터치 시 카드 진입 클릭과 겹치지 않게 */
export function bindKpiCardEditButton(btn, onEdit) {
  if (!btn || typeof onEdit !== "function") return;
  if (btn.dataset.lpKpiCardEditBound === "1") return;
  btn.dataset.lpKpiCardEditBound = "1";
  const stopToCard = (e) => {
    e.stopPropagation();
  };
  btn.addEventListener("pointerdown", stopToCard);
  btn.addEventListener("pointerup", stopToCard);
  btn.addEventListener("touchend", stopToCard);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onEdit(e);
  });
}

/** KPI 카드 우측 상단 */
export const KPI_CARD_EDIT_PENCIL_HTML = kpiEditButtonHtml(
  "dream-kpi-card-edit dream-tab-edit",
  "행동 수정",
  "행동 수정",
);

/** 꿈 목표 목록 카드 */
export const DREAM_GOAL_EDIT_PENCIL_HTML = kpiEditButtonHtml(
  "dream-kpi-card-edit dream-tab-edit",
  "꿈 목표 수정",
  "꿈 목표 수정",
);

export const HEALTH_GOAL_EDIT_PENCIL_HTML = kpiEditButtonHtml(
  "dream-kpi-card-edit dream-tab-edit",
  "건강 목표 수정",
  "건강 목표 수정",
);

export const HAPPINESS_GOAL_EDIT_PENCIL_HTML = kpiEditButtonHtml(
  "dream-kpi-card-edit dream-tab-edit",
  "행복 목표 수정",
  "행복 목표 수정",
);

export const SIDEINCOME_GOAL_EDIT_PENCIL_HTML = kpiEditButtonHtml(
  "dream-kpi-card-edit dream-tab-edit",
  "시급 상승 목표 수정",
  "시급 상승 목표 수정",
);
