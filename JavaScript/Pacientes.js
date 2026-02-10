import { supabase } from "./supabaseClient.js";

const $ = (id) => document.getElementById(id);

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showMsg(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("d-none"), 3000);
}

function fmtDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-MX", { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return "—";
  }
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

/* =========================
   ✅ LIMPIEZA de notes pegados
   Quita cualquier " __DETAILS__: {json...}"
========================= */
function cleanNotes(notes) {
  const raw = String(notes ?? "");

  // 1) Corta desde __DETAILS__ si existe
  const idx = raw.indexOf("__DETAILS__");
  const cut = idx >= 0 ? raw.slice(0, idx) : raw;

  // 2) Limpia basura final
  return cut.trim() || "—";
}

/* (Opcional) si algún día quieres leer el JSON pegado */
function extractDetails(notes) {
  try {
    const raw = String(notes ?? "");
    const i = raw.indexOf("__DETAILS__:");
    if (i < 0) return null;

    // intenta parsear lo que viene después
    const jsonPart = raw.slice(i + "__DETAILS__:".length).trim();
    if (!jsonPart) return null;

    // si viene algo como {...}
    return JSON.parse(jsonPart);
  } catch {
    return null;
  }
}

/* ✅ Estudio: usa orders.study si existe, si no folio, si no notes */
function getStudyFromOrder(o) {
  const s = String(o?.study ?? "").trim();
  if (s) return s;

  const fol = String(o?.folio ?? "").trim();
  if (fol) return fol;

  const notes = String(o?.notes ?? "").trim();
  if (notes) return cleanNotes(notes).split("\n")[0].slice(0, 90);

  return "—";
}

/* -------------------------
   DOM
-------------------------- */
/* KPIs */
const pCountTotal = $("pCountTotal");
const pCountProcess = $("pCountProcess");
const pCountReady = $("pCountReady");
const pCountDelivered = $("pCountDelivered");

/* Controls */
const pSearch = $("pSearch");
const pFilterStatus = $("pFilterStatus");
const pSort = $("pSort");

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
const dStudy = $("dStudy");
const dSelectedMini = $("dSelectedMini");
const dSelectedStudy = $("dSelectedStudy");

const btnOpenOrderModal = $("btnOpenOrderModal");

/* Orders table */
const ordersByPatient = $("ordersByPatient");
const ordersEmpty = $("ordersEmpty");

/* Links side */
const shareLinksList = $("shareLinksList");
const shareLinksEmpty = $("shareLinksEmpty");

/* Toasts */
const patientMsg = $("patientMsg");
const patientErr = $("patientErr");

/* Logout */
const btnLogoutDash = $("btnLogoutDash");
const confirmLogout = $("confirmLogout");
const logoutModalEl = $("logoutModal");
const logoutModal = (logoutModalEl && window.bootstrap?.Modal)
  ? bootstrap.Modal.getOrCreateInstance(logoutModalEl)
  : null;

/* Modal order */
const orderModalEl = $("orderModal");
const orderModal = (orderModalEl && window.bootstrap?.Modal)
  ? bootstrap.Modal.getOrCreateInstance(orderModalEl)
  : null;

const mPatient = $("mPatient");
const mContact = $("mContact");
const mStatus = $("mStatus");
const mDate = $("mDate");
const mStudy = $("mStudy");
const mFolio = $("mFolio");
const mNotes = $("mNotes");
const mLinks = $("mLinks");
const mLinksEmpty = $("mLinksEmpty");

/* -------------------------
   Context / Auth
-------------------------- */
let ctx = null;
let viewRows = [];
let selectedOrderId = null;

function goIndex() {
  window.location.replace("./Index.html");
}

async function getAuthUserSupabase() {
  const { data } = await supabase.auth.getSession();
  return data?.session?.user || null;
}

async function getMyProfileSupabase(userId) {
  const { data } = await supabase
    .from("profiles")
    .select("id, role, display_name, clinic_name")
    .eq("id", userId)
    .maybeSingle();
  return data || null;
}

async function getMyTeamIdSupabase(userId) {
  const { data } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.team_id || null;
}

async function requireAuth() {
  const user = await getAuthUserSupabase();
  if (!user?.id) { goIndex(); return null; }

  const prof = await getMyProfileSupabase(user.id);

  // si RLS bloquea profile, asumimos doctor
  const safeProf = prof || { role: "doctor", display_name: user.email || "Doctor", clinic_name: "ORLINE" };

  return {
    user: { id: user.id, email: user.email || "" },
    profile: safeProf,
    teamId: await getMyTeamIdSupabase(user.id)
  };
}

/* -------------------------
   Supabase queries
-------------------------- */
async function fetchOrdersForRole() {
  const uid = ctx?.user?.id;
  const role = ctx?.profile?.role || "doctor";
  const teamId = ctx?.teamId;

  let q = supabase
    .from("orders")
    .select("id, doctor_id, team_id, patient_name, patient_phone, patient_email, status, folio, notes, study, created_at, updated_at");

  if (role === "doctor") {
    q = q.eq("doctor_id", uid);
    if (teamId) q = q.eq("team_id", teamId);
  } else {
    if (teamId) q = q.eq("team_id", teamId);
  }

  const { data, error } = await q.order("updated_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchOrderLinks(orderId) {
  const { data, error } = await supabase
    .from("order_links")
    .select("id, title, url, provider, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

/* -------------------------
   Mapping
-------------------------- */
function mapOrderToRow(o) {
  return {
    id: o.id,
    name: o.patient_name || "Sin nombre",
    phone: o.patient_phone || "—",
    email: o.patient_email || "—",
    status: o.status || "pending",
    study: getStudyFromOrder(o),
    updatedAt: o.updated_at || o.created_at || null,
    createdAt: o.created_at || null,
    raw: o
  };
}

/* -------------------------
   Filter / Sort
-------------------------- */
function applyFiltersAndSort() {
  const q = (pSearch?.value || "").trim().toLowerCase();
  const st = (pFilterStatus?.value || "all");
  const sort = (pSort?.value || "recent");

  let list = viewRows.slice();

  if (q) {
    list = list.filter(r => {
      const hay = [r.name, r.phone, r.email, r.study, r.id].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  if (st !== "all") list = list.filter(r => (r.status || "pending") === st);

  if (sort === "name") list.sort((a,b) => (a.name||"").localeCompare(b.name||""));
  else if (sort === "status") {
    const om = { pending:0, process:1, ready:2, delivered:3 };
    list.sort((a,b) => (om[a.status] ?? 9) - (om[b.status] ?? 9));
  } else {
    list.sort((a,b) => new Date(b.updatedAt||b.createdAt||0) - new Date(a.updatedAt||a.createdAt||0));
  }

  return list;
}

/* -------------------------
   Render
-------------------------- */
function renderKPIs() {
  const total = viewRows.length;
  const process = viewRows.filter(x => x.status === "process").length;
  const ready = viewRows.filter(x => x.status === "ready").length;
  const delivered = viewRows.filter(x => x.status === "delivered").length;

  if (pCountTotal) pCountTotal.textContent = total;
  if (pCountProcess) pCountProcess.textContent = process;
  if (pCountReady) pCountReady.textContent = ready;
  if (pCountDelivered) pCountDelivered.textContent = delivered;
}

function renderList() {
  const list = applyFiltersAndSort();

  if (pResultsInfo) pResultsInfo.textContent = `${list.length} resultados`;
  if (patientsEmpty) patientsEmpty.classList.toggle("d-none", list.length !== 0);
  if (!patientsList) return;

  patientsList.innerHTML = list.map(r => {
    const active = r.id === selectedOrderId ? "is-active" : "";
    const meta = [r.phone !== "—" ? r.phone : null, r.email !== "—" ? r.email : null]
      .filter(Boolean).join(" • ");

    return `
      <button class="patient-item cardx p-3 text-start ${active}" data-id="${escapeHtml(r.id)}" type="button">
        <div class="d-flex align-items-start justify-content-between gap-2">
          <div class="me-2">
            <div class="fw-bold">${escapeHtml(r.name)}</div>
            <div class="muted small">${escapeHtml(meta || "—")}</div>
            <div class="mt-2 fw-semibold">${escapeHtml(r.study || "—")}</div>
          </div>
          <div class="text-end">
            <div class="small">
              <i class="bi ${statusIcon(r.status)} me-1"></i>
              <span class="fw-semibold">${escapeHtml(statusLabel(r.status))}</span>
            </div>
            <div class="muted small mt-1">${fmtDate(r.updatedAt || r.createdAt)}</div>
          </div>
        </div>
      </button>
    `;
  }).join("");

  if (!selectedOrderId && list.length) selectOrder(list[0].id);

  renderKPIs();
}

async function renderLinks(orderId) {
  if (!shareLinksList || !shareLinksEmpty) return;

  shareLinksList.innerHTML = "";
  shareLinksEmpty.classList.add("d-none");

  try {
    const links = await fetchOrderLinks(orderId);

    if (!links.length) {
      shareLinksEmpty.classList.remove("d-none");
      return;
    }

    shareLinksList.innerHTML = links.map(l => `
      <a class="cardx p-3 text-decoration-none" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">
        <div class="d-flex align-items-start justify-content-between gap-2">
          <div>
            <div class="fw-bold">${escapeHtml(l.title || "Link")}</div>
            <div class="muted small">${escapeHtml(l.provider || "—")}</div>
          </div>
          <div class="muted"><i class="bi bi-box-arrow-up-right"></i></div>
        </div>
      </a>
    `).join("");

  } catch (e) {
    shareLinksEmpty.classList.remove("d-none");
    showMsg(patientErr, "No pude cargar links (RLS/permisos en order_links).");
    console.error(e);
  }
}

function renderOrdersTable(rows) {
  if (!ordersByPatient || !ordersEmpty) return;

  if (!rows?.length) {
    ordersByPatient.innerHTML = "";
    ordersEmpty.classList.remove("d-none");
    return;
  }
  ordersEmpty.classList.add("d-none");

  ordersByPatient.innerHTML = rows.map(r => `
    <tr>
      <td class="fw-semibold">${escapeHtml(r.study || "—")}</td>
      <td class="text-secondary">${escapeHtml(fmtDate(r.createdAt))}</td>
      <td class="text-secondary">${escapeHtml(statusLabel(r.status))}</td>
      <td class="text-end">
        <button class="btn btn-outline-light btn-sm btn-view-order" data-oid="${escapeHtml(r.id)}" type="button">
          Ver
        </button>
      </td>
    </tr>
  `).join("");
}

async function renderDetail(row) {
  if (!patientDetailEmpty || !patientDetailBody) return;

  if (!row) {
    patientDetailEmpty.classList.remove("d-none");
    patientDetailBody.classList.add("d-none");
    if (dSelectedMini) dSelectedMini.textContent = "—";
    if (dSelectedStudy) dSelectedStudy.textContent = "—";
    return;
  }

  patientDetailEmpty.classList.add("d-none");
  patientDetailBody.classList.remove("d-none");

  if (dName) dName.textContent = row.name || "—";
  if (dPhone) dPhone.textContent = row.phone || "—";
  if (dEmail) dEmail.textContent = row.email || "—";
  if (dStatusText) dStatusText.textContent = statusLabel(row.status);
  if (dStudy) dStudy.textContent = row.study || "—";
  if (dSelectedMini) dSelectedMini.textContent = row.name || "—";
  if (dSelectedStudy) dSelectedStudy.textContent = row.study || "—";

  if (dMeta) {
    dMeta.textContent = [
      `Orden: ${row.id?.slice(0, 8) || "—"}`,
      `Actualizado: ${fmtDate(row.updatedAt || row.createdAt)}`
    ].join(" • ");
  }

  renderOrdersTable([row]);
  await renderLinks(row.id);

  btnOpenOrderModal?.setAttribute("data-oid", row.id);
}

/* -------------------------
   Modal ✅ limpio
-------------------------- */
async function openOrderModal(orderId) {
  const row = viewRows.find(x => x.id === orderId);
  if (!row) return;

  const raw = row.raw || {};

  const clean = cleanNotes(raw.notes);

  if (mPatient) mPatient.textContent = row.name || "—";
  if (mContact) mContact.textContent = [row.phone, row.email].filter(x => x && x !== "—").join(" • ") || "—";
  if (mStatus) mStatus.textContent = statusLabel(row.status);
  if (mDate) mDate.textContent = `Actualizado: ${fmtDate(row.updatedAt || row.createdAt)}`;

  // ✅ estudio bonito (study ya viene así: "Estudio: ... | Referido: ...")
  if (mStudy) mStudy.textContent = String(raw.study || row.study || "—");

  if (mFolio) mFolio.textContent = raw.folio || row.id.slice(0, 8);

  // ✅ notas SOLO las del doc (sin __DETAILS__)
  if (mNotes) mNotes.textContent = clean || "—";

  if (mLinks) mLinks.innerHTML = "";
  if (mLinksEmpty) mLinksEmpty.classList.add("d-none");

  try {
    const links = await fetchOrderLinks(orderId);
    if (!links.length) {
      mLinksEmpty?.classList.remove("d-none");
    } else {
      mLinks.innerHTML = links.map(l => `
        <a class="cardx p-3 text-decoration-none" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">
          <div class="d-flex align-items-start justify-content-between gap-2">
            <div>
              <div class="fw-bold">${escapeHtml(l.title || "Link")}</div>
              <div class="muted small">${escapeHtml(l.provider || "—")}</div>
            </div>
            <div class="muted"><i class="bi bi-box-arrow-up-right"></i></div>
          </div>
        </a>
      `).join("");
    }
  } catch {
    mLinksEmpty?.classList.remove("d-none");
    if (mLinksEmpty) mLinksEmpty.textContent = "No pude cargar links (RLS/permisos).";
  }

  orderModal?.show();
}

/* -------------------------
   Select
-------------------------- */
async function selectOrder(orderId) {
  selectedOrderId = orderId;
  renderList();
  const row = viewRows.find(x => x.id === orderId) || null;
  await renderDetail(row);
}

/* -------------------------
   Logout
-------------------------- */
async function doLogout() {
  try { await supabase.auth.signOut(); } catch {}
  goIndex();
}

function wireLogout() {
  if (!btnLogoutDash) return;

  if (!logoutModal) {
    btnLogoutDash.addEventListener("click", async () => {
      if (confirm("¿Seguro que deseas cerrar sesión?")) await doLogout();
    });
    return;
  }

  btnLogoutDash.addEventListener("click", () => logoutModal.show());
  confirmLogout?.addEventListener("click", async () => await doLogout());
}

/* -------------------------
   Events
-------------------------- */
function wireEvents() {
  patientsList?.addEventListener("click", (e) => {
    const btn = e.target.closest(".patient-item");
    if (!btn) return;
    const id = btn.getAttribute("data-id");
    if (id) selectOrder(id);
  });

  ordersByPatient?.addEventListener("click", (e) => {
    const b = e.target.closest(".btn-view-order");
    if (!b) return;
    const oid = b.getAttribute("data-oid");
    if (oid) openOrderModal(oid);
  });

  btnOpenOrderModal?.addEventListener("click", () => {
    const oid = btnOpenOrderModal.getAttribute("data-oid");
    if (oid) openOrderModal(oid);
  });

  pSearch?.addEventListener("input", () => renderList());
  pFilterStatus?.addEventListener("change", () => renderList());
  pSort?.addEventListener("change", () => renderList());
}

/* -------------------------
   Init
-------------------------- */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    ctx = await requireAuth();
    if (!ctx) return;

    const rows = await fetchOrdersForRole();
    viewRows = rows.map(mapOrderToRow);

    renderList();
    await renderDetail(null);

    wireEvents();
    wireLogout();

    showMsg(patientMsg, "Órdenes cargadas :)");
  } catch (e) {
    console.error("Supabase error:", e);
    showMsg(patientErr, "No pude cargar órdenes desde Supabase. Revisa RLS/policies en orders.");
    viewRows = [];
    renderList();
    await renderDetail(null);
    wireEvents();
    wireLogout();
  }
});
