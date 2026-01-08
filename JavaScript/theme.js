(() => {
  const THEME_KEY = "appTheme"; // "dark" | "light"
  const LIGHT_CLASS = "theme-light";

  const LOGOS = {
    dark: "Multimedia/3.png",   // logo para MODO OSCURO
    light: "Multimedia/2.png"   // logo para MODO CLARO (sin fondo si lo haces PNG)
  };

  function setThemeClass(isLight) {
    document.documentElement.classList.toggle(LIGHT_CLASS, isLight);
    document.body?.classList.toggle(LIGHT_CLASS, isLight);
    document.documentElement.dataset.theme = isLight ? "light" : "dark";
  }

  function updateThemeIcon(isLight) {
    const btn = document.getElementById("btnTheme");
    if (!btn) return;

    btn.innerHTML = isLight
      ? `<i class="bi bi-sun"></i>`
      : `<i class="bi bi-moon-stars"></i>`;

    btn.setAttribute("aria-label", isLight ? "Tema claro" : "Tema oscuro");
    btn.title = isLight ? "Tema claro" : "Tema oscuro";
  }

  function updateBrandLogo(isLight) {
    const img = document.querySelector("img.topfb-logoimg");
    if (!img) return;

    const nextSrc = isLight ? LOGOS.light : LOGOS.dark;

    // Evita recargas innecesarias si ya está puesto
    const current = (img.getAttribute("src") || "").trim();
    if (current === nextSrc) return;

    img.setAttribute("src", nextSrc);
  }

  function applyTheme(theme) {
    const isLight = theme === "light";
    setThemeClass(isLight);
    updateThemeIcon(isLight);
    updateBrandLogo(isLight);
  }

  function getSavedTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
    return "dark";
  }

  function toggleTheme() {
    const isLightNow = document.documentElement.classList.contains(LIGHT_CLASS);
    const next = isLightNow ? "dark" : "light";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  document.addEventListener("DOMContentLoaded", () => {
    applyTheme(getSavedTheme());

    const btn = document.getElementById("btnTheme");
    if (btn) btn.addEventListener("click", toggleTheme);
  });

  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY) {
      applyTheme(getSavedTheme());
    }
  });
})();
