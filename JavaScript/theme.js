(() => {
  /* =========================
     ORLINE — GLOBAL THEME
     appTheme: "auto" | "dark" | "light"
     - Mobile: AUTO → DARK → LIGHT → AUTO
     - Desktop: DARK ↔ LIGHT
     - Bootstrap 5.3 (data-bs-theme)
     - Mantiene tu .theme-light
     - Cambia logo según tema
  ========================= */

  const THEME_KEY = "appTheme";
  const LIGHT_CLASS = "theme-light";

  const LOGOS = {
    dark: "Multimedia/3.png",
    light: "Multimedia/2.png",
  };

  const mqScheme = window.matchMedia("(prefers-color-scheme: dark)");
  const mqMobile = window.matchMedia("(max-width: 991.98px)"); // Bootstrap lg-

  const isMobile = () => mqMobile.matches;
  const systemTheme = () => (mqScheme.matches ? "dark" : "light");

  // ✅ Default: móvil=auto, desktop=dark
  function getSavedTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark" || saved === "auto") return saved;
    return isMobile() ? "auto" : "dark";
  }

  function setThemeClass(finalTheme) {
    const isLight = finalTheme === "light";

    document.documentElement.classList.toggle(LIGHT_CLASS, isLight);
    document.body?.classList.toggle(LIGHT_CLASS, isLight);

    document.documentElement.setAttribute("data-bs-theme", finalTheme);
    document.documentElement.style.colorScheme = finalTheme;
    document.documentElement.dataset.theme = finalTheme;
  }

  function updateBrandLogo(finalTheme) {
    const img = document.querySelector("img.topfb-logoimg");
    if (!img) return;

    const nextSrc = finalTheme === "light" ? LOGOS.light : LOGOS.dark;
    if ((img.getAttribute("src") || "").trim() !== nextSrc) img.setAttribute("src", nextSrc);
  }

  function updateThemeIcon(mode, finalTheme) {
    const btn = document.getElementById("btnTheme");
    if (!btn) return;

    // ✅ En desktop mostramos el tema FINAL (dark/light).
    // ✅ En móvil mostramos el MODO (auto/dark/light).
    const show = isMobile() ? mode : finalTheme;

    let icon = "bi-moon-stars";
    let title = "Tema: Claro";

    if (show === "dark") {
      icon = "bi-sun";
      title = "Tema: Oscuro";
    } else if (show === "light") {
      icon = "bi-moon-stars";
      title = "Tema: Claro";
    } else {
      icon = "bi-circle-half";
      title = `Tema: Automático (${finalTheme})`;
    }

    btn.innerHTML = `<i class="bi ${icon}"></i>`;
    btn.setAttribute("aria-label", title);
    btn.title = title;
  }

  // ✅ Desktop NO usa auto (aunque esté guardado), se resuelve a systemTheme
  function resolveFinalTheme(mode) {
    if (mode === "auto") return systemTheme();
    return mode === "light" ? "light" : "dark";
  }

  function applyTheme(mode) {
    const finalTheme = resolveFinalTheme(mode);

    setThemeClass(finalTheme);
    updateThemeIcon(mode, finalTheme);
    updateBrandLogo(finalTheme);

    window.dispatchEvent(new Event("orline:themeChanged"));
  }

  function setTheme(mode) {
    localStorage.setItem(THEME_KEY, mode);
    applyTheme(mode);
  }

  function cycleTheme() {
    const current = getSavedTheme();

    if (!isMobile()) {
      // Desktop: dark ↔ light
      const finalNow = resolveFinalTheme(current);
      const next = finalNow === "dark" ? "light" : "dark";
      setTheme(next);
      return;
    }

    // Mobile: auto → dark → light → auto
    const next =
      current === "auto" ? "dark" :
      current === "dark" ? "light" :
      "auto";

    setTheme(next);
  }

  // Compat: addEventListener vs addListener
  function onMQ(mq, cb) {
    if (mq.addEventListener) mq.addEventListener("change", cb);
    else if (mq.addListener) mq.addListener(cb);
  }

  function init() {
    applyTheme(getSavedTheme());

    const btn = document.getElementById("btnTheme");
    if (btn && !btn.dataset.themeBound) {
      btn.dataset.themeBound = "1";
      btn.addEventListener("click", cycleTheme);
    }

    // ✅ Si cambia el sistema: solo afecta si estamos en auto (en móvil o en desktop si lo dejaron guardado)
    onMQ(mqScheme, () => {
      const saved = getSavedTheme();
      if (saved === "auto") applyTheme("auto");
    });

    // ✅ Si cambias de tamaño (móvil/desktop), re-aplica para icono + comportamiento
    onMQ(mqMobile, () => applyTheme(getSavedTheme()));

    // Sync entre pestañas
    window.addEventListener("storage", (e) => {
      if (e.key === THEME_KEY) applyTheme(getSavedTheme());
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  window.ORLINE_THEME = { set: setTheme, get: getSavedTheme, cycle: cycleTheme };
})();
