(() => {
const form = document.getElementById("affiliate-form");
const errorBox = document.getElementById("affiliate-error");
const success = document.getElementById("affiliate-success");
const submit = document.getElementById("affiliate-submit");

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
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    await window.CavedrepaApi.apply(data);
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
