const fallbackCatalogs = () =>
  fetch("/data/catalogs.json").then((response) => {
    if (!response.ok) throw new Error("catalogs");
    return response.json();
  });

const isLocalHost = () => {
  const host = window.location.hostname;
  return host === "127.0.0.1" || host === "localhost";
};

const apiUrl = () => {
  if (isLocalHost()) {
    return `${window.location.origin}/api`;
  }
  return (window.CAVEDREPA_API_URL || "").replace(/\/$/, "");
};

const apiGet = async (path, params) => {
  const base = apiUrl();
  if (!base) {
    const error = new Error("API_URL");
    error.code = "API_URL";
    throw error;
  }
  const url = new URL(base + path);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value) url.searchParams.set(key, value);
  });
  const response = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "API");
  }
  return payload;
};

const postUrl = (path) => {
  const prod = (window.CAVEDREPA_API_URL || "").replace(/\/$/, "");
  if (isLocalHost()) return `${window.location.origin}/api${path}`;
  return `${prod}${path}`;
};

const apiPost = async (path, body) => {
  const send = async (url) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      throw new Error(payload.error || "API");
    }
    return payload;
  };

  try {
    return await send(postUrl(path));
  } catch (error) {
    const prod = (window.CAVEDREPA_API_URL || "").replace(/\/$/, "");
    if (isLocalHost() && prod) {
      return send(`${prod}${path}`);
    }
    throw error;
  }
};

window.CavedrepaApi = {
  catalogs: async () => {
    try {
      const payload = await apiGet("/directory/catalogs");
      if ((payload.sectors || []).length) return payload;
    } catch (_error) {
      /* fallback local */
    }
    const local = await fallbackCatalogs();
    return { ok: true, ...local };
  },
  search: (params) => apiGet("/directory", params),
  company: (key) => apiGet(`/directory/companies/${encodeURIComponent(key)}`),
  apply: (payload) => apiPost("/directory/applications", payload),
};
