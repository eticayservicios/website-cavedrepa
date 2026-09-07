(() => {
const tabs = document.getElementById("sitios-tabs");
const lead = document.getElementById("sitios-lead");
const list = document.getElementById("sitios-list");
if (!tabs || !list) return;

const itemHtml = (item) => {
  const name = item.name || "";
  if (item.url) {
    return `<a href="${item.url}" target="_blank" rel="noopener">${name}</a>`;
  }
  return `<span>${name}</span>`;
};

const showTab = (tab, button) => {
  tabs.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
  if (lead) lead.textContent = tab.lead || "";
  list.innerHTML = (tab.items || []).map(itemHtml).join("");
};

fetch("/data/sitios.json")
  .then((response) => response.json())
  .then((payload) => {
    const groups = payload.tabs || [];
    tabs.innerHTML = groups
      .map(
        (tab, index) =>
          `<button type="button" class="${index === 0 ? "is-active" : ""}" data-tab="${tab.id}">${tab.title}</button>`
      )
      .join("");
    tabs.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const tab = groups.find((item) => item.id === button.dataset.tab);
        if (tab) showTab(tab, button);
      });
    });
    if (groups[0]) showTab(groups[0], tabs.querySelector("button"));
  })
  .catch(() => {
    if (lead) lead.textContent = "No se pudieron cargar los sitios de interés.";
  });
})();
