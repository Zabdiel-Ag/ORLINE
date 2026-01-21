import { supabase } from "./supabaseClient.js";

function $(id) { return document.getElementById(id); }

/* -------------------------
   UI helpers
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
function showOk(el, msg) {
  if (!el) return;
  el.textContent = msg || "Listo ✅";
  el.classList.remove("d-none");
}
function hideOk(el) {
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
  views.forEach((id) => $(id)?.classList.add("d-none"));
  $(viewId)?.classList.remove("d-none");
}
function redirectReplace(url) {
  window.location.replace(url);
}
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
function normalize(str) {
  return String(str || "").trim();
}

/* -------------------------
   DOM refs
-------------------------- */
const loginEmail = $("loginEmail");
const loginPassword = $("loginPassword");
const loginError = $("loginError");

const regName = $("regName");
const regGender = $("regGender");
const regEmail = $("regEmail");
const regPassword = $("regPassword");
const regInviteCode = $("regInviteCode");
const regTerms = $("regTerms");
const regError = $("regError");

const empInviteCode = $("empInviteCode");
const empDisplayName = $("empDisplayName");
const empEmail = $("empEmail");
const empPassword = $("empPassword");
const empError = $("empError");

const docClinicName = $("docClinicName");
const docCity = $("docCity");
const docPhone = $("docPhone");
const docCedula = $("docCedula");
const docCabinetName = $("docCabinetName");
const docNotes = $("docNotes");
const docProfileError = $("docProfileError");

/* Admin */
const doctorsTableBody = $("doctorsTableBody");
const invDays = $("invDays");
const btnGenDoctorInvite = $("btnGenDoctorInvite");
const btnGenEmployeeInvite = $("btnGenEmployeeInvite");
const inviteResultWrap = $("inviteResultWrap");
const inviteCodeResult = $("inviteCodeResult");
const btnCopyInvite = $("btnCopyInvite");
const btnMakeQr = $("btnMakeQr");
const qrWrap = $("qrWrap");

/* Teams Admin UI */
const teamName = $("teamName");
const teamSlug = $("teamSlug");
const teamNotes = $("teamNotes");
const btnCreateTeam = $("btnCreateTeam");
const teamError = $("teamError");
const teamOk = $("teamOk");

const teamSelect = $("teamSelect");
const teamsTableBody = $("teamsTableBody");
const btnRefreshTeams = $("btnRefreshTeams");

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
    .maybeSingle();

  if (error) {
    console.error("getMyProfile error:", error);
    return null;
  }
  return data;
}

/* ✅ Solo actualiza display_name / clinic_name. NO role. */
async function updateMyProfile(userId, patch) {
  const safe = { ...patch };
  delete safe.role;
  if (!Object.keys(safe).length) return;

  const { error } = await supabase
    .from("profiles")
    .update(safe)
    .eq("id", userId);

  if (error) throw error;
}

/* -------------------------
   Routing
-------------------------- */
async function routeByRole(profile) {
  const role = String(profile?.role || "").toLowerCase();

  if (role === "admin") {
    await Promise.allSettled([
      renderDoctorsTable(),
      refreshTeamsUI(), // 👈 carga equipos en dropdown + tabla
    ]);
    showView("view-admin");
    return;
  }

  if (role === "employee") {
    redirectReplace("Empleado.html");
    return;
  }

  if (role === "doctor") {
    if (!profile.clinic_name) {
      showView("view-doctor-profile");
      return;
    }
    redirectReplace("Dashboard.html");
    return;
  }

  showView("view-login");
}

async function routeByCurrentUser() {
  const user = await getAuthUser();
  if (!user) {
    showView("view-login");
    return;
  }

  const profile = await getMyProfile(user.id);
  if (!profile) {
    await supabase.auth.signOut();
    showView("view-login");
    showError(loginError, "Tu profile no existe. Revisa trigger handle_new_user / RLS.");
    return;
  }

  await routeByRole(profile);
}

/* -------------------------
   RPC: validate_invite (NEW SHAPE)
   returns: ok, team_id, team_name, kind, expires_at, remaining
-------------------------- */
async function rpcValidateInvite(code) {
  const { data, error } = await supabase.rpc("validate_invite", { p_code: code });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

/* -------------------------
   Navigation
-------------------------- */
$("goRegisterDoctor")?.addEventListener("click", () => {
  hideError(loginError);
  showView("view-register");
});

$("goEmployeeJoin")?.addEventListener("click", () => {
  hideError(loginError);
  showView("view-employee-join");
});

$("goLogin")?.addEventListener("click", () => {
  hideError(regError);
  showView("view-login");
});

$("goLoginFromEmployee")?.addEventListener("click", () => {
  hideError(empError);
  showView("view-login");
});

$("goLoginFromVerify")?.addEventListener("click", () => showView("view-login"));

document.addEventListener("DOMContentLoaded", () => {
  const btnRead = $("btnTermsRead");
  if (btnRead && regTerms) btnRead.addEventListener("click", () => (regTerms.checked = true));
});

/* -------------------------
   LOGIN
-------------------------- */
$("btnLogin")?.addEventListener("click", async () => {
  hideError(loginError);

  const email = normalize(loginEmail?.value).toLowerCase();
  const password = String(loginPassword?.value || "");

  if (!email) return showError(loginError, "Pon tu correo.");
  if (!isValidEmail(email)) return showError(loginError, "Pon un correo válido.");
  if (!password) return showError(loginError, "Pon tu contraseña.");

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return showError(loginError, error.message);

  await routeByCurrentUser();
});

/* -------------------------
   REGISTER DOCTOR (invite)
   ✅ usa TRIGGER handle_new_user:
   - mandamos invite_code + role en metadata
-------------------------- */
$("btnRegister")?.addEventListener("click", async () => {
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

  // 1) validar invite
  let v;
  try {
    v = await rpcValidateInvite(inviteCode);
    const k = String(v?.kind || "").toLowerCase();
    if (!v?.ok) return showError(regError, "Código inválido, expirado o agotado.");
    if (k !== "doctor") return showError(regError, "Este código no es de doctor.");
  } catch (e) {
    console.error(e);
    return showError(regError, "No se pudo validar el código (RPC).");
  }

  // 2) signup (trigger handle_new_user consume invite y crea profile/team_members)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        invite_code: inviteCode,
        role: "doctor",
      },
    },
  });
  if (error) return showError(regError, error.message);

  // confirmación email: no hay sesión
  if (!data?.user?.id) {
    showError(regError, "Cuenta creada ✅ Revisa tu correo, confirma y luego inicia sesión.");
    showView("view-login");
    return;
  }

  // UX: guardar team info en localStorage para UI
  try {
    if (v?.team_id) localStorage.setItem("orline_team_id", String(v.team_id));
    if (v?.team_name) localStorage.setItem("orline_team_name", String(v.team_name));
  } catch {}

  // 3) Ajuste display_name en profile (por si quieres)
  try { await updateMyProfile(data.user.id, { display_name: displayName }); } catch {}

  await routeByCurrentUser();
});

/* -------------------------
   EMPLOYEE CREATE (invite)
   ✅ usa TRIGGER handle_new_user
-------------------------- */
$("btnEmployeeCreate")?.addEventListener("click", async () => {
  hideError(empError);

  const code = normalize(empInviteCode?.value);
  const displayName = normalize(empDisplayName?.value);
  const email = normalize(empEmail?.value).toLowerCase();
  const password = String(empPassword?.value || "");

  if (!code) return showError(empError, "Pon el código de activación.");
  if (displayName.length < 2) return showError(empError, "Pon tu nombre para mostrar.");
  if (!isValidEmail(email)) return showError(empError, "Pon un correo válido.");
  if (password.length < 6) return showError(empError, "Contraseña mínima: 6 caracteres.");

  // 1) validar invite
  let v;
  try {
    v = await rpcValidateInvite(code);
    const k = String(v?.kind || "").toLowerCase();
    if (!v?.ok) return showError(empError, "Código inválido, expirado o agotado.");
    if (k !== "employee") return showError(empError, "Este código no es de empleado.");
  } catch (e) {
    console.error(e);
    return showError(empError, "No se pudo validar el código (RPC).");
  }

  // 2) signup (trigger consume invite + crea profile/team_members)
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        display_name: displayName,
        invite_code: code,
        role: "employee",
      },
    },
  });
  if (error) return showError(empError, error.message);

  if (!data?.user?.id) {
    return showError(empError, "Cuenta creada ✅ Revisa tu correo, confirma y luego inicia sesión.");
  }

  try {
    if (v?.team_id) localStorage.setItem("orline_team_id", String(v.team_id));
    if (v?.team_name) localStorage.setItem("orline_team_name", String(v.team_name));
  } catch {}

  try { await updateMyProfile(data.user.id, { display_name: displayName }); } catch {}

  await routeByCurrentUser();
});

/* -------------------------
   DOCTOR PROFILE SAVE
-------------------------- */
$("btnSaveDoctorProfile")?.addEventListener("click", async () => {
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

  const { error } = await supabase
    .from("profiles")
    .update({ clinic_name: clinic })
    .eq("id", user.id);

  if (error) return showError(docProfileError, error.message);

  await routeByCurrentUser();
});

/* -------------------------
   ADMIN: Doctors table
-------------------------- */
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

  if (error) {
    doctorsTableBody.innerHTML = `<tr><td colspan="3" class="text-center small text-danger">Error: ${String(error.message)}</td></tr>`;
    return;
  }

  if (!data?.length) {
    doctorsTableBody.innerHTML = `<tr><td colspan="3" class="text-center small muted">Sin doctores…</td></tr>`;
    return;
  }

  doctorsTableBody.innerHTML = data.map(p => `
    <tr>
      <td>
        <div class="fw-semibold">${String(p.display_name || "Doctor")}</div>
        <div class="small text-secondary">${String(p.id)}</div>
      </td>
      <td>${String(p.clinic_name || "—")}</td>
      <td class="text-end"><button class="btn btn-soft btn-sm" type="button" disabled>Acción</button></td>
    </tr>
  `).join("");
}

$("btnRefreshDoctors")?.addEventListener("click", async () => {
  await renderDoctorsTable();
});

/* -------------------------
   ADMIN: Teams (create + list)
-------------------------- */
async function guardIsAdmin() {
  const user = await getAuthUser();
  if (!user) return false;
  const p = await getMyProfile(user.id);
  return p?.role === "admin";
}

async function loadTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}

async function refreshTeamsUI() {
  // si no existen en el HTML, no hacemos nada
  if (!teamSelect && !teamsTableBody) return;

  const userOk = await guardIsAdmin();
  if (!userOk) return;

  try {
    const teams = await loadTeams();

    // dropdown
    if (teamSelect) {
      if (!teams.length) {
        teamSelect.innerHTML = `<option value="">Sin equipos aún…</option>`;
      } else {
        teamSelect.innerHTML = `
          <option value="">Selecciona equipo…</option>
          ${teams.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join("")}
        `;
      }
    }

    // table
    if (teamsTableBody) {
      if (!teams.length) {
        teamsTableBody.innerHTML = `<tr><td colspan="4" class="text-center small muted">Sin equipos aún…</td></tr>`;
      } else {
        teamsTableBody.innerHTML = teams.map(t => `
          <tr>
            <td><div class="fw-semibold">${escapeHtml(t.name)}</div></td>
            <td class="d-none d-lg-table-cell">—</td>
            <td class="d-none d-lg-table-cell">—</td>
            <td class="text-end">
              <code>${String(t.id)}</code>
            </td>
          </tr>
        `).join("");
      }
    }
  } catch (e) {
    console.error("refreshTeamsUI error:", e);
  }
}

btnRefreshTeams?.addEventListener("click", refreshTeamsUI);

btnCreateTeam?.addEventListener("click", async () => {
  hideError(teamError);
  hideOk(teamOk);

  const okAdmin = await guardIsAdmin();
  if (!okAdmin) return showError(teamError, "Sin permisos.");

  const name = normalize(teamName?.value);
  const slug = normalize(teamSlug?.value);
  const notes = normalize(teamNotes?.value);

  if (name.length < 2) return showError(teamError, "Pon un nombre de equipo (mínimo 2 letras).");

  // Nota: tu tabla teams actual solo tiene (id, name, created_at)
  // Por eso slug/notes no se guardan aún; si luego agregas columnas, lo metemos.
  try {
    const { error } = await supabase.from("teams").insert([{ name }]);
    if (error) throw error;

    showOk(teamOk, `Equipo creado ✅ (${name})`);
    if (teamName) teamName.value = "";
    if (teamSlug) teamSlug.value = "";
    if (teamNotes) teamNotes.value = "";

    await refreshTeamsUI();
  } catch (e) {
    showError(teamError, String(e?.message || e));
  }
});

/* -------------------------
   ADMIN: Generate Invite (by team)
   Prefer: gen_invite(p_team_id, p_kind, p_days, p_max_uses)
   Fallback: create_invite(p_kind, p_team_id, p_days)
-------------------------- */
function setInviteResult(msg, isError = false) {
  if (!inviteResultWrap || !inviteCodeResult) return;
  inviteResultWrap.classList.remove("d-none");
  inviteCodeResult.textContent = msg;
  inviteCodeResult.classList.toggle("text-danger", !!isError);
}

async function rpcGenInvite(kind, teamId, days) {
  // 1) intenta gen_invite (returns text)
  const try1 = await supabase.rpc("gen_invite", {
    p_team_id: teamId,
    p_kind: kind,
    p_days: days,
    p_max_uses: 1,
  });

  if (!try1.error) {
    const code = typeof try1.data === "string" ? try1.data : (Array.isArray(try1.data) ? try1.data[0] : try1.data);
    if (code) return String(code);
  }

  // 2) fallback create_invite (returns table(code, kind, expires_at))
  const try2 = await supabase.rpc("create_invite", {
    p_kind: kind,
    p_team_id: teamId,
    p_days: days,
  });
  if (try2.error) throw try2.error;

  const row = Array.isArray(try2.data) ? try2.data[0] : try2.data;
  const code2 = row?.code || row?.invite_code || (typeof try2.data === "string" ? try2.data : null);
  if (!code2) throw new Error("RPC no devolvió código.");
  return String(code2);
}

async function generateInvite(kind) {
  if (!inviteResultWrap || !inviteCodeResult) return;

  inviteResultWrap.classList.add("d-none");
  inviteCodeResult.classList.remove("text-danger");
  if (qrWrap) { qrWrap.classList.add("d-none"); qrWrap.innerHTML = ""; }

  const isAdmin = await guardIsAdmin();
  if (!isAdmin) return setInviteResult("Sin permisos (no eres admin).", true);

  const teamId = normalize(teamSelect?.value);
  if (!teamId) return setInviteResult("Selecciona un equipo primero.", true);

  const days = Math.max(1, parseInt(invDays?.value || "7", 10) || 7);

  try {
    const code = await rpcGenInvite(kind, teamId, days);
    setInviteResult(code);
  } catch (e) {
    setInviteResult("Error al generar: " + String(e?.message || e), true);
  }
}

btnGenDoctorInvite?.addEventListener("click", () => generateInvite("doctor"));
btnGenEmployeeInvite?.addEventListener("click", () => generateInvite("employee"));

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

btnMakeQr?.addEventListener("click", () => {
  const code = normalize(inviteCodeResult?.textContent || "");
  if (!code || !qrWrap) return;

  qrWrap.classList.remove("d-none");
  qrWrap.innerHTML = "";

  // si tienes qrcodejs cargado, existirá QRCode
  if (typeof window.QRCode !== "function") {
    qrWrap.innerHTML = `<div class="small muted">No se encontró la librería QR (QRCode). Igual puedes copiar el código.</div>`;
    return;
  }

  // genera QR con link (?code=...)
  const url = new URL(window.location.href);
  url.searchParams.set("code", code);

  // eslint-disable-next-line no-new
  new window.QRCode(qrWrap, {
    text: url.toString(),
    width: 180,
    height: 180,
  });

  const cap = document.createElement("div");
  cap.className = "small muted mt-2";
  cap.textContent = "QR listo ✅ (abre el link y se llena el código)";
  qrWrap.appendChild(cap);
});

/* Autofill (?code=...) */
(function fillInviteFromQuery() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code") || url.searchParams.get("invite") || "";
    if (code && empInviteCode) empInviteCode.value = code;
    if (code && regInviteCode && !regInviteCode.value) regInviteCode.value = code;
  } catch {}
})();

/* Logout admin */
$("btnLogoutAdmin")?.addEventListener("click", async () => {
  await supabase.auth.signOut();
  showView("view-login");
});

/* -------------------------
   Utils
-------------------------- */
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* INIT */
(async function init() {
  const user = await getAuthUser();
  if (!user) {
    showView("view-login");
    return;
  }
  await routeByCurrentUser();
})();
