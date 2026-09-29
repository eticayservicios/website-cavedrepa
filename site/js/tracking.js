(() => {
  const cfg = window.CAVEDREPA_TRACKING || {};
  const path = String(window.location.pathname || "");
  if (path.startsWith("/admin")) return;

  const verification = String(cfg.searchConsoleVerification || "").trim();
  if (verification && !document.querySelector('meta[name="google-site-verification"]')) {
    const meta = document.createElement("meta");
    meta.name = "google-site-verification";
    meta.content = verification;
    document.head.appendChild(meta);
  }

  const gaId = String(cfg.ga4MeasurementId || "").trim();
  if (!gaId || !/^G-[A-Z0-9]+$/i.test(gaId)) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", gaId);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
  document.head.appendChild(script);
})();
