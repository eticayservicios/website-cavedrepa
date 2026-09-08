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
const sortSelect = document.getElementById("company-sort");
const filtersBox = document.getElementById("company-filters");
const blogPanel = document.getElementById("admin-blog");
const blogStatusEl = document.getElementById("blog-status");
const blogList = document.getElementById("blog-list");
const blogFilters = document.getElementById("blog-filters");
const blogSearch = document.getElementById("blog-search");
const blogNew = document.getElementById("blog-new");
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

const PAGE_SIZE = 20;

let allRows = [];
let counts = {};
let currentStatus = "";
let currentQuery = "";
let currentSort = "fecha-desc";
let currentPage = 1;
let allPosts = [];
let blogCounts = {};
let blogStatusFilter = "";
let blogQuery = "";
let blogPage = 1;

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

const softenHtml = (html) =>
  String(html || "").replace(/<\/?(strong|b)\b[^>]*>/gi, "");

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

const line = (label, value, href, wide) => {
  if (!value) return "";
  const text = escapeHtml(value);
  const content = href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">${text}</a>` : text;
  return `<div${wide ? ' class="detail-wide"' : ""}><dt>${escapeHtml(label)}</dt><dd>${content}</dd></div>`;
};

const expiryInputValue = (value) => {
  const raw = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "";
};

const socialLine = (label, network, value) => {
  if (!value) return "";
  const handle = /^https?:\/\//i.test(value) ? value : `@${String(value).replace(/^@/, "")}`;
  return line(label, handle, socialHref(network, value));
};

const sortRows = (rows) => {
  const copy = rows.slice();
  if (currentSort === "nombre") {
    copy.sort((a, b) => fold(a.name).localeCompare(fold(b.name), "es"));
  } else if (currentSort === "nombre-desc") {
    copy.sort((a, b) => fold(b.name).localeCompare(fold(a.name), "es"));
  } else if (currentSort === "fecha") {
    copy.sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));
  } else {
    copy.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }
  return copy;
};

const visibleRows = () => {
  const query = fold(currentQuery);
  const filtered = allRows.filter((item) => {
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
  return sortRows(filtered);
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
    buttons.push(`<button type="button" class="btn btn-ghost-ink" data-expire="${item.id}">Expirar</button>`);
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
      ${item.expires_at ? `<p>Vence ${escapeHtml(String(item.expires_at).slice(0, 10))}</p>` : ""}
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

const pagerHtml = (page, pages) => {
  if (pages <= 1) return "";
  const buttons = [];
  buttons.push(
    `<button type="button" class="page-btn" data-page="${page - 1}" ${page <= 1 ? "disabled" : ""}>Anterior</button>`
  );
  for (let index = 1; index <= pages; index += 1) {
    buttons.push(
      `<button type="button" class="page-btn ${index === page ? "is-active" : ""}" data-page="${index}">${index}</button>`
    );
  }
  buttons.push(
    `<button type="button" class="page-btn" data-page="${page + 1}" ${page >= pages ? "disabled" : ""}>Siguiente</button>`
  );
  return `<nav class="pager" aria-label="Paginación">${buttons.join("")}</nav>`;
};

const goToPage = (page) => {
  const pages = Math.max(1, Math.ceil(visibleRows().length / PAGE_SIZE));
  currentPage = Math.min(Math.max(1, Number(page) || 1), pages);
  renderList();
  queueList?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const goToBlogPage = (page) => {
  const pages = Math.max(1, Math.ceil(visiblePosts().length / PAGE_SIZE));
  blogPage = Math.min(Math.max(1, Number(page) || 1), pages);
  renderPosts();
  blogList?.scrollIntoView({ behavior: "smooth", block: "start" });
};

const renderList = () => {
  const rows = visibleRows();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  currentPage = Math.min(Math.max(1, currentPage), pages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(start, start + PAGE_SIZE);
  if (queueStatus) {
    queueStatus.textContent = total
      ? `${total} empresa${total === 1 ? "" : "s"} · página ${currentPage} de ${pages}`
      : currentQuery || currentStatus
        ? "No hay empresas con ese filtro."
        : "No hay empresas.";
  }
  if (!queueList) return;
  queueList.innerHTML = pageRows.length
    ? `${pageRows.map(cardHtml).join("")}${pagerHtml(currentPage, pages)}`
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
      ${line("Vence", company.expires_at ? String(company.expires_at).slice(0, 10) : "Sin fecha")}
      ${line("RIF", company.rif)}
      ${line("Representante legal", company.legal_rep)}
      ${line("Teléfono", company.phone, company.phone ? `tel:${company.phone}` : "")}
      ${line("Teléfono 2", company.phone2, company.phone2 ? `tel:${company.phone2}` : "")}
      ${line("Email", company.email, company.email ? `mailto:${company.email}` : "")}
      ${line("Email 2", company.email2, company.email2 ? `mailto:${company.email2}` : "")}
      ${line("Web", company.website, website)}
      ${line("Fax", company.fax)}
      ${line("Ubicación", names(company.locations))}
      ${line("Dirección", [company.address, company.zip].filter(Boolean).join(" "), "", true)}
      ${socialLine("Facebook", "facebook", social.facebook)}
      ${socialLine("Instagram", "instagram", social.instagram)}
      ${socialLine("LinkedIn", "linkedin", social.linkedin)}
      ${socialLine("YouTube", "youtube", social.youtube)}
      ${line("Alta", company.created_at)}
      ${line("Actualización", company.updated_at)}
      ${line("Revisado por", company.reviewed_by)}
      ${line("Motivo de rechazo", company.reject_reason, "", true)}
    </dl>
    <section class="detail-section detail-wide admin-expiry">
      <h3 class="detail-heading">Vigencia</h3>
      <p>Solo el equipo de la Cámara puede cambiar esta fecha. Al vencer, la empresa sale del directorio.</p>
      <div class="admin-expiry-row">
        <label>
          <span>Fecha de expiración</span>
          <input type="date" id="expiry-date" value="${expiryInputValue(company.expires_at)}">
        </label>
        <button type="button" class="btn btn-yellow" data-save-expiry="${company.id}">Guardar fecha</button>
        ${
          status === "publish"
            ? `<button type="button" class="btn btn-ghost-ink" data-expire="${company.id}">Expirar ahora</button>`
            : ""
        }
      </div>
    </section>
    ${
      brands
        ? `<section class="detail-section detail-wide"><h3 class="detail-heading">Marcas</h3><div class="brand-chips">${brands}</div></section>`
        : ""
    }
    ${
      company.excerpt
        ? `<section class="detail-section detail-wide"><h3 class="detail-heading">Resumen</h3><p>${escapeHtml(company.excerpt)}</p></section>`
        : ""
    }
    ${
      company.description
        ? `<section class="detail-section detail-wide"><h3 class="detail-heading">Productos que comercializa</h3><div class="detail-copy">${softenHtml(company.description)}</div></section>`
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
  const messages = {
    approve: "¿Publicar esta empresa en el directorio? Quedará vigente un año.",
    reject: "¿Quitar esta empresa del directorio público?",
    expire: "¿Expirar esta empresa ahora? Saldrá del directorio.",
  };
  if (!window.confirm(messages[action] || "¿Continuar?")) return;
  try {
    if (action === "approve") await window.CavedrepaApi.adminApprove(token(), id);
    else if (action === "expire") await window.CavedrepaApi.adminExpireNow(token(), id);
    else await window.CavedrepaApi.adminReject(token(), id);
    closeModal();
    await loadCompanies();
  } catch (_error) {
    if (queueStatus) queueStatus.textContent = "No se pudo completar la acción.";
  }
};

const postStatusLabel = (status) => (status === "publish" ? "Publicada" : "Borrador");

const visiblePosts = () => {
  const query = fold(blogQuery);
  return allPosts.filter((item) => {
    const status = item.status || "draft";
    if (blogStatusFilter === "publish" && status !== "publish") return false;
    if (blogStatusFilter === "draft" && status === "publish") return false;
    if (!query) return true;
    return fold([item.title, item.excerpt, names(item.categories)].join(" ")).includes(query);
  });
};

const updateBlogFilters = () => {
  if (!blogFilters) return;
  const labels = { "": "Todas", publish: "Publicadas", draft: "Borradores" };
  blogFilters.querySelectorAll("[data-blog-status]").forEach((button) => {
    const key = button.dataset.blogStatus || "";
    const count = key === "" ? blogCounts.all || allPosts.length : blogCounts[key] || 0;
    button.textContent = count ? `${labels[key]} (${count})` : labels[key];
    button.classList.toggle("is-active", key === blogStatusFilter);
  });
};

const postCardHtml = (item) => `
  <article class="admin-card">
    <div>
      <p class="admin-status-pill is-${escapeHtml(item.status === "publish" ? "publish" : "draft")}">${escapeHtml(postStatusLabel(item.status))}</p>
      <h2>${escapeHtml(item.title) || "Entrada"}</h2>
      <p>${escapeHtml(names(item.categories) || "Sin categoría")}</p>
      ${item.date ? `<p>${escapeHtml(String(item.date).slice(0, 10))}</p>` : ""}
    </div>
    <div class="admin-card-actions">
      <button type="button" class="btn btn-ghost-ink" data-open-post="${item.id}">Editar</button>
    </div>
  </article>
`;

const renderPosts = () => {
  const rows = visiblePosts();
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  blogPage = Math.min(Math.max(1, blogPage), pages);
  const pageRows = rows.slice((blogPage - 1) * PAGE_SIZE, blogPage * PAGE_SIZE);
  if (blogStatusEl) {
    blogStatusEl.textContent = total
      ? `${total} entrada${total === 1 ? "" : "s"} · página ${blogPage} de ${pages}`
      : "No hay entradas.";
  }
  if (!blogList) return;
  blogList.innerHTML = pageRows.length
    ? `${pageRows.map(postCardHtml).join("")}${pagerHtml(blogPage, pages)}`
    : `<p class="empty-state">Cuando publiques en el blog, aparecerán aquí.</p>`;
};

const loadPosts = async () => {
  if (blogStatusEl) blogStatusEl.textContent = "Cargando blog...";
  try {
    const payload = await window.CavedrepaApi.adminPosts(token());
    allPosts = payload.posts || [];
    blogCounts = payload.counts || {};
    updateBlogFilters();
    renderPosts();
  } catch (error) {
    if (authFail(error)) return;
    if (blogStatusEl) blogStatusEl.textContent = "No se pudo cargar el blog.";
  }
};

const emptyPost = () => ({
  id: "",
  title: "",
  excerpt: "",
  content: "",
  date: new Date().toISOString().slice(0, 10),
  categories: [],
  status: "draft",
  image_url: "",
});

const DEFAULT_TAGS = ["Editoriales", "Noticias", "Estadísticas", "Nuevos Afiliados"];

const knownTags = () => {
  const seen = new Set();
  const tags = [];
  DEFAULT_TAGS.concat(allPosts.flatMap((item) => (item.categories || []).map((cat) => cat.name))).forEach((name) => {
    if (!name || seen.has(fold(name))) return;
    seen.add(fold(name));
    tags.push(name);
  });
  return tags;
};

const sanitizeEditorHtml = (html) => {
  const box = document.createElement("div");
  box.innerHTML = String(html || "");
  box.querySelectorAll("script,style").forEach((node) => node.remove());
  const widgets = box.querySelectorAll(".elementor-widget-container");
  if (widgets.length) {
    const clean = document.createElement("div");
    widgets.forEach((widget) => {
      Array.from(widget.childNodes).forEach((node) => clean.appendChild(node.cloneNode(true)));
    });
    box.innerHTML = clean.innerHTML;
  }
  const allowed = /^(P|BR|H[1-4]|STRONG|B|EM|I|UL|OL|LI|A)$/i;
  const walk = (node) => {
    Array.from(node.children).forEach((child) => {
      walk(child);
      if (!allowed.test(child.tagName)) {
        const parent = child.parentNode;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        parent.removeChild(child);
        return;
      }
      Array.from(child.attributes).forEach((attr) => {
        if (child.tagName !== "A" || attr.name !== "href") child.removeAttribute(attr.name);
      });
    });
  };
  walk(box);
  const text = box.innerHTML.trim();
  return text || "<p><br></p>";
};

const bindPostEditor = (post) => {
  const editor = document.getElementById("post-editor");
  const toolbar = document.getElementById("post-toolbar");
  toolbar?.addEventListener("mousedown", (event) => {
    const button = event.target.closest("[data-cmd]");
    if (!button) return;
    event.preventDefault();
    editor?.focus();
    const cmd = button.dataset.cmd;
    if (cmd === "createLink") {
      const href = window.prompt("Enlace", "https://");
      if (href) document.execCommand("createLink", false, href);
      return;
    }
    const value = button.dataset.value;
    document.execCommand(cmd, false, value ? (cmd === "formatBlock" ? `<${value}>` : value) : null);
  });

  const list = document.getElementById("post-tags");
  const input = document.getElementById("post-tag-input");
  const hidden = document.getElementById("post-categories");
  const chips = (post.categories || []).map((item) => item.name).filter(Boolean);

  const syncTags = () => {
    if (hidden) hidden.value = chips.join(", ");
    if (!list) return;
    list.innerHTML = chips
      .map(
        (name) =>
          `<button type="button" class="admin-tag" data-remove-tag="${escapeHtml(name)}">${escapeHtml(name)}<span aria-hidden="true">×</span></button>`
      )
      .join("");
  };

  const addTag = (raw) => {
    const name = String(raw || "").trim();
    if (!name || chips.some((item) => fold(item) === fold(name))) return;
    chips.push(name);
    syncTags();
  };

  list?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-tag]");
    if (!button) return;
    const index = chips.findIndex((item) => item === button.dataset.removeTag);
    if (index >= 0) chips.splice(index, 1);
    syncTags();
  });

  input?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== ",") return;
    event.preventDefault();
    addTag(input.value.replace(/,$/, ""));
    input.value = "";
  });
  input?.addEventListener("blur", () => {
    addTag(input.value);
    input.value = "";
  });

  document.getElementById("post-tag-suggestions")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-add-tag]");
    if (!button) return;
    addTag(button.dataset.addTag);
  });

  syncTags();
};

const renderPostEditor = (post) => {
  const suggestions = knownTags()
    .map((name) => `<button type="button" class="admin-tag-suggest" data-add-tag="${escapeHtml(name)}">${escapeHtml(name)}</button>`)
    .join("");
  detail.innerHTML = `
    <form class="admin-post-form admin-article" id="post-form">
      <input type="hidden" name="id" value="${escapeHtml(post.id || "")}">
      <input type="hidden" name="categories" id="post-categories" value="">
      <p class="admin-article-note">${
        post.status === "publish"
          ? "Esta entrada ya se ve en el blog. Puedes corregirla y volver a publicar."
          : "Borrador: todavía no se ve en el blog. Cuando esté lista, pulsa Publicar."
      }</p>
      <div class="admin-article-top">
        <p class="admin-status-pill is-${post.status === "publish" ? "publish" : "draft"}">${escapeHtml(postStatusLabel(post.status))}</p>
        <label class="admin-field admin-article-date">
          <span>Fecha de publicación</span>
          <input type="date" name="date" value="${expiryInputValue(post.date)}">
        </label>
      </div>
      <label class="admin-field">
        <span>Título de la entrada</span>
        <input class="admin-input admin-input-title" type="text" name="title" maxlength="200" required placeholder="Escribe aquí el título" value="${escapeHtml(post.title || "")}">
      </label>
      <div class="admin-field">
        <span>Etiquetas</span>
        <p class="admin-field-hint">Temas de la entrada. Pulsa una etiqueta o escríbela y dale a Enter.</p>
        <div class="admin-tag-row">
          <div class="admin-tag-list" id="post-tags"></div>
          <input type="text" id="post-tag-input" placeholder="Nueva etiqueta…" autocomplete="off">
        </div>
        <div class="admin-tag-suggestions" id="post-tag-suggestions">${suggestions}</div>
      </div>
      <div class="admin-field">
        <span>Texto de la entrada</span>
        <p class="admin-field-hint">Haz clic en el recuadro blanco para escribir, como en una hoja.</p>
        <div class="admin-editor">
          <div class="admin-editor-toolbar" id="post-toolbar">
            <button type="button" data-cmd="formatBlock" data-value="P">Párrafo</button>
            <button type="button" data-cmd="formatBlock" data-value="H2">Título</button>
            <button type="button" data-cmd="bold">Negrita</button>
            <button type="button" data-cmd="italic">Cursiva</button>
            <button type="button" data-cmd="insertUnorderedList">Viñetas</button>
            <button type="button" data-cmd="insertOrderedList">Números</button>
            <button type="button" data-cmd="createLink">Enlace</button>
          </div>
          <div class="admin-editor-canvas" id="post-editor" contenteditable="true" role="textbox" aria-label="Texto de la entrada">${sanitizeEditorHtml(post.content)}</div>
        </div>
      </div>
      <label class="admin-field">
        <span>Extracto para el listado</span>
        <p class="admin-field-hint">Frase corta que se ve en la lista del blog. Si lo dejas vacío, se usa el inicio del texto.</p>
        <textarea class="admin-input" name="excerpt" rows="3" maxlength="400" placeholder="Escribe aquí un resumen corto">${escapeHtml(post.excerpt || "")}</textarea>
      </label>
      <p class="admin-status" id="post-status"></p>
      <div class="admin-card-actions admin-modal-actions">
        <button type="submit" class="btn btn-ghost-ink" data-post-status="draft">Guardar sin publicar</button>
        <button type="submit" class="btn btn-yellow" data-post-status="publish">Publicar en el blog</button>
        ${
          post.id
            ? `<button type="button" class="btn btn-ghost-ink" data-delete-post="${escapeHtml(post.id)}">Eliminar</button>`
            : ""
        }
      </div>
    </form>
  `;
  modal.hidden = false;
  document.body.classList.add("admin-modal-open");
  bindPostEditor(post);
  document.getElementById("post-form")?.addEventListener("submit", onSavePost);
};

const openPost = async (id) => {
  try {
    const payload = await window.CavedrepaApi.adminPost(token(), id);
    renderPostEditor(payload.post);
  } catch (_error) {
    if (blogStatusEl) blogStatusEl.textContent = "No se pudo abrir esa entrada.";
  }
};

const onSavePost = async (event) => {
  event.preventDefault();
  const form = event.target;
  const statusBtn = event.submitter && event.submitter.dataset.postStatus;
  const data = new FormData(form);
  const payload = {
    title: data.get("title") || "",
    date: data.get("date") || "",
    categories: data.get("categories") || "",
    excerpt: data.get("excerpt") || "",
    content: document.getElementById("post-editor")?.innerHTML || "",
    status: statusBtn || "draft",
  };
  const id = String(data.get("id") || "");
  const box = document.getElementById("post-status");
  if (box) box.textContent = "Guardando...";
  try {
    await window.CavedrepaApi.adminSavePost(token(), payload, id);
    closeModal();
    await loadPosts();
  } catch (error) {
    if (authFail(error)) return;
    if (box) box.textContent = error.message || "No se pudo guardar.";
  }
};

const deletePost = async (id) => {
  if (!window.confirm("¿Eliminar esta entrada? No se podrá recuperar.")) return;
  try {
    await window.CavedrepaApi.adminDeletePost(token(), id);
    closeModal();
    await loadPosts();
  } catch (error) {
    if (authFail(error)) return;
    if (blogStatusEl) blogStatusEl.textContent = error.message || "No se pudo eliminar.";
  }
};

const saveExpiry = async (id) => {
  const input = document.getElementById("expiry-date");
  const value = input && input.value;
  if (!value) {
    window.alert("Indica una fecha de expiración.");
    return;
  }
  try {
    await window.CavedrepaApi.adminSetExpiry(token(), id, value);
    closeModal();
    await loadCompanies();
    await openItem(id);
  } catch (_error) {
    if (queueStatus) queueStatus.textContent = "No se pudo guardar la fecha.";
  }
};

document.querySelectorAll("[data-panel]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("[data-panel]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    const panel = button.dataset.panel;
    if (queuePanel) queuePanel.hidden = panel !== "queue";
    if (blogPanel) blogPanel.hidden = panel !== "blog";
    if (messagesPanel) messagesPanel.hidden = panel !== "messages";
    if (usersPanel) usersPanel.hidden = panel !== "users";
    if (panel === "blog") loadPosts();
    if (panel === "messages") loadMessages();
    if (panel === "users") loadUsers();
  });
});

filtersBox?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-status]");
  if (!button) return;
  currentStatus = button.dataset.status || "";
  currentPage = 1;
  updateFilterCounts();
  renderList();
});

searchInput?.addEventListener("input", () => {
  currentQuery = searchInput.value || "";
  currentPage = 1;
  renderList();
});

sortSelect?.addEventListener("change", () => {
  currentSort = sortSelect.value || "fecha-desc";
  currentPage = 1;
  renderList();
});

blogFilters?.addEventListener("click", (event) => {
  const button = event.target.closest("[data-blog-status]");
  if (!button) return;
  blogStatusFilter = button.dataset.blogStatus || "";
  blogPage = 1;
  updateBlogFilters();
  renderPosts();
});

blogSearch?.addEventListener("input", () => {
  blogQuery = blogSearch.value || "";
  blogPage = 1;
  renderPosts();
});

blogNew?.addEventListener("click", () => {
  renderPostEditor(emptyPost());
});

blogList?.addEventListener("click", (event) => {
  const pageBtn = event.target.closest("[data-page]");
  if (pageBtn) {
    if (pageBtn.disabled) return;
    goToBlogPage(Number(pageBtn.dataset.page));
    return;
  }
  const open = event.target.closest("[data-open-post]");
  if (open) openPost(open.dataset.openPost);
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
  const pageBtn = event.target.closest("[data-page]");
  if (pageBtn) {
    if (pageBtn.disabled) return;
    goToPage(Number(pageBtn.dataset.page));
    return;
  }
  const save = event.target.closest("[data-save-expiry]");
  if (save) {
    saveExpiry(save.dataset.saveExpiry);
    return;
  }
  const open = event.target.closest("[data-open]");
  const approve = event.target.closest("[data-approve]");
  const expire = event.target.closest("[data-expire]");
  const reject = event.target.closest("[data-reject]");
  const removePost = event.target.closest("[data-delete-post]");
  if (open) openItem(open.dataset.open);
  if (approve) decide(approve.dataset.approve, "approve");
  if (expire) decide(expire.dataset.expire, "expire");
  if (reject) decide(reject.dataset.reject, "reject");
  if (removePost) deletePost(removePost.dataset.deletePost);
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
