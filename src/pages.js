export function showOnly(pageId) {
  const pages = document.querySelectorAll("#app > .page");
  pages.forEach((p) => {
    if (p.id === pageId + "-page") {
      p.style.display = p.classList.contains("login-page") ? "flex" : "block";
    } else {
      p.style.display = "none";
    }
  });
}
