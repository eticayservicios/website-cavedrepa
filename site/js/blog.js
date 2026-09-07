(() => {
const results = document.getElementById("blog-results");
const article = document.getElementById("blog-article");
const status = document.getElementById("blog-status");
const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

if (!results || !window.CavedrepaApi) return;

let currentPage = Number(new URLSearchParams(window.location.search).get("page") || 1) || 1;

const formatDate = (value) => {
  const stamp = String(value || "").slice(0, 10);
  const [year, month, day] = stamp.split("-");
  if (!year || !month || !day) return "";
  return `${Number(day)} ${MONTHS[Number(month) - 1] || ""} ${year}`;
};

const setStatus = (text) => {
  if (status) status.textContent = text || "";
};

const postHref = (post) => {
  const next = new URL(window.location.href);
  next.searchParams.set("entrada", post.slug || post.id);
  next.searchParams.delete("page");
  return `${next.pathname}${next.search}`;
};

const cardHtml = (post) => {
  const image = post.image_url
    ? `<img src="${post.image_url}" alt="" width="960" height="540">`
    : `<div class="news-fallback"></div>`;
  return `
    <article class="news-card">
      <a class="company-card-link" href="${postHref(post)}" data-entrada="${post.slug || post.id}">
        ${image}
        <div class="news-body">
          <p class="news-date">${formatDate(post.date)}</p>
          <h3>${post.title || "Entrada"}</h3>
          <p>${post.excerpt || ""}</p>
          <span class="read-more">Leer más →</span>
        </div>
      </a>
    </article>
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

const showList = () => {
  if (article) {
    article.hidden = true;
    article.innerHTML = "";
  }
  results.hidden = false;
};

const renderList = (payload) => {
  const posts = payload.posts || [];
  const page = payload.page || 1;
  const pages = payload.pages || 1;
  const total = payload.total || posts.length;
  setStatus(total ? `${total} entradas · página ${page} de ${pages}` : "Aún no hay entradas.");
  results.innerHTML = posts.length
    ? `<div class="news-grid">${posts.map(cardHtml).join("")}</div>${pagerHtml(payload)}`
    : `<p class="empty-state">No hay entradas para mostrar.</p>`;
  results.querySelectorAll(".page-btn").forEach((button) => {
    button.addEventListener("click", () => goToPage(Number(button.dataset.page)));
  });
  showList();
};

const renderArticle = (post) => {
  const image = post.image_url ? `<img class="blog-hero-img" src="${post.image_url}" alt="">` : "";
  article.innerHTML = `
    <button type="button" class="blog-back" id="blog-back">← Volver al blog</button>
    ${image}
    <p class="news-date">${formatDate(post.date)}</p>
    <h1>${post.title || ""}</h1>
    <div class="blog-content">${post.content || ""}</div>
  `;
  article.hidden = false;
  results.hidden = true;
  setStatus("");
  document.getElementById("blog-back")?.addEventListener("click", closeArticle);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const loadList = async () => {
  setStatus("Cargando el blog...");
  try {
    const payload = await window.CavedrepaApi.posts({ page: String(currentPage), per_page: "12" });
    renderList(payload);
  } catch (_error) {
    setStatus("No se pudo cargar el blog.");
    results.innerHTML = `<p class="empty-state">Intenta de nuevo en unos minutos.</p>`;
    showList();
  }
};

const openPost = async (key, push = true) => {
  if (!key) return;
  setStatus("Cargando la entrada...");
  try {
    const payload = await window.CavedrepaApi.post(key);
    renderArticle(payload.post);
    if (push) {
      const next = new URL(window.location.href);
      next.searchParams.set("entrada", key);
      next.searchParams.delete("page");
      window.history.pushState({}, "", next);
    }
  } catch (_error) {
    setStatus("No se encontró esa entrada.");
    showList();
  }
};

const closeArticle = () => {
  const next = new URL(window.location.href);
  next.searchParams.delete("entrada");
  window.history.pushState({}, "", next);
  showList();
  if (!results.innerHTML) loadList();
};

const goToPage = (page) => {
  if (!page || page < 1) return;
  currentPage = page;
  const next = new URL(window.location.href);
  if (page > 1) next.searchParams.set("page", String(page));
  else next.searchParams.delete("page");
  window.history.replaceState({}, "", next);
  loadList();
  window.scrollTo({ top: 0, behavior: "smooth" });
};

results.addEventListener("click", (event) => {
  const link = event.target.closest("[data-entrada]");
  if (!link) return;
  event.preventDefault();
  openPost(link.dataset.entrada);
});

window.addEventListener("popstate", () => {
  const key = new URLSearchParams(window.location.search).get("entrada");
  if (key) openPost(key, false);
  else {
    showList();
    if (!results.querySelector(".news-grid")) loadList();
  }
});

(async () => {
  const key = new URLSearchParams(window.location.search).get("entrada");
  await loadList();
  if (key) await openPost(key, false);
})();
})();
