(() => {
const form = document.getElementById("contact-form");
const errorBox = document.getElementById("contact-error");
const success = document.getElementById("contact-success");
const submit = document.getElementById("contact-submit");
if (!form || !window.CavedrepaApi) return;

const showError = (text) => {
  if (!errorBox) return;
  errorBox.hidden = !text;
  errorBox.textContent = text || "";
};

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  if (submit) {
    submit.disabled = true;
    submit.textContent = "Enviando…";
  }
  const raw = Object.fromEntries(new FormData(form).entries());
  try {
    await window.CavedrepaApi.contact({
      name: raw.name,
      email: raw.email,
      phone: raw.phone,
      message: raw.message,
      website_url: raw.website_url,
    });
    form.hidden = true;
    if (success) success.hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    showError(error && error.message ? error.message : "No se pudo enviar el mensaje. Intenta de nuevo.");
    if (submit) {
      submit.disabled = false;
      submit.textContent = "Enviar mensaje →";
    }
  }
});
})();
