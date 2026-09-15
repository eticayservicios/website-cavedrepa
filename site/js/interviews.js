(() => {
const DATA_URL = "/data/interviews.json?v=medios2";
let cache = null;

const escapeHtml = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const months = [
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

const formatDate = (value) => {
  const stamp = String(value || "").slice(0, 10);
  const [year, month, day] = stamp.split("-");
  if (!year || !month || !day) return "";
  return `${Number(day)} de ${months[Number(month) - 1] || ""} de ${year}`;
};

const load = async () => {
  if (cache) return cache;
  const response = await fetch(DATA_URL);
  if (!response.ok) throw new Error("interviews");
  cache = await response.json();
  return cache;
};

const itemsOf = (payload) => (payload && payload.items) || [];

const featuredOf = (payload) => itemsOf(payload).find((item) => item.featured) || itemsOf(payload)[0] || null;

const featuredItems = (payload, limit = 2) => {
  const rows = itemsOf(payload);
  const featured = rows.filter((item) => item.featured);
  return (featured.length ? featured : rows).slice(0, limit);
};

const bySlug = (payload, slug) => itemsOf(payload).find((item) => item.slug === slug) || null;

const thumbSrc = (item) => item?.thumbnails?.maxres || `https://img.youtube.com/vi/${item.youtubeId}/maxresdefault.jpg`;

const thumbFallback = (item) => item?.thumbnails?.hq || `https://img.youtube.com/vi/${item.youtubeId}/hqdefault.jpg`;

const thumbImg = (item, extraClass = "") => `
  <img
    class="${extraClass}"
    src="${escapeHtml(thumbSrc(item))}"
    alt="${escapeHtml(item.alt || item.title)}"
    width="1280"
    height="720"
    loading="lazy"
    decoding="async"
    onerror="if(!this.dataset.fallback){this.dataset.fallback='1';this.src='${escapeHtml(thumbFallback(item))}';}"
    onload="if(this.naturalWidth && this.naturalWidth<480 && !this.dataset.fallback){this.dataset.fallback='1';this.src='${escapeHtml(thumbFallback(item))}';}"
  >`;

const playIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.1v13.8l11-6.9L8 5.1z"/></svg>`;

const shareUrls = (item) => {
  const url = new URL(item.href || window.location.href, window.location.origin).href;
  const text = `${item.title || "Entrevista CAVEDREPA"} ${url}`;
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(text)}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`,
    email: `mailto:?subject=${encodeURIComponent(item.title || "Entrevista CAVEDREPA")}&body=${encodeURIComponent(text)}`,
  };
};

const metaLine = (item) =>
  [formatDate(item.publishedAt), item.interviewee, item.media].filter(Boolean).join(" · ");

const homeCardHtml = (item) => `
  <article class="media-home-card">
    <a class="media-thumb" href="${escapeHtml(item.href)}">
      ${thumbImg(item)}
      <span class="media-play" aria-hidden="true">${playIcon}</span>
      <span class="visually-hidden">Reproducir entrevista</span>
    </a>
    <div class="media-copy">
      <p class="media-kicker">${escapeHtml(item.media || "Entrevista")}</p>
      <h3><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a></h3>
      <p class="media-excerpt">${escapeHtml(item.excerpt)}</p>
      <a class="btn btn-yellow media-cta" href="${escapeHtml(item.href)}">Ver entrevista</a>
    </div>
  </article>`;

const homeHtml = (items) => {
  const rows = (Array.isArray(items) ? items : items ? [items] : []).filter(Boolean);
  if (!rows.length) return "";
  return `
    <div class="section-head media-section-head">
      <div>
        <h2 id="medios-title">CAVEDREPA en los medios</h2>
        <p>Entrevistas, análisis y posiciones institucionales sobre los sectores que impulsan el desarrollo del país.</p>
      </div>
      <a class="link-more media-more" href="/blog/?categoria=entrevistas">Ver todas →</a>
    </div>
    <div class="media-home-grid media-home-grid-${rows.length}">
      ${rows.map(homeCardHtml).join("")}
    </div>`;
};

const listCardHtml = (item) => `
  <article class="news-card media-list-card">
    <a class="company-card-link" href="${escapeHtml(item.href)}">
      <div class="media-thumb media-thumb-card">
        ${thumbImg(item)}
        <span class="media-play" aria-hidden="true">${playIcon}</span>
      </div>
      <div class="news-body">
        <p class="media-kicker">Entrevistas</p>
        <p class="news-date">${escapeHtml(formatDate(item.publishedAt))}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.excerpt)}</p>
        <span class="btn btn-yellow media-cta">Ver entrevista</span>
      </div>
    </a>
  </article>`;

const pageHtml = (item) => {
  const shares = shareUrls(item);
  const facts = [
    ["Fecha", formatDate(item.publishedAt)],
    ["Entrevistado", item.interviewee],
    ["Cargo", item.role],
    ["Medio o programa", item.media],
    ["Duración", item.duration || "Pendiente de completar"],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
    .join("");
  const points = (item.highlights || []).map((point) => `<li>${escapeHtml(point)}</li>`).join("");
  return `
    <nav class="interview-crumb" aria-label="Miga de pan">
      <a href="/">Inicio</a>
      <span aria-hidden="true">/</span>
      <a href="/blog/">Actualidad</a>
      <span aria-hidden="true">/</span>
      <a href="/blog/?categoria=entrevistas">Entrevistas</a>
    </nav>
    <p class="media-kicker">Entrevista</p>
    <h1>${escapeHtml(item.title)}</h1>
    <dl class="interview-facts">${facts}</dl>
    <p class="interview-lead">${escapeHtml(item.excerpt)}</p>
    <div class="video-frame">
      <iframe
        src="https://www.youtube.com/embed/${escapeHtml(item.youtubeId)}"
        title="Entrevista CAVEDREPA"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      ></iframe>
    </div>
    ${
      points
        ? `<section class="interview-block">
            <h2>Puntos destacados</h2>
            <ul class="media-points">${points}</ul>
          </section>`
        : ""
    }
    ${
      item.context
        ? `<section class="interview-block">
            <h2>Contexto</h2>
            <p>${escapeHtml(item.context)}</p>
          </section>`
        : ""
    }
    <div class="interview-share" aria-label="Compartir">
      <p>Compartir</p>
      <a class="btn btn-ghost-ink" href="${shares.whatsapp}" target="_blank" rel="noopener">WhatsApp</a>
      <a class="btn btn-ghost-ink" href="${shares.linkedin}" target="_blank" rel="noopener">LinkedIn</a>
      <a class="btn btn-ghost-ink" href="${shares.email}">Correo</a>
    </div>
    <p><a class="link-more" href="/blog/">Volver a Actualidad</a></p>
    <section class="interview-related" data-interview-related>
      <h2>Contenidos relacionados</h2>
      <div class="news-grid" data-interview-related-grid></div>
    </section>`;
};

const relatedHtml = (post) => {
  const href = `/blog/?entrada=${encodeURIComponent(post.slug || post.id)}`;
  return `
    <a class="news-card" href="${escapeHtml(href)}">
      <img src="/images/blog/editorial.jpg" alt="" width="640" height="400">
      <div class="news-body">
        <p class="news-date">${escapeHtml(formatDate(post.date))}</p>
        <h3>${escapeHtml(post.title || "Entrada")}</h3>
        <span class="read-more">Leer más →</span>
      </div>
    </a>`;
};

const mountHome = async () => {
  const root = document.querySelector("[data-interviews-home]");
  if (!root) return;
  try {
    const payload = await load();
    root.innerHTML = homeHtml(featuredItems(payload, 2));
  } catch (_error) {
    root.innerHTML = `<p class="home-empty">La entrevista aparecerá aquí en breve.</p>`;
  }
};

const mountList = async () => {
  const root = document.querySelector("[data-interviews-list]");
  if (!root) return;
  try {
    const payload = await load();
    const rows = itemsOf(payload);
    if (!rows.length) {
      root.innerHTML = `<p class="empty-state">Aún no hay entrevistas publicadas.</p>`;
      return;
    }
    root.innerHTML = `<div class="blog-grid">${rows.map(listCardHtml).join("")}</div>`;
  } catch (_error) {
    root.innerHTML = `<p class="empty-state">No se pudieron cargar las entrevistas.</p>`;
  }
};

const mountFeatured = async () => {
  const root = document.querySelector("[data-interviews-featured]");
  if (!root) return;
  if (new URLSearchParams(window.location.search).get("categoria") === "entrevistas") {
    root.hidden = true;
    return;
  }
  try {
    const payload = await load();
    const item = featuredOf(payload);
    root.innerHTML = item ? listCardHtml(item) : "";
  } catch (_error) {
    root.innerHTML = "";
  }
};

const mountPage = async () => {
  const root = document.querySelector("[data-interview-page]");
  if (!root) return;
  const slug = root.getAttribute("data-interview-page");
  try {
    const payload = await load();
    const item = bySlug(payload, slug);
    if (!item) {
      root.innerHTML = `<p class="empty-state">No se encontró esa entrevista.</p>`;
      return;
    }
    root.innerHTML = pageHtml(item);
    if (window.CavedrepaApi) {
      const related = document.querySelector("[data-interview-related-grid]");
      const payloadPosts = await window.CavedrepaApi.posts({ per_page: "3" }).catch(() => ({ posts: [] }));
      const posts = (payloadPosts.posts || []).slice(0, 3);
      if (related) {
        related.innerHTML = posts.length
          ? posts.map(relatedHtml).join("")
          : `<p class="empty-state">Pronto publicaremos más contenidos.</p>`;
      }
    }
  } catch (_error) {
    root.innerHTML = `<p class="empty-state">No se pudo cargar la entrevista.</p>`;
  }
};

window.CavedrepaInterviews = {
  load,
  featured: featuredOf,
  featuredItems,
  items: itemsOf,
  bySlug,
  formatDate,
  listCardHtml,
  shareUrls,
};

mountHome();
mountList();
mountFeatured();
mountPage();
})();
