// client/src/util/api.js
function asJson(res) {
  const ct = res.headers.get('content-type') || '';
  const isJson = ct.includes('application/json');
  if (!isJson) return res.text().then(txt => {
    const err = new Error(`Unerwartete Antwort (Content-Type: ${ct}): ${txt?.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  });
  return res.json();
}

async function request(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'include',                // <<< WICHTIG: Cookies mitsenden
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let payload;
    try { payload = await asJson(res); } catch { /* ignore */ }
    const err = new Error(payload?.error || payload?.message || `${method} ${url} failed (${res.status})`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return asJson(res);
}

export const api = {
  get: (url) => request('GET', url),
  post: (url, body) => request('POST', url, body),
  put: (url, body) => request('PUT', url, body),
  del: (url, body) => request('DELETE', url, body)
};

export function fmt(dateLike) {
  if (!dateLike) return '';
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return String(dateLike);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth()+1)}.${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default api;
