// Appels à l'API. L'en-tête X-Requested-With est exigé par le serveur pour
// toute écriture : un site tiers ne peut pas l'ajouter (protection CSRF).

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function request(method, url, body) {
  const opts = { method, headers: { 'X-Requested-With': 'outil-devis' }, credentials: 'same-origin' };
  if (body instanceof FormData) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401 && !url.startsWith('/api/auth/login')) {
    location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    // La page est quittée : on suspend le script plutôt que de lever une erreur.
    return new Promise(() => {});
  }
  const data = res.headers.get('content-type')?.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, data?.error || `Erreur ${res.status}`);
  return data;
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body = {}) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  patch: (url, body) => request('PATCH', url, body),
  del: (url, body) => request('DELETE', url, body),
  upload: (url, formData) => request('POST', url, formData),
};
