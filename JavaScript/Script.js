
// Admin fijo: user=zab pass=admin123$

const USERS_KEY = "orline_users";
const SESSION_KEY = "orline_session";
const INVITES_KEY = "orline_invites";
const DOCTOR_PROFILES_KEY = "orline_doctor_profiles";

// ====== Const Admin ======
const ADMIN_USERNAME = "zab";
const ADMIN_PASSWORD = "admin123$";

// ====== Helpers: Storage ======
function readLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function writeLS(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// Users
function getUsers() { return readLS(USERS_KEY, []); }
function saveUsers(users) { writeLS(USERS_KEY, users); }

// Session
function getSession() { return readLS(SESSION_KEY, null); }
function setSession(session) { writeLS(SESSION_KEY, session); }
function clearSession() { localStorage.removeItem(SESSION_KEY); }

// Invites
function getInvites() { return readLS(INVITES_KEY, []); }
function saveInvites(invites) { writeLS(INVITES_KEY, invites); }

// Doctor Profiles
function getDoctorProfiles() { return readLS(DOCTOR_PROFILES_KEY, []); }
function saveDoctorProfiles(items) { writeLS(DOCTOR_PROFILES_KEY, items); }
function getDoctorProfileByUserId(userId) {
  return getDoctorProfiles().find(p => p.userId === userId) || null;
}

// ====== Helpers: UI ======
function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("d-none");
}
function hideError(el) {
  if (!el) return;
  el.textContent = "";
  el.classList.add("d-none");
}
function showView(viewId) {
  const views = ["view-login", "view-register", "view-verify", "view-doctor-profile", "view-admin"];
  views.forEach(id => document.getElementById(id)?.classList.add("d-none"));
  document.getElementById(viewId)?.classList.remove("d-none");
}

// ====== Validation ======
function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}
function normalize(str) {
  return String(str || "").trim();
}
function nowISO() { return new Date().toISOString(); }

// Acepta login por correo o username
function findUserByLogin(login) {
  const users = getUsers();
  const v = String(login || "").trim().toLowerCase();
  return users.find(u =>
    (u.email && u.email.toLowerCase() === v) ||
    (u.username && u.username.toLowerCase() === v)
  ) || null;
}
function findUserByEmail(email) {
  const users = getUsers();
  const v = String(email || "").trim().toLowerCase();
  return users.find(u => (u.email || "").toLowerCase() === v) || null;
}

// ====== Seed Admin (una sola vez) ======
function seedAdmin() {
  const users = getUsers();

  const exists = users.some(u =>
    (u.username || "").toLowerCase() === ADMIN_USERNAME.toLowerCase()
  );

  if (exists) return;

  users.push({
    id: crypto.randomUUID(),
    role: "admin",
    username: ADMIN_USERNAME,
    name: "Admin",
    email: "", // opcional
    password: ADMIN_PASSWORD,
    createdAt: nowISO()
  });

  saveUsers(users);
}

// ====== Invites ======
function genInviteCode() {
  // SD-XXXXXX
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "SD-";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function createInvite({ doctorName = "", doctorEmail = "", days = 7 } = {}) {
  const invites = getInvites();
  const code = genInviteCode();

  const expiresAt = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000).toISOString();

  invites.push({
    id: crypto.randomUUID(),
    code,
    doctorName: normalize(doctorName),
    doctorEmail: normalize(doctorEmail).toLowerCase(),
    createdAt: nowISO(),
    expiresAt,
    usedAt: null,
    usedByUserId: null
  });

  saveInvites(invites);
  return code;
}

function validateInvite(code, email) {
  const invites = getInvites();
  const c = normalize(code).toUpperCase();
  const e = normalize(email).toLowerCase();

  const inv = invites.find(x => (x.code || "").toUpperCase() === c);
  if (!inv) return { ok: false, msg: "Código de invitación inválido." };
  if (inv.usedAt) return { ok: false, msg: "Ese código ya fue usado." };

  const exp = new Date(inv.expiresAt).getTime();
  if (Number.isFinite(exp) && Date.now() > exp) return { ok: false, msg: "Ese código ya expiró. Pide otro a ScanDent." };

  // Si guardaste correo en invitación, lo forzamos (opcional)
  if (inv.doctorEmail && inv.doctorEmail !== e) {
    return { ok: false, msg: "Este código no corresponde a ese correo." };
  }

  return { ok: true, invite: inv };
}

function markInviteUsed(inviteId, userId) {
  const invites = getInvites();
  const idx = invites.findIndex(x => x.id === inviteId);
  if (idx >= 0) {
    invites[idx].usedAt = nowISO();
    invites[idx].usedByUserId = userId;
    saveInvites(invites);
  }
}

// ====== Routing / Next Step ======
function goToNextStep(user) {
  if (!user) return showView("view-login");

  // Admin -> Panel admin
  if (user.role === "admin") {
    renderDoctorsTable();
    showView("view-admin");
    return;
  }

  // Doctor -> si no tiene perfil, pedirlo
  const profile = getDoctorProfileByUserId(user.id);
  if (!profile) {
    clearDoctorProfileForm();
    showView("view-doctor-profile");
    return;
  }

  // Doctor ya completo -> Dashboard
  window.location.href = "Dashboard.html";
}

// ====== DOM ======
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");

const regName = document.getElementById("regName");
const regEmail = document.getElementById("regEmail");
const regPassword = document.getElementById("regPassword");
const regInviteCode = document.getElementById("regInviteCode");
const regTerms = document.getElementById("regTerms");
const regError = document.getElementById("regError");

// Verify (si no lo usas, no pasa nada)
const verifyCode = document.getElementById("verifyCode");
const verifyError = document.getElementById("verifyError");

// Doctor Profile
const docClinicName = document.getElementById("docClinicName");
const docCity = document.getElementById("docCity");
const docPhone = document.getElementById("docPhone");
const docCedula = document.getElementById("docCedula");
const docCabinetName = document.getElementById("docCabinetName");
const docNotes = document.getElementById("docNotes");
const docProfileError = document.getElementById("docProfileError");

// Admin
const invDoctorName = document.getElementById("invDoctorName");
const invDoctorEmail = document.getElementById("invDoctorEmail");
const invDays = document.getElementById("invDays");
const inviteResultWrap = document.getElementById("inviteResultWrap");
const inviteCodeResult = document.getElementById("inviteCodeResult");
const doctorsTableBody = document.getElementById("doctorsTableBody");

// ====== View Nav Buttons ======
document.getElementById("goRegister")?.addEventListener("click", () => {
  hideError(loginError);
  showView("view-register");
});
document.getElementById("goLogin")?.addEventListener("click", () => {
  hideError(regError);
  showView("view-login");
});
document.getElementById("goLoginFromVerify")?.addEventListener("click", () => {
  hideError(verifyError);
  showView("view-login");
});

// ====== Register (SOLO DOCTORES) ======
document.getElementById("btnRegister")?.addEventListener("click", () => {
  hideError(regError);

  const name = normalize(regName?.value);
  const email = normalize(regEmail?.value);
  const password = String(regPassword?.value || "");
  const code = normalize(regInviteCode?.value);

  if (name.length < 2) return showError(regError, "Pon tu nombre (mínimo 2 letras).");
  if (!isValidEmail(email)) return showError(regError, "Pon un correo válido.");
  if (password.length < 6) return showError(regError, "Contraseña mínima: 6 caracteres.");
  if (!code) return showError(regError, "Necesitas un código de invitación.");
  if (!regTerms?.checked) return showError(regError, "Debes aceptar el uso responsable de información.");

  if (findUserByEmail(email)) return showError(regError, "Ese correo ya está registrado.");

  const inviteCheck = validateInvite(code, email);
  if (!inviteCheck.ok) return showError(regError, inviteCheck.msg);

  const users = getUsers();

  const newUser = {
    id: crypto.randomUUID(),
    role: "doctor",
    username: "", // doctores por email
    name,
    email: email.toLowerCase(),
    password,
    createdAt: nowISO()
  };

  users.push(newUser);
  saveUsers(users);

  // Marcar invitación usada
  markInviteUsed(inviteCheck.invite.id, newUser.id);

  // Sesión
  setSession({ userId: newUser.id, role: "doctor", loginAt: nowISO() });

  // Siguiente paso: perfil doctor
  goToNextStep(newUser);
});

// ====== Login (Admin o Doctor) ======
document.getElementById("btnLogin")?.addEventListener("click", () => {
  hideError(loginError);

  const login = normalize(loginEmail?.value); // puede ser email o username
  const password = String(loginPassword?.value || "");

  if (!login) return showError(loginError, "Pon tu usuario o correo.");
  if (!password) return showError(loginError, "Pon tu contraseña.");

  const user = findUserByLogin(login);
  if (!user) return showError(loginError, "No existe ese usuario.");

  if (user.password !== password) return showError(loginError, "Contraseña incorrecta.");

  setSession({ userId: user.id, role: user.role, loginAt: nowISO() });
  goToNextStep(user);
});

// ====== Doctor Profile Save ======
function clearDoctorProfileForm() {
  if (docClinicName) docClinicName.value = "";
  if (docCity) docCity.value = "";
  if (docPhone) docPhone.value = "";
  if (docCedula) docCedula.value = "";
  if (docCabinetName) docCabinetName.value = "";
  if (docNotes) docNotes.value = "";
  hideError(docProfileError);
}

document.getElementById("btnSaveDoctorProfile")?.addEventListener("click", () => {
  hideError(docProfileError);

  const session = getSession();
  if (!session?.userId) return showError(docProfileError, "No hay sesión activa.");

  const users = getUsers();
  const user = users.find(u => u.id === session.userId);
  if (!user) {
    clearSession();
    return showError(docProfileError, "Sesión inválida, vuelve a iniciar sesión.");
  }
  if (user.role !== "doctor") return showError(docProfileError, "Solo doctores pueden crear perfil.");

  const clinic = normalize(docClinicName?.value);
  const city = normalize(docCity?.value);
  const phone = normalize(docPhone?.value);
  const cedula = normalize(docCedula?.value);
  const cabinet = normalize(docCabinetName?.value);
  const notes = normalize(docNotes?.value);

  if (clinic.length < 2) return showError(docProfileError, "Pon el nombre del consultorio/local.");
  if (city.length < 2) return showError(docProfileError, "Pon la ciudad.");
  if (phone.length < 7) return showError(docProfileError, "Pon un teléfono válido.");
  if (cabinet.length < 2) return showError(docProfileError, "Pon el nombre del gabinete/equipo.");

  const profiles = getDoctorProfiles();

  // evitar duplicado
  const existing = profiles.find(p => p.userId === user.id);
  if (existing) {
    existing.clinicName = clinic;
    existing.city = city;
    existing.phone = phone;
    existing.cedula = cedula;
    existing.cabinetName = cabinet;
    existing.notes = notes;
    existing.updatedAt = nowISO();
  } else {
    profiles.push({
      id: crypto.randomUUID(),
      userId: user.id,
      clinicName: clinic,
      city,
      phone,
      cedula,
      cabinetName: cabinet,
      notes,
      createdAt: nowISO(),
      updatedAt: nowISO()
    });
  }

  saveDoctorProfiles(profiles);

  // listo -> dashboard
  window.location.href = "Dashboard.html";
});

// ====== Admin Panel Actions ======
document.getElementById("btnLogoutAdmin")?.addEventListener("click", () => {
  clearSession();
  showView("view-login");
});

// Generar invitación
document.getElementById("btnGenerateInvite")?.addEventListener("click", () => {
  const session = getSession();
  if (!session?.userId) return;

  const users = getUsers();
  const me = users.find(u => u.id === session.userId);
  if (!me || me.role !== "admin") return;

  const dName = normalize(invDoctorName?.value);
  const dEmail = normalize(invDoctorEmail?.value);
  const days = Number(invDays?.value || 7);

  if (days < 1) return;

  // Si pusiste correo, validarlo (opcional)
  if (dEmail && !isValidEmail(dEmail)) {
    // si tienes algún error UI propio lo metes, aquí lo dejo simple:
    alert("Correo del doctor inválido (opcional).");
    return;
  }

  const code = createInvite({ doctorName: dName, doctorEmail: dEmail, days });

  if (inviteCodeResult) inviteCodeResult.value = code;
  inviteResultWrap?.classList.remove("d-none");

  // Limpieza ligera
  if (invDoctorName) invDoctorName.value = "";
  if (invDoctorEmail) invDoctorEmail.value = "";
  if (invDays) invDays.value = "7";
});

// Copiar invitación
document.getElementById("btnCopyInvite")?.addEventListener("click", async () => {
  const code = String(inviteCodeResult?.value || "");
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
  } catch {
    // fallback
    inviteCodeResult?.select();
    document.execCommand("copy");
  }
});

// Tabla doctores
document.getElementById("btnRefreshDoctors")?.addEventListener("click", () => {
  renderDoctorsTable();
});

function renderDoctorsTable() {
  if (!doctorsTableBody) return;

  const users = getUsers().filter(u => u.role === "doctor");
  const profiles = getDoctorProfiles();

  if (users.length === 0) {
    doctorsTableBody.innerHTML = `
      <tr><td colspan="4" class="text-center small muted">Sin datos aún…</td></tr>
    `;
    return;
  }

  const rows = users.map(u => {
    const p = profiles.find(x => x.userId === u.id);
    const clinic = p?.clinicName || "—";
    const city = p?.city || "—";

    return `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(u.name || "Doctor")}</div>
          <div class="small text-secondary">${escapeHtml(u.email || "")}</div>
        </td>
        <td>${escapeHtml(clinic)}</td>
        <td>${escapeHtml(city)}</td>
        <td class="text-end">
          <button class="btn btn-soft btn-sm" type="button" data-action="reset" data-id="${u.id}">Reset pass</button>
          <button class="btn btn-soft btn-sm" type="button" data-action="block" data-id="${u.id}">Bloquear</button>
        </td>
      </tr>
    `;
  }).join("");

  doctorsTableBody.innerHTML = rows;

  // Acciones tabla (demo)
  doctorsTableBody.querySelectorAll("button[data-action]")?.forEach(btn => {
    btn.addEventListener("click", () => {
      const action = btn.getAttribute("data-action");
      const id = btn.getAttribute("data-id");
      if (!action || !id) return;

      if (action === "reset") {
        // demo: reset a 123456 (en real, mandar correo)
        resetDoctorPassword(id, "123456");
        alert("Password reseteada a: 123456 (demo)");
      }

      if (action === "block") {
        toggleDoctorBlocked(id);
        renderDoctorsTable();
      }
    });
  });
}

function resetDoctorPassword(userId, newPass) {
  const users = getUsers();
  const u = users.find(x => x.id === userId);
  if (!u) return;
  u.password = String(newPass || "123456");
  u.updatedAt = nowISO();
  saveUsers(users);
}

function toggleDoctorBlocked(userId) {
  const users = getUsers();
  const u = users.find(x => x.id === userId);
  if (!u) return;
  u.blocked = !u.blocked;
  u.updatedAt = nowISO();
  saveUsers(users);
}

// ====== Security check: blocked users ======
function isBlockedUser(user) {
  return !!user?.blocked;
}

// Override login to block
(function patchBlockedLogin() {
  const btn = document.getElementById("btnLogin");
  if (!btn) return;

  // ya añadimos listener arriba, pero bloqueamos en init y en next step
  // el bloqueo real lo harías en backend; aquí es demo.
})();

// ====== Escape HTML ======
function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// ====== Init ======
(function init() {
  seedAdmin();

  const session = getSession();
  if (!session?.userId) {
    showView("view-login");
    return;
  }

  const user = getUsers().find(u => u.id === session.userId);
  if (!user) {
    clearSession();
    showView("view-login");
    return;
  }

  if (isBlockedUser(user)) {
    clearSession();
    showError(loginError, "Tu acceso está bloqueado. Contacta a ScanDent.");
    showView("view-login");
    return;
  }

  goToNextStep(user);
})();
