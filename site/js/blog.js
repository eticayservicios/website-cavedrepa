(() => {
const results = document.getElementById("blog-results");
const article = document.getElementById("blog-article");
const status = document.getElementById("blog-status");
const side = document.getElementById("blog-side");

if (!results || !window.CavedrepaApi) return;

const params = new URLSearchParams(window.location.search);
let currentPage = Number(params.get("page") || 1) || 1;
let currentCategory = params.get("categoria") || "";
let recentPosts = [];
let categories = [];
let sectors = [];

const formatDate = (value) => {
  const stamp = String(value || "").slice(0, 10);
  const [year, month, day] = stamp.split("-");
  if (!year || !month || !day) return "";
  return `${day}/${month}/${year}`;
};

const setStatus = (text) => {
  if (status) status.textContent = text || "";
};

const syncMenu = () => {
  document.querySelectorAll("#site-nav a").forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.includes("categoria=estadisticas")) {
      link.classList.toggle("active", currentCategory === "estadisticas");
    } else if (href === "/blog/") {
      link.classList.toggle("active", currentCategory !== "estadisticas");
    }
  });
};

const postHref = (post) => {
  const next = new URL("/blog/", window.location.origin);
  next.searchParams.set("entrada", post.slug || post.id);
  const foto = coverKeyFor(post);
  if (foto) next.searchParams.set("foto", foto);
  return `${next.pathname}${next.search}`;
};

const categoryHref = (slug) => {
  const next = new URL("/blog/", window.location.origin);
  if (slug) next.searchParams.set("categoria", slug);
  return `${next.pathname}${next.search}`;
};

const catsLine = (items) =>
  (items || [])
    .map((item) => item.name)
    .filter(Boolean)
    .join(" / ");

const softenCaps = (value) => {
  const text = String(value || "").replace(/\s*\[(?:&hellip;|…)\]\s*$/i, "…").trim();
  const letters = text.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
  if (!letters) return text;
  const upper = (letters.match(/[A-ZÁÉÍÓÚÜÑ]/g) || []).length;
  if (upper / letters.length < 0.65) return text;
  const lower = text.toLocaleLowerCase("es");
  return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
};

const shortText = (value, max = 160) => {
  const text = softenCaps(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
};

const BLOG_IMAGE = "/images/blog/editorial.jpg";

const coverSrc = (post, fotoKey) => {
  const covers = window.CavedrepaCovers;
  if (!covers) return BLOG_IMAGE;
  return covers.fromKey(fotoKey) || covers.forPost(post) || BLOG_IMAGE;
};

const coverKeyFor = (post) => window.CavedrepaCovers?.keyFromSrc(coverSrc(post)) || "";

const rowHtml = (post) => `
    <article class="news-card">
      <a class="company-card-link" href="${postHref(post)}" data-entrada="${post.slug || post.id}" data-foto="${coverKeyFor(post)}">
        <img src="${coverSrc(post)}" alt="">
        <div class="news-body">
          <p class="blog-row-cats">${catsLine(post.categories)}</p>
          <p class="news-date">${formatDate(post.date)}</p>
          <h3>${post.title || "Entrada"}</h3>
          <p>${shortText(post.excerpt)}</p>
          <span class="read-more">Leer más →</span>
        </div>
      </a>
    </article>
  `;

const sideHtml = () => `
  <section class="blog-widget">
    <h3>Entradas recientes</h3>
    ${
      recentPosts.length
        ? recentPosts
            .map(
              (post) => `
      <a class="blog-recent" href="${postHref(post)}" data-entrada="${post.slug || post.id}" data-foto="${coverKeyFor(post)}">
        <img src="${coverSrc(post)}" alt="">
        <span>
          <strong>${post.title || "Entrada"}</strong>
          <em>${formatDate(post.date)}</em>
        </span>
      </a>`
            )
            .join("")
        : `<p class="blog-side-empty">Sin entradas recientes.</p>`
    }
  </section>
  <section class="blog-widget">
    <h3>Categorías principales</h3>
    <div class="blog-cats">
      <a href="/blog/" data-categoria="" class="${currentCategory ? "" : "is-active"}">Todas</a>
      ${categories
        .map(
          (item) =>
            `<a href="${categoryHref(item.slug)}" data-categoria="${item.slug}" class="${
              currentCategory === item.slug ? "is-active" : ""
            }">${item.name}</a>`
        )
        .join("")}
    </div>
  </section>
  <section class="blog-widget">
    <h3>Directorio – Sectores</h3>
    <div class="blog-cats">
      ${sectors
        .map(
          (item) =>
            `<a href="/directorio/?sector=${encodeURIComponent(item.slug)}">${item.name}${
              item.count ? ` (${item.count})` : ""
            }</a>`
        )
        .join("")}
    </div>
  </section>
`;

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

const renderSide = () => {
  if (side) side.innerHTML = sideHtml();
};

const showList = () => {
  if (article) {
    article.hidden = true;
    article.innerHTML = "";
  }
  results.hidden = false;
};

const renderList = (payload) => {
  syncMenu();
  const posts = payload.posts || [];
  const page = payload.page || 1;
  const pages = payload.pages || 1;
  const total = payload.total || posts.length;
  recentPosts = payload.recent || recentPosts;
  categories = payload.categories || categories;
  setStatus(total ? `${total} entradas · página ${page} de ${pages}` : "Aún no hay entradas.");
  results.innerHTML = posts.length
    ? `<div class="blog-grid">${posts.map(rowHtml).join("")}</div>${pagerHtml(payload)}`
    : `<p class="empty-state">No hay entradas para mostrar.</p>`;
  results.querySelectorAll(".page-btn").forEach((button) => {
    button.addEventListener("click", () => goToPage(Number(button.dataset.page)));
  });
  renderSide();
  showList();
};

const renderArticle = (post, fotoKey) => {
  const image = `<img class="blog-hero-img" src="${coverSrc(post, fotoKey)}" alt="">`;
  article.innerHTML = `
    <button type="button" class="blog-back" id="blog-back">← Volver al blog</button>
    <p class="blog-row-cats">${catsLine(post.categories)}</p>
    ${image}
    <p class="blog-row-date">${formatDate(post.date)}</p>
    <h1>${post.title || ""}</h1>
    <div class="blog-content">${post.content || ""}</div>
  `;
  article.hidden = false;
  results.hidden = true;
  setStatus("");
  document.getElementById("blog-back")?.addEventListener("click", closeArticle);
  window.scrollTo({ top: 0, behavior: "smooth" });
};

const deriveCategories = (posts) => {
  const buckets = {};
  (posts || []).forEach((post) => {
    (post.categories || []).forEach((item) => {
      if (!item.slug) return;
      buckets[item.slug] = buckets[item.slug] || { name: item.name || item.slug, slug: item.slug, count: 0 };
      buckets[item.slug].count += 1;
    });
  });
  return Object.values(buckets);
};

const loadSide = async () => {
  try {
    const [blog, catalogs, local] = await Promise.all([
      window.CavedrepaApi.posts({ per_page: "50" }).catch(() => ({})),
      window.CavedrepaApi.catalogs().catch(() => ({})),
      fetch("/data/blog-side.json").then((response) => (response.ok ? response.json() : {})).catch(() => ({})),
    ]);
    recentPosts =
      (blog.recent && blog.recent.length && blog.recent) ||
      (local.recent && local.recent.length && local.recent) ||
      (blog.posts || []).slice(0, 5);
    categories =
      (blog.categories && blog.categories.length && blog.categories) ||
      (local.categories && local.categories.length && local.categories) ||
      deriveCategories(blog.posts);
    sectors = (catalogs.sectors || []).filter((item) => item.slug);
    renderSide();
  } catch (_error) {
    renderSide();
  }
};

const loadList = async () => {
  setStatus("Cargando el blog...");
  try {
    const payload = await window.CavedrepaApi.posts({
      page: String(currentPage),
      per_page: "10",
      categoria: currentCategory,
    });
    renderList(payload);
  } catch (_error) {
    setStatus("No se pudo cargar el blog.");
    results.innerHTML = `<p class="empty-state">Intenta de nuevo en unos minutos.</p>`;
    showList();
  }
};

const openPost = async (key, push = true, fotoKey = "") => {
  if (!key) return;
  setStatus("Cargando la entrada...");
  try {
    const payload = await window.CavedrepaApi.post(key);
    const coverKey = fotoKey || coverKeyFor(payload.post);
    renderArticle(payload.post, coverKey);
    if (push) {
      const next = new URL(window.location.href);
      next.searchParams.set("entrada", key);
      next.searchParams.delete("page");
      if (coverKey) next.searchParams.set("foto", coverKey);
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
  next.searchParams.delete("foto");
  window.history.pushState({}, "", next);
  showList();
  if (!results.querySelector(".blog-row")) loadList();
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

const applyCategory = (slug) => {
  currentCategory = slug || "";
  currentPage = 1;
  const next = new URL("/blog/", window.location.origin);
  if (currentCategory) next.searchParams.set("categoria", currentCategory);
  window.history.pushState({}, "", next);
  loadList();
};

document.querySelector(".blog-layout")?.addEventListener("click", (event) => {
  const category = event.target.closest("[data-categoria]");
  if (category) {
    event.preventDefault();
    applyCategory(category.dataset.categoria);
    return;
  }
  const link = event.target.closest("[data-entrada]");
  if (!link) return;
  event.preventDefault();
  openPost(link.dataset.entrada, true, link.dataset.foto || "");
});

window.addEventListener("popstate", () => {
  const next = new URLSearchParams(window.location.search);
  const key = next.get("entrada");
  currentCategory = next.get("categoria") || "";
  currentPage = Number(next.get("page") || 1) || 1;
  if (key) openPost(key, false, next.get("foto") || "");
  else loadList();
});

(async () => {
  const key = new URLSearchParams(window.location.search).get("entrada");
  await Promise.all([loadList(), loadSide()]);
  if (key) await openPost(key, false, new URLSearchParams(window.location.search).get("foto") || "");
})();
})();
