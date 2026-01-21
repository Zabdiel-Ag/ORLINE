
import { supabase } from "./supabaseClient.js";

/* =========================
   ORLINE — Empleado.js (FULL FIX)
   Compatible con TU HTML
========================= */

const STATUS = ["pending", "process", "ready", "delivered"];
const BUCKET = "orline-orders";

function $(id) { return document.getElementById(id); }

/* ---------- UI helpers ---------- */
function showErr(msg) {
  const el = $("empErr");
  if (!el) return;
  el.textContent = msg || "Error";
  el.classList.remove("d-none");
}
function hideErr() {
  const el = $("empErr");
  if (!el) return;
  el.textContent = "";
  el.classList.add("d-none");
}
function showMsg(msg) {
  const el = $("empMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("d-none");
  setTimeout(() => el.classList.add("d-none"), 2200);
}
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function fmtDate(iso) {
  try { return new Date(iso).toLocaleString(); } catch { return "—"; }
}
function statusLabel(s) {
  if (s === "pending") return "Pendiente";
  if (s === "process") return "En proceso";
  if (s === "ready") return "Listo";
  if (s === "delivered") return "Entregado";
  return "Pendiente";
}
function statusBadgeClass(s) {
  if (s === "pending") return "bg-secondary";
  if (s === "process") return "bg-warning text-dark";
  if (s === "ready") return "bg-info text-dark";
  if (s === "delivered") return "bg-success";
  return "bg-secondary";
}
function setTextSafe(id, val) {
  const el = $(id);
  if (el) el.textContent = val ?? "";
}
function safeTrim(v) {
  return (typeof v === "string") ? v.trim() : "";
}

/* ---------- Auth/Profile ---------- */
async function getUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data?.user || null;
}

async function getMyProfile(userId) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, display_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.warn("profiles error:", error);
    return null;
  }
  return data || null;
}

async function getMyTeamId(userId) {
  const { data, error } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return data?.team_id || null;
}

async function guardEmployee() {
  const user = await getUser();
  if (!user) return { ok: false, reason: "No hay sesión. Inicia sesión." };

  const profile = await getMyProfile(user.id);
  if (profile) {
    if (profile.role !== "employee" && profile.role !== "admin") {
      return { ok: false, reason: `Sin permisos. Rol actual: ${profile.role || "—"}` };
    }
  } else {
    // dejamos pasar con fallback (email/metadata) para que NO se quede en blanco
    console.warn("No profile row o RLS bloqueó (seguimos con fallback).");
  }

  return { ok: true, user, profile };
}

/* ---------- State ---------- */
let CURRENT_ORDER = null;
let ORDERS_CACHE = [];
let MY_TEAM_ID = null;

/* ---------- Data (Orders + Links) ---------- */
async function fetchOrdersByTeam(teamId) {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, doctor_id, team_id,
      patient_name, patient_phone, patient_email,
      folio, status, notes,
      created_at, updated_at,
      doctor_name, doctor_clinic,
      study, doctor_notes
    `)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function fetchOrderById(orderId) {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id, doctor_id, team_id,
      patient_name, patient_phone, patient_email,
      folio, status, notes,
      created_at, updated_at,
      doctor_name, doctor_clinic,
      study, doctor_notes
    `)
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function updateOrder(orderId, patch) {
  const { error } = await supabase
    .from("orders")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", orderId);

  if (error) throw error;
}

async function fetchOrderLinks(orderId) {
  const { data, error } = await supabase
    .from("order_links")
    .select("id, order_id, title, url, provider, created_at")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function addOrderLink(orderId, { title, url, provider }) {
  const user = await getUser();
  const created_by = user?.id || null;

  const { error } = await supabase
    .from("order_links")
    .insert([{ order_id: orderId, title, url, provider, created_by }]);

  if (error) throw error;
}

async function deleteOrderLink(linkId) {
  const { error } = await supabase.from("order_links").delete().eq("id", linkId);
  if (error) throw error;
}

/* ---------- Storage upload ---------- */
function safeExt(name) {
  const base = String(name || "file").split("?")[0];
  const parts = base.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "bin";
}
function contentTypeByExt(ext) {
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  return "application/octet-stream";
}

async function uploadFilesForOrder(orderId, files) {
  if (!orderId) throw new Error("Selecciona una orden primero.");

  const user = await getUser();
  if (!user) throw new Error("Sin sesión.");

  const msg = $("uploadMsg");
  if (msg) msg.textContent = "Subiendo…";

  for (const file of files) {
    const ext = safeExt(file.name);
    const ct = contentTypeByExt(ext);
    const path = `${orderId}/${Date.now()}_${Math.random().toString(16).slice(2)}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: ct, upsert: false });

    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) throw new Error("No se pudo obtener URL del archivo.");

    await addOrderLink(orderId, { title: file.name, url: publicUrl, provider: "storage" });
  }

  if (msg) msg.textContent = "Listo ✅";
}

/* ---------- Header (Bienvenido + team) ---------- */
async function loadEmployeeHeader(user, profile) {
  const clean = (v) => String(v ?? "").trim();

  const name =
    clean(profile?.display_name) ||
    clean(user?.user_metadata?.display_name) ||
    clean(user?.user_metadata?.name) ||
    "Empleado"; //  ya NO usamos email

  setTextSafe("empWelcomeName", name);
  setTextSafe("navUserName", name);

  // team en navbar
  const teamName = await getTeamName(MY_TEAM_ID);
  setTextSafe("navTeamName", teamName || "Equipo");
}


/* ---------- KPIs ---------- */
function renderKPIs(orders) {
  const counts = { pending: 0, process: 0, ready: 0, delivered: 0 };
  for (const o of orders) {
    const s = STATUS.includes(o.status) ? o.status : "pending";
    counts[s]++;
  }
  setTextSafe("kpiPending", String(counts.pending));
  setTextSafe("kpiProcess", String(counts.process));
  setTextSafe("kpiReady", String(counts.ready));
  setTextSafe("kpiDelivered", String(counts.delivered));
}

/* ---------- Filters/sort + list ---------- */
function getFilters() {
  const q = String($("oSearch")?.value || "").trim().toLowerCase();
  const st = String($("oFilterStatus")?.value || "all");
  const sort = String($("oSort")?.value || "recent");
  return { q, st, sort };
}

function applyFilterSort(list) {
  const { q, st, sort } = getFilters();
  let out = Array.isArray(list) ? [...list] : [];

  if (st !== "all") out = out.filter(o => (o.status || "pending") === st);

  if (q) {
    out = out.filter(o => {
      const hay = [
        o.folio, o.patient_name, o.patient_phone,
        o.doctor_name, o.doctor_clinic, o.id
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  if (sort === "recent") out.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  if (sort === "old") out.sort((a,b) => new Date(a.created_at) - new Date(b.created_at));
  if (sort === "doctor") out.sort((a,b) => String(a.doctor_name||"").localeCompare(String(b.doctor_name||"")));
  if (sort === "patient") out.sort((a,b) => String(a.patient_name||"").localeCompare(String(b.patient_name||"")));
  if (sort === "status") out.sort((a,b) => String(a.status||"").localeCompare(String(b.status||"")));

  return out;
}

function setResultsInfo(n) {
  const el = $("oResultsInfo");
  if (el) el.textContent = `${n} resultados`;
}

function setSelectedMini(order) {
  const el = $("odSelectedMini");
  if (el) el.textContent = order ? (order.folio || order.id?.slice(0,8) || "—") : "—";
}

function renderOrdersList(list) {
  const wrap = $("ordersList");
  const empty = $("ordersEmpty");
  if (!wrap) return;

  if (!list.length) {
    wrap.innerHTML = "";
    if (empty) empty.classList.remove("d-none");
    setResultsInfo(0);
    return;
  }

  if (empty) empty.classList.add("d-none");
  setResultsInfo(list.length);

  wrap.innerHTML = list.map(o => {
    const badgeCls = statusBadgeClass(o.status);
    const selected = (CURRENT_ORDER?.id && o.id === CURRENT_ORDER.id) ? "border border-info" : "";
    return `
      <div class="cardx p-3 ${selected}" data-oid="${escapeHtml(o.id)}" style="cursor:pointer;">
        <div class="d-flex align-items-start justify-content-between gap-2">
          <div class="min-w-0">
            <div class="d-flex align-items-center gap-2">
              <span class="badge ${badgeCls}">${escapeHtml(statusLabel(o.status))}</span>
              <div class="fw-bold text-truncate">${escapeHtml(o.patient_name || "—")}</div>
            </div>
            <div class="muted small mt-1 text-truncate">
              <span class="me-2"><i class="bi bi-hash"></i> ${escapeHtml(o.folio || "—")}</span>
              <span class="me-2"><i class="bi bi-telephone"></i> ${escapeHtml(o.patient_phone || "—")}</span>
            </div>
            <div class="muted small text-truncate">
              <i class="bi bi-person"></i> ${escapeHtml(o.doctor_name || "Doctor")}
              ${o.doctor_clinic ? " • " + escapeHtml(o.doctor_clinic) : ""}
            </div>
          </div>
          <div class="muted small text-nowrap">${escapeHtml(fmtDate(o.created_at))}</div>
        </div>
      </div>
    `;
  }).join("");

  wrap.querySelectorAll("[data-oid]").forEach(card => {
    card.addEventListener("click", async () => {
      const oid = card.getAttribute("data-oid");
      await openOrderDetail(oid);
      renderOrdersList(applyFilterSort(ORDERS_CACHE));
    });
  });
}

/* ---------- Detail + links ---------- */
function showDetail(on) {
  const empty = $("orderDetailEmpty");
  const body = $("orderDetailBody");
  if (!empty || !body) return;
  if (on) { empty.classList.add("d-none"); body.classList.remove("d-none"); }
  else { empty.classList.remove("d-none"); body.classList.add("d-none"); }
}

async function renderLinks(orderId) {
  const list = $("orderFilesList");
  const empty = $("orderFilesEmpty");
  if (!list) return;

  const links = await fetchOrderLinks(orderId);

  if (!links.length) {
    list.innerHTML = "";
    if (empty) empty.classList.remove("d-none");
    return;
  }
  if (empty) empty.classList.add("d-none");

  list.innerHTML = links.map(l => {
    const title = l.title || "Archivo";
    return `
      <div class="cardx p-2 d-flex align-items-center justify-content-between gap-2">
        <div class="min-w-0">
          <div class="fw-semibold small text-truncate">${escapeHtml(title)}</div>
          <div class="muted tiny text-truncate">${escapeHtml(l.url)}</div>
        </div>
        <div class="d-flex gap-2">
          <a class="btn btn-soft py-1 px-3" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">
            <i class="bi bi-box-arrow-up-right me-1"></i>Abrir
          </a>
          <button class="btn btn-danger btn-sm" type="button" data-del="${escapeHtml(l.id)}">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");

  list.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      const id = btn.getAttribute("data-del");
      try {
        hideErr();
        await deleteOrderLink(id);
        await renderLinks(orderId);
        showMsg("Link borrado ✅");
      } catch (err) {
        console.error(err);
        showErr(err?.message || "No se pudo borrar.");
      }
    });
  });
}

async function openOrderDetail(orderId) {
  hideErr();

  const order = await fetchOrderById(orderId);
  if (!order) return showErr("No se pudo abrir la orden.");

  CURRENT_ORDER = order;
  showDetail(true);

  setTextSafe("odFolio", `Folio ${order.folio || "—"}`);
  setTextSafe("odMeta", `${fmtDate(order.created_at)} • ${statusLabel(order.status)}`);

  setTextSafe("odPatientName", order.patient_name || "—");
  setTextSafe("odPatientPhone", order.patient_phone || "—");
  setTextSafe("odDoctorName", order.doctor_name || "Doctor");
  setTextSafe("odDoctorClinic", order.doctor_clinic || "—");

  setTextSafe("odStudy", order.study || "—");
  setTextSafe("odNotesDoctor", order.doctor_notes || "—");

  const sel = $("odStatus");
  if (sel) sel.value = STATUS.includes(order.status) ? order.status : "pending";
  setTextSafe("odStatusText", statusLabel(order.status));

  const notes = $("odInternalNotes");
  if (notes) notes.value = order.notes || "";

  setSelectedMini(order);
  await renderLinks(order.id);
}

/* ---------- Actions ---------- */
function bindSaveChanges() {
  $("btnSaveOrderChanges")?.addEventListener("click", async () => {
    try {
      hideErr();
      if (!CURRENT_ORDER?.id) return showErr("Selecciona una orden.");

      const sel = $("odStatus");
      const status = String(sel?.value || "pending");
      if (!STATUS.includes(status)) return showErr("Estatus inválido.");

      const notes = $("odInternalNotes")?.value || "";

      await updateOrder(CURRENT_ORDER.id, { status, notes });

      showMsg("Guardado ✅");
      await refreshOrders();
      await openOrderDetail(CURRENT_ORDER.id);
      renderOrdersList(applyFilterSort(ORDERS_CACHE));
    } catch (err) {
      console.error(err);
      showErr(err?.message || "No se pudo guardar.");
    }
  });
}

function bindDropzone() {
  const dz = $("dropzone");
  const fp = $("filePicker");
  if (!dz || !fp) return;

  dz.addEventListener("click", () => fp.click());

  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("border-info");
  });
  dz.addEventListener("dragleave", () => dz.classList.remove("border-info"));

  dz.addEventListener("drop", async (e) => {
    e.preventDefault();
    dz.classList.remove("border-info");
    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;

    try {
      hideErr();
      if (!CURRENT_ORDER?.id) return showErr("Selecciona una orden primero.");
      await uploadFilesForOrder(CURRENT_ORDER.id, files);
      await renderLinks(CURRENT_ORDER.id);
      showMsg("Archivos subidos ✅");
    } catch (err) {
      console.error(err);
      showErr(err?.message || "No se pudo subir.");
    }
  });

  fp.addEventListener("change", async () => {
    const files = Array.from(fp.files || []);
    fp.value = "";
    if (!files.length) return;

    try {
      hideErr();
      if (!CURRENT_ORDER?.id) return showErr("Selecciona una orden primero.");
      await uploadFilesForOrder(CURRENT_ORDER.id, files);
      await renderLinks(CURRENT_ORDER.id);
      showMsg("Archivos subidos ✅");
    } catch (err) {
      console.error(err);
      showErr(err?.message || "No se pudo subir.");
    }
  });
}

function bindFilters() {
  ["oSearch", "oFilterStatus", "oSort"].forEach(id => {
    $(id)?.addEventListener("input", () => renderOrdersList(applyFilterSort(ORDERS_CACHE)));
    $(id)?.addEventListener("change", () => renderOrdersList(applyFilterSort(ORDERS_CACHE)));
  });

  $("btnRefreshOrders")?.addEventListener("click", refreshOrders);

  $("chipPendingQuick")?.addEventListener("click", () => {
    if ($("oFilterStatus")) $("oFilterStatus").value = "pending";
    renderOrdersList(applyFilterSort(ORDERS_CACHE));
  });
  $("chipReadyQuick")?.addEventListener("click", () => {
    if ($("oFilterStatus")) $("oFilterStatus").value = "ready";
    renderOrdersList(applyFilterSort(ORDERS_CACHE));
  });
  $("chipDeliveredQuick")?.addEventListener("click", () => {
    if ($("oFilterStatus")) $("oFilterStatus").value = "delivered";
    renderOrdersList(applyFilterSort(ORDERS_CACHE));
  });
}

/* ---------- Modal: Guardar link manual ---------- */
function bindSaveOrderFile() {
  $("btnSaveOrderFile")?.addEventListener("click", async () => {
    try {
      hideErr();
      if (!CURRENT_ORDER?.id) return showErr("Selecciona una orden primero.");

      const title = ($("ofTitle")?.value || "").trim() || "Archivo";
      const url = ($("ofUrl")?.value || "").trim();
      const provider = $("ofType")?.value || "other";

      if (!url) return showErr("Pon un link válido.");

      await addOrderLink(CURRENT_ORDER.id, { title, url, provider });
      await renderLinks(CURRENT_ORDER.id);

      showMsg("Link guardado ✅");

      // cerrar modal
      const modalEl = document.getElementById("orderFileModal");
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        modal.hide();
      }

      // limpiar
      if ($("ofTitle")) $("ofTitle").value = "";
      if ($("ofUrl")) $("ofUrl").value = "";

    } catch (err) {
      console.error(err);
      showErr(err?.message || "No se pudo guardar el link.");
    }
  });
}

/* ---------- Logout ---------- */
function bindLogout() {
  const btn = $("confirmLogout");
  if (!btn) {
    console.warn("No se encontró #confirmLogout (revisa el ID en HTML)");
    return;
  }

  btn.addEventListener("click", async () => {
    try {
      hideErr();

      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      // cerrar modal si sigue visible
      const modalEl = document.getElementById("logoutModal");
      if (modalEl) {
        const modal = bootstrap.Modal.getInstance(modalEl);
        modal?.hide();
      }

      window.location.href = "Index.html";
    } catch (err) {
      console.error(err);
      showErr(err?.message || "No se pudo cerrar sesión.");
    }
  });
}

/* ---------- Refresh ---------- */
async function refreshOrders() {
  hideErr();
  if (!MY_TEAM_ID) return;

  const orders = await fetchOrdersByTeam(MY_TEAM_ID);
  ORDERS_CACHE = orders;

  renderKPIs(orders);
  renderOrdersList(applyFilterSort(orders));
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    hideErr();

    const g = await guardEmployee();
    if (!g.ok) return showErr(g.reason);

    MY_TEAM_ID = await getMyTeamId(g.user.id);
    if (!MY_TEAM_ID) return showErr("Tu usuario no está vinculado a un team (team_members).");

    await loadEmployeeHeader(g.user, g.profile);

    bindFilters();
    bindSaveChanges();
    bindDropzone();
    bindSaveOrderFile();
    bindLogout();

    await refreshOrders();
    showDetail(false);
  } catch (err) {
    console.error(err);
    showErr(err?.message || "Error al iniciar.");
  }
});




document.addEventListener("DOMContentLoaded", async () => {

  // prueba nombre
  const { data, error } = await supabase.auth.getUser();

  const nameEl = document.getElementById("empWelcomeName");
  if (nameEl) {
    nameEl.textContent = data?.user?.email || "SIN SESIÓN";
  }

  // prueba logout
  const btn = document.getElementById("confirmLogout");
  

  btn?.addEventListener("click", async () => {
    console.log("🔴 Click logout");
    const { error } = await supabase.auth.signOut();
    console.log("signOut:", { error });
    if (!error) window.location.href = "Index.html";
  });
});
