// JavaScript/dashboard.js
import { supabase } from "./supabaseClient.js";

/* =========================
   CONFIG (solo aquí)
========================= */
const SESSION_LOGOUT_FLAG = "orline_logout";

/* =========================
   Helpers DOM
========================= */
function $(id) { return document.getElementById(id); }

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value ?? "";
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

/* =========================
   Auth / Profile
========================= */
async function getAuthUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, display_name, clinic_name, created_at")
    .eq("id", userId)
    .single();

  if (error) return null;
  return data;
}

function redirectReplace(url) {
  window.location.replace(url);
}

async function requireDoctorOrRedirect() {
  // si vienes de logout
  if (sessionStorage.getItem(SESSION_LOGOUT_FLAG) === "1") {
    sessionStorage.removeItem(SESSION_LOGOUT_FLAG);
    await supabase.auth.signOut();
    redirectReplace("Index.html");
    return null;
  }

  const user = await getAuthUser();
  if (!user) {
    redirectReplace("Index.html");
    return null;
  }

  const profile = await getMyProfile(user.id);
  if (!profile) {
    await supabase.auth.signOut();
    redirectReplace("Index.html");
    return null;
  }

  // Solo doctores deben estar aquí
  if (profile.role !== "doctor") {
    if (profile.role === "admin") redirectReplace("Index.html"); // o Admin.html si lo separas
    else if (profile.role === "employee") redirectReplace("Empleado.html");
    else redirectReplace("Index.html");
    return null;
  }

  // si doctor no completó perfil mínimo
  if (!profile.clinic_name) {
    redirectReplace("Index.html"); // vuelve para completar
    return null;
  }

  return { user, profile };
}

/* =========================
   Data: Orders (Supabase)
========================= */
function normalizeStatus(raw) {
  const s = normalizeStr(raw).toLowerCase();
  if (!s) return "pending";
  if (["pendiente", "pending", "espera", "waiting"].includes(s)) return "pending";
  if (["proceso", "process", "en proceso"].includes(s)) return "process";
  if (["listo", "ready", "finalizado", "done", "terminado"].includes(s)) return "ready";
  if (["entregado", "delivered", "entrega", "entregada"].includes(s)) return "delivered";
  return s;
}

function statusLabel(st) {
  if (st === "pending") return "Pendiente";
  if (st === "process") return "En proceso";
  if (st === "ready") return "Listo";
  if (st === "delivered") return "Entregado";
  return st;
}

function statusBadgeClass(st) {
  if (st === "pending") return "badge text-bg-warning";
  if (st === "process") return "badge text-bg-info";
  if (st === "ready") return "badge text-bg-success";
  if (st === "delivered") return "badge text-bg-secondary";
  return "badge text-bg-light";
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

async function fetchOrdersForDoctor(doctorId) {
  const { data, error } = await supabase
    .from("orders")
    .select("id, patient_name, status, created_at, folio, notes")
    .eq("doctor_id", doctorId)
    .order("created_at", { ascending: false });

  if (error) return [];

  return (data || []).map(o => ({
    id: o.id,
    patientName: normalizeStr(o.patient_name) || "—",
    study: normalizeStr(o.folio) || "—", // si folio lo usas como "estudio" cámbialo
    ymd: parseISODateToYMD(o.created_at),
    status: normalizeStatus(o.status),
    raw: o
  }));
}

/* =========================
   State + Filters
========================= */
const state = {
  all: [],
  filtered: [],
  page: 1,
  pageSize: 10
};

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
      (r.study || "").toLowerCase().includes(q);

    const matchesStatus = status === "all" ? true : r.status === status;
    const matchesDate = (!from && !to) ? true : inRangeYMD(r.ymd, from, to);

    return matchesQ && matchesStatus && matchesDate;
  });

  state.page = 1;
  renderKpis();
  renderTable();
}

/* =========================
   UI Render
========================= */
function renderHeader(ctx) {
  const name = normalizeStr(ctx.profile?.display_name) || "Doctor";
  setText("docWelcomeTitle", `Bienvenido, ${name}`);
  setText("docClinicBadge", ctx.profile?.clinic_name || "—");
  setText("docCabinetBadge", "—"); // si luego agregas cabinet en schema
}

function renderKpis() {
  const total = state.filtered.length;
  const pending = state.filtered.filter(x => x.status === "pending").length;
  const process = state.filtered.filter(x => x.status === "process").length;
  const ready = state.filtered.filter(x => x.status === "ready").length;
  const delivered = state.filtered.filter(x => x.status === "delivered").length;

  setText("kpiTotal", String(total));
  setText("kpiPending", String(pending));
  setText("kpiProcess", String(process)); // si existe en tu HTML
  setText("kpiReady", String(ready));
  setText("kpiDelivered", String(delivered));
}

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

      alert(
        `Paciente: ${r.patientName}\n` +
        `Folio/Estudio: ${r.study}\n` +
        `Fecha: ${r.ymd}\n` +
        `Estado: ${statusLabel(r.status)}`
      );
    });
  });
}

/* =========================
   Events
========================= */
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

function setupLogout() {
  const btn = $("btnLogoutDash");
  btn?.addEventListener("click", async () => {
    sessionStorage.setItem(SESSION_LOGOUT_FLAG, "1");
    await supabase.auth.signOut();
    redirectReplace("Index.html");
  });
}

/* =========================
   Boot
========================= */
async function boot() {
  const ctx = await requireDoctorOrRedirect();
  if (!ctx) return;

  renderHeader(ctx);

  // cargar datos
  state.all = await fetchOrdersForDoctor(ctx.user.id);

  setupFilters();
  setupPager();
  setupLogout();

  applyFilters();
}

document.addEventListener("DOMContentLoaded", boot);
