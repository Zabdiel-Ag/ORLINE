// JavaScript/ordenes.js
import { supabase } from "./supabaseClient.js";

/* =========================
   KEYS (legacy local)
========================= */
const ORDERS_KEY = "orline_orders";
const PATIENTS_KEY = "pos_patients_v1";
const SESSION_KEY = "orline_session";

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
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;")
    .replaceAll(">","&gt;").replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
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

  btn.setAttribute("type", "button");

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    book.classList.toggle("is-flipped");

    const icon = btn.querySelector("i");
    if (icon) {
      icon.classList.toggle("bi-arrow-left-right");
      icon.classList.toggle("bi-arrow-repeat");
    }

    btn.title = book.classList.contains("is-flipped") ? "Ver frente" : "Ver reverso";

    requestAnimationFrame(fitBookHeight);
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
  ort3d: "Estudio Ortodoncia 3D",
  ort2d: "Estudio Ortodoncia 2D",
  rx: "Radiografías Digitales",
  photos: "Fotografías Intra/Extraorales",
  scan: "Escaneo Intraoral",
  print3d: "Impresión 3D"
};

/* =========================
   ✅ SINGLE ACTIVE BLOCK LOGIC
========================= */
function getCards() {
  return Array.from(document.querySelectorAll(".order-card"));
}
function getCardById(cardId) {
  return document.querySelector(`.order-card[data-card="${cardId}"]`);
}
function getActiveCardId() {
  const c = document.querySelector(".order-card.is-active");
  return c ? c.getAttribute("data-card") : "";
}
function setCardsDisabledExcept(activeId) {
  const cards = getCards();
  cards.forEach(card => {
    const id = card.getAttribute("data-card");
    if (!activeId) {
      card.classList.remove("is-disabled");
      return;
    }
    if (id !== activeId) card.classList.add("is-disabled");
    else card.classList.remove("is-disabled");
  });
}

/* =========================
   Preview UI (data-picked="id")
========================= */
function setPickedText(cardId, text) {
  const el = document.querySelector(`[data-picked="${cardId}"]`);
  if (!el) return;
  el.textContent = text || "—";
}
function clearPickedAll() {
  Object.keys(LABELS).forEach(k => setPickedText(k, "—"));
}

/* =========================
   Read selections inside card
========================= */
function getCardDetails(cardId) {
  const card = getCardById(cardId);
  if (!card) return {};

  const d = {};

  // radios (name=...): uno por grupo
  const radios = card.querySelectorAll('input[type="radio"]:checked');
  radios.forEach(r => { d[r.name] = r.value; });

  // checkboxes por data-check
  const checks = card.querySelectorAll('input[type="checkbox"]:checked');
  if (checks.length) {
    const groups = {};
    checks.forEach(c => {
      const g = c.getAttribute("data-check") || "checks";
      if (!groups[g]) groups[g] = [];
      groups[g].push(c.value);
    });
    Object.assign(d, groups);
  }

  // text inputs con data-field
  const texts = card.querySelectorAll('input[type="text"][data-field], textarea[data-field]');
  texts.forEach(t => {
    const k = t.getAttribute("data-field");
    const v = String(t.value || "").trim();
    if (k) d[k] = v; // guardamos aunque esté vacío para consistencia
  });

  // Normalización por tipo para que sea fácil armar el estudio
  if (cardId === "rx") {
    d.items = d.rx_items || [];
    d.notes = d.rx_notes || "";
    delete d.rx_items; delete d.rx_notes;
  }
  if (cardId === "photos") {
    d.items = d.photo_items || [];
    d.notes = d.photos_notes || "";
    delete d.photo_items; delete d.photos_notes;
  }
  if (cardId === "scan") {
    d.scope = d.scan_scope || "";
    d.specs = d.scan_specs || "";
    delete d.scan_scope; delete d.scan_specs;
  }
  if (cardId === "print3d") {
    d.base  = d.print_base || "";
    d.scope = d.print_scope || "";
    d.specs = d.print_specs || "";
    delete d.print_base; delete d.print_scope; delete d.print_specs;
  }
  if (cardId === "ort3d") {
    d.trazado = d.ort3d_trazado || "";
    d.specs   = d.ort3d_specs || "";
    delete d.ort3d_trazado; delete d.ort3d_specs;
  }
  if (cardId === "ort2d") {
    d.trazado = d.ort2d_trazado || "";
    d.specs   = d.ort2d_specs || "";
    delete d.ort2d_trazado; delete d.ort2d_specs;
  }

  return d;
}

function buildPickedPreview(cardId, details) {
  if (!details) return "—";

  if (cardId === "rx" || cardId === "photos") {
    const items = (details.items || []).filter(Boolean);
    const notes = String(details.notes || "").trim();
    if (!items.length && !notes) return "—";
    return items.length ? items.join(", ") : (notes ? "Con observaciones" : "—");
  }

  if (cardId === "scan") {
    const parts = [details.scope, details.specs].map(x => String(x||"").trim()).filter(Boolean);
    return parts.length ? parts.join(" • ") : "—";
  }

  if (cardId === "print3d") {
    const parts = [details.base, details.scope, details.specs].map(x => String(x||"").trim()).filter(Boolean);
    return parts.length ? parts.join(" • ") : "—";
  }

  if (cardId === "ort3d" || cardId === "ort2d") {
    const parts = [];
    if (details.trazado) parts.push(`Trazado ${details.trazado}`);
    if (String(details.specs || "").trim()) parts.push(details.specs);
    return parts.length ? parts.join(" • ") : "—";
  }

  return "—";
}

/* =========================
   Toggle card (single active)
========================= */
function clearCardInputs(card) {
  if (!card) return;
  card.querySelectorAll('input[type="checkbox"], input[type="radio"]').forEach(i => i.checked = false);
  card.querySelectorAll('input[type="text"]').forEach(i => i.value = "");
  card.querySelectorAll("textarea").forEach(t => t.value = "");
}

function toggleCard(cardId) {
  const card = getCardById(cardId);
  if (!card) return;

  const isActive = card.classList.contains("is-active");

  // Si estaba activa → desactivar, limpiar y re-habilitar todo
  if (isActive) {
    card.classList.remove("is-active");
    clearCardInputs(card);
    setPickedText(cardId, "—");
    setCardsDisabledExcept("");
    setTimeout(fitBookHeight, 30);
    return;
  }

  // Activar una nueva: apagar cualquier activa previa
  getCards().forEach(c => {
    if (c.classList.contains("is-active")) {
      const cid = c.getAttribute("data-card");
      c.classList.remove("is-active");
      clearCardInputs(c);
      if (cid) setPickedText(cid, "—");
    }
  });

  card.classList.add("is-active");
  setCardsDisabledExcept(cardId);
  setPickedText(cardId, "Selecciona opciones…");
  setTimeout(fitBookHeight, 30);
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
   Live preview when picking
========================= */
function bindPickedPreviewLive() {
  const update = (card) => {
    const cardId = card?.getAttribute("data-card");
    if (!cardId) return;
    const details = getCardDetails(cardId);
    const preview = buildPickedPreview(cardId, details);
    setPickedText(cardId, preview);
  };

  document.addEventListener("input", (e) => {
    const card = e.target.closest(".order-card.is-active");
    if (!card) return;
    update(card);
  });

  document.addEventListener("change", (e) => {
    const card = e.target.closest(".order-card.is-active");
    if (!card) return;
    update(card);
  });
}

/* =========================
   BUILD: Estudio bonito + payload
========================= */
function buildStudyLine(payload) {
  const active = payload?.selections?.active?.[0] || "";
  const title = active ? (LABELS[active] || active) : "—";
  const d = active ? (payload?.selections?.details?.[active] || {}) : {};
  const referido = String(payload?.referred?.doctor || "").trim() || "—";

  let studyText = title;

  if (active === "rx" || active === "photos") {
    const items = (d.items || []).filter(Boolean);
    const notes = String(d.notes || "").trim();
    if (items.length) studyText = `${title}: ${items.join(", ")}`;
    else if (notes) studyText = `${title}: (con observaciones)`;
  }
  else if (active === "scan") {
    const parts = [d.scope, d.specs].map(x => String(x||"").trim()).filter(Boolean);
    if (parts.length) studyText = `${title}: ${parts.join(" • ")}`;
  }
  else if (active === "print3d") {
    const parts = [d.base, d.scope, d.specs].map(x => String(x||"").trim()).filter(Boolean);
    if (parts.length) studyText = `${title}: ${parts.join(" • ")}`;
  }
  else if (active === "ort3d" || active === "ort2d") {
    const parts = [];
    if (String(d.trazado || "").trim()) parts.push(`Trazado ${d.trazado}`);
    if (String(d.specs || "").trim()) parts.push(d.specs);
    if (parts.length) studyText = `${title}: ${parts.join(" • ")}`;
  }

  // ✅ EXACTO como pediste
  return `Estudio: ${studyText} | Referido: ${referido}`;
}

function buildOrderPayload() {
  const sess = getSessionAny() || {};
  const bizId = (sess.bizId || sess.orgId || sess.businessId || "ORLINE_MAIN");

  const patient = {
    name: String($("pName")?.value || "").trim(),
    phone: onlyDigits($("pPhone")?.value || ""),
    age: String($("pAge")?.value || "").trim(),
    dob: String($("pDob")?.value || "").trim(),
    address: String($("pAddress")?.value || "").trim(),
    email: ""
  };

  const referred = {
    doctor: String($("refDoctor")?.value || "").trim(),
    cedula: String($("refCedula")?.value || "").trim(),
    tel: onlyDigits($("refTel")?.value || ""),
    email: String($("refEmail")?.value || "").trim()
  };

  const notes = String($("docNotes")?.value || "").trim();

  // ✅ Single active card
  const activeId = getActiveCardId();
  const activeArr = activeId ? [activeId] : [];
  const detailsObj = activeId ? { [activeId]: getCardDetails(activeId) } : {};

  const payload = {
    id: (crypto?.randomUUID ? crypto.randomUUID() : "o_" + Date.now()),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),

    doctorId: sess.userId || sess.id || "",
    doctorEmail: String(sess.email || "").toLowerCase(),
    bizId,

    patientName: patient.name,
    patientPhone: patient.phone,
    referredDoctor: referred.doctor,

    session: { ...sess, bizId },
    patient,
    referred,

    notes, // ✅ notas reales del doctor

    selections: {
      active: activeArr,
      details: detailsObj
    },

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

  payload.study_line = buildStudyLine(payload);

  return payload;
}

/* =========================
   VALIDACIÓN
========================= */
function validateOrder(payload) {
  if (!payload.patient.name || payload.patient.name.length < 2) return "Pon el nombre del paciente.";
  if (!payload.referred.doctor || payload.referred.doctor.length < 2) return "Pon el nombre del médico (obligatorio).";
  if (payload.patient.phone && payload.patient.phone.length < 8) return "El teléfono del paciente debe tener al menos 8 dígitos.";
  if (!payload.selections.active.length) return "Selecciona 1 bloque (círculo) y marca las opciones.";
  return "";
}

/* =========================
   SUPABASE HELPERS
========================= */
async function getAuthUserSafe() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}
async function getMyTeamIdSafe(userId) {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data?.team_id || null;
}

function makeFolio() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,"0");
  const day = String(d.getDate()).padStart(2,"0");
  const rnd = Math.random().toString(16).slice(2,6).toUpperCase();
  return `ORL-${y}${m}${day}-${rnd}`;
}

async function sendOrderToSupabase(payload) {
  const user = await getAuthUserSafe();
  if (!user) throw new Error("No hay sesión activa. Inicia sesión.");

  const teamId = await getMyTeamIdSafe(user.id);
  if (!teamId) throw new Error("Tu usuario no está vinculado a un team (team_members).");

  const studyLine = buildStudyLine(payload);
  const docNotes = String(payload.notes || "").trim();

  const row = {
    doctor_id: user.id,
    team_id: teamId,

    patient_name: payload.patient?.name || payload.patientName || "",
    patient_phone: payload.patient?.phone || payload.patientPhone || null,
    patient_email: payload.patient?.email || null,

    folio: payload.folio || makeFolio(),
    status: payload.status || "pending",

    // ✅ donde quieres que salga bonito en el modal:
    study: studyLine,

    // ✅ solo lo que escribió el doc:
    notes: docNotes,
  };

  const { data, error } = await supabase
    .from("orders")
    .insert([row])
    .select("id, folio, team_id, created_at")
    .single();

  if (error) throw error;
  return data;
}

/* =========================
   Guardar local (opcional)
========================= */
function saveOrderLocal(payload) {
  const orders = safeJSON(ORDERS_KEY, []);
  orders.push(payload);
  saveJSON(ORDERS_KEY, orders);

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
  window.dispatchEvent(new CustomEvent("orline:ordersUpdated", { detail: payload }));
}

/* =========================
   Reset
========================= */
function resetForm() {
  ["pName","pPhone","pAge","pDob","pAddress","refDoctor","refCedula","refTel","refEmail","docNotes"].forEach(id => {
    const el = $(id);
    if (el) el.value = "";
  });

  // cards
  getCards().forEach(card => {
    card.classList.remove("is-active", "is-disabled");
    clearCardInputs(card);
    const cid = card.getAttribute("data-card");
    if (cid) setPickedText(cid, "—");
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

function openConfirmModal(payload) {
  const modalEl = $("confirmSendModal");
  const modal = ensureConfirmModal();

  const line = payload.study_line || buildStudyLine(payload);
  const notes = String(payload.notes || "").trim() || "—";
  const teeth = (payload.cbct?.teeth || []).join(", ") || "—";

  if (!modal || !modalEl) {
    const ok = window.confirm(`${line}\n\nNotas: ${notes}\n\nCT: ${payload.cbct?.ct || "—"}\nDientes: ${teeth}\n\n¿Enviar?`);
    return Promise.resolve(ok);
  }

  const summary = $("confirmSendSummary");
  if (summary) {
    summary.innerHTML = `
      <div class="small">
        <div><b>Paciente:</b> ${escapeHtml(payload.patient.name || "—")}</div>
        <div><b>Tel:</b> ${escapeHtml(payload.patient.phone || "—")}</div>

        <hr class="my-2" style="opacity:.12">

        <div class="fw-semibold">${escapeHtml(line)}</div>

        <div class="mt-2"><b>Notas:</b> ${escapeHtml(notes)}</div>

        <hr class="my-2" style="opacity:.12">

        <div><b>CT:</b> ${escapeHtml(payload.cbct?.ct || "—")}</div>
        <div><b>Dientes:</b> ${escapeHtml(teeth)}</div>
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

    if (btnYes) btnYes.onclick = () => resolveAfterHide(true);
    if (btnNo)  btnNo.onclick  = () => resolveAfterHide(false);

    modal.show();
  });
}

/* =========================
   Bind UI
========================= */
function bindUI() {
  bindFlip();
  bindDots();
  bindCardClick();
  bindPickedPreviewLive();
  initBackUI();
  bindPhoneOnlyNumbers();
  clearPickedAll();

  $("btnResetOrder")?.addEventListener("click", () => {
    hideMsg($("orderMsg"));
    hideMsg($("orderErr"));
    resetForm();
  });

  $("btnSaveOrder")?.addEventListener("click", async () => {
    try {
      hideMsg($("orderMsg"));
      hideMsg($("orderErr"));

      const payload = buildOrderPayload();
      const err = validateOrder(payload);
      if (err) return showMsg($("orderErr"), err, 3200);

      const ok = await openConfirmModal(payload);
      if (!ok) return showMsg($("orderMsg"), "Listo, revisa la orden y vuelve a enviar.", 2200);

      showMsg($("orderMsg"), "Enviando a Supabase…", 0);
      const inserted = await sendOrderToSupabase(payload);

      payload.supabaseOrderId = inserted?.id || null;
      payload.folio = inserted?.folio || payload.folio || null;

      // local opcional
      saveOrderLocal(payload);

      showMsg($("orderMsg"), `Orden enviada ;) Folio: ${payload.folio || "—"}`, 2600);
      setTimeout(resetForm, 450);
      setTimeout(fitBookHeight, 120);

    } catch (e) {
      console.error(e);
      showMsg($("orderErr"), e?.message || "No se pudo enviar la orden.", 4500);
      hideMsg($("orderMsg"));
    }
  });

  setTimeout(fitBookHeight, 120);

  window.addEventListener("resize", () => {
    clearTimeout(window.__fitBookH);
    window.__fitBookH = setTimeout(fitBookHeight, 80);
  });

  window.addEventListener("load", () => {
    setTimeout(fitBookHeight, 120);
    setTimeout(fitBookHeight, 600);
  });
}

document.addEventListener("DOMContentLoaded", bindUI);
