/* =========================
   DASHBOARD (DOCTORES)
   ========================= */

/* Unifica con Index */
const USERS_KEY = "orline_users";
const SESSION_KEY = "orline_session";
const BUSINESSES_KEY = "pos_businesses"; // si tu business aún está en pos_businesses, lo dejamos

/* Compat: por si aún existen keys viejas */
const LEGACY_SESSION_KEYS = ["pos_session"];
const LEGACY_USERS_KEYS = ["pos_users"];

/* Datos clínicos */
const PATIENT_KEYS = [
  "orline_patients",
  "pos_patients",
  "pos_radiology_patients",
  "pos_orders_radiology",
  "pos_orders",
  "pos_studies"
];

/* Evita “parpadeo” por redirects dobles */
let isLoggingOut = false;
let hasRedirected = false;

/* -------------------------
   Storage utils
-------------------------- */
function safeJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getUsers() {
  /* Primero intenta orline_users, si está vacío intenta pos_users */
  const a = safeJSON(USERS_KEY, null);
  if (Array.isArray(a)) return a;

  for (const k of LEGACY_USERS_KEYS) {
    const b = safeJSON(k, null);
    if (Array.isArray(b)) return b;
  }
  return [];
}

function getSession() { return safeJSON(SESSION_KEY, null); }

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
  for (const k of LEGACY_SESSION_KEYS) localStorage.removeItem(k);
}

function getBusinesses() { return safeJSON(BUSINESSES_KEY, []); }
function getBusinessByOwner(userId) {
  return getBusinesses().find(b => b.ownerUserId === userId) || null;
}

function findArrayFromStorage(keys) {
  for (const k of keys) {
    const v = safeJSON(k, null);
    if (Array.isArray(v)) return { key: k, arr: v };
  }
  return null;
}

/* -------------------------
   Auth
-------------------------- */
function redirectToIndex() {
  if (hasRedirected) return;
  hasRedirected = true;
  window.location.replace("Index.html");
}

function requireAuthOrRedirect() {
  if (isLoggingOut) return null;

  const session = getSession();

  /* Si Index marcó logout, no intentes “re-entrar” */
  if (sessionStorage.getItem("orline_logout") === "1") {
    sessionStorage.removeItem("orline_logout");
    clearSession();
    redirectToIndex();
    return null;
  }

  if (!session?.userId) {
    redirectToIndex();
    return null;
  }

  const user = getUsers().find(u => u.id === session.userId);
  if (!user) {
    clearSession();
    redirectToIndex();
    return null;
  }

  const biz = getBusinessByOwner(session.userId) || null;
  return { user, biz };
}

/* -------------------------
   DOM helpers
-------------------------- */
function $(id) { return document.getElementById(id); }

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeStr(x) {
  return String(x ?? "").trim();
}

function parseISODateToYMD(isoLike) {
  const d = new Date(isoLike);
  if (isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function inRangeYMD(ymd, fromYMD, toYMD) {
  if (!ymd) return false;
  if (fromYMD && ymd < fromYMD) return false;
  if (toYMD && ymd > toYMD) return false;
  return true;
}

/* -------------------------
   Prefijo Dr/Dra
-------------------------- */
function normalizeGenderValue(v) {
  const s = normalizeStr(v).toLowerCase();
  if (!s) return "";

  if (["m", "masculino", "hombre", "male", "man"].includes(s)) return "male";
  if (["f", "femenino", "mujer", "female", "woman"].includes(s)) return "female";

  return s;
}

function getDoctorPrefix(ctx) {
  const u = ctx?.user || {};
  const sess = getSession() || {};

  const raw =
    u.gender ?? u.sexo ?? u.sex ?? u.genero ??
    sess.gender ?? sess.sexo ?? sess.sex ?? sess.genero ??
    "";

  const g = normalizeGenderValue(raw);

  if (g === "female") return "Dra.";
  if (g === "male") return "Dr.";
  return "Dr.";
}

/* -------------------------
   Modelo de registro
-------------------------- */
function normalizeStatus(raw) {
  const s = normalizeStr(raw).toLowerCase();

  if (!s) return "pending";
  if (["pendiente", "pending", "espera", "waiting"].includes(s)) return "pending";
  if (["listo", "ready", "finalizado", "done", "terminado"].includes(s)) return "ready";
  if (["entregado", "delivered", "entrega", "entregada"].includes(s)) return "delivered";

  return s;
}

function statusLabel(st) {
  if (st === "pending") return "Pendiente";
  if (st === "ready") return "Listo";
  if (st === "delivered") return "Entregado";
  return st;
}

function statusBadgeClass(st) {
  if (st === "pending") return "badge text-bg-warning";
  if (st === "ready") return "badge text-bg-success";
  if (st === "delivered") return "badge text-bg-secondary";
  return "badge text-bg-light";
}

/* -------------------------
   Lectura de pacientes/estudios
-------------------------- */
function readPatientsForDoctor(ctx) {
  const hit = findArrayFromStorage(PATIENT_KEYS);
  if (!hit?.arr?.length) return [];

  const userId = ctx.user?.id;
  const userEmail = normalizeStr(ctx.user?.email).toLowerCase();
  const bizId = ctx.biz?.id || null;

  const rows = hit.arr
    .filter(x => x && typeof x === "object")
    .map(x => {
      const patientName =
        x.patientName || x.paciente || x.nombrePaciente || x.patient || x.name || "";

      const study =
        x.study || x.estudio || x.studyType || x.tipoEstudio || x.type || "";

      const createdAt =
        x.createdAt || x.date || x.fecha || x.timestamp || x.time || "";

      const doctorId =
        x.doctorId || x.medicoId || x.userId || x.ownerUserId || "";

      const doctorEmail =
        normalizeStr(x.doctorEmail || x.emailDoctor || x.medicoEmail || "").toLowerCase();

      const recordBizId =
        x.bizId || x.businessId || x.cabinetId || x.clinicId || "";

      const status =
        normalizeStatus(x.status || x.estado || x.stage || x.state || "pending");

      const id = x.id || x.orderId || x.studyId || crypto.randomUUID();
      const ymd = parseISODateToYMD(createdAt);

      return {
        id,
        patientName: normalizeStr(patientName),
        study: normalizeStr(study) || "—",
        ymd,
        status,
        raw: x,
        meta: { doctorId, doctorEmail, recordBizId }
      };
    })
    .filter(r => {
      const byDoctor =
        (userId && r.meta.doctorId && r.meta.doctorId === userId) ||
        (userEmail && r.meta.doctorEmail && r.meta.doctorEmail === userEmail);

      const byBiz = bizId && r.meta.recordBizId && r.meta.recordBizId === bizId;

      return byDoctor || byBiz;
    });

  rows.sort((a, b) => (b.ymd || "").localeCompare(a.ymd || ""));
  return rows;
}

/* -------------------------
   Estado UI
-------------------------- */
const state = {
  all: [],
  filtered: [],
  page: 1,
  pageSize: 10
};

/* -------------------------
   Render: bienvenida y badges
-------------------------- */
function renderHeader(ctx) {
  const name = normalizeStr(ctx.user?.name) || "Doctor";
  const prefix = getDoctorPrefix(ctx);

  setText("docWelcomeTitle", `Bienvenido, ${prefix} ${name}`);
  setText("docClinicBadge", ctx.biz?.name || "—");
  setText("docCabinetBadge", ctx.biz?.handle ? "@" + ctx.biz.handle : "—");
}

/* -------------------------
   Filtros
-------------------------- */
function getFilters() {
  const q = normalizeStr($("patientSearchInput")?.value).toLowerCase();
  const status = $("statusFilter")?.value || "all";
  const from = $("dateFrom")?.value || "";
  const to = $("dateTo")?.value || "";
  return { q, status, from, to };
}

function applyFilters() {
  const { q, status, from, to } = getFilters();

  state.filtered = state.all.filter(r => {
    const matchesQ =
      !q ||
      r.patientName.toLowerCase().includes(q) ||
      r.study.toLowerCase().includes(q);

    const matchesStatus = status === "all" ? true : r.status === status;
    const matchesDate = (!from && !to) ? true : inRangeYMD(r.ymd, from, to);

    return matchesQ && matchesStatus && matchesDate;
  });

  state.page = 1;
  renderKpis();
  renderTable();
}

/* -------------------------
   KPIs
-------------------------- */
function renderKpis() {
  const total = state.filtered.length;
  const pending = state.filtered.filter(x => x.status === "pending").length;
  const ready = state.filtered.filter(x => x.status === "ready").length;
  const delivered = state.filtered.filter(x => x.status === "delivered").length;

  setText("kpiTotal", String(total));
  setText("kpiPending", String(pending));
  setText("kpiReady", String(ready));
  setText("kpiDelivered", String(delivered));
}

/* -------------------------
   Tabla + paginación
-------------------------- */
function pageCount() {
  return Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
}

function clampPage(n) {
  const max = pageCount();
  return Math.min(Math.max(1, n), max);
}

function renderTable() {
  const tbody = $("patientsTableBody");
  if (!tbody) return;

  const maxPages = pageCount();
  state.page = clampPage(state.page);

  const start = (state.page - 1) * state.pageSize;
  const slice = state.filtered.slice(start, start + state.pageSize);

  if (!slice.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center small muted">Sin resultados…</td></tr>`;
    setText("tableSummary", `Mostrando 0 registros`);
    updatePagerButtons();
    return;
  }

  tbody.innerHTML = slice.map(r => {
    const patient = escapeHtml(r.patientName || "—");
    const study = escapeHtml(r.study || "—");
    const date = escapeHtml(r.ymd || "—");
    const badge = `<span class="${statusBadgeClass(r.status)}">${statusLabel(r.status)}</span>`;

    return `
      <tr>
        <td>${patient}</td>
        <td>${study}</td>
        <td>${date}</td>
        <td>${badge}</td>
        <td class="text-end">
          <button class="btn btn-sm btn-soft" type="button" data-open="${escapeHtml(r.id)}">Ver</button>
        </td>
      </tr>
    `;
  }).join("");

  setText("tableSummary", `Mostrando ${slice.length} de ${state.filtered.length} (página ${state.page}/${maxPages})`);
  updatePagerButtons();
  bindRowActions();
}

function updatePagerButtons() {
  const prev = $("btnPrevPage");
  const next = $("btnNextPage");
  const max = pageCount();

  if (prev) prev.disabled = state.page <= 1;
  if (next) next.disabled = state.page >= max;
}

function bindRowActions() {
  const tbody = $("patientsTableBody");
  if (!tbody) return;

  tbody.querySelectorAll("[data-open]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-open");
      const r = state.filtered.find(x => x.id === id);
      if (!r) return;
      openRecord(r);
    });
  });
}

function openRecord(record) {
  const raw = record.raw || {};
  const msg =
    `Paciente: ${record.patientName || "—"}\n` +
    `Estudio: ${record.study || "—"}\n` +
    `Fecha: ${record.ymd || "—"}\n` +
    `Estado: ${statusLabel(record.status)}\n\n` +
    `Detalle (JSON):\n${JSON.stringify(raw, null, 2)}`;

  alert(msg);
}

/* -------------------------
   Eventos UI
-------------------------- */
function setupFilters() {
  const q = $("patientSearchInput");
  const status = $("statusFilter");
  const from = $("dateFrom");
  const to = $("dateTo");
  const clear = $("btnClearFilters");

  q?.addEventListener("input", applyFilters);
  status?.addEventListener("change", applyFilters);
  from?.addEventListener("change", applyFilters);
  to?.addEventListener("change", applyFilters);

  clear?.addEventListener("click", () => {
    if (q) q.value = "";
    if (status) status.value = "all";
    if (from) from.value = "";
    if (to) to.value = "";
    applyFilters();
  });

  const topSearch = $("dashSearchInput");
  if (topSearch && q) {
    topSearch.addEventListener("input", () => {
      q.value = topSearch.value;
      applyFilters();
    });
  }
}

function setupPager() {
  $("btnPrevPage")?.addEventListener("click", () => {
    state.page = clampPage(state.page - 1);
    renderTable();
  });

  $("btnNextPage")?.addEventListener("click", () => {
    state.page = clampPage(state.page + 1);
    renderTable();
  });
}

/* -------------------------
   Logout
-------------------------- */
function setupLogout() {
  const btn = $("btnLogoutDash");
  const modalEl = $("logoutModal");
  const confirmBtn = $("confirmLogout");

  const doLogout = () => {
    if (isLoggingOut) return;
    isLoggingOut = true;

    /* Marca logout para que Index no auto-redirija al volver */
    sessionStorage.setItem("orline_logout", "1");

    /* Cierra modal antes de navegar */
    if (modalEl && window.bootstrap?.Modal) {
      const m = bootstrap.Modal.getOrCreateInstance(modalEl);
      m.hide();
    }

    clearSession();
    redirectToIndex();
  };

  const fallback = () => {
    if (confirm("¿Seguro que deseas cerrar sesión?")) doLogout();
  };

  if (!modalEl || !window.bootstrap?.Modal) {
    btn?.addEventListener("click", fallback);
    return;
  }

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  btn?.addEventListener("click", () => modal.show());
  confirmBtn?.addEventListener("click", doLogout);
}

/* -------------------------
   INIT
-------------------------- */
function boot() {
  const ctx = requireAuthOrRedirect();
  if (!ctx) return;

  renderHeader(ctx);

  state.all = readPatientsForDoctor(ctx);
  setupFilters();
  setupPager();
  setupLogout();

  applyFilters();
}

document.addEventListener("DOMContentLoaded", boot);

/* Si cambia la sesión, no hagas nada aquí (evita dobles redirects) */
window.addEventListener("storage", (e) => {
  if (isLoggingOut) return;
  if (!e?.key) return;

  if (e.key === SESSION_KEY || LEGACY_SESSION_KEYS.includes(e.key)) return;

  if (!PATIENT_KEYS.includes(e.key)) return;

  const ctx = requireAuthOrRedirect();
  if (!ctx) return;

  state.all = readPatientsForDoctor(ctx);
  applyFilters();
});
