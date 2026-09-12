const fallbackCatalogs = () =>
  fetch("/data/catalogs.json").then((response) => {
    if (!response.ok) throw new Error("catalogs");
    return response.json();
  });

const fallbackBlogFile = () =>
  fetch("/data/blog.json").then((response) => {
    if (!response.ok) throw new Error("blog");
    return response.json();
  });

const paginateLocal = (items, page, perPage) => {
  const per = Number(perPage) || 10;
  const current = Math.max(1, Number(page) || 1);
  const start = (current - 1) * per;
  return {
    posts: items.slice(start, start + per),
    page: current,
    pages: Math.max(1, Math.ceil(items.length / per) || 1),
    total: items.length,
    per_page: per,
  };
};

const fallbackBlog = async (params) => {
  const data = await fallbackBlogFile();
  const category = String(params?.categoria || "").toLowerCase();
  let posts = data.posts || [];
  if (category) {
    posts = posts.filter((post) =>
      (post.categories || []).some((item) => item.slug === category)
    );
  }
  return {
    ok: true,
    ...paginateLocal(posts, params?.page, params?.per_page),
    recent: data.recent || (data.posts || []).slice(0, 5),
    categories: data.categories || [],
    categoria: category,
  };
};

const fallbackPost = async (key) => {
  const data = await fallbackBlogFile();
  const raw = String(key || "").toLowerCase();
  const post = (data.posts || []).find(
    (item) => String(item.slug || "").toLowerCase() === raw || String(item.id) === raw
  );
  if (!post) throw new Error("NOT_FOUND");
  return { ok: true, post: { ...post, content: post.content || post.excerpt || "" } };
};

const isLocalHost = () => {
  const host = window.location.hostname;
  return host === "127.0.0.1" || host === "localhost";
};

const apiUrl = () => {
  if (isLocalHost()) return `${window.location.origin}/api`;
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

const postUrl = (path) => `${apiUrl()}${path}`;

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

const authHeaders = (token) => {
  const headers = { Accept: "application/json", "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

const apiSend = async (method, path, body, token) => {
  const send = async (url) => {
    const response = await fetch(url, {
      method,
      headers: authHeaders(token),
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload.error || "API");
      error.status = response.status;
      throw error;
    }
    return payload;
  };

  try {
    return await send(method === "GET" ? `${apiUrl()}${path}` : postUrl(path));
  } catch (error) {
    const prod = (window.CAVEDREPA_API_URL || "").replace(/\/$/, "");
    if (isLocalHost() && prod) {
      return send(`${prod}${path}`);
    }
    throw error;
  }
};

window.CavedrepaCovers = {
  files: {
    agricola: "/images/home/agricola.jpg",
    tractor: "/images/home/tractor.jpg",
    construccion: "/images/home/construccion.jpg",
    industrial: "/images/home/industrial.jpg",
    pesca: "/images/home/pesca.jpg",
    buque: "/images/home/buque.jpg",
    economia: "/images/home/economia.jpg",
    eventos: "/images/home/eventos.jpg",
  },
  fromKey(key) {
    return this.files[String(key || "").toLowerCase()] || "";
  },
  keyFromSrc(src) {
    const match = String(src || "").match(/\/images\/home\/([a-z]+)\.jpg$/i);
    return match ? match[1] : "";
  },
  forPost(post) {
    const keys = Object.keys(this.files);
    const id = Number(post && post.id) || 0;
    return this.files[keys[Math.abs(id) % keys.length]];
  },
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
  contact: (payload) => apiPost("/contact", payload),
  posts: async (params) => {
    try {
      return await apiGet("/blog", params);
    } catch (_error) {
      return fallbackBlog(params);
    }
  },
  post: async (key) => {
    try {
      return await apiGet(`/blog/${encodeURIComponent(key)}`);
    } catch (_error) {
      return fallbackPost(key);
    }
  },
  login: (user, password) => apiPost("/admin/login", { user, password }),
  adminCompanies: (token, params) => {
    const query = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const suffix = query.toString() ? `?${query}` : "";
    return apiSend("GET", `/admin/companies${suffix}`, null, token);
  },
  adminCompany: (token, id) => apiSend("GET", `/admin/companies/${encodeURIComponent(id)}`, null, token),
  adminApplications: (token) => apiSend("GET", "/admin/applications", null, token),
  adminMessages: (token) => apiSend("GET", "/admin/messages", null, token),
  adminApplication: (token, id) => apiSend("GET", `/admin/applications/${encodeURIComponent(id)}`, null, token),
  adminApprove: (token, id) => apiSend("POST", `/admin/applications/${encodeURIComponent(id)}/approve`, {}, token),
  adminReject: (token, id, reason) =>
    apiSend("POST", `/admin/applications/${encodeURIComponent(id)}/reject`, { reason: reason || "" }, token),
  adminSetExpiry: (token, id, expiresAt) =>
    apiSend("POST", `/admin/companies/${encodeURIComponent(id)}/expiration`, { expires_at: expiresAt }, token),
  adminExpireNow: (token, id) => apiSend("POST", `/admin/companies/${encodeURIComponent(id)}/expire`, {}, token),
  adminPosts: (token) => apiSend("GET", "/admin/posts", null, token),
  adminPost: (token, id) => apiSend("GET", `/admin/posts/${encodeURIComponent(id)}`, null, token),
  adminSavePost: (token, payload, id) =>
    id
      ? apiSend("POST", `/admin/posts/${encodeURIComponent(id)}`, payload, token)
      : apiSend("POST", "/admin/posts", payload, token),
  adminDeletePost: (token, id) => apiSend("POST", `/admin/posts/${encodeURIComponent(id)}/delete`, {}, token),
  adminUsers: (token) => apiSend("GET", "/admin/users", null, token),
  adminCreateUser: (token, payload) => apiSend("POST", "/admin/users", payload, token),
  adminDeleteUser: (token, username) =>
    apiSend("POST", `/admin/users/${encodeURIComponent(username)}/delete`, {}, token),
};
