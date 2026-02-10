import { supabase } from "./supabaseClient.js";



const STATUS = ["pending", "process", "ready", "delivered"];
const BUCKET = "orline-orders";

/* Upload rules */
const MAX_FILE_MB = 3;
const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;
const ALLOWED_EXT = new Set(["png", "jpg", "jpeg", "webp", "txt"]);
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "text/plain"]);
const UPLOAD_ALLOWED_STATUS = "process";

const $ = (id) => document.getElementById(id);
const clean = (v) => String(v ?? "").trim();

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString("es-MX"); } catch { return "—"; }
}

/* ---------- UI messages ---------- */
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
function showMsg(msg, ms = 2200) {
  const el = $("empMsg");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.remove("d-none");
  clearTimeout(el._t);
  if (ms > 0) el._t = setTimeout(() => el.classList.add("d-none"), ms);
}
function setTextSafe(id, val) {
  const el = $(id);
  if (el) el.textContent = val ?? "";
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

/* ---------- Auth/Profile ---------- */
async function getUser() {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) return null;
    return data?.user || null;
  } catch {
    return null;
  }
}

async function getMyProfile(userId) {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, display_name")
      .eq("id", userId)
      .maybeSingle();
    if (error) return null;
    return data || null;
  } catch {
    return null;
  }
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


async function getTeamName(teamId) {
  try {
    const cachedId = clean(localStorage.getItem("orline_team_id"));
    const cachedName = clean(localStorage.getItem("orline_team_name"));
    if (cachedName && cachedId && teamId && cachedId === String(teamId)) return cachedName;

    if (!teamId) return "Equipo";

    const { data, error } = await supabase
      .from("teams")
      .select("id, name")
      .eq("id", teamId)
      .maybeSingle();

    if (error) return "Equipo";

    const name = data?.name || "Equipo";
    try {
      localStorage.setItem("orline_team_id", String(teamId));
      localStorage.setItem("orline_team_name", String(name));
    } catch {}
    return name;
  } catch {
    return "Equipo";
  }
}

async function guardEmployee() {
  const user = await getUser();
  if (!user) return { ok: false, reason: "No hay sesión. Inicia sesión." };

  const profile = await getMyProfile(user.id);

  // Si profile no está disponible por RLS, dejamos pasar como empleado
  const role = profile?.role || "employee";

  if (role !== "employee" && role !== "admin") {
    return { ok: false, reason: `Sin permisos. Rol actual: ${role}` };
  }

  return { ok: true, user, profile: profile || { role, display_name: user.email || "Empleado" } };
}

/* ---------- State ---------- */
let CURRENT_ORDER = null;
let ORDERS_CACHE = [];
let MY_TEAM_ID = null;

/* ---------- Orders SELECT (safe primero) ---------- */
const ORDER_SELECT_SAFE = `
  id, doctor_id, team_id,
  patient_name, patient_phone, patient_email,
  folio, status, notes,
  created_at, updated_at
`;

const ORDER_SELECT_FULL = `
  id, doctor_id, team_id,
  patient_name, patient_phone, patient_email,
  folio, status, notes,
  created_at, updated_at,
  doctor_name, doctor_clinic,
  study, doctor_notes
`;

async function fetchOrdersByTeam(teamId) {
  const full = await supabase
    .from("orders")
    .select(ORDER_SELECT_FULL)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (full.error) {
    const safe = await supabase
      .from("orders")
      .select(ORDER_SELECT_SAFE)
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (safe.error) throw safe.error;
    return safe.data || [];
  }

  return full.data || [];
}

async function fetchOrderById(orderId) {
  const full = await supabase
    .from("orders")
    .select(ORDER_SELECT_FULL)
    .eq("id", orderId)
    .maybeSingle();

  if (full.error) {
    const safe = await supabase
      .from("orders")
      .select(ORDER_SELECT_SAFE)
      .eq("id", orderId)
      .maybeSingle();

    if (safe.error) throw safe.error;
    return safe.data || null;
  }

  return full.data || null;
}

async function updateOrder(orderId, patch) {
  const { error } = await supabase.from("orders").update({ ...patch }).eq("id", orderId);
  if (error) throw error;
}

/* ---------- Links ---------- */
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

/* ---------- Upload gating ---------- */
function canUploadForCurrentOrder() {
  if (!CURRENT_ORDER?.id) return { ok: false, reason: "Selecciona una orden primero." };
  const st = String(CURRENT_ORDER.status || "pending");
  if (st !== UPLOAD_ALLOWED_STATUS) {
    return {
      ok: false,
      reason: `Bloqueado: solo puedes subir archivos cuando la orden está en "En proceso". (Actual: ${statusLabel(st)})`
    };
  }
  return { ok: true };
}

function syncUploadUIByStatus() {
  const dz = $("dropzone");
  const fp = $("filePicker");
  const msg = $("uploadMsg");

  const allow = CURRENT_ORDER?.status === UPLOAD_ALLOWED_STATUS;

  if (dz) {
    dz.style.opacity = allow ? "1" : "0.55";
    dz.style.pointerEvents = allow ? "auto" : "none";
    dz.title = allow ? "Arrastra o da click para subir" : "Bloqueado: solo se permite subir en 'En proceso'";
  }
  if (fp) fp.disabled = !allow;

  if (msg) {
    msg.textContent = allow
      ? "Arrastra radiografías aquí o da click para seleccionar "
      : (CURRENT_ORDER ? `Bloqueado: cambia la orden a "En proceso" para subir archivos.` : "");
  }
}

/* ---------- Storage upload (VALIDADO + 3MB + IMG/TXT) ---------- */
function safeExt(name) {
  const base = String(name || "file").split("?")[0];
  const parts = base.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function normalizeFilename(name) {
  return String(name || "archivo")
    .replace(/[^\w.\-()\s]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
}

function contentTypeByExt(ext) {
  if (ext === "png") return "image/png";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "webp") return "image/webp";
  if (ext === "txt") return "text/plain";
  return "application/octet-stream";
}

function validateFile(file) {
  if (!file) return { ok: false, reason: "Archivo inválido." };

  if (file.size > MAX_FILE_BYTES) {
    return { ok: false, reason: `El archivo "${file.name}" pesa más de ${MAX_FILE_MB}MB.` };
  }

  const ext = safeExt(file.name);
  const mime = String(file.type || "");
  const isImageMime = mime.startsWith("image/");

  const extOk = ALLOWED_EXT.has(ext);
  const mimeOk =
    ALLOWED_MIME.has(mime) ||
    (isImageMime && (ext === "jpg" || ext === "jpeg" || ext === "png" || ext === "webp"));

  if (!extOk || !mimeOk) {
    return { ok: false, reason: `Tipo no permitido: "${file.name}". Solo PNG/JPG/WEBP o TXT.` };
  }

  return { ok: true, ext };
}

function explainStorageError(err) {
  const msg = String(err?.message || err || "Error al subir.");
  const lower = msg.toLowerCase();

  if (lower.includes("bucket") || lower.includes("not found")) {
    return `Error de Storage: no existe "${BUCKET}" o no tienes acceso. Revisa bucket + policies.`;
  }
  if (lower.includes("row-level security") || lower.includes("permission") || lower.includes("not authorized") || lower.includes("unauthorized")) {
    return "Sin permisos para subir. Revisa policies de Storage y que el usuario esté autenticado.";
  }
  if (lower.includes("mime") || lower.includes("content-type")) {
    return "El servidor rechazó el tipo (Content-Type). Usa PNG/JPG/WEBP o TXT.";
  }
  if (lower.includes("exceeded") || lower.includes("too large") || lower.includes("payload")) {
    return `El archivo excede el límite permitido. Máximo ${MAX_FILE_MB}MB.`;
  }
  return msg;
}

async function tryGetPublicUrlOrSigned(path) {
  // 1) public
  try {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    if (data?.publicUrl) return data.publicUrl;
  } catch {}

  // 2) signed 7 días
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 7);
    if (!error && data?.signedUrl) return data.signedUrl;
  } catch {}

  return null;
}

async function uploadFilesForOrder(orderId, files) {
  const allow = canUploadForCurrentOrder();
  if (!allow.ok) throw new Error(allow.reason);

  const user = await getUser();
  if (!user) throw new Error("Sin sesión.");

  const msg = $("uploadMsg");
  if (msg) msg.textContent = "Validando…";

  const arr = Array.isArray(files) ? files : [];
  if (!arr.length) return;

  // valida TODO antes
  const validated = [];
  for (const f of arr) {
    const v = validateFile(f);
    if (!v.ok) throw new Error(v.reason);
    validated.push({ file: f, ext: v.ext });
  }

  if (msg) msg.textContent = `Subiendo ${validated.length} archivo(s)…`;

  for (const item of validated) {
    const file = item.file;
    const ext = item.ext;
    const ct = contentTypeByExt(ext);
    const safeName = normalizeFilename(file.name);

    // ruta: orderId/....
    const path = `${orderId}/${Date.now()}_${Math.random().toString(16).slice(2)}_${safeName}`;

    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: ct, upsert: false, cacheControl: "3600" });

    if (upErr) throw new Error(explainStorageError(upErr));

    const url = await tryGetPublicUrlOrSigned(path);
    if (!url) throw new Error("Se subió el archivo pero no se pudo generar URL (public/signed).");

    await addOrderLink(orderId, { title: file.name, url, provider: "storage" });
  }

  if (msg) msg.textContent = "Listo ;)";
}

/* ---------- Header ---------- */
async function loadEmployeeHeader(user, profile) {
  const name =
    clean(profile?.display_name) ||
    clean(user?.user_metadata?.display_name) ||
    clean(user?.user_metadata?.name) ||
    "Empleado";

  setTextSafe("empWelcomeName", name);

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

/* ---------- Filters/sort ---------- */
function getFilters() {
  const q = clean($("oSearch")?.value).toLowerCase();
  const st = String($("oFilterStatus")?.value || "all");
  const sort = String($("oSort")?.value || "recent");
  return { q, st, sort };
}

function safeDateValue(x) {
  const d = new Date(x || 0);
  const t = d.getTime();
  return Number.isFinite(t) ? t : 0;
}

function applyFilterSort(list) {
  const { q, st, sort } = getFilters();
  let out = Array.isArray(list) ? [...list] : [];

  if (st !== "all") out = out.filter(o => (o.status || "pending") === st);

  if (q) {
    out = out.filter(o => {
      const hay = [
        o.study, o.folio, o.patient_name, o.patient_phone,
        o.doctor_name, o.doctor_clinic, o.id
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  if (sort === "recent") out.sort((a,b) => safeDateValue(b.created_at) - safeDateValue(a.created_at));
  else if (sort === "old") out.sort((a,b) => safeDateValue(a.created_at) - safeDateValue(b.created_at));
  else if (sort === "doctor") out.sort((a,b) => String(a.doctor_name||"").localeCompare(String(b.doctor_name||"")));
  else if (sort === "patient") out.sort((a,b) => String(a.patient_name||"").localeCompare(String(b.patient_name||"")));
  else if (sort === "status") out.sort((a,b) => String(a.status||"").localeCompare(String(b.status||"")));

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

/* ---------- Orders list ---------- */
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
    const study = clean(o.study) || "—";

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
              <i class="bi bi-clipboard2-pulse"></i> ${escapeHtml(study)}
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
}

/* Delegación: un solo listener */
function bindOrdersListClick() {
  const wrap = $("ordersList");
  if (!wrap || wrap.dataset.bound) return;
  wrap.dataset.bound = "1";

  wrap.addEventListener("click", async (e) => {
    const card = e.target.closest("[data-oid]");
    if (!card) return;

    const oid = card.getAttribute("data-oid");
    if (!oid) return;

    await openOrderDetail(oid);
    renderOrdersList(applyFilterSort(ORDERS_CACHE));
  });
}

/* ---------- Detail ---------- */
function showDetail(on) {
  const empty = $("orderDetailEmpty");
  const body = $("orderDetailBody");
  if (!empty || !body) return;
  if (on) { empty.classList.add("d-none"); body.classList.remove("d-none"); }
  else { empty.classList.remove("d-none"); body.classList.add("d-none"); }
}

function setDetailLoading(on) {
  const el = $("odMeta");
  if (!el) return;
  if (on) el.textContent = "Cargando…";
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
          <button class="btn btn-danger btn-sm" type="button" data-del="${escapeHtml(l.id)}" title="Borrar link">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      </div>
    `;
  }).join("");

  // Delegación para borrar (sin listeners por item)
  list.querySelectorAll("button[data-del]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.getAttribute("data-del");
      if (!id) return;
      try {
        hideErr();
        await deleteOrderLink(id);
        await renderLinks(orderId);
        showMsg("Link borrado ;)");
      } catch (err) {
        console.error(err);
        showErr(err?.message || "No se pudo borrar.");
      }
    });
  });
}



function renderOrderDetail(order) {
  if (!order) return;

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

  // permisos de subida según status
  syncUploadUIByStatus();
}

async function openOrderDetail(orderId) {
  hideErr();
  if (!orderId) return;

  const cached = ORDERS_CACHE.find(o => o.id === orderId) || null;
  if (cached) {
    renderOrderDetail(cached);
    setDetailLoading(true);
  } else {
    showDetail(true);
    setDetailLoading(true);
  }

  try {
    const order = await fetchOrderById(orderId);
    if (!order) throw new Error("No se pudo abrir la orden.");

    const idx = ORDERS_CACHE.findIndex(x => x.id === orderId);
    if (idx >= 0) ORDERS_CACHE[idx] = { ...ORDERS_CACHE[idx], ...order };
    else ORDERS_CACHE.unshift(order);

    renderOrderDetail(order);
    await renderLinks(order.id);
  } catch (err) {
    console.error(err);
    showErr(err?.message || "No se pudo abrir la orden.");
  } finally {
    setDetailLoading(false);
  }
}

/* ---------- Actions ---------- */
function bindSaveChanges() {
  const btn = $("btnSaveOrderChanges");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", async () => {
    try {
      hideErr();
      if (!CURRENT_ORDER?.id) return showErr("Selecciona una orden.");

      const sel = $("odStatus");
      const status = String(sel?.value || "pending");
      if (!STATUS.includes(status)) return showErr("Estatus inválido.");

      const notes = $("odInternalNotes")?.value || "";

      await updateOrder(CURRENT_ORDER.id, { status, notes });
      showMsg("Guardado :)");

      // refresca lista y detalle
      await refreshOrders(false);
      await openOrderDetail(CURRENT_ORDER.id);
      renderOrdersList(applyFilterSort(ORDERS_CACHE));
    } catch (err) {
      console.error(err);
      showErr(err?.message || "No se pudo guardar.");
    }
  });
}

/* ---------- Dropzone ---------- */
function bindDropzone() {
  const dz = $("dropzone");
  const fp = $("filePicker");
  if (!dz || !fp || dz.dataset.bound) return;
  dz.dataset.bound = "1";

  // Recomendado: en HTML => accept="image/*,.txt" multiple
  dz.addEventListener("click", () => {
    const allow = canUploadForCurrentOrder();
    if (!allow.ok) return showErr(allow.reason);
    fp.click();
  });

  dz.addEventListener("dragover", (e) => {
    e.preventDefault();
    dz.classList.add("border-info");
  });

  dz.addEventListener("dragleave", () => dz.classList.remove("border-info"));

  dz.addEventListener("drop", async (e) => {
    e.preventDefault();
    dz.classList.remove("border-info");

    const allow = canUploadForCurrentOrder();
    if (!allow.ok) return showErr(allow.reason);

    const files = Array.from(e.dataTransfer?.files || []);
    if (!files.length) return;

    try {
      hideErr();
      await uploadFilesForOrder(CURRENT_ORDER.id, files);
      await renderLinks(CURRENT_ORDER.id);
      showMsg("Archivos subidos :)");
    } catch (err) {
      console.error(err);
      showErr(err?.message || "No se pudo subir.");
    }
  });

  fp.addEventListener("change", async () => {
    const allow = canUploadForCurrentOrder();
    if (!allow.ok) {
      fp.value = "";
      return showErr(allow.reason);
    }

    const files = Array.from(fp.files || []);
    fp.value = "";
    if (!files.length) return;

    try {
      hideErr();
      await uploadFilesForOrder(CURRENT_ORDER.id, files);
      await renderLinks(CURRENT_ORDER.id);
      showMsg("Archivos subidos ;)");
    } catch (err) {
      console.error(err);
      showErr(err?.message || "No se pudo subir.");
    }
  });
}

/* ---------- Filters ---------- */
function bindFilters() {
  const rerender = () => renderOrdersList(applyFilterSort(ORDERS_CACHE));

  ["oSearch", "oFilterStatus", "oSort"].forEach(id => {
    $(id)?.addEventListener("input", rerender);
    $(id)?.addEventListener("change", rerender);
  });

  $("btnRefreshOrders")?.addEventListener("click", () => refreshOrders(false));

  $("chipPendingQuick")?.addEventListener("click", () => {
    if ($("oFilterStatus")) $("oFilterStatus").value = "pending";
    rerender();
  });
  $("chipReadyQuick")?.addEventListener("click", () => {
    if ($("oFilterStatus")) $("oFilterStatus").value = "ready";
    rerender();
  });
  $("chipDeliveredQuick")?.addEventListener("click", () => {
    if ($("oFilterStatus")) $("oFilterStatus").value = "delivered";
    rerender();
  });
}

/* ---------- Quitar botón "Agregar" ---------- */
function removeAddButton() {
  const ids = ["btnAddOrderFile", "btnOpenOrderFileModal", "btnAddShareLink", "btnAddFile", "btnAddLink"];
  ids.forEach(id => $(id)?.remove());
}

/* ---------- Logout ---------- */
function bindLogout() {
  const btn = $("confirmLogout");
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = "1";

  btn.addEventListener("click", async () => {
    try {
      hideErr();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      const modalEl = document.getElementById("logoutModal");
      if (modalEl && window.bootstrap?.Modal) {
        const modal = window.bootstrap.Modal.getInstance(modalEl);
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
async function refreshOrders(clearSelection = false) {
  hideErr();
  if (!MY_TEAM_ID) return;

  const btn = $("btnRefreshOrders");
  const oldTxt = btn?.textContent;

  try {
    if (btn) { btn.disabled = true; btn.textContent = "Actualizando…"; }

    const orders = await fetchOrdersByTeam(MY_TEAM_ID);
    ORDERS_CACHE = orders;

    renderKPIs(orders);
    renderOrdersList(applyFilterSort(orders));

    if (clearSelection) {
      CURRENT_ORDER = null;
      showDetail(false);
      setSelectedMini(null);
      syncUploadUIByStatus();
    } else {
      if (CURRENT_ORDER?.id) {
        const again = ORDERS_CACHE.find(o => o.id === CURRENT_ORDER.id);
        if (again) renderOrderDetail({ ...CURRENT_ORDER, ...again });
      }
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldTxt || "Actualizar"; }
  }
}

getMyTeamId

/* ---------- Init ---------- */
async function initEmployee() {
  try {
    hideErr();

    const g = await guardEmployee();
    if (!g.ok) return showErr(g.reason);

    MY_TEAM_ID = await getMyTeamId(g.user.id);
    if (!MY_TEAM_ID) return showErr("Tu usuario no está vinculado a un team (team_members).");

    await loadEmployeeHeader(g.user, g.profile);

    removeAddButton();
    bindOrdersListClick();
    bindFilters();
    bindSaveChanges();
    bindDropzone();
    bindLogout();

    await refreshOrders(true);
    showDetail(false);
    syncUploadUIByStatus();

    showMsg("Panel empleado listo ;)");
  } catch (err) {
    console.error(err);
    showErr(err?.message || "Error al iniciar.");
  }
}

document.addEventListener("DOMContentLoaded", initEmployee);
