# THU 아래 굵은 선 위치 (찾은 결과)

## 그려지고 있던 선이 나오는 위치

- **파일:** `src/main.css`
- **라인:** 24674–24685
- **선택자:** `.calendar-1day-view .calendar-1day-time-header`
- **속성:** `border-bottom: 1.5px solid #d1d5db;`

이 요소는 **1일 뷰 시간 테이블의 맨 위 헤더 행**(예상|오늘실제)입니다.  
홈에서는 THU 다음에 오는 `.home-embed-1day` 안에 있어서, THU 바로 아래에 보이는 “굵은 선”이 바로 이 **헤더의 border-bottom**입니다.

## 왜 끝까지 안 이어져 보였는지

- 이 헤더의 조상인 `.calendar-monthly-main`에 `padding: 1rem`이 있어서,  
  border는 **패딩 안쪽 너비**만 차지합니다.
- 그래서 선이 **좌우에 여백**이 생깁니다.
- 굵기 1.5px, 색상 #d1d5db라서 **굵고 진하게** 보입니다.

## 수정 방향

1. **홈·모바일에서만** 위 헤더의 `border-bottom`을 제거해, 이 굵은 선이 더 이상 안 나오게 함.
2. THU 아래 구분선은 **`.home-daily-weekday::after`** 한 가지만 쓰고,  
   **0.5px, #DCDCDA, 끝까지 이어지게** 유지.
