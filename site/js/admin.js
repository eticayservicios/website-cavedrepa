(() => {
const loginBox = document.getElementById("admin-login");
const appBox = document.getElementById("admin-app");
const loginForm = document.getElementById("login-form");
const loginStatus = document.getElementById("login-status");
const queueStatus = document.getElementById("queue-status");
const queueList = document.getElementById("queue-list");
const logoutBtn = document.getElementById("admin-logout");
const who = document.getElementById("admin-who");
const modal = document.getElementById("admin-modal");
const detail = document.getElementById("admin-detail");
const queuePanel = document.getElementById("admin-queue");
const messagesPanel = document.getElementById("admin-messages");
const messagesStatus = document.getElementById("messages-status");
const messagesList = document.getElementById("messages-list");
const usersPanel = document.getElementById("admin-users");
const userForm = document.getElementById("user-form");
const userStatus = document.getElementById("user-status");
const userList = document.getElementById("user-list");
const searchInput = document.getElementById("company-search");
const filtersBox = document.getElementById("company-filters");
const TOKEN_KEY = "cavedrepa-admin-token";
const USER_KEY = "cavedrepa-admin-user";
const NAME_KEY = "cavedrepa-admin-name";

const STATUS_LABELS = {
  pending: "En revisión",
  publish: "Publicada",
  rejected: "Rechazada",
  expired: "Expirada",
  draft: "Borrador",
  private: "Privada",
};

let allRows = [];
let counts = {};
let currentStatus = "";
let currentQuery = "";

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

const closeModal = () => {
  if (modal) modal.hidden = true;
  document.body.classList.remove("admin-modal-open");
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
  closeModal();
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

const fold = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

const statusLabel = (status) => STATUS_LABELS[status] || status || "Sin estado";

const websiteHref = (value) => {
  if (!value) return "";
  return /^https?:\/\//i.test(value) ? value : `https://${value}`;
};

const socialHref = (network, value) => {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const handle = String(value).replace(/^@/, "");
  const homes = {
    facebook: `https://www.facebook.com/${handle}`,
    instagram: `https://www.instagram.com/${handle}`,
    linkedin: `https://www.linkedin.com/in/${handle}`,
    youtube: `https://www.youtube.com/@${handle}`,
    twitter: `https://x.com/${handle}`,
  };
  return homes[network] || value;
};

const line = (label, value, href) => {
  if (!value) return "";
  const text = escapeHtml(value);
  const content = href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${text}</a>` : text;
  return `<div><dt>${escapeHtml(label)}</dt><dd>${content}</dd></div>`;
};

const socialLine = (label, network, value) => {
  if (!value) return "";
  const handle = /^https?:\/\//i.test(value) ? value : `@${String(value).replace(/^@/, "")}`;
  return line(label, handle, socialHref(network, value));
};

const visibleRows = () => {
  const query = fold(currentQuery);
  return allRows.filter((item) => {
    const status = item.status || "";
    if (currentStatus === "other") {
      if (status === "pending" || status === "publish" || status === "rejected" || status === "expired") {
        return false;
      }
    } else if (currentStatus && status !== currentStatus) {
      return false;
    }
    if (!query) return true;
    const blob = fold(
      [item.name, item.rif, item.email, item.phone, item.legal_rep, names(item.sectors), names(item.locations)].join(" ")
    );
    return blob.includes(query);
  });
};

const cardActions = (item) => {
  const status = item.status || "";
  const buttons = [`<button type="button" class="btn btn-ghost-ink" data-open="${item.id}">Ver</button>`];
  if (status !== "publish") {
    buttons.push(`<button type="button" class="btn btn-yellow" data-approve="${item.id}">Publicar</button>`);
  }
  if (status === "pending") {
    buttons.push(`<button type="button" class="btn btn-ghost-ink" data-reject="${item.id}">Rechazar</button>`);
  } else if (status === "publish") {
    buttons.push(`<button type="button" class="btn btn-ghost-ink" data-reject="${item.id}">Quitar del directorio</button>`);
  }
  return buttons.join("");
};

const cardHtml = (item) => `
  <article class="admin-card">
    <div>
      <p class="admin-status-pill is-${escapeHtml(item.status || "draft")}">${escapeHtml(statusLabel(item.status))}</p>
      <h2>${escapeHtml(item.name) || "Empresa"}</h2>
      <p>${escapeHtml(item.rif || "Sin RIF")} · ${escapeHtml(names(item.sectors) || "Sin sector")}</p>
      <p>${escapeHtml(names(item.locations) || "Sin ubicación")}${item.phone ? " · " + escapeHtml(item.phone) : ""}</p>
      ${item.created_at ? `<p>${escapeHtml(item.created_at)}</p>` : ""}
    </div>
    <div class="admin-card-actions">
      ${cardActions(item)}
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
      <h2>${escapeHtml(item.name || item.username)}</h2>
      <p>${escapeHtml(item.username)}</p>
    </div>
    <div class="admin-card-actions">
      ${
        item.username === currentUser()
          ? `<span class="admin-you">Eres tú</span>`
          : `<button type="button" class="btn btn-ghost-ink" data-delete-user="${escapeHtml(item.username)}">Quitar</button>`
      }
    </div>
  </article>
`;

const updateFilterCounts = () => {
  if (!filtersBox) return;
  const labels = {
    "": "Todas",
    pending: "En revisión",
    publish: "Publicadas",
    rejected: "Rechazadas",
    expired: "Expiradas",
    other: "Otras",
  };
  filtersBox.querySelectorAll("[data-status]").forEach((button) => {
    const key = button.dataset.status || "";
    const count = key === "" ? counts.all || allRows.length : counts[key] || 0;
    button.textContent = count ? `${labels[key]} (${count})` : labels[key];
    button.classList.toggle("is-active", key === currentStatus);
    if (key === "other") button.hidden = !count;
  });
};

const renderList = () => {
  const rows = visibleRows();
  if (queueStatus) {
    queueStatus.textContent = rows.length
      ? `${rows.length} empresa${rows.length === 1 ? "" : "s"}`
      : currentQuery || currentStatus
        ? "No hay empresas con ese filtro."
        : "No hay empresas.";
  }
  if (!queueList) return;
  queueList.innerHTML = rows.length
    ? rows.map(cardHtml).join("")
    : `<p class="empty-state">Cuando se registren empresas, aparecerán aquí.</p>`;
};

const renderDetail = (company) => {
  const status = company.status || "";
  const website = websiteHref(company.website);
  const image = company.image_url
    ? `<div class="detail-image-wrap"><img src="${escapeHtml(company.image_url)}" alt="" width="640" height="360" onerror="this.remove()"></div>`
    : "";
  const social = company.social || {};
  const brands = (company.brands || [])
    .map((brand) => `<span>${escapeHtml(brand.name || brand)}</span>`)
    .join("");
  detail.innerHTML = `
    ${image}
    <header class="detail-head">
      <p class="admin-status-pill is-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</p>
      <h2 id="admin-title">${escapeHtml(company.name || "Empresa")}</h2>
      <p class="detail-sub">${escapeHtml(names(company.sectors))}${company.locations?.length ? " · " + escapeHtml(names(company.locations)) : ""}</p>
      ${company.tagline ? `<p class="detail-tagline">${escapeHtml(company.tagline)}</p>` : ""}
    </header>
    <dl class="detail-list">
      ${line("Estado", statusLabel(status))}
      ${line("RIF", company.rif)}
      ${line("Representante legal", company.legal_rep)}
      ${line("Teléfono", company.phone, company.phone ? `tel:${company.phone}` : "")}
      ${line("Teléfono 2", company.phone2, company.phone2 ? `tel:${company.phone2}` : "")}
      ${line("Fax", company.fax)}
      ${line("Email", company.email, company.email ? `mailto:${company.email}` : "")}
      ${line("Email 2", company.email2, company.email2 ? `mailto:${company.email2}` : "")}
      ${line("Web", company.website, website)}
      ${line("Dirección", [company.address, company.zip].filter(Boolean).join(" "))}
      ${line("Ubicación", names(company.locations))}
      ${socialLine("Facebook", "facebook", social.facebook)}
      ${socialLine("Instagram", "instagram", social.instagram)}
      ${socialLine("LinkedIn", "linkedin", social.linkedin)}
      ${socialLine("YouTube", "youtube", social.youtube)}
      ${line("Coordenadas", company.lat && company.lng ? `${company.lat}, ${company.lng}` : "")}
      ${line("Video", company.video_url, company.video_url)}
      ${line("Origen", company.source)}
      ${line("Alta", company.created_at)}
      ${line("Actualización", company.updated_at)}
      ${line("Revisado por", company.reviewed_by)}
      ${line("Motivo de rechazo", company.reject_reason)}
    </dl>
    ${
      brands
        ? `<section class="detail-section"><h3 class="detail-heading">Marcas</h3><div class="brand-chips">${brands}</div></section>`
        : ""
    }
    ${
      company.excerpt
        ? `<section class="detail-section"><h3 class="detail-heading">Resumen</h3><p>${escapeHtml(company.excerpt)}</p></section>`
        : ""
    }
    ${
      company.description
        ? `<section class="detail-section"><h3 class="detail-heading">Perfil</h3><div class="detail-copy">${company.description}</div></section>`
        : ""
    }
    <div class="admin-card-actions admin-modal-actions">
      ${cardActions(company)}
    </div>
  `;
  modal.hidden = false;
  document.body.classList.add("admin-modal-open");
};

const authFail = (error) => {
  if (error.status === 401) {
    setSession("");
    showLogin("La sesión venció. Entra de nuevo.");
    return true;
  }
  return false;
};

const loadCompanies = async () => {
  if (queueStatus) queueStatus.textContent = "Cargando empresas...";
  try {
    const payload = await window.CavedrepaApi.adminCompanies(token());
    allRows = payload.companies || payload.applications || [];
    counts = payload.counts || {};
    updateFilterCounts();
    renderList();
  } catch (error) {
    if (authFail(error)) return;
    if (queueStatus) queueStatus.textContent = "No se pudieron cargar las empresas.";
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
    const payload = await window.CavedrepaApi.adminCompany(token(), id);
    renderDetail(payload.company);
  } catch (_error) {
    if (queueStatus) queueStatus.textContent = "No se pudo abrir esa empresa.";
  }
};

const decide = async (id, action) => {
  const ok =
    action === "approve"
      ? window.confirm("¿Publicar esta empresa en el directorio?")
      : window.confirm("¿Quitar esta empresa del directorio público?");
  if (!ok) return;
  try {
    if (action === "approve") await window.CavedrepaApi.adminApprove(token(), id);
    else await window.CavedrepaApi.adminReject(token(), id);
    closeModal();
    await loadCompanies();
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

filtersBox?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  currentStatus = button.dataset.status || "";
  updateFilterCounts();
  renderList();
});

searchInput?.addEventListener("input", () => {
  currentQuery = searchInput.value || "";
  renderList();
});

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (loginStatus) loginStatus.textContent = "Entrando...";
  try {
    const payload = await window.CavedrepaApi.login(loginForm.user.value, loginForm.password.value);
    setSession(payload.token, payload.user, payload.name || payload.user);
    showApp();
    await loadCompanies();
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

const onCompanyClick = (event) => {
  const open = event.target.closest("[data-open]");
  const approve = event.target.closest("[data-approve]");
  const reject = event.target.closest("[data-reject]");
  if (open) openItem(open.dataset.open);
  if (approve) decide(approve.dataset.approve, "approve");
  if (reject) decide(reject.dataset.reject, "reject");
};

queueList?.addEventListener("click", onCompanyClick);
detail?.addEventListener("click", onCompanyClick);

document.getElementById("admin-close")?.addEventListener("click", closeModal);
modal?.addEventListener("click", (event) => {
  if (event.target === modal) closeModal();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modal && !modal.hidden) closeModal();
});

if (token()) {
  showApp();
  loadCompanies();
} else {
  showLogin("");
}
})();
