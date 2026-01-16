(() => {
  function cleanFileName() {
    let file = (location.pathname.split("/").pop() || "").toLowerCase();
    file = file.split("?")[0].split("#")[0];
    return file;
  }

  function setActiveTab() {
    const file = cleanFileName();

    // Soporta nombres con mayúsculas y también "pacintes.html" por si lo tienes así
    const map = {
      "": "index",
      "Index.html": "index",
      "Dashboard.html": "dashboard",
      "Ordenes.html": "ordenes",
      "Pacintes.html": "pacientes" 
    };

    const screen = map[file] || "Index";

    const tabs = document.querySelectorAll(".topfb-tab[data-screen]");
    if (!tabs.length) return;

    tabs.forEach(tab => {
      const isActive = String(tab.dataset.screen || "").toLowerCase() === screen;
      tab.classList.toggle("active", isActive);
      if (isActive) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
  }

  document.addEventListener("DOMContentLoaded", setActiveTab);
})();
