(() => {
const form = document.getElementById("affiliate-form");
const errorBox = document.getElementById("affiliate-error");
const success = document.getElementById("affiliate-success");
const submit = document.getElementById("affiliate-submit");
const locationCombo = document.getElementById("location-combo");
const brandsCombo = document.getElementById("brands-combo");
const logoDrop = document.getElementById("logo-drop");
const logoFile = document.getElementById("logo-file");
const logoPreview = document.getElementById("logo-preview");
const logoHint = document.getElementById("logo-hint");

if (!form || !window.CavedrepaApi) return;

let locationValue = { slug: "", name: "" };
let brandValues = [];
let logoData = "";

const fold = (value) =>
  (value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const showError = (text) => {
  if (!errorBox) return;
  errorBox.hidden = !text;
  errorBox.textContent = text || "";
};

const escapeAttr = (value) =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");

const renderCombo = (root, options, query, onPick, selected) => {
  const list = root.querySelector(".combo-list");
  if (!list) return;
  const needle = fold(query);
  const matches = options
    .filter((item) => !selected?.has(item.slug))
    .filter((item) => !needle || fold(item.name).includes(needle) || fold(item.slug).includes(needle))
    .slice(0, 40);
  list.innerHTML = matches.length
    ? matches
        .map(
          (item) =>
            `<button type="button" class="combo-option" data-slug="${escapeAttr(item.slug)}" data-name="${escapeAttr(item.name)}">${escapeAttr(item.name)}</button>`
        )
        .join("")
    : `<p class="combo-empty">Sin coincidencias</p>`;
  list.hidden = false;
  list.querySelectorAll(".combo-option").forEach((button) => {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
      onPick({ slug: button.dataset.slug, name: button.dataset.name });
    });
  });
};

const mountSelect = (root, options) => {
  root.innerHTML = `
    <input class="combo-input" type="search" placeholder="${root.dataset.empty || "Buscar..."}" autocomplete="off">
    <div class="combo-list" hidden></div>
  `;
  const input = root.querySelector(".combo-input");
  const list = root.querySelector(".combo-list");
  const close = () => {
    list.hidden = true;
  };
  const pick = (item) => {
    locationValue = item;
    input.value = item.name;
    close();
  };
  input.addEventListener("focus", () => renderCombo(root, options, input.value, pick));
  input.addEventListener("input", () => {
    locationValue = { slug: "", name: "" };
    renderCombo(root, options, input.value, pick);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const first = list.querySelector(".combo-option");
      if (first) pick({ slug: first.dataset.slug, name: first.dataset.name });
    }
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
};

const renderBrandTags = (root) => {
  const tags = root.querySelector(".combo-tags-row");
  if (!tags) return;
  tags.innerHTML = brandValues
    .map(
      (item) =>
        `<button type="button" class="combo-tag" data-slug="${item.slug}">${item.name}<span aria-hidden="true">×</span></button>`
    )
    .join("");
  tags.querySelectorAll(".combo-tag").forEach((button) => {
    button.addEventListener("click", () => {
      brandValues = brandValues.filter((item) => item.slug !== button.dataset.slug);
      renderBrandTags(root);
    });
  });
};

const mountTags = (root, options) => {
  root.innerHTML = `
    <div class="combo-tags-row"></div>
    <input class="combo-input" type="search" placeholder="${root.dataset.empty || "Buscar..."}" autocomplete="off">
    <div class="combo-list" hidden></div>
  `;
  const input = root.querySelector(".combo-input");
  const list = root.querySelector(".combo-list");
  const selected = () => new Set(brandValues.map((item) => item.slug));
  const close = () => {
    list.hidden = true;
  };
  const pick = (item) => {
    if (!item.slug || selected().has(item.slug)) return;
    brandValues.push(item);
    input.value = "";
    renderBrandTags(root);
    close();
  };
  input.addEventListener("focus", () => renderCombo(root, options, input.value, pick, selected()));
  input.addEventListener("input", () => renderCombo(root, options, input.value, pick, selected()));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      const first = list.querySelector(".combo-option");
      if (first) {
        pick({ slug: first.dataset.slug, name: first.dataset.name });
      }
    }
  });
  input.addEventListener("blur", () => setTimeout(close, 120));
};

const fitLogo = (file) =>
  new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("logo"));
      return;
    }
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 640;
      canvas.height = 360;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 640, 360);
      const innerW = 512;
      const innerH = 256;
      const scale = Math.min(innerW / image.width, innerH / image.height);
      const width = image.width * scale;
      const height = image.height * scale;
      ctx.drawImage(image, (640 - width) / 2, (360 - height) / 2, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("logo"));
    };
    image.src = url;
  });

const setLogo = async (file) => {
  if (!file) return;
  try {
    logoData = await fitLogo(file);
    if (logoPreview) {
      logoPreview.src = logoData;
      logoPreview.hidden = false;
    }
    if (logoHint) logoHint.textContent = "Logo listo. Puedes cambiarlo si quieres.";
    logoDrop?.classList.add("has-file");
  } catch (_error) {
    showError("No se pudo leer el logo. Usa JPG, PNG o WEBP.");
  }
};

logoDrop?.addEventListener("dragover", (event) => {
  event.preventDefault();
  logoDrop.classList.add("is-over");
});
logoDrop?.addEventListener("dragleave", () => logoDrop.classList.remove("is-over"));
logoDrop?.addEventListener("drop", (event) => {
  event.preventDefault();
  logoDrop.classList.remove("is-over");
  setLogo(event.dataTransfer?.files?.[0]);
});
logoFile?.addEventListener("change", () => setLogo(logoFile.files?.[0]));

window.CavedrepaApi.catalogs()
  .then((catalogs) => {
    if (locationCombo) mountSelect(locationCombo, catalogs.locations || []);
    if (brandsCombo) mountTags(brandsCombo, catalogs.brands || []);
  })
  .catch(() => {});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  if (!locationValue.slug) {
    showError("Elige una ubicación de la lista.");
    return;
  }
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Enviando…";
  }
  const raw = Object.fromEntries(new FormData(form).entries());
  const payload = {
    name: raw.name,
    rif: raw.rif,
    legal_rep: raw.legal_rep,
    sector: raw.sector,
    address: raw.address,
    description: raw.description,
    phone: raw.phone,
    phone2: raw.phone2,
    fax: raw.fax,
    email: raw.email,
    email2: raw.email2,
    website: raw.website,
    website_url: raw.website_url,
    location: locationValue.slug,
    location_name: locationValue.name,
    brands: brandValues.map((item) => item.name),
    social: {
      facebook: raw.facebook,
      instagram: raw.instagram,
      linkedin: raw.linkedin,
      youtube: raw.youtube,
    },
    logo: logoData,
  };
  try {
    await window.CavedrepaApi.apply(payload);
    form.hidden = true;
    if (success) success.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    showError(error && error.message ? error.message : "No se pudo enviar la solicitud. Intenta de nuevo.");
    if (submit) {
      submit.disabled = false;
      submit.textContent = "Enviar solicitud →";
    }
  }
});
})();
