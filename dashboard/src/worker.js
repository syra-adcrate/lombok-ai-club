// Cloudflare Worker port of server.js
// Data: D1 table `collections` (name TEXT PRIMARY KEY, data TEXT) holding the
// same four JSON arrays server.js kept in data/*.json.
// Media: Workers KV (binding MEDIA), served under /uploads/<filename>.
// (R2 isn't enabled on this account; KV caps values at 25 MiB — swap the
// MEDIA binding to an R2 bucket once R2 is enabled in the dashboard.)
// Static frontend: ./public via the assets binding (wrangler.jsonc).

const MAX_UPLOAD = 25 * 1024 * 1024 - 1024; // KV value limit is 25 MiB

const json = (data, status = 200) => Response.json(data, { status });
const err = (message, status = 400) => json({ error: message }, status);

function randHex(n) {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function getCollection(env, name) {
  const row = await env.DB.prepare('SELECT data FROM collections WHERE name = ?')
    .bind(name)
    .first();
  if (!row) return [];
  try {
    return JSON.parse(row.data);
  } catch {
    return [];
  }
}

async function putCollection(env, name, data) {
  await env.DB.prepare(
    'INSERT INTO collections (name, data) VALUES (?1, ?2) ON CONFLICT(name) DO UPDATE SET data = ?2'
  )
    .bind(name, JSON.stringify(data))
    .run();
}

// ---- Media serving (KV) ----
async function serveMedia(env, key, request) {
  const { value, metadata } = await env.MEDIA.getWithMetadata(key, 'arrayBuffer');
  if (!value) return new Response('Not found', { status: 404 });
  const headers = new Headers({
    'content-type': (metadata && metadata.contentType) || 'application/octet-stream',
    'accept-ranges': 'bytes',
    'cache-control': 'public, max-age=31536000, immutable',
  });
  // Manual byte-range support so <video> seeking works (Safari requires it)
  const range = request.headers.get('range');
  const m = range && range.match(/^bytes=(\d*)-(\d*)$/);
  if (m && (m[1] || m[2])) {
    const size = value.byteLength;
    let start = m[1] ? parseInt(m[1], 10) : size - parseInt(m[2], 10);
    let end = m[1] && m[2] ? parseInt(m[2], 10) : size - 1;
    start = Math.max(0, start);
    end = Math.min(end, size - 1);
    if (start > end || start >= size) {
      return new Response('Range not satisfiable', { status: 416, headers: { 'content-range': `bytes */${size}` } });
    }
    headers.set('content-range', `bytes ${start}-${end}/${size}`);
    return new Response(value.slice(start, end + 1), { status: 206, headers });
  }
  return new Response(value, { status: 200, headers });
}

// ---- Assets ----
async function handleUpload(env, request) {
  const form = await request.formData();
  const files = form.getAll('files').filter((f) => typeof f !== 'string');
  const assets = await getCollection(env, 'assets');
  const added = [];
  for (const f of files.slice(0, 30)) {
    if (!/^(image|video)\//.test(f.type)) continue;
    if (f.size > MAX_UPLOAD) continue;
    const safe = f.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = `${Date.now()}-${randHex(6)}-${safe}`;
    await env.MEDIA.put(filename, await f.arrayBuffer(), { metadata: { contentType: f.type } });
    added.push({
      id: randHex(8),
      filename,
      originalName: f.name,
      url: `/uploads/${filename}`,
      type: f.type.startsWith('video/') ? 'video' : 'photo',
      mimetype: f.type,
      size: f.size,
      tags: [],
      notes: '',
      uploadedAt: new Date().toISOString(),
    });
  }
  assets.unshift(...added);
  await putCollection(env, 'assets', assets);
  return json(added);
}

// Import media from a URL (Pinterest pin pages or direct image/video links)
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const EXT_BY_TYPE = {
  'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif',
  'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov',
};

function extractMediaUrl(html) {
  // attribute order varies by site (Pinterest puts content before property)
  const getMeta = (key) => {
    const tag = html.match(new RegExp(`<meta[^>]*(?:property|name)=["']${key}["'][^>]*>`, 'i'));
    if (!tag) return null;
    const c = tag[0].match(/content=["']([^"']+)["']/i);
    return c ? c[1].replace(/&amp;/g, '&') : null;
  };
  for (const k of ['og:video:secure_url', 'og:video:url', 'og:video', 'twitter:player:stream']) {
    const v = getMeta(k);
    if (v) return v;
  }
  const vidJson = html.match(/"url":"(https:\\?\/\\?\/v1?\.pinimg\.com[^"]+?\.mp4[^"]*)"/i);
  if (vidJson) return vidJson[1].replace(/\\\//g, '/');
  for (const k of ['og:image', 'twitter:image', 'twitter:image:src']) {
    const v = getMeta(k);
    if (v) return v;
  }
  return null;
}

async function handleImportUrl(env, body) {
  const pageUrl = String(body.url || '').trim();
  if (!/^https?:\/\//i.test(pageUrl)) return err('Enter a valid http(s) URL');

  let mediaUrl = pageUrl;
  let r = await fetch(pageUrl, { headers: { 'User-Agent': UA }, redirect: 'follow' });
  if (!r.ok) return err(`Fetch failed (${r.status})`);
  let type = (r.headers.get('content-type') || '').split(';')[0].trim();

  if (type.startsWith('text/html')) {
    const html = await r.text();
    mediaUrl = extractMediaUrl(html);
    if (!mediaUrl) return err('No image or video found on that page — try the direct media URL');
    r = await fetch(mediaUrl, { headers: { 'User-Agent': UA, Referer: pageUrl }, redirect: 'follow' });
    if (!r.ok) return err(`Media fetch failed (${r.status})`);
    type = (r.headers.get('content-type') || '').split(';')[0].trim();
  }

  if (!/^(image|video)\//.test(type)) return err(`Unsupported content type: ${type || 'unknown'}`);
  const buf = await r.arrayBuffer();
  if (buf.byteLength > MAX_UPLOAD) return err('File too large (95MB max on this deployment)');

  const ext = EXT_BY_TYPE[type] || (type.startsWith('image/') ? '.jpg' : '.mp4');
  const base = (new URL(mediaUrl).pathname.split('/').pop() || 'import')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.[a-z0-9]+$/i, '');
  const filename = `${Date.now()}-${randHex(6)}-${base}${ext}`;
  await env.MEDIA.put(filename, buf, { metadata: { contentType: type } });

  const host = new URL(pageUrl).hostname;
  const isPinterest = /pinterest\.|pinimg\./i.test(host) || /pinimg\./i.test(mediaUrl);
  const assets = await getCollection(env, 'assets');
  const asset = {
    id: randHex(8),
    filename,
    originalName: base + ext,
    url: `/uploads/${filename}`,
    type: type.startsWith('video/') ? 'video' : 'photo',
    mimetype: type,
    size: buf.byteLength,
    tags: [isPinterest ? 'pinterest' : 'imported', 'reference'],
    notes: '',
    sourceUrl: pageUrl,
    uploadedAt: new Date().toISOString(),
  };
  assets.unshift(asset);
  await putCollection(env, 'assets', assets);
  return json(asset);
}

// ---- Schedule helpers ----
const CHANNELS = ['instagram', 'tiktok', 'facebook', 'linkedin', 'x', 'youtube', 'threads'];
const POST_STATUSES = ['draft', 'scheduled', 'sent'];

function sanitizePost(body, existing = {}) {
  const p = { ...existing };
  if (typeof body.title === 'string') p.title = body.title;
  if (typeof body.text === 'string') p.text = body.text;
  if (typeof body.scheduledAt === 'string' && !isNaN(Date.parse(body.scheduledAt))) p.scheduledAt = body.scheduledAt;
  if (Array.isArray(body.channels)) p.channels = body.channels.filter((c) => CHANNELS.includes(c));
  if (POST_STATUSES.includes(body.status)) p.status = body.status;
  if (typeof body.link === 'string') p.link = body.link;
  if ('remixId' in body) p.remixId = body.remixId || null;
  if (typeof body.bufferId === 'string') p.bufferId = body.bufferId;
  if (typeof body.source === 'string') p.source = body.source;
  return p;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    try {
      // ---- Uploaded media ----
      if (pathname.startsWith('/uploads/')) {
        const key = decodeURIComponent(pathname.slice('/uploads/'.length));
        if (!key || key.includes('/')) return new Response('Not found', { status: 404 });
        return serveMedia(env, key, request);
      }

      if (!pathname.startsWith('/api/')) {
        // Anything else falls through to static assets via the ASSETS binding.
        return env.ASSETS.fetch(request);
      }

      const seg = pathname.split('/').filter(Boolean); // ['api', resource, id?]
      const resource = seg[1];
      const id = seg[2] ? decodeURIComponent(seg[2]) : null;
      const body = method === 'PATCH' || (method === 'POST' && resource !== 'upload')
        ? await request.json().catch(() => ({}))
        : null;

      // ---- Assets ----
      if (resource === 'assets' && method === 'GET' && !id) {
        return json(await getCollection(env, 'assets'));
      }
      if (resource === 'upload' && method === 'POST') {
        return handleUpload(env, request);
      }
      if (resource === 'import-url' && method === 'POST') {
        return handleImportUrl(env, body);
      }
      if (resource === 'assets' && id && method === 'PATCH') {
        const assets = await getCollection(env, 'assets');
        const asset = assets.find((a) => a.id === id);
        if (!asset) return err('not found', 404);
        if (Array.isArray(body.tags)) asset.tags = body.tags;
        if (typeof body.notes === 'string') asset.notes = body.notes;
        await putCollection(env, 'assets', assets);
        return json(asset);
      }
      if (resource === 'assets' && id && method === 'DELETE') {
        let assets = await getCollection(env, 'assets');
        const asset = assets.find((a) => a.id === id);
        if (!asset) return err('not found', 404);
        assets = assets.filter((a) => a.id !== id);
        await putCollection(env, 'assets', assets);
        await env.MEDIA.delete(asset.filename).catch(() => {});
        return json({ ok: true });
      }

      // ---- Outliers ----
      if (resource === 'outliers' && method === 'GET' && !id) {
        return json(await getCollection(env, 'outliers'));
      }
      if (resource === 'outliers' && id && method === 'PATCH') {
        const outliers = await getCollection(env, 'outliers');
        const o = outliers.find((x) => x.id === id);
        if (!o) return err('not found', 404);
        if (body.myScore !== undefined) o.myScore = Number(body.myScore);
        if (typeof body.status === 'string') o.status = body.status;
        if (typeof body.myNotes === 'string') o.myNotes = body.myNotes;
        await putCollection(env, 'outliers', outliers);
        return json(o);
      }

      // ---- Remix briefs ----
      if (resource === 'remixes' && method === 'GET' && !id) {
        return json(await getCollection(env, 'remixes'));
      }
      if (resource === 'remixes' && method === 'POST' && !id) {
        const remixes = await getCollection(env, 'remixes');
        const remix = {
          id: randHex(8),
          outlierId: body.outlierId || null,
          assetIds: Array.isArray(body.assetIds) ? body.assetIds : [],
          title: body.title || 'Untitled remix',
          hook: body.hook || '',
          plan: body.plan || '',
          status: 'idea',
          createdAt: new Date().toISOString(),
        };
        remixes.unshift(remix);
        await putCollection(env, 'remixes', remixes);
        return json(remix);
      }
      if (resource === 'remixes' && id && method === 'PATCH') {
        const remixes = await getCollection(env, 'remixes');
        const r = remixes.find((x) => x.id === id);
        if (!r) return err('not found', 404);
        ['title', 'hook', 'plan', 'status'].forEach((k) => {
          if (typeof body[k] === 'string') r[k] = body[k];
        });
        if (Array.isArray(body.assetIds)) r.assetIds = body.assetIds;
        await putCollection(env, 'remixes', remixes);
        return json(r);
      }
      if (resource === 'remixes' && id && method === 'DELETE') {
        let remixes = await getCollection(env, 'remixes');
        if (!remixes.some((x) => x.id === id)) return err('not found', 404);
        remixes = remixes.filter((x) => x.id !== id);
        await putCollection(env, 'remixes', remixes);
        return json({ ok: true });
      }

      // ---- Schedule (content calendar; posts synced from Buffer land here too) ----
      if (resource === 'schedule' && method === 'GET' && !id) {
        return json(await getCollection(env, 'schedule'));
      }
      if (resource === 'schedule' && method === 'POST' && !id) {
        if (!body.scheduledAt || isNaN(Date.parse(body.scheduledAt))) {
          return err('scheduledAt (ISO date) is required');
        }
        const posts = await getCollection(env, 'schedule');
        const post = {
          id: randHex(8),
          source: 'manual',
          status: 'draft',
          channels: [],
          title: '',
          text: '',
          remixId: null,
          createdAt: new Date().toISOString(),
          ...sanitizePost(body),
        };
        posts.push(post);
        await putCollection(env, 'schedule', posts);
        return json(post);
      }
      // Bulk upsert keyed on bufferId — the Buffer sync session posts the queue here
      if (resource === 'schedule' && id === 'import' && method === 'POST') {
        const incoming = Array.isArray(body) ? body : body.posts;
        if (!Array.isArray(incoming)) return err('Expected an array of posts (or { posts: [...] })');
        const posts = await getCollection(env, 'schedule');
        let added = 0, updated = 0;
        for (const raw of incoming) {
          if (!raw || typeof raw.bufferId !== 'string' || !raw.scheduledAt) continue;
          const existing = posts.find((p) => p.bufferId === raw.bufferId);
          if (existing) {
            Object.assign(existing, sanitizePost(raw, existing));
            updated++;
          } else {
            posts.push({
              id: randHex(8),
              source: 'buffer',
              status: 'scheduled',
              channels: [],
              title: '',
              text: '',
              remixId: null,
              createdAt: new Date().toISOString(),
              ...sanitizePost(raw),
              bufferId: raw.bufferId,
            });
            added++;
          }
        }
        await putCollection(env, 'schedule', posts);
        return json({ added, updated, total: posts.length });
      }
      if (resource === 'schedule' && id && method === 'PATCH') {
        const posts = await getCollection(env, 'schedule');
        const post = posts.find((p) => p.id === id);
        if (!post) return err('not found', 404);
        Object.assign(post, sanitizePost(body, post));
        await putCollection(env, 'schedule', posts);
        return json(post);
      }
      if (resource === 'schedule' && id && method === 'DELETE') {
        let posts = await getCollection(env, 'schedule');
        if (!posts.some((p) => p.id === id)) return err('not found', 404);
        posts = posts.filter((p) => p.id !== id);
        await putCollection(env, 'schedule', posts);
        return json({ ok: true });
      }

      return err('not found', 404);
    } catch (e) {
      return err(e.message || 'Internal error', 500);
    }
  },
};
