import { supabase } from "./supabaseClient.js";

/* =========================================================
   ORLINE — Script.js (Auth + Roles + Admin Invites)
   - No mezcla JS con HTML
   - Admin genera códigos por RPC (create_invite / generate_invite fallback)
   - Valida codes con RPC (validate_invite) y reclama con RPC (claim_invite)
   ========================================================= */

/* -------------------------
   UI Helpers
-------------------------- */
function showError(el, msg) {
  if (!el) return;
  el.textContent = msg || "Error";
  el.classList.remove("d-none");
}
function hideError(el) {
  if (!el) return;
  el.textContent = "";
  el.classList.add("d-none");
}
function showView(viewId) {
  const views = [
    "view-login",
    "view-register",
    "view-employee-join",
    "view-verify",
    "view-doctor-profile",
    "view-admin",
  ];
  views.forEach((id) => document.getElementById(id)?.classList.add("d-none"));
  document.getElementById(viewId)?.classList.remove("d-none");
}
function redirectReplace(url) {
  window.location.replace(url);
}

/* -------------------------
   Utils
-------------------------- */
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
function normalize(str) {
  return String(str || "").trim();
}
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function setText(id, txt) {
  const el = document.getElementById(id);
  if (el) el.textContent = txt ?? "";
}
function showEl(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("d-none");
}
function hideEl(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("d-none");
}

/* -------------------------
   DOM refs
-------------------------- */
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");

const regName = document.getElementById("regName");
const regGender = document.getElementById("regGender");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const regInviteCode = document.getElementById("regInviteCode");
const regTerms = document.getElementById("regTerms");
const regError = document.getElementById("regError");

const empInviteCode = document.getElementById("empInviteCode");
const empDisplayName = document.getElementById("empDisplayName");
const empEmail = document.getElementById("empEmail");
const empPassword = document.getElementById("empPassword");
const empError = document.getElementById("empError");

const docClinicName = document.getElementById("docClinicName");
const docCity = document.getElementById("docCity");
const docPhone = document.getElementById("docPhone");
const docCedula = document.getElementById("docCedula");
const docCabinetName = document.getElementById("docCabinetName");
const docNotes = document.getElementById("docNotes");
const docProfileError = document.getElementById("docProfileError");

const doctorsTableBody = document.getElementById("doctorsTableBody");

/* Admin UI (si existen en tu HTML) */
const invDays = document.getElementById("invDays");
const btnGenDoctorInvite = document.getElementById("btnGenDoctorInvite");
const btnGenEmployeeInvite = document.getElementById("btnGenEmployeeInvite");
const inviteResultWrap = document.getElementById("inviteResultWrap");
const inviteCodeResult = document.getElementById("inviteCodeResult");
const btnCopyInvite = document.getElementById("btnCopyInvite");

/* -------------------------
   Navigation buttons
-------------------------- */
document.getElementById("goRegisterDoctor")?.addEventListener("click", () => {
  hideError(loginError);
  showView("view-register");
});

document.getElementById("goEmployeeJoin")?.addEventListener("click", () => {
  hideError(loginError);
  showView("view-employee-join");
});

document.getElementById("goLogin")?.addEventListener("click", () => {
  hideError(regError);
  showView("view-login");
});

document.getElementById("goLoginFromEmployee")?.addEventListener("click", () => {
  hideError(empError);
  showView("view-login");
});

document.getElementById("goLoginFromVerify")?.addEventListener("click", () => {
  showView("view-login");
});

/* Terms helper */
document.addEventListener("DOMContentLoaded", () => {
  const btnRead = document.getElementById("btnTermsRead");
  if (btnRead && regTerms) btnRead.addEventListener("click", () => (regTerms.checked = true));
});

/* -------------------------
   Supabase helpers
-------------------------- */
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

async function upsertMyProfile(payload) {
  const { error } = await supabase.from("profiles").upsert(payload, { onConflict: "id" });
  if (error) throw error;
}

/**
 * Evita el error "Tu perfil no existe"
 * Si el usuario existe en auth pero no en profiles, intenta crear el mínimo.
 * Requiere policy: profiles_insert_own.
 */
async function ensureProfileAfterAuth(user) {
  const profile = await getMyProfile(user.id);
  if (profile) return profile;

  try {
    const display = user?.user_metadata?.display_name || user?.email || "Usuario";
    await upsertMyProfile({
      id: user.id,
      role: "doctor", // default "seguro"; luego se corrige según invite
      display_name: display,
      clinic_name: null,
    });
  } catch {
    return null;
  }

  return await getMyProfile(user.id);
}

/* -------------------------
   RPC Invites (validate / claim)
   - validate_invite(p_code) returns table(ok, invite_type, expires_at, used_at)
   - claim_invite(p_code) returns table(ok, invite_type)
-------------------------- */
async function rpcValidateInvite(code) {
  const { data, error } = await supabase.rpc("validate_invite", { p_code: code });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

async function rpcClaimInvite(code) {
  const { data, error } = await supabase.rpc("claim_invite", { p_code: code });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

/* -------------------------
   Routing by role
-------------------------- */
async function routeByRole(profile) {
  if (!profile?.role) {
    showView("view-login");
    return;
  }

  if (profile.role === "admin") {
    await renderDoctorsTable();
    showView("view-admin");
    return;
  }

  if (profile.role === "employee") {
    redirectReplace("Empleado.html");
    return;
  }

  if (profile.role === "doctor") {
    if (!profile.clinic_name) {
      clearDoctorProfileForm();
      showView("view-doctor-profile");
      return;
    }
    redirectReplace("Dashboard.html");
    return;
  }

  showView("view-login");
}

/* -------------------------
   LOGIN
-------------------------- */
document.getElementById("btnLogin")?.addEventListener("click", async () => {
  hideError(loginError);

  const email = normalize(loginEmail?.value).toLowerCase();
  const password = String(loginPassword?.value || "");

  if (!email) return showError(loginError, "Pon tu correo.");
  if (!isValidEmail(email)) return showError(loginError, "Pon un correo válido.");
  if (!password) return showError(loginError, "Pon tu contraseña.");

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return showError(loginError, error.message);

  const user = data?.user;
  if (!user?.id) return showError(loginError, "Sesión inválida.");

  const profile = await ensureProfileAfterAuth(user);
  if (!profile) {
    showError(loginError, "Tu perfil no existe o no se pudo crear. Revisa RLS/policies de profiles.");
    return;
  }

  await routeByRole(profile);
});

/* -------------------------
   REGISTER DOCTOR (con invite)
-------------------------- */
document.getElementById("btnRegister")?.addEventListener("click", async () => {
  hideError(regError);

  const name = normalize(regName?.value);
  const gender = normalize(regGender?.value);
  const email = normalize(regEmail?.value).toLowerCase();
  const password = String(regPassword?.value || "");
  const inviteCode = normalize(regInviteCode?.value);

  if (name.length < 2) return showError(regError, "Pon tu nombre (mínimo 2 letras).");
  if (!isValidEmail(email)) return showError(regError, "Pon un correo válido.");
  if (password.length < 6) return showError(regError, "Contraseña mínima: 6 caracteres.");
  if (!inviteCode) return showError(regError, "Necesitas un código de invitación.");
  if (!regTerms?.checked) return showError(regError, "Debes aceptar los términos.");

  const displayName =
    gender === "female" ? `Dra. ${name}` : gender === "male" ? `Dr. ${name}` : name;

  // 1) Validar invite
  try {
    const v = await rpcValidateInvite(inviteCode);
    if (!v?.ok) return showError(regError, "Código inválido o expirado.");
    if (String(v.invite_type || "").toLowerCase() !== "doctor") {
      return showError(regError, "Este código no es de doctor.");
    }
  } catch (e) {
    console.error(e);
    return showError(regError, "No se pudo validar el código (RPC). Revisa tu SQL/RLS.");
  }

  // 2) Crear auth user
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return showError(regError, error.message);

  const userId = data?.user?.id;

  // Si tienes Email confirmation ON, puede que aquí no haya sesión aún.
  if (!userId) {
    showError(regError, "Cuenta creada. Revisa tu correo para confirmar e inicia sesión.");
    showView("view-login");
    return;
  }

  // 3) Reclamar invite
  try {
    const c = await rpcClaimInvite(inviteCode);
    if (!c?.ok) return showError(regError, "No se pudo reclamar el código.");
  } catch (e) {
    console.error(e);
    return showError(regError, "No se pudo reclamar el código (RPC).");
  }

  // 4) Crear profile
  try {
    await upsertMyProfile({
      id: userId,
      role: "doctor",
      display_name: displayName,
      clinic_name: null,
    });
  } catch (e) {
    // Si falla por RLS, lo verá al hacer login
    console.warn("upsert profile doctor falló:", e);
  }

  const profile = await getMyProfile(userId);
  if (!profile) {
    showError(regError, "Cuenta creada. Inicia sesión para continuar.");
    showView("view-login");
    return;
  }

  await routeByRole(profile);
});

/* -------------------------
   EMPLOYEE CREATE (con invite)
-------------------------- */
document.getElementById("btnEmployeeCreate")?.addEventListener("click", async () => {
  hideError(empError);

  const code = normalize(empInviteCode?.value);
  const displayName = normalize(empDisplayName?.value);
  const email = normalize(empEmail?.value).toLowerCase();
  const password = String(empPassword?.value || "");

  if (!code) return showError(empError, "Pon el código de activación.");
  if (displayName.length < 2) return showError(empError, "Pon tu nombre para mostrar.");
  if (!isValidEmail(email)) return showError(empError, "Pon un correo válido.");
  if (password.length < 6) return showError(empError, "Contraseña mínima: 6 caracteres.");

  // 1) Validar invite
  try {
    const v = await rpcValidateInvite(code);
    if (!v?.ok) return showError(empError, "Código inválido o expirado.");
    if (String(v.invite_type || "").toLowerCase() !== "employee") {
      return showError(empError, "Este código no es de empleado.");
    }
  } catch (e) {
    console.error(e);
    return showError(empError, "No se pudo validar el código (RPC). Revisa tu SQL/RLS.");
  }

  // 2) Crear auth user
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) return showError(empError, error.message);

  const userId = data?.user?.id;
  if (!userId) {
    return showError(empError, "Cuenta creada. Revisa tu correo para confirmar e inicia sesión.");
  }

  // 3) Reclamar invite
  try {
    const c = await rpcClaimInvite(code);
    if (!c?.ok) return showError(empError, "No se pudo reclamar el código.");
  } catch (e) {
    console.error(e);
    return showError(empError, "No se pudo reclamar el código (RPC).");
  }

  // 4) Crear profile
  try {
    await upsertMyProfile({
      id: userId,
      role: "employee",
      display_name: displayName,
      clinic_name: null,
    });
  } catch (e) {
    console.warn("upsert profile employee falló:", e);
  }

  redirectReplace("Empleado.html");
});

/* -------------------------
   DOCTOR PROFILE SAVE
-------------------------- */
function clearDoctorProfileForm() {
  if (docClinicName) docClinicName.value = "";
  if (docCity) docCity.value = "";
  if (docPhone) docPhone.value = "";
  if (docCedula) docCedula.value = "";
  if (docCabinetName) docCabinetName.value = "";
  if (docNotes) docNotes.value = "";
  hideError(docProfileError);
}

document.getElementById("btnSaveDoctorProfile")?.addEventListener("click", async () => {
  hideError(docProfileError);

  const user = await getAuthUser();
  if (!user) {
    showError(docProfileError, "No hay sesión activa. Inicia sesión.");
    showView("view-login");
    return;
  }

  const clinic = normalize(docClinicName?.value);
  const city = normalize(docCity?.value);
  const phone = normalize(docPhone?.value);
  const cabinet = normalize(docCabinetName?.value);

  if (clinic.length < 2) return showError(docProfileError, "Pon el nombre del consultorio/local.");
  if (city.length < 2) return showError(docProfileError, "Pon la ciudad.");
  if (phone.length < 7) return showError(docProfileError, "Pon un teléfono válido.");
  if (cabinet.length < 2) return showError(docProfileError, "Pon el nombre del gabinete/equipo.");

  const { error } = await supabase.from("profiles").update({ clinic_name: clinic }).eq("id", user.id);
  if (error) return showError(docProfileError, error.message);

  redirectReplace("Dashboard.html");
});

/* -------------------------
   ADMIN PANEL
-------------------------- */
document.getElementById("btnLogoutAdmin")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  showView("view-login");
});

document.getElementById("btnRefreshDoctors")?.addEventListener("click", async () => {
  await renderDoctorsTable();
});

async function renderDoctorsTable() {
  if (!doctorsTableBody) return;

  const user = await getAuthUser();
  if (!user) {
    doctorsTableBody.innerHTML = `<tr><td colspan="3" class="text-center small muted">Sin sesión…</td></tr>`;
    return;
  }

  const myProfile = await getMyProfile(user.id);
  if (!myProfile || myProfile.role !== "admin") {
    doctorsTableBody.innerHTML = `<tr><td colspan="3" class="text-center small muted">Sin permisos…</td></tr>`;
    return;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, display_name, clinic_name, created_at")
    .eq("role", "doctor")
    .order("created_at", { ascending: false });

  if (error || !data?.length) {
    doctorsTableBody.innerHTML = `<tr><td colspan="3" class="text-center small muted">Sin datos…</td></tr>`;
    return;
  }

  doctorsTableBody.innerHTML = data
    .map((p) => {
      const name = p.display_name || "Doctor";
      const clinic = p.clinic_name || "—";
      return `
        <tr>
          <td>
            <div class="fw-semibold">${escapeHtml(name)}</div>
            <div class="small text-secondary">${escapeHtml(p.id)}</div>
          </td>
          <td>${escapeHtml(clinic)}</td>
          <td class="text-end">
            <button class="btn btn-soft btn-sm" type="button" disabled>Acción</button>
          </td>
        </tr>
      `;
    })
    .join("");
}

/* -------------------------
   ADMIN: generar invitaciones (RPC)
   - create_invite(p_type, p_days) returns table(invite_code, expires_at)
   - fallback: generate_invite(p_kind, p_days) returns text
-------------------------- */
async function rpcCreateInviteSmart(type, days) {
  // 1) Intenta create_invite (returns table)
  {
    const { data, error } = await supabase.rpc("create_invite", {
      p_type: type,
      p_days: days,
    });

    if (!error) {
      const row = Array.isArray(data) ? data[0] : data;
      // ✅ Soporta invite_code (nuevo) o code (viejo)
      const code = row?.invite_code || row?.code;
      if (code) return { code: String(code), expires_at: row?.expires_at || null };
      // si no viene, caemos al fallback
    } else {
      // Si NO es "no existe", lo aventamos (ej: not allowed)
      const msg = String(error.message || "");
      const notFound =
        msg.toLowerCase().includes("could not find") ||
        msg.toLowerCase().includes("does not exist") ||
        msg.toLowerCase().includes("not exist");

      if (!notFound) throw error;
    }
  }

  // 2) Fallback: generate_invite (returns text)
  {
    const { data, error } = await supabase.rpc("generate_invite", {
      p_kind: type, // 'doctor' | 'employee'
      p_days: days,
    });

    if (error) throw error;

    if (typeof data === "string" && data.trim()) {
      return { code: data.trim(), expires_at: null };
    }

    throw new Error("RPC generate_invite no devolvió código.");
  }
}

async function guardIsAdmin() {
  const user = await getAuthUser();
  if (!user) return false;
  const p = await getMyProfile(user.id);
  return p?.role === "admin";
}

function setInviteResult(msg, isError = false) {
  if (!inviteResultWrap || !inviteCodeResult) return;
  inviteResultWrap.classList.remove("d-none");
  inviteCodeResult.textContent = msg;
  inviteCodeResult.classList.toggle("text-danger", !!isError);
}

async function generateInvite(type) {
  if (!inviteResultWrap || !inviteCodeResult) return;

  inviteResultWrap.classList.add("d-none");
  inviteCodeResult.classList.remove("text-danger");

  const isAdmin = await guardIsAdmin();
  if (!isAdmin) {
    setInviteResult("Sin permisos (no eres admin).", true);
    return;
  }

  const days = Math.max(1, parseInt(invDays?.value || "7", 10) || 7);

  try {
    const res = await rpcCreateInviteSmart(type, days);
    setInviteResult(res.code);
  } catch (e) {
    const msg = String(e?.message || e || "Error desconocido");
    setInviteResult("Error al generar: " + msg, true);
    console.error("Invite error:", e);
  }
}

btnGenDoctorInvite?.addEventListener("click", async () => {
  await generateInvite("doctor");
});

btnGenEmployeeInvite?.addEventListener("click", async () => {
  await generateInvite("employee");
});

btnCopyInvite?.addEventListener("click", async () => {
  const code = normalize(inviteCodeResult?.textContent || "");
  if (!code) return;

  try {
    await navigator.clipboard.writeText(code);
    btnCopyInvite.textContent = "Copiado ✅";
    setTimeout(() => (btnCopyInvite.textContent = "Copiar"), 1200);
  } catch {
    alert("No se pudo copiar. Código: " + code);
  }
});

/* -------------------------
   Autofill code desde URL (?code=...)
-------------------------- */
(function fillInviteFromQuery() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code") || url.searchParams.get("invite") || "";
    if (code && empInviteCode) empInviteCode.value = code;
  } catch {}
})();

/* -------------------------
   INIT
-------------------------- */
(async function init() {
  const user = await getAuthUser();
  if (!user) {
    showView("view-login");
    return;
  }

  const profile = await getMyProfile(user.id);
  if (!profile) {
    await supabase.auth.signOut();
    showError(loginError, "Tu perfil no existe o no se pudo leer. Revisa RLS/policies.");
    showView("view-login");
    return;
  }

  await routeByRole(profile);
})();
