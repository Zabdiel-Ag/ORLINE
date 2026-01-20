const USERS_KEY = "orline_users";
const SESSION_KEY = "orline_session";
const DOCTOR_PROFILES_KEY = "orline_doctor_profiles";

/*  Pacientes oficiales creados desde Órdenes */
const PATIENTS_KEY = "pos_patients_v1";

/* Órdenes oficiales */
const ORDERS_KEYS = ["orline_orders", "pos_orders_v1", "pos_orders"];

/* =========================
    MODO DOCTOR (solo lectura)
   ========================= */
const DOCTOR_READONLY = true;

/* -------------------------
   Storage utils
-------------------------- */
function jget(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
  catch { return fallback; }
}
function jset(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

function getSessionAny() {
  return jget(SESSION_KEY, null) || jget("pos_session", null);
}
function clearSessionAny() {
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem("pos_session");
}

function getUsers() { return jget(USERS_KEY, []); }

function getDoctorProfiles() { return jget(DOCTOR_PROFILES_KEY, []); }
function getDoctorProfileByUserId(userId) {
  return getDoctorProfiles().find(p => p.userId === userId) || null;
}

function requireAuth() {
  const s = getSessionAny();
  const sid = s?.userId || s?.id;
  if (!sid) { window.location.href = "Index.html"; return null; }

  const u = getUsers().find(x => x.id === sid);
  if (!u) { clearSessionAny(); window.location.href = "Index.html"; return null; }

  const profile = getDoctorProfileByUserId(u.id);

  const biz = {
    id: (s.bizId || s.orgId || s.businessId || "ORLINE_MAIN"),
    name: profile?.clinicName || "ORLINE",
    handle: (u.email || u.username || "user").split("@")[0]
  };

  return { user: u, biz, profile, session: s };
}

/* -------------------------
   DOM
-------------------------- */
const $ = (id) => document.getElementById(id);

/* KPIs */
const pCountTotal = $("pCountTotal");
const pCountProcess = $("pCountProcess");
const pCountReady = $("pCountReady");
const pCountDelivered = $("pCountDelivered");

/* Controls */
const pSearch = $("pSearch");
const pFilterStatus = $("pFilterStatus");
const pSort = $("pSort");
const btnNewPatient = $("btnNewPatient");
const btnExportPatients = $("btnExportPatients");

const chipUrgent = $("chipUrgent");
const chipMissing = $("chipMissing");
const chipFollowup = $("chipFollowup");

/* List */
const patientsList = $("patientsList");
const patientsEmpty = $("patientsEmpty");
const pResultsInfo = $("pResultsInfo");

/* Detail */
const patientDetailEmpty = $("patientDetailEmpty");
const patientDetailBody = $("patientDetailBody");

const dName = $("dName");
const dMeta = $("dMeta");
const dPhone = $("dPhone");
const dEmail = $("dEmail");
const dStatusText = $("dStatusText");
const dStatus = $("dStatus"); // puede no existir en HTML readonly

const btnEditPatient = $("btnEditPatient");
const btnAddNote = $("btnAddNote");
const btnDeletePatient = $("btnDeletePatient");

const followupList = $("followupList");
const followupEmpty = $("followupEmpty");
const btnAddFollowup = $("btnAddFollowup");

const ordersByPatient = $("ordersByPatient");
const ordersEmpty = $("ordersEmpty");

/* Toasts */
const patientMsg = $("patientMsg");
const patientErr = $("patientErr");

/* Modals */
const logoutModalEl = $("logoutModal");
const followupModalEl = $("followupModal");

const logoutModal = (logoutModalEl && window.bootstrap?.Modal)
  ? bootstrap.Modal.getOrCreateInstance(logoutModalEl)
  : null;

const followupModal = (followupModalEl && window.bootstrap?.Modal)
  ? bootstrap.Modal.getOrCreateInstance(followupModalEl)
  : null;

/* Followup modal fields */
const fuText = $("fuText");
const fuDate = $("fuDate");
const fuType = $("fuType");
const btnSaveFollowup = $("btnSaveFollowup");

/* Logout wiring */
const btnLogoutDash = $("btnLogoutDash");
const confirmLogout = $("confirmLogout");

/* -------------------------
   State
-------------------------- */
let ctx = null;
let patients = [];
let selectedId = null;

/* chip filters */
let chipFilter = { urgent:false, missing:false, followup:false };

/* -------------------------
   Utils
-------------------------- */
function isReadonly() { return !!DOCTOR_READONLY; }

function disableEl(el) {
  if (!el) return;
  el.setAttribute("disabled", "disabled");
  el.style.pointerEvents = "none";
  el.style.opacity = "0.6";
}
function hideEl(el) {
  if (!el) return;
  el.classList.add("d-none");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function nowISO() { return new Date().toISOString(); }

function showMsg(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("d-none"), 2600);
}
function showOk(msg) { showMsg(patientMsg, msg); }
function showBad(msg) { showMsg(patientErr, msg); }

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", { year:"numeric", month:"short", day:"2-digit" });
  } catch { return "—"; }
}

function statusLabel(s) {
  switch (s) {
    case "pending": return "Pendiente";
    case "process": return "En proceso";
    case "ready": return "Listo";
    case "delivered": return "Entregado";
    default: return "—";
  }
}
function statusIcon(s) {
  switch (s) {
    case "pending": return "bi-hourglass-split";
    case "process": return "bi-gear";
    case "ready": return "bi-check2-circle";
    case "delivered": return "bi-box-seam";
    default: return "bi-dot";
  }
}

/* -------------------------
   Data: Patients + Orders
-------------------------- */
function normalizePatient(p) {
  if (!p) return p;
  p.bizId = p.bizId || "ORLINE_MAIN";
  p.status = p.status || "pending";
  if (!p.flags) p.flags = { urgent:false, missing:false, followup:false };
  p.flags.urgent = !!p.flags.urgent;
  p.flags.missing = !!p.flags.missing;
  p.flags.followup = !!p.flags.followup;
  if (!Array.isArray(p.followups)) p.followups = [];
  return p;
}

function getAllPatients() {
  return (jget(PATIENTS_KEY, []) || []).map(normalizePatient);
}
function saveAllPatients(all) {
  jset(PATIENTS_KEY, all);
}
function getPatientsByBiz(bizId) {
  return getAllPatients().filter(p => (p.bizId || "ORLINE_MAIN") === bizId);
}

/* Orders: busca en keys conocidas */
function getAllOrdersAnyKey() {
  for (const k of ORDERS_KEYS) {
    const arr = jget(k, null);
    if (Array.isArray(arr)) return arr;
  }
  return [];
}

/* reconstruye pacientes a partir de órdenes si no hay */
function rebuildPatientsFromOrdersIfNeeded() {
  const existing = getAllPatients();
  if (existing.length) return existing;

  const orders = getAllOrdersAnyKey();
  if (!orders.length) return [];

  const bizId = ctx?.biz?.id || "ORLINE_MAIN";
  const map = new Map();

  for (const o of orders) {
    if (!o) continue;

    const obiz = o.bizId || o.session?.bizId || "ORLINE_MAIN";
    if (obiz !== bizId) continue;

    const name = (o.patientName || o.patient?.name || "").trim();
    const phone = (o.patientPhone || o.patient?.phone || "").trim();
    if (!name && !phone) continue;

    const key = (phone ? "p:" + phone : "n:" + name.toLowerCase()) + "|biz:" + obiz;

    if (!map.has(key)) {
      map.set(key, normalizePatient({
        id: o.patientId || (crypto?.randomUUID ? crypto.randomUUID() : "p_" + Date.now()),
        bizId: obiz,
        name,
        phone,
        email: (o.patient?.email || ""),
        doctor: (o.referredDoctor || o.referred?.doctor || ""),
        status: "pending",
        flags: { urgent:false, missing:false, followup:false },
        followups: [],
        notes: "",
        createdAt: o.createdAt || nowISO(),
        updatedAt: o.updatedAt || o.createdAt || nowISO()
      }));
    } else {
      const p = map.get(key);
      p.updatedAt = (o.updatedAt || o.createdAt || p.updatedAt);
    }
  }

  const built = Array.from(map.values()).sort((a,b) => new Date(b.updatedAt||0) - new Date(a.updatedAt||0));
  if (built.length) saveAllPatients(built);
  return built;
}

/* -------------------------
   Render
-------------------------- */
function renderKPIs(list) {
  const total = list.length;
  const process = list.filter(p => p.status === "process").length;
  const ready = list.filter(p => p.status === "ready").length;
  const delivered = list.filter(p => p.status === "delivered").length;

  if (pCountTotal) pCountTotal.textContent = total;
  if (pCountProcess) pCountProcess.textContent = process;
  if (pCountReady) pCountReady.textContent = ready;
  if (pCountDelivered) pCountDelivered.textContent = delivered;
}

function patientBadges(p) {
  const chips = [];
  if (p.flags?.urgent) chips.push(`<span class="badge rounded-pill text-bg-danger">Urgente</span>`);
  if (p.flags?.missing) chips.push(`<span class="badge rounded-pill text-bg-warning">Falta info</span>`);
  if (p.flags?.followup) chips.push(`<span class="badge rounded-pill text-bg-info">Seguimiento</span>`);
  return chips.join(" ");
}

function applyFiltersAndSort() {
  const q = (pSearch?.value || "").trim().toLowerCase();
  const status = (pFilterStatus?.value || "all");

  let list = patients.slice();

  if (q) {
    list = list.filter(p => {
      const hay = [p.name, p.phone, p.email, p.doctor, p.id].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  if (status !== "all") list = list.filter(p => (p.status || "pending") === status);

  if (chipFilter.urgent) list = list.filter(p => !!p.flags?.urgent);
  if (chipFilter.missing) list = list.filter(p => !!p.flags?.missing);
  if (chipFilter.followup) list = list.filter(p => !!p.flags?.followup || (p.followups?.length > 0));

  const s = (pSort?.value || "recent");
  if (s === "name") {
    list.sort((a,b) => (a.name||"").localeCompare(b.name||""));
  } else if (s === "status") {
    const order = { pending:0, process:1, ready:2, delivered:3 };
    list.sort((a,b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  } else {
    list.sort((a,b) => new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0));
  }

  return list;
}

function renderList() {
  const list = applyFiltersAndSort();

  if (pResultsInfo) pResultsInfo.textContent = `${list.length} resultados`;
  if (patientsEmpty) patientsEmpty.classList.toggle("d-none", list.length !== 0);
  if (!patientsList) return;

  patientsList.innerHTML = list.map(p => {
    const active = p.id === selectedId ? "is-active" : "";
    const meta = [
      p.doctor ? `Dr(a). ${p.doctor}` : null,
      p.phone ? p.phone : null,
      p.email ? p.email : null
    ].filter(Boolean).join(" • ");

    return `
      <button class="patient-item cardx p-3 text-start ${active}" data-id="${escapeHtml(p.id)}" type="button">
        <div class="d-flex align-items-start justify-content-between gap-2">
          <div class="me-2">
            <div class="fw-bold">${escapeHtml(p.name || "Sin nombre")}</div>
            <div class="muted small">${escapeHtml(meta || "—")}</div>
          </div>
          <div class="text-end">
            <div class="small">
              <i class="bi ${statusIcon(p.status)} me-1"></i>
              <span class="fw-semibold">${escapeHtml(statusLabel(p.status))}</span>
            </div>
            <div class="muted small mt-1">${fmtDate(p.updatedAt || p.createdAt)}</div>
          </div>
        </div>
        <div class="mt-2 d-flex flex-wrap gap-2">
          ${patientBadges(p)}
        </div>
      </button>
    `;
  }).join("");

  if (!selectedId && list.length) selectPatient(list[0].id);

  renderKPIs(patients);
}

function renderDetail(p) {
  if (!patientDetailEmpty || !patientDetailBody) return;

  if (!p) {
    patientDetailEmpty.classList.remove("d-none");
    patientDetailBody.classList.add("d-none");
    return;
  }

  patientDetailEmpty.classList.add("d-none");
  patientDetailBody.classList.remove("d-none");

  if (dName) dName.textContent = p.name || "—";
  if (dMeta) {
    dMeta.textContent = [
      p.doctor ? `Dr(a). ${p.doctor}` : "Sin doctor",
      `ID: ${p.id?.slice(0,8) || "—"}`,
      `Actualizado: ${fmtDate(p.updatedAt || p.createdAt)}`
    ].join(" • ");
  }
  if (dPhone) dPhone.textContent = p.phone || "—";
  if (dEmail) dEmail.textContent = p.email || "—";

  if (dStatusText) dStatusText.textContent = statusLabel(p.status);

  if (dStatus) {
    dStatus.value = p.status || "pending";
    if (isReadonly()) disableEl(dStatus);
  }

  renderFollowups(p);
  renderOrdersForPatient(p);
}

function renderFollowups(p) {
  if (!followupList || !followupEmpty) return;

  const arr = Array.isArray(p.followups) ? p.followups.slice() : [];
  arr.sort((a,b) => new Date(b.at||0) - new Date(a.at||0));

  followupEmpty.classList.toggle("d-none", arr.length !== 0);

  followupList.innerHTML = arr.map(f => {
    const typeIcon =
      f.type === "call" ? "bi-telephone" :
      f.type === "reminder" ? "bi-bell" :
      f.type === "status" ? "bi-shuffle" : "bi-journal-text";

    const when = f.date ? `Para: ${escapeHtml(f.date)}` : fmtDate(f.at);

    const delBtn = isReadonly()
      ? ""
      : `<button class="btn btn-soft py-1 px-2" data-act="delFollow" data-id="${escapeHtml(f.id)}" type="button" title="Eliminar">
           <i class="bi bi-x-lg"></i>
         </button>`;

    return `
      <div class="cardx p-3">
        <div class="d-flex align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-semibold"><i class="bi ${typeIcon} me-2"></i>${escapeHtml(f.text || "")}</div>
            <div class="muted small mt-1">${escapeHtml(when)}</div>
          </div>
          ${delBtn}
        </div>
      </div>
    `;
  }).join("");
}

function renderOrdersForPatient(p) {
  if (!ordersByPatient || !ordersEmpty) return;

  const all = getAllOrdersAnyKey();
  const phone = (p.phone || "").trim();
  const name = (p.name || "").trim().toLowerCase();

  const list = all.filter(o => {
    if (!o) return false;
    const op = (o.patientPhone || o.patient?.phone || "").trim();
    const on = (o.patientName || o.patient?.name || "").trim().toLowerCase();
    const obiz = (o.bizId || o.session?.bizId || "ORLINE_MAIN");
    if (obiz !== ctx.biz.id) return false;
    return (phone && op && op === phone) || (name && on && on === name);
  });

  if (!list.length) {
    ordersByPatient.innerHTML = "";
    ordersEmpty.classList.remove("d-none");
    return;
  }
  ordersEmpty.classList.add("d-none");

  list.sort((a,b) => new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0));

  ordersByPatient.innerHTML = list.map(o => {
    const folio = o.folio || o.id?.slice(0,8) || "—";
    const date = fmtDate(o.createdAt || o.date);
    const st = o.status || o.state || "pending";
    const label =
      st === "pending" ? "Pendiente" :
      st === "ready" ? "Listo" :
      st === "delivered" ? "Entregado" :
      st === "process" ? "En proceso" : String(st);

    return `
      <tr>
        <td class="fw-semibold">${escapeHtml(folio)}</td>
        <td class="text-secondary">${escapeHtml(date)}</td>
        <td class="text-secondary">${escapeHtml(label)}</td>
        <td class="text-end">
          <button class="btn btn-outline-light btn-sm" type="button" data-act="viewOrder" data-id="${escapeHtml(o.id || "")}">
            Ver
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

/* -------------------------
   Actions
-------------------------- */
function loadPatients() {
  patients = getPatientsByBiz(ctx.biz.id);
  if (!patients.length) patients = rebuildPatientsFromOrdersIfNeeded();
}

function savePatientsToStorage() {
  if (isReadonly()) return;

  const all = getAllPatients();
  const filtered = all.filter(p => (p.bizId || "ORLINE_MAIN") !== ctx.biz.id);
  saveAllPatients(filtered.concat(patients));
}

function selectPatient(id) {
  selectedId = id;
  const p = patients.find(x => x.id === id) || null;
  renderList();
  renderDetail(p);
}

function toggleChip(name) {
  chipFilter[name] = !chipFilter[name];
  const btn = name === "urgent" ? chipUrgent : name === "missing" ? chipMissing : chipFollowup;
  if (btn) {
    btn.classList.toggle("btn-primary", chipFilter[name]);
    btn.classList.toggle("btn-soft", !chipFilter[name]);
  }
  renderList();
}

/* -------------------------
   Logout
-------------------------- */
function wireLogout() {
  if (!btnLogoutDash) return;

  if (!logoutModal) {
    btnLogoutDash.addEventListener("click", () => {
      if (confirm("¿Seguro que deseas cerrar sesión?")) {
        clearSessionAny();
        window.location.href = "Index.html";
      }
    });
    return;
  }

  btnLogoutDash.addEventListener("click", () => logoutModal.show());
  confirmLogout?.addEventListener("click", () => {
    clearSessionAny();
    window.location.href = "Index.html";
  });
}

/* -------------------------
   Events
-------------------------- */
function wireEvents() {
  // ✅ BLOQUEO GLOBAL DE LINKS (para que no navegue a Dashboard por accidente)
  document.addEventListener("click", (e) => {
    if (!isReadonly()) return;
    const a = e.target.closest("a[href]");
    if (!a) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // ✅ Click listado: si das click en acciones internas, NO seleccionar paciente ni navegar
  patientsList?.addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]");
    if (act) {
      e.preventDefault();
      e.stopPropagation();
      showBad("Modo doctor: navegación desactivada.");
      return;
    }

    const btn = e.target.closest(".patient-item");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (id) selectPatient(id);
  });

  pSearch?.addEventListener("input", () => renderList());
  pFilterStatus?.addEventListener("change", () => renderList());
  pSort?.addEventListener("change", () => renderList());

  // Doctor: ocultamos acciones
  hideEl(btnNewPatient);
  hideEl(btnExportPatients);
  hideEl(btnEditPatient);
  hideEl(btnAddNote);
  hideEl(btnAddFollowup);
  hideEl(btnSaveFollowup);

  if (dStatus) disableEl(dStatus);

  chipUrgent?.addEventListener("click", () => toggleChip("urgent"));
  chipMissing?.addEventListener("click", () => toggleChip("missing"));
  chipFollowup?.addEventListener("click", () => toggleChip("followup"));

  btnEditPatient?.addEventListener("click", () => showBad("Edición desactivada."));
  btnDeletePatient?.addEventListener("click", () => showBad("Eliminación desactivada por seguridad."));
  btnAddNote?.addEventListener("click", () => showBad("Acción no permitida."));
  btnAddFollowup?.addEventListener("click", () => showBad("Acción no permitida."));
  btnSaveFollowup?.addEventListener("click", () => showBad("Acción no permitida."));

  window.addEventListener("orline:ordersUpdated", () => {
    loadPatients();
    renderList();
    if (selectedId) renderDetail(patients.find(x => x.id === selectedId) || null);
  });

  window.addEventListener("storage", (e) => {
    if (!e?.key) return;
    if (e.key === PATIENTS_KEY || ORDERS_KEYS.includes(e.key)) {
      loadPatients();
      renderList();
      if (selectedId) renderDetail(patients.find(x => x.id === selectedId) || null);
    }
  });
}

/* -------------------------
   Init
-------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  ctx = requireAuth();
  if (!ctx) return;

  loadPatients();
  renderList();
  renderDetail(null);

  wireEvents();
  wireLogout();
});
