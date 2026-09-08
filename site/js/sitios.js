(() => {
const tabs = document.getElementById("sitios-tabs");
const lead = document.getElementById("sitios-lead");
const count = document.getElementById("sitios-count");
const list = document.getElementById("sitios-list");
if (!tabs || !list) return;

const itemHtml = (item) => {
  const name = item.name || "";
  if (item.url) {
    return `<a class="sitios-card" href="${item.url}" target="_blank" rel="noopener"><span class="sitios-name">${name}</span><span class="sitios-go">Visitar →</span></a>`;
  }
  return `<div class="sitios-card is-plain"><span class="sitios-name">${name}</span></div>`;
};

let groups = [];

const showTab = (tab, button, pushHash = false) => {
  tabs.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
  if (lead) lead.textContent = tab.lead || "";
  const total = (tab.items || []).length;
  if (count) count.textContent = total ? `${total} sitio${total === 1 ? "" : "s"}` : "";
  list.innerHTML = (tab.items || []).map(itemHtml).join("");
  if (pushHash && tab.id && history.replaceState) {
    history.replaceState({}, "", `#${tab.id}`);
  }
};

const openFromHash = () => {
  const id = (location.hash || "").replace("#", "");
  const tab = groups.find((item) => item.id === id);
  const button = id ? tabs.querySelector(`[data-tab="${id}"]`) : tabs.querySelector("button");
  if (tab && button) showTab(tab, button);
  else if (groups[0]) showTab(groups[0], tabs.querySelector("button"));
};

fetch("/data/sitios.json")
  .then((response) => response.json())
  .then((payload) => {
    groups = payload.tabs || [];
    tabs.innerHTML = groups
      .map(
        (tab, index) =>
          `<button type="button" class="${index === 0 ? "is-active" : ""}" data-tab="${tab.id}">${tab.title}</button>`
      )
      .join("");
    tabs.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = groups.find((item) => item.id === button.dataset.tab);
        if (tab) showTab(tab, button, true);
      });
    });
    openFromHash();
  })
  .catch(() => {
    if (lead) lead.textContent = "No se pudieron cargar los sitios de interés.";
  });

window.addEventListener("hashchange", () => {
  if (groups.length) openFromHash();
});
})();
