(() => {
const loginBox = document.getElementById("admin-login");
const appBox = document.getElementById("admin-app");
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
const queueStatus = document.getElementById("queue-status");
const queueList = document.getElementById("queue-list");
const logoutBtn = document.getElementById("admin-logout");
const who = document.getElementById("admin-who");
const drawer = document.getElementById("admin-drawer");
const detail = document.getElementById("admin-detail");
const queuePanel = document.getElementById("admin-queue");
const messagesPanel = document.getElementById("admin-messages");
const messagesStatus = document.getElementById("messages-status");
const messagesList = document.getElementById("messages-list");
const usersPanel = document.getElementById("admin-users");
const userForm = document.getElementById("user-form");
const userStatus = document.getElementById("user-status");
const userList = document.getElementById("user-list");
const TOKEN_KEY = "cavedrepa-admin-token";
const USER_KEY = "cavedrepa-admin-user";
const NAME_KEY = "cavedrepa-admin-name";

const token = () => sessionStorage.getItem(TOKEN_KEY) || "";
const currentUser = () => sessionStorage.getItem(USER_KEY) || "";
const currentName = () => sessionStorage.getItem(NAME_KEY) || currentUser();

const setSession = (value, user, name) => {
  if (value) {
    sessionStorage.setItem(TOKEN_KEY, value);
    if (user) sessionStorage.setItem(USER_KEY, user);
    if (name) sessionStorage.setItem(NAME_KEY, name);
  } else {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(NAME_KEY);
  }
};

const closeDrawer = () => {
  if (drawer) drawer.hidden = true;
  document.body.classList.remove("drawer-open");
};

const showLogin = (message) => {
  if (loginBox) loginBox.hidden = false;
  if (appBox) appBox.hidden = true;
  if (logoutBtn) logoutBtn.hidden = true;
  if (who) {
    who.hidden = true;
    who.textContent = "";
  }
  if (loginStatus) loginStatus.textContent = message || "";
  closeDrawer();
};

const showApp = () => {
  if (loginBox) loginBox.hidden = true;
  if (appBox) appBox.hidden = false;
  if (logoutBtn) logoutBtn.hidden = false;
  if (who) {
    who.hidden = !currentUser();
    who.textContent = currentName();
  }
};

const names = (items) => (items || []).map((item) => item.name).join(" · ");

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const line = (label, value) => {
  if (!value) return "";
  return `<div><dt>${label}</dt><dd>${value}</dd></div>`;
};

const cardHtml = (item) => `
  <article class="admin-card">
    <div>
      <h2>${item.name || "Empresa"}</h2>
      <p>${item.rif || "Sin RIF"} · ${names(item.sectors) || "Sin sector"}</p>
      <p>${names(item.locations) || "Sin ubicación"} · ${item.phone || ""}</p>
    </div>
    <div class="admin-card-actions">
      <button type="button" class="btn btn-ghost-ink" data-open="${item.id}">Ver</button>
      <button type="button" class="btn btn-yellow" data-approve="${item.id}">Publicar</button>
      <button type="button" class="btn btn-ghost-ink" data-reject="${item.id}">Rechazar</button>
    </div>
  </article>
`;

const messageHtml = (item) => `
  <article class="admin-card">
    <div>
      <h2>${escapeHtml(item.name) || "Mensaje"}</h2>
      <p>${escapeHtml(item.email)}${item.phone ? " · " + escapeHtml(item.phone) : ""}</p>
      <p>${escapeHtml(item.created_at)}</p>
      <p class="admin-message">${escapeHtml(item.message).replace(/\n/g, "<br>")}</p>
    </div>
  </article>
`;

const userHtml = (item) => `
  <article class="admin-card">
    <div>
      <h2>${item.name || item.username}</h2>
      <p>${item.username}</p>
    </div>
    <div class="admin-card-actions">
      ${
        item.username === currentUser()
          ? `<span class="admin-you">Eres tú</span>`
          : `<button type="button" class="btn btn-ghost-ink" data-delete-user="${item.username}">Quitar</button>`
      }
    </div>
  </article>
`;

const renderDetail = (company) => {
  const image = company.image_url
    ? `<div class="detail-image-wrap"><img src="${company.image_url}" alt="" width="640" height="360"></div>`
    : "";
  detail.innerHTML = `
    ${image}
    <header class="detail-head">
      <p class="eyebrow">Solicitud</p>
      <h2 id="admin-title">${company.name || ""}</h2>
      <p class="detail-sub">${names(company.sectors)} ${company.locations?.length ? "· " + names(company.locations) : ""}</p>
    </header>
    <dl class="detail-list">
      ${line("RIF", company.rif)}
      ${line("Representante legal", company.legal_rep)}
      ${line("Teléfono", company.phone)}
      ${line("Teléfono 2", company.phone2)}
      ${line("Email", company.email)}
      ${line("Email 2", company.email2)}
      ${line("Web", company.website)}
      ${line("Dirección", company.address)}
      ${line("Marcas", names(company.brands))}
    </dl>
    ${company.description ? `<section class="detail-section"><h3 class="detail-heading">Perfil</h3><div class="detail-copy">${company.description}</div></section>` : ""}
    <div class="admin-card-actions">
      <button type="button" class="btn btn-yellow" data-approve="${company.id}">Publicar</button>
      <button type="button" class="btn btn-ghost-ink" data-reject="${company.id}">Rechazar</button>
    </div>
  `;
  drawer.hidden = false;
  document.body.classList.add("drawer-open");
};

const authFail = (error) => {
  if (error.status === 401) {
    setSession("");
    showLogin("La sesión venció. Entra de nuevo.");
    return true;
  }
  return false;
};

const loadQueue = async () => {
  if (queueStatus) queueStatus.textContent = "Cargando solicitudes...";
  try {
    const payload = await window.CavedrepaApi.adminApplications(token());
    const rows = payload.applications || [];
    if (queueStatus) {
      queueStatus.textContent = rows.length
        ? `${rows.length} solicitud${rows.length === 1 ? "" : "es"} en revisión`
        : "No hay solicitudes pendientes.";
    }
    queueList.innerHTML = rows.length
      ? rows.map(cardHtml).join("")
      : `<p class="empty-state">Cuando una empresa complete el formulario, aparecerá aquí.</p>`;
  } catch (error) {
    if (authFail(error)) return;
    if (queueStatus) queueStatus.textContent = "No se pudo cargar la cola.";
  }
};

const loadMessages = async () => {
  if (messagesStatus) messagesStatus.textContent = "Cargando mensajes...";
  try {
    const payload = await window.CavedrepaApi.adminMessages(token());
    const rows = payload.messages || [];
    if (messagesStatus) {
      messagesStatus.textContent = rows.length
        ? `${rows.length} mensaje${rows.length === 1 ? "" : "s"}`
        : "No hay mensajes.";
    }
    if (messagesList) {
      messagesList.innerHTML = rows.length
        ? rows.map(messageHtml).join("")
        : `<p class="empty-state">Cuando alguien escriba desde Contacto, aparecerá aquí.</p>`;
    }
  } catch (error) {
    if (authFail(error)) return;
    if (messagesStatus) messagesStatus.textContent = "No se pudieron cargar los mensajes.";
  }
};

const loadUsers = async () => {
  if (userStatus) userStatus.textContent = "";
  try {
    const payload = await window.CavedrepaApi.adminUsers(token());
    const rows = payload.users || [];
    userList.innerHTML = rows.length
      ? rows.map(userHtml).join("")
      : `<p class="empty-state">Aún no hay más personas en el equipo.</p>`;
  } catch (error) {
    if (authFail(error)) return;
    if (userStatus) userStatus.textContent = "No se pudo cargar el equipo.";
  }
};

const openItem = async (id) => {
  try {
    const payload = await window.CavedrepaApi.adminApplication(token(), id);
    renderDetail(payload.company);
  } catch (_error) {
    if (queueStatus) queueStatus.textContent = "No se pudo abrir esa solicitud.";
  }
};

const decide = async (id, action) => {
  const ok =
    action === "approve"
      ? window.confirm("¿Publicar esta empresa en el directorio?")
      : window.confirm("¿Rechazar esta solicitud? No aparecerá en el directorio.");
  if (!ok) return;
  try {
    if (action === "approve") await window.CavedrepaApi.adminApprove(token(), id);
    else await window.CavedrepaApi.adminReject(token(), id);
    closeDrawer();
    await loadQueue();
  } catch (_error) {
    if (queueStatus) queueStatus.textContent = "No se pudo completar la acción.";
  }
};

document.querySelectorAll("[data-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-panel]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    const panel = button.dataset.panel;
    if (queuePanel) queuePanel.hidden = panel !== "queue";
    if (messagesPanel) messagesPanel.hidden = panel !== "messages";
    if (usersPanel) usersPanel.hidden = panel !== "users";
    if (panel === "messages") loadMessages();
    if (panel === "users") loadUsers();
  });
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginStatus) loginStatus.textContent = "Entrando...";
  try {
    const payload = await window.CavedrepaApi.login(loginForm.user.value, loginForm.password.value);
    setSession(payload.token, payload.user, payload.name || payload.user);
    showApp();
    await loadQueue();
  } catch (error) {
    if (loginStatus) loginStatus.textContent = error.message || "No se pudo entrar.";
  }
});

logoutBtn?.addEventListener("click", () => {
  setSession("");
  showLogin("");
});

userForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (userStatus) userStatus.textContent = "Guardando...";
  try {
    await window.CavedrepaApi.adminCreateUser(token(), {
      name: userForm.name.value,
      username: userForm.username.value,
      password: userForm.password.value,
    });
    userForm.reset();
    if (userStatus) userStatus.textContent = "Persona agregada.";
    await loadUsers();
  } catch (error) {
    if (authFail(error)) return;
    if (userStatus) userStatus.textContent = error.message || "No se pudo agregar.";
  }
});

userList?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete-user]");
  if (!button) return;
  if (!window.confirm("¿Quitar el acceso de esta persona?")) return;
  try {
    await window.CavedrepaApi.adminDeleteUser(token(), button.dataset.deleteUser);
    await loadUsers();
  } catch (error) {
    if (authFail(error)) return;
    if (userStatus) userStatus.textContent = error.message || "No se pudo quitar.";
  }
});

queueList?.addEventListener("click", (event) => {
  const open = event.target.closest("[data-open]");
  const approve = event.target.closest("[data-approve]");
  const reject = event.target.closest("[data-reject]");
  if (open) openItem(open.dataset.open);
  if (approve) decide(approve.dataset.approve, "approve");
  if (reject) decide(reject.dataset.reject, "reject");
});

detail?.addEventListener("click", (event) => {
  const approve = event.target.closest("[data-approve]");
  const reject = event.target.closest("[data-reject]");
  if (approve) decide(approve.dataset.approve, "approve");
  if (reject) decide(reject.dataset.reject, "reject");
});

document.getElementById("admin-close")?.addEventListener("click", closeDrawer);
drawer?.addEventListener("click", (event) => {
  if (event.target === drawer) closeDrawer();
});

if (token()) {
  showApp();
  loadQueue();
} else {
  showLogin("");
}
})();
