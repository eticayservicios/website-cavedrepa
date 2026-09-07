(() => {
const nav = document.getElementById("site-nav");
const toggle = document.getElementById("menu-toggle");
const search = document.getElementById("directory-search");
const isDirectoryPage = document.body.classList.contains("directory-page");

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(open));
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    });
  });
}

const sections = document.querySelectorAll("main section[id]");
const navLinks = document.querySelectorAll(".nav a");

const markActive = () => {
  let current = "inicio";
  sections.forEach((section) => {
    if (window.scrollY >= section.offsetTop - 140) {
      current = section.id;
    }
  });
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${current}`);
  });
};

window.addEventListener("scroll", markActive, { passive: true });

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
  window.CavedrepaApi.posts({ per_page: "3" })
    .then((payload) => {
      const posts = payload.posts || [];
      homeNews.innerHTML = posts
        .map((post) => {
          const image = post.image_url
            ? `<img src="${post.image_url}" alt="" width="960" height="540">`
            : `<div class="news-fallback"></div>`;
          return `
            <article class="news-card">
              <a class="company-card-link" href="/blog/?entrada=${encodeURIComponent(post.slug || post.id)}">
                ${image}
                <div class="news-body">
                  <p class="news-date">${formatDate(post.date)}</p>
                  <h3>${post.title || "Entrada"}</h3>
                  <p>${post.excerpt || ""}</p>
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
})();
