// JavaScript/topnav.js
(() => {
  function cleanFileName() {
    let file = (location.pathname.split("/").pop() || "").toLowerCase();
    file = file.split("?")[0].split("#")[0];
    return file || "dashboard.html"; // si abres / sin archivo
  }

  function setActiveTab() {
    const file = cleanFileName();

    // Busca tabs por href (tu HTML real)
    const tabs = document.querySelectorAll(".topfb-center .topfb-tab[href]");
    if (!tabs.length) return;

    tabs.forEach(a => {
      const href = (a.getAttribute("href") || "").toLowerCase();
      const isActive = href === file;

      a.classList.toggle("active", isActive);
      if (isActive) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
  }

  document.addEventListener("DOMContentLoaded", setActiveTab);
})();
