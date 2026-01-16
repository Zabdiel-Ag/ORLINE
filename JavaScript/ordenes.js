/* =========================
   ORDENES (CREAR ORDEN) - FULL CONNECTED (FIXED)
   ========================= */

const ORDERS_KEY = "orline_orders";

/* ✅ Pacientes “oficiales” para Pacientes.html */
const PATIENTS_KEY = "pos_patients_v1";

/* ✅ Sesión unificada */
const SESSION_KEY = "orline_session";
const LEGACY_SESSION_KEYS = ["pos_session"];

/* =========================
   Helpers
   ========================= */
function safeJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function $(id) { return document.getElementById(id); }

function getSessionAny() {
  return safeJSON(SESSION_KEY, null) || safeJSON("pos_session", null) || null;
}

let __msgTimer = null;
function showMsg(el, msg, ms = 2500) {
  if (!el) return;
  clearTimeout(__msgTimer);
  el.textContent = msg;
  el.classList.remove("d-none");
  if (ms > 0) __msgTimer = setTimeout(() => hideMsg(el), ms);
}
function hideMsg(el) {
  if (!el) return;
  el.textContent = "";
  el.classList.add("d-none");
}

/* =========================
   INPUT: SOLO NÚMEROS (tel)
   ========================= */
function onlyDigits(str) {
  return String(str || "").replace(/\D+/g, "");
}
function bindPhoneOnlyNumbers() {
  const ids = ["pPhone", "refTel"];
  ids.forEach(id => {
    const el = $(id);
    if (!el) return;

    el.setAttribute("inputmode", "numeric");
    el.setAttribute("autocomplete", "tel");
    el.setAttribute("pattern", "[0-9]*");

    el.addEventListener("input", () => {
      const clean = onlyDigits(el.value);
      if (el.value !== clean) el.value = clean;
    });

    el.addEventListener("keydown", (e) => {
      const allowed = ["Backspace","Delete","Tab","Enter","Escape","ArrowLeft","ArrowRight","Home","End"];
      if (allowed.includes(e.key)) return;
      if ((e.ctrlKey || e.metaKey) && ["a","c","v","x"].includes(e.key.toLowerCase())) return;
      if (/^[0-9]$/.test(e.key)) return;
      e.preventDefault();
    });
  });
}

/* =========================
   FLIP (FRONT/BACK) + HEIGHT
   ========================= */
function bindFlip() {
  const btn = $("btnFlip");
  const book = $("orderBook");
  if (!btn || !book) return;

  btn.addEventListener("click", () => {
    book.classList.toggle("is-flipped");

    const icon = btn.querySelector("i");
    if (icon) {
      icon.classList.toggle("bi-arrow-left-right");
      icon.classList.toggle("bi-arrow-repeat");
    }

    btn.title = book.classList.contains("is-flipped") ? "Ver frente" : "Ver reverso";
    setTimeout(fitBookHeight, 60);
    setTimeout(fitBookHeight, 520);
  });
}

function measureFaceHeight(face) {
  if (!face) return 0;
  const surface = face.querySelector(".order-surface") || face;

  const kids = Array.from(surface.children).filter(el => el && el.offsetParent !== null);
  if (!kids.length) return surface.scrollHeight;

  let maxBottom = 0;
  for (const el of kids) {
    const bottom = el.offsetTop + el.offsetHeight;
    if (bottom > maxBottom) maxBottom = bottom;
  }

  const cs = getComputedStyle(surface);
  const padT = parseFloat(cs.paddingTop) || 0;
  const padB = parseFloat(cs.paddingBottom) || 0;

  return Math.ceil(maxBottom + padT + padB);
}

function fitBookHeight() {
  const book  = $("orderBook");
  const inner = book ? (book.querySelector(".order-book-inner") || book) : null;
  const front = book ? book.querySelector(".order-face.order-front") : null;
  const back  = book ? book.querySelector(".order-face.order-back") : null;
  if (!book || !inner || !front || !back) return;

  const flipped = book.classList.contains("is-flipped");
  const face = flipped ? back : front;

  requestAnimationFrame(() => {
    const h = measureFaceHeight(face);
    inner.style.height = h + "px";
    book.style.height  = h + "px";
  });
}

/* =========================
   TOGGLE CARDS
   ========================= */
function toggleCard(cardId) {
  const card = document.querySelector(`.order-card[data-card="${cardId}"]`);
  if (!card) return;

  card.classList.toggle("is-active");

  if (!card.classList.contains("is-active")) {
    card.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(i => i.checked = false);
    card.querySelectorAll('input[type="text"]').forEach(i => i.value = "");
  }
  setTimeout(fitBookHeight, 30);
}
function getActiveCards() {
  return Array.from(document.querySelectorAll(".order-card.is-active"))
    .map(x => x.getAttribute("data-card"))
    .filter(Boolean);
}
function bindDots() {
  document.querySelectorAll("[data-toggle-card]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute("data-toggle-card");
      if (id) toggleCard(id);
    });
  });
}
function bindCardClick() {
  document.addEventListener("click", (e) => {
    const card = e.target.closest(".order-card");
    if (!card) return;
    if (e.target.closest("input, label, textarea, select, a, button")) return;

    const key = card.getAttribute("data-card");
    if (key) toggleCard(key);
  });
}

/* =========================
   BACK UI STATE (CT + DIENTES)
   ========================= */
const BackState = { ct: "", teeth: new Set() };

function initBackUI() {
  const ctLabel = $("ctSelectedLabel");
  const ctCards = Array.from(document.querySelectorAll(".ct-card"));

  const miniCT = $("backCTMini");
  const miniTeeth = $("backTeethMini");

  function updateBackMini() {
    if (miniCT) miniCT.textContent = BackState.ct ? BackState.ct : "—";
    if (miniTeeth) {
      const arr = Array.from(BackState.teeth).sort((a,b)=>Number(a)-Number(b));
      miniTeeth.textContent = arr.length ? arr.join(", ") : "—";
    }
  }

  ctCards.forEach(btn => {
    btn.addEventListener("click", () => {
      ctCards.forEach(x => x.classList.remove("is-active"));
      btn.classList.add("is-active");

      const val = btn.getAttribute("data-ct") || "";
      BackState.ct = val;

      if (ctLabel) ctLabel.textContent = val ? `CT ${val}` : "—";

      updateBackMini();
      setTimeout(fitBookHeight, 30);
    });
  });

  const grid = $("teethGrid");
  const out  = $("teethSelectedLabel");

  function renderTeeth() {
    const arr = Array.from(BackState.teeth).sort((a,b)=>Number(a)-Number(b));
    if (out) out.textContent = arr.length ? arr.join(", ") : "—";
    updateBackMini();
    setTimeout(fitBookHeight, 30);
  }

  if (!grid) { updateBackMini(); return; }

  grid.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".tooth");
    if (!btn || !grid.contains(btn)) return;
    e.preventDefault();

    const id = btn.dataset.tooth;
    if (!id) return;

    if (BackState.teeth.has(id)) {
      BackState.teeth.delete(id);
      btn.classList.remove("is-active");
      btn.setAttribute("aria-pressed", "false");
    } else {
      BackState.teeth.add(id);
      btn.classList.add("is-active");
      btn.setAttribute("aria-pressed", "true");
    }
    renderTeeth();
  });

  renderTeeth();
}

/* =========================
   LABELS
   ========================= */
const LABELS = {
  ort3d: "Ortodoncia 3D",
  ort2d: "Ortodoncia 2D",
  rx: "Radiografías",
  photos: "Fotografías",
  scan: "Escaneo Intraoral",
  print3d: "Impresión 3D"
};

/* =========================
   BUILD PAYLOAD
   ========================= */
function buildOrderPayload() {
  const sess = getSessionAny() || {};
  const bizId = (sess.bizId || sess.orgId || sess.businessId || "ORLINE_MAIN");

  const patient = {
    name: String($("pName")?.value || "").trim(),
    phone: onlyDigits($("pPhone")?.value || ""),
    age: String($("pAge")?.value || "").trim(),
    dob: String($("pDob")?.value || "").trim(),
    address: String($("pAddress")?.value || "").trim()
  };

  const referred = {
    doctor: String($("refDoctor")?.value || "").trim(),
    cedula: String($("refCedula")?.value || "").trim(),
    tel: onlyDigits($("refTel")?.value || ""),
    email: String($("refEmail")?.value || "").trim()
  };

  const activeArr = Array.from(new Set(getActiveCards()));
  const studyNice = activeArr.length ? activeArr.map(k => (LABELS[k] || k)).join(" + ") : "—";

  return {
    id: (crypto?.randomUUID ? crypto.randomUUID() : "o_" + Date.now()),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    doctorId: sess.userId || sess.id || "",
    doctorEmail: String(sess.email || "").toLowerCase(),
    bizId,

    patientName: patient.name,
    patientPhone: patient.phone,
    referredDoctor: referred.doctor,
    study: studyNice,

    session: { ...sess, bizId },
    patient,
    referred,

    selections: { active: activeArr },

    cbct: {
      ct: BackState.ct || "",
      teeth: Array.from(BackState.teeth).sort((a,b)=>Number(a)-Number(b))
    },

    delivery: {
      method: document.querySelector('input[name="delivery_method"]:checked')?.value || "Digital",
      target: document.querySelector('input[name="delivery_target"]:checked')?.value || "Entregar al paciente"
    },

    status: "pending",
    statusLabel: "Pendiente"
  };
}

/* =========================
   VALIDACIÓN
   ========================= */
function validateOrder(payload) {
  if (!payload.patient.name || payload.patient.name.length < 2) return "Pon el nombre del paciente.";
  if (!payload.referred.doctor || payload.referred.doctor.length < 2) return "Pon el nombre del médico (obligatorio).";
  if (payload.patient.phone && payload.patient.phone.length < 8) return "El teléfono del paciente debe tener al menos 8 dígitos.";
  if (!payload.selections.active.length) return "Selecciona al menos un bloque (círculo).";
  return "";
}

/* =========================
   Guardar (orders + patients) ✅
   ========================= */
function saveOrder(payload) {
  // 1) órdenes
  const orders = safeJSON(ORDERS_KEY, []);
  orders.push(payload);
  saveJSON(ORDERS_KEY, orders);

  // 2) pacientes oficiales (pos_patients_v1)
  const patients = safeJSON(PATIENTS_KEY, []);
  const bizId = payload.bizId || "ORLINE_MAIN";

  const phoneKey = String(payload.patient?.phone || "").trim();
  const nameKey  = String(payload.patient?.name || "").trim().toLowerCase();

  const existing = patients.find(p => {
    if ((p.bizId || "ORLINE_MAIN") !== bizId) return false;
    const pPhone = String(p.phone || "").trim();
    const pName  = String(p.name || "").trim().toLowerCase();
    return (phoneKey && pPhone && phoneKey === pPhone) || (nameKey && pName && nameKey === pName);
  });

  if (existing) {
    existing.bizId = bizId;
    existing.name = payload.patient?.name || existing.name || "";
    existing.phone = payload.patient?.phone || existing.phone || "";
    existing.age = payload.patient?.age || existing.age || "";
    existing.dob = payload.patient?.dob || existing.dob || "";
    existing.address = payload.patient?.address || existing.address || "";
    existing.doctor = payload.referred?.doctor || existing.doctor || "";
    existing.status = existing.status || "pending";
    existing.updatedAt = new Date().toISOString();
  } else {
    patients.unshift({
      id: (crypto?.randomUUID ? crypto.randomUUID() : "p_" + Date.now()),
      bizId,
      name: payload.patient?.name || "",
      phone: payload.patient?.phone || "",
      email: payload.patient?.email || "",
      doctor: payload.referred?.doctor || "",
      age: payload.patient?.age || "",
      dob: payload.patient?.dob || "",
      address: payload.patient?.address || "",

      status: "pending",
      flags: { urgent:false, missing:false, followup:false },
      followups: [],
      notes: "",

      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  saveJSON(PATIENTS_KEY, patients);

  // 3) evento para que Dashboard/Pacientes refresquen (misma pestaña)
  window.dispatchEvent(new CustomEvent("orline:ordersUpdated", { detail: payload }));
}

/* =========================
   Reset
   ========================= */
function resetForm() {
  ["pName","pPhone","pAge","pDob","pAddress","refDoctor","refCedula","refTel","refEmail"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });

  document.querySelectorAll(".order-card.is-active").forEach(card => {
    card.classList.remove("is-active");
    card.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(i => i.checked = false);
    card.querySelectorAll('input[type="text"]').forEach(i => i.value = "");
  });

  BackState.ct = "";
  BackState.teeth.clear();

  document.querySelectorAll(".ct-card.is-active").forEach(x => x.classList.remove("is-active"));
  if ($("ctSelectedLabel")) $("ctSelectedLabel").textContent = "—";

  document.querySelectorAll(".tooth.is-active").forEach(x => x.classList.remove("is-active"));
  if ($("teethSelectedLabel")) $("teethSelectedLabel").textContent = "—";

  if ($("backCTMini")) $("backCTMini").textContent = "—";
  if ($("backTeethMini")) $("backTeethMini").textContent = "—";

  const dm = document.querySelector('input[name="delivery_method"][value="Digital"]');
  if (dm) dm.checked = true;

  const dt = document.querySelector('input[name="delivery_target"][value="Entregar al paciente"]');
  if (dt) dt.checked = true;

  setTimeout(fitBookHeight, 80);
}

/* =========================
   Confirm Modal
   ========================= */
let __confirmModalInstance = null;
function ensureConfirmModal() {
  const modalEl = $("confirmSendModal");
  if (!modalEl || !window.bootstrap) return null;
  if (!__confirmModalInstance) __confirmModalInstance = new bootstrap.Modal(modalEl, { backdrop:"static", keyboard:false });
  return __confirmModalInstance;
}
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function openConfirmModal(payload) {
  const modalEl = $("confirmSendModal");
  const modal = ensureConfirmModal();

  if (!modal || !modalEl) {
    const ok = window.confirm("¿Confirmas que esté todo correcto?\n\nSi: enviar\nCancelar: revisar");
    return Promise.resolve(ok);
  }

  const summary = $("confirmSendSummary");
  if (summary) {
    const active = payload.selections?.active || [];
    const teeth = (payload.cbct?.teeth || []).join(", ");
    summary.innerHTML = `
      <div class="small">
        <div><b>Paciente:</b> ${escapeHtml(payload.patient.name || "—")}</div>
        <div><b>Tel:</b> ${escapeHtml(payload.patient.phone || "—")}</div>
        <div><b>Médico:</b> ${escapeHtml(payload.referred.doctor || "—")}</div>
        <div><b>CT:</b> ${escapeHtml(payload.cbct?.ct || "—")}</div>
        <div><b>Dientes:</b> ${escapeHtml(teeth || "—")}</div>
        <div><b>Estudios:</b> ${escapeHtml(active.map(x => LABELS[x] || x).join(", ") || "—")}</div>
        <div><b>Estado:</b> ${escapeHtml(payload.statusLabel || "Pendiente")}</div>
      </div>
    `;
  }

  return new Promise((resolve) => {
    const btnYes = $("btnConfirmSendYes");
    const btnNo  = $("btnConfirmSendNo");

    const resolveAfterHide = (value) => {
      const onHidden = () => resolve(value);
      modalEl.addEventListener("hidden.bs.modal", onHidden, { once:true });
      modal.hide();
    };

    btnYes.onclick = () => resolveAfterHide(true);
    btnNo.onclick  = () => resolveAfterHide(false);

    modal.show();
  });
}

/* =========================
   Bind UI ✅
   ========================= */
function bindUI() {
  bindFlip();
  bindDots();
  bindCardClick();
  initBackUI();
  bindPhoneOnlyNumbers();

  $("btnResetOrder")?.addEventListener("click", () => {
    hideMsg($("orderMsg"));
    hideMsg($("orderErr"));
    resetForm();
  });

  $("btnSaveOrder")?.addEventListener("click", async () => {
    hideMsg($("orderMsg"));
    hideMsg($("orderErr"));

    const payload = buildOrderPayload();
    const err = validateOrder(payload);
    if (err) return showMsg($("orderErr"), err, 3000);

    const ok = await openConfirmModal(payload);
    if (!ok) return showMsg($("orderMsg"), "Listo, revisa la orden y vuelve a enviar.", 2500);

    // ✅ AQUI ESTABA TU BUG: sí o sí hay que guardar
    saveOrder(payload);

    showMsg($("orderMsg"), "Orden guardada correctamente ✅", 2500);
    setTimeout(resetForm, 450);
    setTimeout(fitBookHeight, 120);
  });

  setTimeout(fitBookHeight, 120);

  window.addEventListener("resize", () => {
    clearTimeout(window.__fitBookH);
    window.__fitBookH = setTimeout(fitBookHeight, 80);
  });
  window.addEventListener("load", () => setTimeout(fitBookHeight, 120));
}

document.addEventListener("DOMContentLoaded", bindUI);
