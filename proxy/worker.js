/**
 * ppsx-proxy — intermediario para el Reproductor PPSX (Cloudflare Worker)
 *
 * Descarga una presentación (.ppsx / .pptx) compartida en Google Drive, OneDrive,
 * SharePoint o Dropbox y se la entrega al reproductor con permiso CORS, para que
 * el reproductor la dibuje con su propio motor (audio con clic, botones, animaciones).
 *
 * Uso:   https://TU-WORKER.workers.dev/?url=<enlace compartido>
 * Prueba: abre https://TU-WORKER.workers.dev/ y debe decir "ppsx-proxy funcionando".
 */

/* ======================= CONFIGURACIÓN ======================= */

// Sitios donde está el reproductor que pueden usar este intermediario.
// (Es la dirección del reproductor, no la del LMS.) Lista vacía [] = cualquiera.
const ALLOWED_ORIGINS = [
  'https://dnl666.github.io',
];

// Otros servidores (además de Drive, OneDrive, SharePoint y Dropbox) de los que se permite descargar.
// Ejemplo: ['archivos.miempresa.com']
const EXTRA_HOSTS = [];

const MAX_MB = 150;          // tamaño máximo del archivo
const CACHE_SECONDS = 600;   // cuánto tiempo se guarda una copia (10 min)

/* ============================================================= */

const PPT_NAME = /\.(ppsx|pptx|ppsm|pptm|potx|potm)$/i;
const PPT_TYPE = /presentationml|powerpoint|zip|octet-stream/i;
const MIME = {
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';
const ONEDRIVE_APP = '5cbed6ac-a083-4e14-b191-b4ba07653de2'; // visor web público de OneDrive

export default {
  async fetch(request, env, ctx) {
    const reqUrl = new URL(request.url);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail(405, 'Método no permitido.', cors);

    const src = reqUrl.searchParams.get('url') || reqUrl.searchParams.get('src');
    if (!src) {
      return new Response('ppsx-proxy funcionando.\nUso: ' + reqUrl.origin + '/?url=<enlace de Google Drive, OneDrive, SharePoint o Dropbox>\n',
        { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (origin && !originAllowed(origin)) {
      return fail(403, 'Este sitio (' + origin + ') no está autorizado para usar el intermediario. Agrégalo en ALLOWED_ORIGINS.', cors);
    }

    let target;
    try { target = new URL(src); } catch (_) { return fail(400, 'El enlace no es válido.', cors); }
    if (target.protocol !== 'https:') return fail(400, 'Solo se aceptan enlaces https.', cors);

    // Copia en caché (si la plataforma la ofrece)
    const cacheKey = new Request('https://ppsx-proxy.cache/' + encodeURIComponent(target.href));
    let cache = null;
    try { cache = caches.default; } catch (_) { cache = null; }
    if (cache) {
      try {
        const hit = await cache.match(cacheKey);
        if (hit) return respond(hit, cors, request.method, 'HIT');
      } catch (_) { /* sin caché */ }
    }

    let file;
    try {
      file = await download(target);
    } catch (e) {
      return fail(e.status || 502, e.message || 'No se pudo descargar el archivo.', cors);
    }

    let out;
    try {
      out = finalize(file.res, file.name);
    } catch (e) {
      return fail(e.status || 502, e.message, cors);
    }
    if (cache && ctx && ctx.waitUntil) {
      try { ctx.waitUntil(cache.put(cacheKey, out.clone()).catch(() => {})); } catch (_) { /* sin caché */ }
    }
    return respond(out, cors, request.method, 'MISS');
  },
};

/* ---------------- Respuestas ---------------- */
function originAllowed(origin) {
  return ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin);
}
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.length === 0 ? '*' : (origin && originAllowed(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Length, X-Filename, X-Cache',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}
function fail(status, message, cors) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
function respond(res, cors, method, cacheState) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(cors)) h.set(k, v);
  h.set('X-Cache', cacheState);
  return new Response(method === 'HEAD' ? null : res.body, { status: 200, headers: h });
}
function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

/* Revisa que sea una presentación y arma la respuesta final */
function finalize(up, knownName) {
  const len = parseInt(up.headers.get('content-length') || '0', 10) || 0;
  if (len > MAX_MB * 1048576) throw httpError(413, 'El archivo supera el límite de ' + MAX_MB + ' MB.');
  const name = fileNameFrom(up) || knownName || '';
  const type = up.headers.get('content-type') || '';
  if (/text\/html/i.test(type)) throw httpError(403, 'El servicio devolvió una página en lugar del archivo. Revisa que el enlace sea público.');
  if (name && !PPT_NAME.test(name)) throw httpError(415, 'El archivo no es una presentación .ppsx o .pptx (' + name + ').');
  if (!name && !PPT_TYPE.test(type)) throw httpError(415, 'El enlace no apunta a una presentación .ppsx o .pptx.');
  const ext = (name.match(PPT_NAME) || [])[1];
  const h = new Headers();
  h.set('Content-Type', (ext && MIME[ext.toLowerCase()]) || 'application/octet-stream');
  if (len) h.set('Content-Length', String(len));
  if (name) h.set('X-Filename', encodeURIComponent(name));
  h.set('Cache-Control', 'public, max-age=' + CACHE_SECONDS);
  return new Response(up.body, { status: 200, headers: h });
}
function fileNameFrom(res) {
  const cd = res.headers.get('content-disposition') || '';
  let m = cd.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/);
  if (m) { try { return decodeURIComponent(m[1].trim().replace(/^"|"$/g, '')); } catch (_) { /* sigue */ } }
  m = cd.match(/filename\s*=\s*"([^"]+)"/) || cd.match(/filename\s*=\s*([^;]+)/);
  if (m) return m[1].trim();
  try {
    const last = decodeURIComponent(new URL(res.url).pathname.split('/').pop() || '');
    if (PPT_NAME.test(last)) return last;
  } catch (_) { /* sin nombre */ }
  return '';
}
function isHtml(res) {
  return /text\/html/i.test(res.headers.get('content-type') || '');
}
function get(url, init = {}) {
  return fetch(url, { redirect: 'follow', ...init, headers: { 'User-Agent': UA, 'Accept': '*/*', ...(init.headers || {}) } });
}

/* ---------------- Por servicio ---------------- */
async function download(u) {
  const host = u.hostname.toLowerCase();
  if (host === 'drive.google.com' || host === 'docs.google.com' || host === 'drive.usercontent.google.com') return fromGoogle(u);
  if (host === '1drv.ms' || host === 'onedrive.live.com' || host.endsWith('.onedrive.live.com') || host === 'my.microsoftpersonalcontent.com') return fromOneDrive(u);
  if (host.endsWith('.sharepoint.com') || host.endsWith('.sharepoint.us')) return fromSharePoint(u);
  if (host === 'www.dropbox.com' || host === 'dropbox.com' || host === 'dl.dropboxusercontent.com') return fromDropbox(u);
  if (EXTRA_HOSTS.includes(host)) {
    const r = await get(u.href);
    if (!r.ok) throw httpError(502, 'El servidor respondió ' + r.status + '.');
    return { res: r };
  }
  throw httpError(400, 'Solo se aceptan enlaces de Google Drive, OneDrive, SharePoint o Dropbox (' + host + ' no está permitido).');
}

/* Google Drive: el archivo debe estar compartido como "Cualquier persona con el enlace" */
function driveId(u) {
  const m = u.pathname.match(/\/d\/([\w-]{10,})/);
  return (m && m[1]) || u.searchParams.get('id') || '';
}
async function fromGoogle(u) {
  const id = driveId(u);
  if (!/^[\w-]{10,}$/.test(id)) throw httpError(400, 'No se encontró el identificador del archivo en el enlace de Google Drive.');
  const rk = u.searchParams.get('resourcekey');
  const extra = rk ? '&resourcekey=' + encodeURIComponent(rk) : '';

  let r = await get('https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t' + extra);
  if (r.ok && !isHtml(r)) return { res: r };

  let html = '';
  try { html = await r.text(); } catch (_) { html = ''; }

  // Aviso de "no se pudo analizar en busca de virus": se confirma con el formulario de la página
  const form = html.match(/<form[^>]+id="download-form"[^>]+action="([^"]+)"[\s\S]*?<\/form>/i);
  if (form) {
    const action = new URL(form[1].replace(/&amp;/g, '&'));
    for (const inp of form[0].matchAll(/<input[^>]+type="hidden"[^>]*>/gi)) {
      const n = (inp[0].match(/name="([^"]+)"/) || [])[1];
      const v = (inp[0].match(/value="([^"]*)"/) || [])[1];
      if (n) action.searchParams.set(n, (v || '').replace(/&amp;/g, '&'));
    }
    r = await get(action.href);
    if (r.ok && !isHtml(r)) return { res: r };
    try { html = await r.text(); } catch (_) { /* sigue */ }
  }

  // Presentación nativa de Google Slides → se exporta como .pptx
  const ex = await get('https://docs.google.com/presentation/d/' + id + '/export/pptx');
  if (ex.ok && !isHtml(ex)) return { res: ex, name: 'presentacion.pptx' };

  if (/too many users|demasiados usuarios|quota/i.test(html)) {
    throw httpError(429, 'Google Drive limitó las descargas de este archivo por exceso de visitas. Intenta más tarde o aloja el archivo en otro lugar.');
  }
  throw httpError(403, 'Google Drive no entregó el archivo. Compártelo como "Cualquier persona con el enlace" (Lector).');
}

/* OneDrive personal: mismo acceso anónimo que usa el visor web de OneDrive */
let odToken = null;
async function oneDriveToken() {
  if (odToken && odToken.exp > Date.now() + 120000) return odToken.token;
  const r = await get('https://api-badgerp.svc.ms/v1.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appId: ONEDRIVE_APP }),
  });
  if (!r.ok) throw httpError(502, 'OneDrive no respondió (' + r.status + ').');
  const j = await r.json();
  odToken = { token: j.token, exp: Date.parse(j.expiryTimeUtc) || Date.now() + 3600000 };
  return odToken.token;
}
function b64url(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}
async function oneDriveShareIds(u) {
  const ids = [];
  const redeem = u.searchParams.get('redeem');
  if (redeem) ids.push(redeem);
  ids.push(b64url(u.origin + u.pathname));
  if (u.search) ids.push(b64url(u.href));
  if (u.hostname === '1drv.ms') {
    try {
      const r = await fetch(u.href, { redirect: 'manual', headers: { 'User-Agent': UA } });
      const loc = r.headers.get('location');
      if (loc) {
        const rd = new URL(loc, u.href).searchParams.get('redeem');
        if (rd) ids.push(rd);
      }
    } catch (_) { /* sigue */ }
  }
  return [...new Set(ids)];
}
async function fromOneDrive(u) {
  const token = await oneDriveToken();
  const auth = { Authorization: 'Badger ' + token, Prefer: 'autoredeem' };
  let last = 'OneDrive no entregó el archivo. Revisa que el enlace sea público ("Cualquier persona con el vínculo").';
  for (const id of await oneDriveShareIds(u)) {
    const meta = await get('https://my.microsoftpersonalcontent.com/_api/v2.0/shares/u!' + id +
      '/driveitem?$select=name,size,@content.downloadUrl', { headers: auth });
    if (!meta.ok) { last = 'OneDrive respondió ' + meta.status + ' al buscar el archivo. Revisa que el enlace sea público.'; continue; }
    const item = await meta.json();
    if (item.size > MAX_MB * 1048576) throw httpError(413, 'El archivo supera el límite de ' + MAX_MB + ' MB.');
    const dl = item['@content.downloadUrl'];
    if (!dl) { last = 'OneDrive no permite descargar este archivo.'; continue; }
    const r = await get(dl);
    if (r.ok) return { res: r, name: item.name };
    last = 'OneDrive respondió ' + r.status + ' al descargar.';
  }
  throw httpError(502, last);
}

/* SharePoint / OneDrive empresarial: enlace "Cualquier persona" + download=1 */
async function fromSharePoint(u) {
  const d = new URL(u.href);
  d.searchParams.set('download', '1');
  const r = await get(d.href);
  if (!r.ok || isHtml(r)) throw httpError(403, 'SharePoint no entregó el archivo. El enlace debe ser de tipo "Cualquier persona".');
  return { res: r };
}

/* Dropbox: enlace compartido → descarga directa */
async function fromDropbox(u) {
  const d = new URL(u.href);
  if (d.hostname !== 'dl.dropboxusercontent.com') {
    d.searchParams.delete('dl');
    d.searchParams.set('dl', '1');
  }
  const r = await get(d.href);
  if (!r.ok || isHtml(r)) throw httpError(403, 'Dropbox no entregó el archivo. Revisa que el enlace sea público.');
  return { res: r };
}
