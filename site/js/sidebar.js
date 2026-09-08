(() => {
const targets = document.querySelectorAll("[data-site-sidebar]");
if (!targets.length && !window.CavedrepaSidebar) {
  /* still export helper for the blog */
}

const itemHtml = (item) => {
  const extra = item.external ? ` target="_blank" rel="noopener"` : "";
  return `<a class="sidebar-card" href="${item.href}"${extra}><img src="${item.src}" alt="${item.alt || ""}"></a>`;
};

const render = (items) =>
  `<div class="site-sidebar-stack">${(items || []).map(itemHtml).join("")}</div>`;

window.CavedrepaSidebar = {
  html: (items) => render(items || window.CavedrepaSidebar.items || []),
  items: [],
};

fetch("/data/sidebar.json")
  .then((response) => (response.ok ? response.json() : { items: [] }))
  .then((payload) => {
    window.CavedrepaSidebar.items = payload.items || [];
    const html = render(window.CavedrepaSidebar.items);
    document.querySelectorAll("[data-site-sidebar]").forEach((node) => {
      node.innerHTML = html;
    });
    document.dispatchEvent(new CustomEvent("cavedrepa-sidebar"));
  })
  .catch(() => {});
})();
