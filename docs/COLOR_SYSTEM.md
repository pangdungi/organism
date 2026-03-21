# 컬러 시스템 정리

앱의 색상(리스트/생산성/작업 카테고리)은 **22가지** 프리셋(hex)으로 통일되어 있음(기본 10 + Behr 세이지/클래식/올리브 12).

## 1. 데이터 정의 & 저장

| 파일 | 역할 |
|------|------|
| `src/utils/todoSettings.js` | 색상 정의, localStorage 저장/로드 |

### 주요 export
- **APP_PRESET_COLORS** - 22가지 hex 프리셋 (기본 10 + Behr 세이지/클래식/올리브 12 — `todoSettings.js` 주석 참고)
- **hexToRgba(hex, alpha)** - hex → rgba 변환
- **DEFAULT_SECTION_COLORS** - 리스트 기본색 (브레인덤프·꿈·부수입·건강·행복; `sectionListPresetVersion`으로 1회 마이그레이션, 커스텀 리스트 색은 유지)
- **DEFAULT_TIME_CATEGORY_COLORS** - 생산 `#C97A6A` / 비생산 `#7A8E9A` / 기타 `#8A9E82` (로컬 `timeCategoryPresetVersion`으로 1회 마이그레이션)
- **DEFAULT_TASK_CATEGORY_COLORS** - 작업(세부) 기본색(꿈·부수입·행복·건강은 리스트 4색과 동일, 그외 항목은 다른 프리셋; `taskSubcategoryPresetVersion`)
- **getSectionColor(sectionId)** - 리스트 색 조회
- **getTimeCategoryColor(key)** - 생산성 색 조회
- **getTimeCategoryColorsForTimetable()** - 타임테이블 블록용 rgba
- **getTimeCategoryColorsForTimetableExpected()** - 타임테이블 예상 컬럼용
- **applyTimeCategoryColors()** - `<style id="time-category-colors-style">` 주입 (prod-pink/blue/green)
- **applyTaskCategoryColors()** - `<style id="task-category-colors-style">` 주입 (cat-dream 등)

---

## 2. 색상 설정 UI

| 파일 | 역할 |
|------|------|
| `src/utils/todoSettingsModal.js` | createColorPickerRow (칩+모달), 22 프리셋 선택 |
| `src/views/Idea.js` | 나의계정 → 리스트 색상 / 생산성 / 작업 카테고리 설정 블록 |

설정 저장 시 `document.dispatchEvent(new CustomEvent("app-colors-changed"))` 발생.

---

## 3. 색상 사용처

### 3-1. 리스트 색상 (sectionColors) - getSectionColor()

| 파일 | 용도 |
|------|------|
| `TodoList.js` | `--row-section-color` CSS 변수로 행 배경/테두리 |
| `TodoList.js` | 탭 버튼별 색 표시 (sectionColors) |
| `Calendar.js` | 할 일 블록 배경색 (sidebar, 1day, monthly 등) |

### 3-2. 생산성 색상 (timeCategoryColors) - prod-pink / prod-blue / prod-green

applyTimeCategoryColors()가 동적으로 `<style id="time-category-colors-style">`을 주입.

| 파일 | 용도 |
|------|------|
| `main.js` | 앱 초기화 시 applyTimeCategoryColors(), applyTaskCategoryColors() 호출 |
| `Time.js` | 생산성 드롭다운 (prod-pink, prod-blue, prod-green) |
| `Time.js` | 작업 카테고리 드롭다운 (cat-dream, cat-sideincome 등) |
| `Time.js` | 오딧 그래프, 대시 도넛차트 |
| `Calendar.js` | 1일 뷰 타임테이블 블록 (실제/예상) |
| `main.css` | .time-tag-pill.prod-pink/blue/green, .time-dash-donut-seg 등 기본 스타일 |

### 3-3. 작업 카테고리 색상 (taskCategoryColors + sectionColors) - cat-*

applyTaskCategoryColors()가 동적으로 `<style id="task-category-colors-style">`을 주입.
꿈/부수입/행복/건강은 **sectionColors**와 통일.

| 파일 | 용도 |
|------|------|
| `Time.js` | 카테고리 선택 (cat-dream, cat-sideincome, cat-pleasure 등) |
| `main.css` | .time-tag-pill.cat-* 기본 스타일 (applyTaskCategoryColors가 덮어씀) |

---

## 4. 이벤트 흐름

1. **앱 로드** (main.js) → applyTimeCategoryColors(), applyTaskCategoryColors()
2. **나의계정에서 색 저장** (Idea.js) → saveTodoSettings → apply* → `app-colors-changed`
3. **app-colors-changed** 수신 (TodoList.js) → 탭 버튼 색 즉시 반영

---

## 5. CSS 클래스 매핑

| 생산성 | 클래스 | 용도 |
|--------|--------|------|
| 생산적 | prod-pink | time-tag-pill, donut, bar |
| 비생산적 | prod-blue | time-tag-pill, donut, bar |
| 기타 | prod-green | time-tag-pill, donut |

| 작업 카테고리 | 클래스 |
|---------------|--------|
| — | cat-empty |
| 꿈 | cat-dream |
| 부수입 | cat-sideincome |
| 행복 | cat-happiness |
| 건강 | cat-health |
| 쾌락충족 | cat-pleasure |
| 꿈을 방해하는 일 | cat-dreamblocking |
| 불행 | cat-unhappiness |
| 비건강 | cat-unhealthy |
| 돈을 잃는 일 | cat-moneylosing |
| 근무 | cat-work |
| 수면 | cat-sleep |
