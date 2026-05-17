# 시간가계부 스타일 구조

## 목적

- **공통 UI**(앱 뼈대, 하단 푸터, 홈 메뉴, safe-area, 전역 리셋)는 `src/main.css` 한곳에서 유지한다.
- **시간가계부 탭에서만** 쓰이는 레이아웃·컴포넌트 스타일은 `src/styles/time-ledger.css`에만 둔다.
- 두 파일이 섞이지 않도록 역할을 나누면, 다른 탭과 선택자 충돌을 줄이고 수정 범위가 분명해진다.

## 엔트리

- `src/main.js`에서 `import "./main.css"` 다음에 `import "./styles/time-ledger.css"` 로 로드한다.
- 로드 순서: **공통 → 시간가계부**. 시간가계부에서 공통을 덮어야 할 때만 이 순서를 바꾼다.

## DOM 루트(스코프)

- `Time.js`의 루트 요소: `class="app-tab-panel-content time-ledger-view"`.
- `time-ledger.css`에 규칙을 추가할 때는 가능한 한 **`.time-ledger-view` 접두**로 스코프한다.
  - 예: `.time-ledger-view .time-filter-bar { … }`
- 예외: 전역 유틸로 쓰일 여지가 없고, 클래스명이 앱 전체에서 유일하다고 확신할 때만 루트 없이 쓸 수 있다(가급적 지양).

## 무엇을 어디에 둘지

| 구분 | 파일 | 예시 |
|------|------|------|
| 앱 레이아웃, `#app`, `.app-main`, 탭 패널 래퍼 폭 | `main.css` | `.app-page`, `.app-tab-panel` |
| 하단 앱 푸터(뒤로 + 액션 슬롯) | `main.css` | `.app-footer-menu`, `.app-footer-actions` |
| 홈(오늘) 런처 버튼 목록 | `main.css` | `.app-home-menu-launcher*` |
| 시간가계부 헤더/필터/테이블/모바일 카드/모달 등 Time 전용 | `time-ledger.css` | `.time-ledger-*`, `.time-filter-*`, `.time-row` (스코프 권장) |

## 색·테마 칩 프로덕트/카테고리

- `prod-*`, `cat-*` 등 **런타임 주입 색**은 `main.js`의 `applyTimeCategoryColors` / `applyTaskCategoryColors`와 `docs/COLOR_SYSTEM.md`를 따른다.
- 그 칩에 대한 **정적인 보조 스타일**(간격·모양)은 원칙적으로 `time-ledger.css`로 옮기고, 정말 앱 전역에서 재사용할 때만 `main.css`에 둔다.

## 푸터 액션 버튼

- 시간가계부가 푸터 슬롯에 붙이는 아이콘 버튼의 **크기·터치 영역**은 공통 규격 `main.css`의 `.app-footer-icon-btn`를 쓴다.
- 시간가계부**만의** 아이콘/배열 커스텀이 필요해지면 `time-ledger.css`에서 `.time-ledger-view [data-lp-app-footer-actions] …` 처럼 스코프해서 덮어쓴다.

## 마이그레이션 노트

- `Time.js` 일부는 `data-legacy="…"` 로 마킹된 구역이 있다(`scripts/migrate-time-legacy-classes.mjs` 참고). 스타일을 `time-ledger.css`로 옮길 때 선택자를 `[data-legacy~="클래스명"]` 형태로 맞출지, DOM에 `class`를 되살릴지 정책을 통일한다.

## 관련 규칙

- Cursor: `.cursor/rules/mobile-only-styles.mdc` — 푸터는 공통·분기 없음; 시간가계부 전용은 본 문서 + `time-ledger.css`.
