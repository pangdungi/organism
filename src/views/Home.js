/**
 * Home 페이지 - 3분할 레이아웃, 한 구역에 오늘 해치우기 캘린더
 */

import { render1DayView } from "./Calendar.js";

export function render() {
  const el = document.createElement("div");
  el.className = "app-tab-panel-content home-view";

  const threeCols = document.createElement("div");
  threeCols.className = "home-view-three";

  const section1 = document.createElement("div");
  section1.className = "home-view-section home-view-section--calendar";
  const header1 = document.createElement("h3");
  header1.className = "home-view-section-title";
  header1.textContent = "Daily";
  section1.appendChild(header1);
  const calendarWrap = render1DayView(null);
  calendarWrap.classList.add("home-embed-1day");
  section1.appendChild(calendarWrap);

  const section2 = document.createElement("div");
  section2.className = "home-view-section";
  const header2 = document.createElement("h3");
  header2.className = "home-view-section-title";
  header2.textContent = "Event";
  section2.appendChild(header2);

  const section3 = document.createElement("div");
  section3.className = "home-view-section";
  const header3 = document.createElement("h3");
  header3.className = "home-view-section-title";
  header3.textContent = "To do list";
  section3.appendChild(header3);

  threeCols.appendChild(section1);
  threeCols.appendChild(section2);
  threeCols.appendChild(section3);
  el.appendChild(threeCols);

  return el;
}
