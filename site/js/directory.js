(() => {
const form = document.getElementById("directory-search");
const results = document.getElementById("directory-results");
const status = document.getElementById("directory-status");
const sortSelect = document.getElementById("directory-sort");
const toolbar = document.getElementById("directory-toolbar");
const tabs = document.querySelectorAll(".directory-tabs button");
const drawer = document.getElementById("company-drawer");
const detail = document.getElementById("company-detail");
const params = new URLSearchParams(window.location.search);
let catalogs = { sectors: [], locations: [], brands: [] };
let currentView = params.get("vista") || (params.get("empresa") ? "empresas" : "empresas");
let currentPage = Number(params.get("page") || 1) || 1;

const fillSelect = (select, items, selected, emptyLabel) => {
  if (!select) return;
  const current = selected || select.value;
  select.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = emptyLabel;
  select.appendChild(blank);
  items.forEach((item) => {
    if (!item.slug) return;
    const option = document.createElement("option");
    option.value = item.slug;
    option.textContent = item.count ? `${item.name} (${item.count})` : item.name;
    select.appendChild(option);
  });
  select.value = current;
};

const termNames = (items) => (items || []).map((item) => item.name).join(" · ");

const setStatus = (text) => {
  if (status) status.textContent = text || "";
};

const setLoading = (on) => {
  toolbar?.classList.toggle("is-loading", on);
  results?.classList.toggle("is-loading", on);
  if (sortSelect) sortSelect.disabled = on;
};

const companyHref = (company) => {
  const next = new URL(window.location.href);
  next.searchParams.set("empresa", company.slug || company.id);
  next.searchParams.set("vista", "empresas");
  return `${next.pathname}${next.search}`;
};

const cardHtml = (company) => {
  const initial = (company.name || "?").slice(0, 1);
  const image = company.image_url
    ? `<img src="${company.image_url}?v=3" alt="" width="640" height="360" onerror="this.remove()">`
    : "";
  return `
    <article class="company-card">
      <a class="company-card-link" href="${companyHref(company)}" data-empresa="${company.slug || company.id}">
        <div class="company-media">${image}<div class="company-fallback">${initial}</div></div>
        <div class="company-card-body">
          <h3>${company.name || "Empresa"}</h3>
          <p class="company-meta">${termNames(company.sectors) || "Sin sector"}</p>
          <p class="company-meta">${termNames(company.locations) || "Sin ubicación"}</p>
          <p class="company-brands">${termNames(company.brands) || "Sin marcas cargadas"}</p>
        </div>
      </a>
    </article>
  `;
};

const browseHtml = (items, param) => {
  if (!items.length) return `<p class="empty-state">No hay datos para este listado.</p>`;
  return `
    <div class="browse-grid">
      ${items
        .filter((item) => item.count > 0)
        .map(
          (item) => `
        <a class="browse-card" href="/directorio/?${param}=${encodeURIComponent(item.slug)}">
          <strong>${item.name}</strong>
          <span>${item.count} empresa${item.count === 1 ? "" : "s"}</span>
        </a>`
        )
        .join("")}
    </div>
  `;
};

const pagerHtml = (payload) => {
  const page = payload.page || 1;
  const pages = payload.pages || 1;
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

const renderCompanies = (payload) => {
  let companies = payload.companies || [];
  let total = payload.total || companies.length;
  let page = payload.page || 1;
  let pages = payload.pages || 1;
  if (pages <= 1 && companies.length > 20) {
    total = companies.length;
    pages = Math.ceil(total / 20);
    page = Math.min(currentPage, pages);
    companies = companies.slice((page - 1) * 20, page * 20);
  }
  setStatus(
    total
      ? `${total} empresa${total === 1 ? "" : "s"} · página ${page} de ${pages}`
      : "No hay empresas con esos filtros."
  );
  results.innerHTML = companies.length
    ? `<div class="companies-grid">${companies.map(cardHtml).join("")}</div>${pagerHtml(payload)}`
    : `<p class="empty-state">Prueba otro sector, ubicación o marca.</p>`;
  results.querySelectorAll(".page-btn").forEach((button) => {
    button.addEventListener("click", () => goToPage(Number(button.dataset.page)));
  });
};

const line = (label, value, href) => {
  if (!value) return "";
  const content = href ? `<a href="${href}">${value}</a>` : value;
  return `<div><dt>${label}</dt><dd>${content}</dd></div>`;
};

const renderDetail = (company) => {
  const website = company.website
    ? company.website.startsWith("http")
      ? company.website
      : `https://${company.website}`
    : "";
  detail.innerHTML = `
    ${
      company.image_url
        ? `<div class="detail-image-wrap"><img src="${company.image_url}?v=3" alt="" width="640" height="360" onerror="this.remove()"></div>`
        : ""
    }
    <p class="eyebrow">Ficha de afiliado</p>
    <h2 id="company-title">${company.name || ""}</h2>
    <p class="company-meta">${termNames(company.sectors)} ${company.locations?.length ? "· " + termNames(company.locations) : ""}</p>
    ${company.tagline ? `<p class="detail-tagline">${company.tagline}</p>` : ""}
    <dl class="detail-list">
      ${line("RIF", company.rif)}
      ${line("Representante legal", company.legal_rep)}
      ${line("Teléfono", company.phone, company.phone ? `tel:${company.phone}` : "")}
      ${line("Teléfono 2", company.phone2, company.phone2 ? `tel:${company.phone2}` : "")}
      ${line("Email", company.email, company.email ? `mailto:${company.email}` : "")}
      ${line("Email 2", company.email2, company.email2 ? `mailto:${company.email2}` : "")}
      ${line("Web", company.website, website)}
      ${line("Dirección", [company.address, company.zip].filter(Boolean).join(" "))}
    </dl>
    ${
      company.brands?.length
        ? `<div class="brand-chips">${company.brands
            .map((brand) => `<a href="/directorio/?marca=${encodeURIComponent(brand.slug)}">${brand.name}</a>`)
            .join("")}</div>`
        : ""
    }
    ${company.description ? `<div class="detail-copy">${company.description}</div>` : ""}
  `;
  drawer.hidden = false;
  document.body.classList.add("drawer-open");
};

const closeDrawer = () => {
  drawer.hidden = true;
  document.body.classList.remove("drawer-open");
  const next = new URL(window.location.href);
  next.searchParams.delete("empresa");
  window.history.replaceState({}, "", next);
};

const activateTab = (view) => {
  currentView = view;
  tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.view === view));
};

const loadView = async () => {
  const filters = {
    q: form?.q?.value || "",
    sector: form?.sector?.value || "",
    ubicacion: form?.ubicacion?.value || "",
    marca: form?.marca?.value || "",
    orden: sortSelect?.value || "nombre",
    page: String(currentPage),
    per_page: "20",
  };

  if (sortSelect) {
    const field = sortSelect.closest(".sort-field");
    if (field) field.hidden = currentView !== "empresas";
  }

  if (currentView === "sectores") {
    setStatus("Directorio por sector");
    results.innerHTML = browseHtml(catalogs.sectors, "sector");
    return;
  }
  if (currentView === "ubicaciones") {
    setStatus("Directorio por ubicación");
    results.innerHTML = browseHtml(catalogs.locations, "ubicacion");
    return;
  }
  if (currentView === "marcas") {
    setStatus(`${catalogs.brands.filter((item) => item.count).length} marcas representadas`);
    results.innerHTML = browseHtml(catalogs.brands, "marca");
    return;
  }

  setLoading(true);
  setStatus("Buscando en el directorio...");
  try {
    const payload = await window.CavedrepaApi.search(filters);
    renderCompanies(payload);
  } catch (error) {
    const detail = error && error.message ? ` (${error.message})` : "";
    setStatus("No se pudo consultar el API del directorio.");
    results.innerHTML = `<p class="empty-state">Fallo al pedir empresas${detail}. En local usa <code>python3 scripts/serve_site.py</code> para proxear el API.</p>`;
  } finally {
    setLoading(false);
  }
};

const hydrateForm = () => {
  if (!form) return;
  form.q.value = params.get("q") || "";
  fillSelect(form.sector, catalogs.sectors, params.get("sector") || "", "Todos los sectores");
  fillSelect(
    form.ubicacion,
    catalogs.locations.filter((item) => item.count > 0 || item.slug === params.get("ubicacion")),
    params.get("ubicacion") || "",
    "Todo el país"
  );
  fillSelect(
    form.marca,
    catalogs.brands.filter((item) => item.count > 0 || item.slug === params.get("marca")),
    params.get("marca") || "",
    "Todas las marcas"
  );
  if (sortSelect) sortSelect.value = params.get("orden") || "nombre";
  currentPage = Number(params.get("page") || 1) || 1;
};

const goToPage = (page) => {
  if (!page || page < 1) return;
  currentPage = page;
  const next = new URL(window.location.href);
  if (page > 1) next.searchParams.set("page", String(page));
  else next.searchParams.delete("page");
  window.history.replaceState({}, "", next);
  loadView();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const openCompany = async (key, push = true) => {
  if (!key) return;
  setLoading(true);
  try {
    const payload = await window.CavedrepaApi.company(key);
    renderDetail(payload.company);
    if (push) {
      const next = new URL(window.location.href);
      next.searchParams.set("empresa", key);
      window.history.pushState({}, "", next);
    }
  } catch (_error) {
    setStatus("No se encontró esa ficha de empresa.");
  } finally {
    setLoading(false);
  }
};

const openFromQuery = async () => {
  const key = new URLSearchParams(window.location.search).get("empresa");
  if (key) await openCompany(key, false);
};

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    activateTab(tab.dataset.view);
    const next = new URL(window.location.href);
    next.searchParams.set("vista", tab.dataset.view);
    if (tab.dataset.view !== "empresas") next.searchParams.delete("empresa");
    window.history.replaceState({}, "", next);
    loadView();
  });
});

const applyQuery = () => {
  const next = new URL(window.location.href);
  ["q", "sector", "ubicacion", "marca"].forEach((key) => {
    const value = form?.[key]?.value || "";
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  });
  const orden = sortSelect?.value || "nombre";
  if (orden && orden !== "nombre") next.searchParams.set("orden", orden);
  else next.searchParams.delete("orden");
  next.searchParams.set("vista", "empresas");
  next.searchParams.delete("empresa");
  next.searchParams.delete("page");
  currentPage = 1;
  window.history.replaceState({}, "", next);
  activateTab("empresas");
  loadView();
};

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  applyQuery();
});

sortSelect?.addEventListener("change", applyQuery);

results?.addEventListener("click", (event) => {
  const link = event.target.closest("[data-empresa]");
  if (!link) return;
  event.preventDefault();
  openCompany(link.dataset.empresa);
});

window.addEventListener("popstate", () => {
  const key = new URLSearchParams(window.location.search).get("empresa");
  if (key) openCompany(key, false);
  else closeDrawer();
});

document.getElementById("drawer-close")?.addEventListener("click", closeDrawer);
drawer?.addEventListener("click", (event) => {
  if (event.target === drawer) closeDrawer();
});

if (drawer && !params.get("empresa")) {
  drawer.hidden = true;
  document.body.classList.remove("drawer-open");
}

(async () => {
  try {
    catalogs = await window.CavedrepaApi.catalogs();
  } catch (_error) {
    catalogs = { sectors: [], locations: [], brands: [] };
  }
  hydrateForm();
  if (params.get("vista")) activateTab(params.get("vista"));
  await loadView();
  await openFromQuery();
})();
})();
