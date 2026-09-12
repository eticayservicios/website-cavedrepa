(() => {
const nav = document.getElementById("site-nav");
const toggle = document.getElementById("menu-toggle");
const search = document.getElementById("directory-search");
const isDirectoryPage = document.body.classList.contains("directory-page");
const isHome = location.pathname === "/" || location.pathname === "/index.html";
const isNarrow = () => window.matchMedia("(max-width: 1400px)").matches;

const closeMenu = () => {
  if (!nav || !toggle) return;
  nav.classList.remove("is-open");
  toggle.setAttribute("aria-expanded", "false");
  document.body.classList.remove("menu-open");
  nav.querySelectorAll(".has-sub.is-open").forEach((item) => item.classList.remove("is-open"));
};

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
    document.body.classList.toggle("menu-open", open);
    if (!open) {
      nav.querySelectorAll(".has-sub.is-open").forEach((item) => item.classList.remove("is-open"));
    }
  });

  nav.querySelectorAll(".has-sub > a").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (!isNarrow()) return;
      event.preventDefault();
      const parent = link.parentElement;
      const wasOpen = parent.classList.contains("is-open");
      nav.querySelectorAll(".has-sub.is-open").forEach((item) => {
        if (item !== parent) item.classList.remove("is-open");
      });
      parent.classList.toggle("is-open", !wasOpen);
    });
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      if (isNarrow() && link.parentElement?.classList.contains("has-sub") && link.parentElement.firstElementChild === link) {
        return;
      }
      closeMenu();
    });
  });
}

window.addEventListener("resize", () => {
  if (!isNarrow()) closeMenu();
});

const topLinks = document.querySelectorAll(".nav > a, .nav > .has-sub > a");

const pathOf = (href) => {
  try {
    return new URL(href, location.origin);
  } catch (_error) {
    return null;
  }
};

const markCurrentNav = () => {
  const here = location.pathname.replace(/\/+$/, "") || "/";
  const stats = new URLSearchParams(location.search).get("categoria") === "estadisticas";
  topLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    if (href.startsWith("http")) {
      link.classList.remove("active");
      return;
    }
    let match = false;
    if (href === "#inicio" || href === "/") {
      match = isHome;
    } else {
      const url = pathOf(href);
      if (!url) return;
      const path = url.pathname.replace(/\/+$/, "") || "/";
      if (path === "/blog" && url.searchParams.get("categoria") === "estadisticas") {
        match = here === "/blog" && stats;
      } else if (path === "/blog") {
        match = here === "/blog" && !stats;
      } else if (path === "/directorio") {
        match = here === "/directorio" || here === "/afiliate";
      } else {
        match = here === path || here.startsWith(`${path}/`);
      }
    }
    link.classList.toggle("active", match);
  });
};

const sections = document.querySelectorAll("main section[id]");

const markActive = () => {
  if (!isHome) {
    markCurrentNav();
    return;
  }
  let current = "inicio";
  sections.forEach((section) => {
    if (window.scrollY >= section.offsetTop - 140) {
      current = section.id;
    }
  });
  const hashId = current === "contacto" ? "contacto" : "inicio";
  topLinks.forEach((link) => {
    const href = link.getAttribute("href") || "";
    link.classList.toggle("active", href === `#${hashId}`);
  });
};

markCurrentNav();
window.addEventListener("scroll", markActive, { passive: true });
window.addEventListener("hashchange", markCurrentNav);

const fillSelect = (select, items, emptyLabel) => {
  if (!select) return;
  const selected = select.value;
  select.innerHTML = "";
  const blank = document.createElement("option");
  blank.value = "";
  blank.textContent = emptyLabel;
  select.appendChild(blank);
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.slug;
    option.textContent = item.name;
    select.appendChild(option);
  });
  if ([...select.options].some((option) => option.value === selected)) {
    select.value = selected;
  }
};

if (!isDirectoryPage && window.CavedrepaApi) {
  window.CavedrepaApi.catalogs()
    .then((catalogs) => {
      fillSelect(search?.sector, catalogs.sectors || [], "Todos los sectores");
      fillSelect(
        search?.ubicacion,
        (catalogs.locations || []).filter((item) => item.count > 0),
        "Todo el país"
      );
    })
    .catch(() => {});
}

if (search && !isDirectoryPage) {
  search.setAttribute("action", "/directorio/");
  search.setAttribute("method", "get");
}

const homeFeatured = document.getElementById("home-featured");
const homeLatest = document.getElementById("home-latest");
const homeCats = document.getElementById("home-cats");
if (homeFeatured && homeLatest && window.CavedrepaApi) {
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
  const HOME_CATS = [
    { name: "Todos", slug: "" },
    { name: "Agrícola", slugs: ["agro", "agricola", "agroindustria"] },
    { name: "Construcción", slugs: ["construccion"] },
    { name: "Industrial", slugs: ["industrial"] },
    { name: "Pesca y acuícola", slugs: ["acuicola", "pesca"] },
    { name: "Economía", slugs: ["economia", "estadisticas"] },
    { name: "Eventos", slugs: ["eventos"] },
  ];
  const escapeHtml = (value) =>
    String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const formatDate = (value) => {
    const stamp = String(value || "").slice(0, 10);
    const [year, month, day] = stamp.split("-");
    if (!year || !month || !day) return "";
    return `${Number(day)} de ${months[Number(month) - 1] || ""} de ${year}`;
  };
  const softenCaps = (value) => {
    const text = String(value || "").replace(/\s*\[(?:&hellip;|…)\]\s*$/i, "…").trim();
    const letters = text.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
    if (!letters) return text;
    const upper = (letters.match(/[A-ZÁÉÍÓÚÜÑ]/g) || []).length;
    if (upper / letters.length < 0.65) return text;
    const lower = text.toLocaleLowerCase("es");
    return lower.charAt(0).toLocaleUpperCase("es") + lower.slice(1);
  };
  const shortExcerpt = (value, max = 170) => {
    const text = softenCaps(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
  };
  const postHref = (post, coverKey) => {
    const next = new URL("/blog/", window.location.origin);
    next.searchParams.set("entrada", post.slug || post.id);
    if (coverKey) next.searchParams.set("foto", coverKey);
    return `${next.pathname}${next.search}`;
  };
  const catName = (post) => {
    const cats = post.categories || [];
    const named = cats.find((item) => !/^\d{4}$/.test(item.slug || ""));
    return (named || cats[0] || {}).name || "Noticias";
  };
  const FEATURED_IMAGES = [
    "/images/home/tractor.jpg",
    "/images/home/construccion.jpg",
    "/images/home/buque.jpg",
  ];
  const LATEST_IMAGES = [
    "/images/home/agricola.jpg",
    "/images/home/construccion.jpg",
    "/images/home/industrial.jpg",
    "/images/home/pesca.jpg",
    "/images/home/economia.jpg",
    "/images/home/eventos.jpg",
  ];
  const imageFor = (variant, index) => {
    if (variant === "mini") return LATEST_IMAGES[index] || LATEST_IMAGES[0];
    if (variant === "main") return FEATURED_IMAGES[0];
    return FEATURED_IMAGES[Math.min(index + 1, FEATURED_IMAGES.length - 1)];
  };
  const storyHtml = (post, variant, index = 0) => {
    const title = escapeHtml(softenCaps(post.title || "Entrada"));
    const kicker = escapeHtml(catName(post));
    const date = escapeHtml(formatDate(post.date));
    const excerpt = escapeHtml(shortExcerpt(post.excerpt));
    const image = imageFor(variant, index);
    const coverKey = window.CavedrepaCovers?.keyFromSrc(image) || "";
    const href = postHref(post, coverKey);
    if (variant === "mini") {
      return `
        <a class="home-mini" href="${href}">
          <img src="${escapeHtml(image)}" alt="" width="400" height="267" onerror="this.src='/images/blog/editorial.jpg'">
          <div class="home-mini-body">
            <p class="home-kicker">${kicker}</p>
            <time>${date}</time>
            <h3>${title}</h3>
            <span class="home-mini-arrow" aria-hidden="true">→</span>
          </div>
        </a>`;
    }
    return `
      <a class="${variant === "main" ? "home-featured-main" : "home-story"}" href="${href}">
        <img src="${escapeHtml(image)}" alt="" width="640" height="400" onerror="this.src='/images/blog/editorial.jpg'">
        <p class="home-kicker">${kicker}</p>
        <h3>${title}</h3>
        ${variant === "main" && excerpt ? `<p class="home-excerpt">${excerpt}</p>` : ""}
        <p class="home-meta"><time>${date}</time><span>Leer artículo →</span></p>
      </a>`;
  };
  let allPosts = [];
  let currentCat = "Todos";
  const renderCats = () => {
    if (!homeCats) return;
    homeCats.innerHTML = HOME_CATS.map(
      (item) =>
        `<button type="button" data-cat="${escapeHtml(item.name)}" class="${
          item.name === currentCat ? "is-active" : ""
        }">${escapeHtml(item.name)}</button>`
    ).join("");
  };
  const paintFeed = (posts) => {
    if (!posts.length) {
      homeFeatured.innerHTML = `<p class="home-empty">Pronto publicaremos más notas de este tema.</p>`;
      homeLatest.innerHTML = "";
      return;
    }
    const featured = posts.slice(0, 3);
    const latest = posts.slice(3, 9);
    homeFeatured.innerHTML = `
      ${storyHtml(featured[0], "main", 0)}
      <div class="home-featured-side">
        ${featured.slice(1).map((post, index) => storyHtml(post, "side", index)).join("")}
      </div>`;
    homeLatest.innerHTML = latest.length
      ? latest.map((post, index) => storyHtml(post, "mini", index)).join("")
      : "";
  };
  const loadFeed = async (name) => {
    currentCat = name || "Todos";
    renderCats();
    const filter = HOME_CATS.find((item) => item.name === currentCat);
    const slug = filter && filter.slugs ? filter.slugs[0] : "";
    if (!slug && allPosts.length) {
      paintFeed(allPosts);
      return;
    }
    homeFeatured.innerHTML = `<p class="home-empty">Cargando…</p>`;
    homeLatest.innerHTML = "";
    try {
      const payload = await window.CavedrepaApi.posts({
        per_page: "12",
        categoria: slug,
      });
      const posts = payload.posts || [];
      if (!slug) allPosts = posts;
      paintFeed(posts);
    } catch (_error) {
      homeFeatured.innerHTML = `<p class="home-empty">Las entradas aparecerán aquí en breve.</p>`;
    }
  };
  renderCats();
  loadFeed("Todos");
  homeCats?.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-cat]");
    if (!button) return;
    loadFeed(button.dataset.cat || "Todos");
  });
}

const newsletter = document.getElementById("home-newsletter");
const newsletterBox = document.getElementById("home-newsletter-box");
if (newsletter && window.CavedrepaApi) {
  newsletter.addEventListener("submit", async (event) => {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(newsletter).entries());
    const button = newsletter.querySelector("button");
    if (button) button.disabled = true;
    try {
      await window.CavedrepaApi.contact({
        name: "Boletín CAVEDREPA",
        email: raw.email,
        message: "Quiero recibir las últimas noticias, estudios y oportunidades del sector.",
        website_url: raw.website_url,
      });
      if (newsletterBox) {
        newsletterBox.classList.add("is-done");
        newsletterBox.innerHTML = `
          <h3>Listo</h3>
          <p>Recibimos tu correo. La Cámara lo revisará para el envío de información.</p>`;
      }
    } catch (_error) {
      if (button) button.disabled = false;
    }
  });
}

const backToTop = document.createElement("button");
backToTop.type = "button";
backToTop.className = "back-to-top";
backToTop.setAttribute("aria-label", "Volver arriba");
backToTop.innerHTML = "<span aria-hidden=\"true\">↑</span>";
document.body.appendChild(backToTop);

const syncBackToTop = () => {
  backToTop.classList.toggle("is-visible", window.scrollY > 360);
};

backToTop.addEventListener("click", () => {
  window.scrollTo({ top: 0, behavior: "smooth" });
});

syncBackToTop();
window.addEventListener("scroll", syncBackToTop, { passive: true });
})();
