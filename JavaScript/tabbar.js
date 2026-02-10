/* =========================
   iOS TAB BAR — Active + Tap FX + Auto Safe Space
========================= */
document.addEventListener("DOMContentLoaded", () => {
  const tabs = Array.from(document.querySelectorAll(".ios-tabbar .ios-tab"));
  const tabbar = document.querySelector(".ios-tabbar");

  if (!tabs.length || !tabbar) return;

  // obtiene "pacientes" desde "/Pacientes.html" o "/pacientes"
  function currentKey() {
    let p = (location.pathname || "").toLowerCase();
    if (p.endsWith("/")) p = p.slice(0, -1);
    const last = (p.split("/").pop() || "").trim();

    if (!last) return "dashboard";
    if (last.endsWith(".html")) return last.replace(".html", "");
    return last;
  }

  function tabKey(tab) {
    const dr = (tab.getAttribute("data-route") || "").toLowerCase().trim();
    if (dr) return dr;

    const href = (tab.getAttribute("href") || "").toLowerCase().trim();
    const file = href.split("/").pop().split("?")[0].split("#")[0];
    return (file || "").replace(".html", "");
  }

  function paint() {
    const cur = currentKey();
    let matched = false;

    tabs.forEach(t => {
      const ok = tabKey(t) === cur;
      t.classList.toggle("active", ok);
      if (ok) matched = true;
    });

    if (!matched && tabs[0]) tabs[0].classList.add("active");
  }

  function tapFx(tab) {
    const down = () => tab.classList.add("tap-active");
    const up = () => setTimeout(() => tab.classList.remove("tap-active"), 140);
    const leave = () => tab.classList.remove("tap-active");

    tab.addEventListener("touchstart", down, { passive: true });
    tab.addEventListener("touchend", up);
    tab.addEventListener("touchcancel", leave);

    tab.addEventListener("mousedown", down);
    tab.addEventListener("mouseup", up);
    tab.addEventListener("mouseleave", leave);

    // activación visual inmediata (por si tarda en navegar)
    tab.addEventListener("click", () => {
      tabs.forEach(x => x.classList.remove("active"));
      tab.classList.add("active");
    });
  }

  /* =========================
     ✅ AUTO SAFE SPACE (no estorba)
     - Ajusta padding-bottom del body según el alto REAL del tabbar
     - Funciona con teclado móvil, orientación y cambios de contenido
  ========================= */
  function updateSafeSpace() {
    // Altura real del tabbar
    const h = Math.ceil(tabbar.getBoundingClientRect().height || 0);

    // Lee env(safe-area-inset-bottom) indirectamente (si existe en tu CSS)
    const pb = parseFloat(getComputedStyle(tabbar).paddingBottom || "0") || 0;

    // Extra para que se sienta “respiración” abajo
    const extra = 14;

    // Ajuste final
    const space = h + pb + extra;

    document.body.style.paddingBottom = space + "px";
  }

  // Observa cambios en el DOM por si aparece algo que empuje el layout
  const mo = new MutationObserver(() => updateSafeSpace());
  mo.observe(document.body, { childList: true, subtree: true, attributes: true });

  // Reacciona a: resize/orientación/teclado
  window.addEventListener("resize", updateSafeSpace);
  window.addEventListener("orientationchange", updateSafeSpace);
  window.addEventListener("focusin", updateSafeSpace);
  window.addEventListener("focusout", updateSafeSpace);

  // Init
  tabs.forEach(tapFx);
  paint();
  updateSafeSpace();

  window.addEventListener("popstate", () => {
    paint();
    updateSafeSpace();
  });

  console.log("[tabbar] currentKey =", currentKey());
});
