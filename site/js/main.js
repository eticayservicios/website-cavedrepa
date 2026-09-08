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

const homeNews = document.getElementById("home-news");
if (homeNews && window.CavedrepaApi) {
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
    return `${Number(day)} ${months[Number(month) - 1] || ""} ${year}`;
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
  const shortExcerpt = (value, max = 150) => {
    const text = softenCaps(value);
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1).replace(/\s+\S*$/, "")}…`;
  };
  window.CavedrepaApi.posts({ per_page: "3" })
    .then((payload) => {
      const posts = payload.posts || [];
      homeNews.innerHTML = posts
        .map((post) => {
          const media = `<img src="/images/blog/editorial.jpg" alt="Editorial CAVEDREPA">`;
          return `
            <article class="news-card">
              <a class="company-card-link" href="/blog/?entrada=${encodeURIComponent(post.slug || post.id)}">
                ${media}
                <div class="news-body">
                  <p class="news-date">${formatDate(post.date)}</p>
                  <h3>${post.title || "Entrada"}</h3>
                  <p>${shortExcerpt(post.excerpt)}</p>
                  <span class="read-more">Leer más →</span>
                </div>
              </a>
            </article>`;
        })
        .join("");
    })
    .catch(() => {
      homeNews.innerHTML = `<p class="empty-state">Las entradas aparecerán aquí en breve.</p>`;
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
