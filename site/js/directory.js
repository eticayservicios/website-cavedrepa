(() => {
const form = document.getElementById("directory-search");
const results = document.getElementById("directory-results");
const status = document.getElementById("directory-status");
const tabs = document.querySelectorAll(".directory-tabs button");
const drawer = document.getElementById("company-drawer");
const detail = document.getElementById("company-detail");
const params = new URLSearchParams(window.location.search);
let catalogs = { sectors: [], locations: [], brands: [] };
let currentView = params.get("vista") || (params.get("empresa") ? "empresas" : "empresas");

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

const companyHref = (company) => {
  const next = new URL(window.location.href);
  next.searchParams.set("empresa", company.slug || company.id);
  next.searchParams.set("vista", "empresas");
  return `${next.pathname}${next.search}`;
};

const cardHtml = (company) => {
  const image = company.image_url
    ? `<img src="${company.image_url}" alt="">`
    : `<div class="company-fallback">${(company.name || "?").slice(0, 1)}</div>`;
  return `
    <article class="company-card">
      <a class="company-card-link" href="${companyHref(company)}">
        ${image}
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

const renderCompanies = (payload) => {
  const companies = payload.companies || [];
  setStatus(
    companies.length
      ? `${companies.length} empresa${companies.length === 1 ? "" : "s"} encontrada${companies.length === 1 ? "" : "s"}`
      : "No hay empresas con esos filtros."
  );
  results.innerHTML = companies.length
    ? `<div class="companies-grid">${companies.map(cardHtml).join("")}</div>`
    : `<p class="empty-state">Prueba otro sector, ubicación o marca.</p>`;
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
    ${company.image_url ? `<img class="detail-image" src="${company.image_url}" alt="">` : ""}
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
  };

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

  setStatus("Buscando en el directorio...");
  try {
    const payload = await window.CavedrepaApi.search(filters);
    renderCompanies(payload);
  } catch (error) {
    setStatus("El directorio todavía no responde. Revisa que la Lambda esté desplegada y los datos importados.");
    results.innerHTML = `<p class="empty-state">No se pudo consultar el API. Los catálogos locales sí están disponibles en las pestañas Por sector, Por ubicación y Por marcas.</p>`;
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
};

const openFromQuery = async () => {
  const key = params.get("empresa");
  if (!key) return;
  try {
    const payload = await window.CavedrepaApi.company(key);
    renderDetail(payload.company);
  } catch (_error) {
    setStatus("No se encontró esa ficha de empresa.");
  }
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

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  const next = new URL(window.location.href);
  ["q", "sector", "ubicacion", "marca"].forEach((key) => {
    const value = form[key]?.value || "";
    if (value) next.searchParams.set(key, value);
    else next.searchParams.delete(key);
  });
  next.searchParams.set("vista", "empresas");
  next.searchParams.delete("empresa");
  window.history.replaceState({}, "", next);
  activateTab("empresas");
  loadView();
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
