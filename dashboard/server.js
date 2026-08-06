const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 4321;

const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const ASSETS_FILE = path.join(DATA_DIR, 'assets.json');
const OUTLIERS_FILE = path.join(DATA_DIR, 'outliers.json');
const REMIXES_FILE = path.join(DATA_DIR, 'remixes.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

if (!fs.existsSync(ASSETS_FILE)) writeJson(ASSETS_FILE, []);
if (!fs.existsSync(REMIXES_FILE)) writeJson(REMIXES_FILE, []);
if (!fs.existsSync(OUTLIERS_FILE)) writeJson(OUTLIERS_FILE, []);
if (!fs.existsSync(SCHEDULE_FILE)) writeJson(SCHEDULE_FILE, []);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const id = crypto.randomBytes(6).toString('hex');
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${id}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /^(image|video)\//.test(file.mimetype);
    cb(ok ? null : new Error('Only image and video files are allowed'), ok);
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// ---- Assets ----
app.get('/api/assets', (req, res) => {
  res.json(readJson(ASSETS_FILE, []));
});

app.post('/api/upload', upload.array('files', 30), (req, res) => {
  const assets = readJson(ASSETS_FILE, []);
  const added = (req.files || []).map((f) => ({
    id: crypto.randomBytes(8).toString('hex'),
    filename: f.filename,
    originalName: f.originalname,
    url: `/uploads/${f.filename}`,
    type: f.mimetype.startsWith('video/') ? 'video' : 'photo',
    mimetype: f.mimetype,
    size: f.size,
    tags: [],
    notes: '',
    uploadedAt: new Date().toISOString(),
  }));
  assets.unshift(...added);
  writeJson(ASSETS_FILE, assets);
  res.json(added);
});

// Import media from a URL (Pinterest pin pages or direct image/video links)
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
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

app.post('/api/import-url', async (req, res) => {
  try {
    const pageUrl = String(req.body.url || '').trim();
    if (!/^https?:\/\//i.test(pageUrl)) return res.status(400).json({ error: 'Enter a valid http(s) URL' });

    let mediaUrl = pageUrl;
    let r = await fetch(pageUrl, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!r.ok) return res.status(400).json({ error: `Fetch failed (${r.status})` });
    let type = (r.headers.get('content-type') || '').split(';')[0].trim();

    if (type.startsWith('text/html')) {
      const html = await r.text();
      mediaUrl = extractMediaUrl(html);
      if (!mediaUrl) return res.status(400).json({ error: 'No image or video found on that page — try the direct media URL' });
      r = await fetch(mediaUrl, { headers: { 'User-Agent': UA, Referer: pageUrl }, redirect: 'follow' });
      if (!r.ok) return res.status(400).json({ error: `Media fetch failed (${r.status})` });
      type = (r.headers.get('content-type') || '').split(';')[0].trim();
    }

    if (!/^(image|video)\//.test(type)) return res.status(400).json({ error: `Unsupported content type: ${type || 'unknown'}` });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 500 * 1024 * 1024) return res.status(400).json({ error: 'File too large (500MB max)' });

    const ext = EXT_BY_TYPE[type] || (type.startsWith('image/') ? '.jpg' : '.mp4');
    const base = (new URL(mediaUrl).pathname.split('/').pop() || 'import')
      .replace(/[^a-zA-Z0-9._-]/g, '_').replace(/\.[a-z0-9]+$/i, '');
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${base}${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, filename), buf);

    const host = new URL(pageUrl).hostname;
    const isPinterest = /pinterest\.|pinimg\./i.test(host) || /pinimg\./i.test(mediaUrl);
    const assets = readJson(ASSETS_FILE, []);
    const asset = {
      id: crypto.randomBytes(8).toString('hex'),
      filename,
      originalName: base + ext,
      url: `/uploads/${filename}`,
      type: type.startsWith('video/') ? 'video' : 'photo',
      mimetype: type,
      size: buf.length,
      tags: [isPinterest ? 'pinterest' : 'imported', 'reference'],
      notes: '',
      sourceUrl: pageUrl,
      uploadedAt: new Date().toISOString(),
    };
    assets.unshift(asset);
    writeJson(ASSETS_FILE, assets);
    res.json(asset);
  } catch (e) {
    res.status(500).json({ error: e.message || 'Import failed' });
  }
});

app.patch('/api/assets/:id', (req, res) => {
  const assets = readJson(ASSETS_FILE, []);
  const asset = assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'not found' });
  if (Array.isArray(req.body.tags)) asset.tags = req.body.tags;
  if (typeof req.body.notes === 'string') asset.notes = req.body.notes;
  writeJson(ASSETS_FILE, assets);
  res.json(asset);
});

app.delete('/api/assets/:id', (req, res) => {
  let assets = readJson(ASSETS_FILE, []);
  const asset = assets.find((a) => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: 'not found' });
  assets = assets.filter((a) => a.id !== req.params.id);
  writeJson(ASSETS_FILE, assets);
  const filePath = path.join(UPLOAD_DIR, path.basename(asset.filename));
  fs.rm(filePath, { force: true }, () => {});
  res.json({ ok: true });
});

// ---- Outliers ----
app.get('/api/outliers', (req, res) => {
  res.json(readJson(OUTLIERS_FILE, []));
});

app.patch('/api/outliers/:id', (req, res) => {
  const outliers = readJson(OUTLIERS_FILE, []);
  const o = outliers.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'not found' });
  if (req.body.myScore !== undefined) o.myScore = Number(req.body.myScore);
  if (typeof req.body.status === 'string') o.status = req.body.status;
  if (typeof req.body.myNotes === 'string') o.myNotes = req.body.myNotes;
  writeJson(OUTLIERS_FILE, outliers);
  res.json(o);
});

// ---- Remix briefs ----
app.get('/api/remixes', (req, res) => {
  res.json(readJson(REMIXES_FILE, []));
});

app.post('/api/remixes', (req, res) => {
  const remixes = readJson(REMIXES_FILE, []);
  const remix = {
    id: crypto.randomBytes(8).toString('hex'),
    outlierId: req.body.outlierId || null,
    assetIds: Array.isArray(req.body.assetIds) ? req.body.assetIds : [],
    title: req.body.title || 'Untitled remix',
    hook: req.body.hook || '',
    plan: req.body.plan || '',
    status: 'idea',
    createdAt: new Date().toISOString(),
  };
  remixes.unshift(remix);
  writeJson(REMIXES_FILE, remixes);
  res.json(remix);
});

app.patch('/api/remixes/:id', (req, res) => {
  const remixes = readJson(REMIXES_FILE, []);
  const r = remixes.find((x) => x.id === req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  ['title', 'hook', 'plan', 'status'].forEach((k) => {
    if (typeof req.body[k] === 'string') r[k] = req.body[k];
  });
  if (Array.isArray(req.body.assetIds)) r.assetIds = req.body.assetIds;
  writeJson(REMIXES_FILE, remixes);
  res.json(r);
});

app.delete('/api/remixes/:id', (req, res) => {
  let remixes = readJson(REMIXES_FILE, []);
  if (!remixes.some((x) => x.id === req.params.id)) return res.status(404).json({ error: 'not found' });
  remixes = remixes.filter((x) => x.id !== req.params.id);
  writeJson(REMIXES_FILE, remixes);
  res.json({ ok: true });
});

// ---- Schedule (content calendar; posts synced from Buffer land here too) ----
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

app.get('/api/schedule', (req, res) => {
  res.json(readJson(SCHEDULE_FILE, []));
});

app.post('/api/schedule', (req, res) => {
  if (!req.body.scheduledAt || isNaN(Date.parse(req.body.scheduledAt))) {
    return res.status(400).json({ error: 'scheduledAt (ISO date) is required' });
  }
  const posts = readJson(SCHEDULE_FILE, []);
  const post = {
    id: crypto.randomBytes(8).toString('hex'),
    source: 'manual',
    status: 'draft',
    channels: [],
    title: '',
    text: '',
    remixId: null,
    createdAt: new Date().toISOString(),
    ...sanitizePost(req.body),
  };
  posts.push(post);
  writeJson(SCHEDULE_FILE, posts);
  res.json(post);
});

// Bulk upsert keyed on bufferId — the Buffer sync session posts the queue here
app.post('/api/schedule/import', (req, res) => {
  const incoming = Array.isArray(req.body) ? req.body : req.body.posts;
  if (!Array.isArray(incoming)) return res.status(400).json({ error: 'Expected an array of posts (or { posts: [...] })' });
  const posts = readJson(SCHEDULE_FILE, []);
  let added = 0, updated = 0;
  for (const raw of incoming) {
    if (!raw || typeof raw.bufferId !== 'string' || !raw.scheduledAt) continue;
    const existing = posts.find((p) => p.bufferId === raw.bufferId);
    if (existing) {
      Object.assign(existing, sanitizePost(raw, existing));
      updated++;
    } else {
      posts.push({
        id: crypto.randomBytes(8).toString('hex'),
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
  writeJson(SCHEDULE_FILE, posts);
  res.json({ added, updated, total: posts.length });
});

app.patch('/api/schedule/:id', (req, res) => {
  const posts = readJson(SCHEDULE_FILE, []);
  const post = posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'not found' });
  Object.assign(post, sanitizePost(req.body, post));
  writeJson(SCHEDULE_FILE, posts);
  res.json(post);
});

app.delete('/api/schedule/:id', (req, res) => {
  let posts = readJson(SCHEDULE_FILE, []);
  if (!posts.some((p) => p.id === req.params.id)) return res.status(404).json({ error: 'not found' });
  posts = posts.filter((p) => p.id !== req.params.id);
  writeJson(SCHEDULE_FILE, posts);
  res.json({ ok: true });
});

// ---- Library (already-created content: video projects + remix batches) ----
const VIDEOS_DIR = path.join(__dirname, '../videos');
const REMIXES_DIR = path.join(__dirname, '../REMIXES');
app.use('/videos-files', express.static(VIDEOS_DIR));

function parseFrontmatter(md) {
  const m = md.match(/^---\n([\s\S]*?)\n---/);
  const out = {};
  if (!m) return out;
  for (const line of m[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^"|"$/g, '');
  }
  return out;
}

app.get('/api/library', (req, res) => {
  const videos = [];
  try {
    for (const name of fs.readdirSync(VIDEOS_DIR)) {
      const dir = path.join(VIDEOS_DIR, name);
      if (!fs.statSync(dir).isDirectory()) continue;
      const meta = readJson(path.join(dir, 'meta.json'), {});
      let brief = {};
      try { brief = parseFrontmatter(fs.readFileSync(path.join(dir, 'BRIEF.md'), 'utf8')); } catch {}
      // thumbnail + individual frames: any snapshots dir with a contact sheet
      let thumb = null;
      let frames = [];
      try {
        for (const d of fs.readdirSync(dir)) {
          if (!d.startsWith('snapshots')) continue;
          const snapDir = path.join(dir, d);
          if (!fs.statSync(snapDir).isDirectory()) continue;
          if (fs.existsSync(path.join(snapDir, 'contact-sheet.jpg'))) {
            thumb = `/videos-files/${name}/${d}/contact-sheet.jpg`;
          }
          const pngs = fs.readdirSync(snapDir).filter((f) => f.endsWith('.png')).sort();
          if (pngs.length) frames = pngs.map((f) => `/videos-files/${name}/${d}/${f}`);
        }
      } catch {}
      // rendered output: mp4 in project root, out/ or renders/
      let render = null;
      for (const sub of ['', 'out', 'renders']) {
        try {
          const base = sub ? path.join(dir, sub) : dir;
          const mp4 = fs.readdirSync(base).find((f) => f.endsWith('.mp4'));
          if (mp4) { render = `/videos-files/${name}${sub ? '/' + sub : ''}/${mp4}`; break; }
        } catch {}
      }
      videos.push({
        type: 'video',
        name,
        message: brief.message || '',
        destination: brief.destination || '',
        aspect: brief.aspect || '',
        language: brief.language || '',
        length: brief.length || '',
        createdAt: meta.createdAt || null,
        thumb,
        frames,
        render,
        path: `videos/${name}`,
      });
    }
  } catch {}
  const batches = [];
  try {
    for (const f of fs.readdirSync(REMIXES_DIR)) {
      if (!f.endsWith('.md')) continue;
      const md = fs.readFileSync(path.join(REMIXES_DIR, f), 'utf8');
      const title = (md.match(/^#\s+(.+)$/m) || [])[1] || f;
      const count = (md.match(/^##\s+Remix/gm) || []).length;
      batches.push({ type: 'batch', file: f, title, remixCount: count, path: `REMIXES/${f}` });
    }
  } catch {}
  res.json({ videos, batches });
});

app.get('/api/library/batch/:file', (req, res) => {
  const f = req.params.file;
  if (!/^[\w.-]+\.md$/.test(f)) return res.status(400).json({ error: 'bad filename' });
  try {
    res.type('text/plain').send(fs.readFileSync(path.join(REMIXES_DIR, f), 'utf8'));
  } catch {
    res.status(404).json({ error: 'not found' });
  }
});

// ---- Render (runs `npm run render` inside a videos/<name> project) ----
const { spawn } = require('child_process');
const renderJobs = {};

function validProject(name) {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return null;
  const dir = path.join(VIDEOS_DIR, name);
  try {
    if (fs.statSync(dir).isDirectory()) return dir;
  } catch {}
  return null;
}

// Newest mp4 across the same locations the library scan uses
function findRender(dir) {
  let newest = null;
  for (const sub of ['renders', 'out', '']) {
    const base = sub ? path.join(dir, sub) : dir;
    try {
      for (const f of fs.readdirSync(base)) {
        if (!f.endsWith('.mp4')) continue;
        const full = path.join(base, f);
        const mtime = fs.statSync(full).mtimeMs;
        if (!newest || mtime > newest.mtime) newest = { file: full, rel: `${sub ? sub + '/' : ''}${f}`, mtime };
      }
    } catch {}
  }
  return newest;
}

function addRenderToAssets(name, mp4Path) {
  const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}-${name}.mp4`;
  fs.copyFileSync(mp4Path, path.join(UPLOAD_DIR, filename));
  const assets = readJson(ASSETS_FILE, []);
  const entry = {
    id: crypto.randomBytes(8).toString('hex'),
    filename,
    originalName: path.basename(mp4Path),
    url: `/uploads/${filename}`,
    type: 'video',
    mimetype: 'video/mp4',
    size: fs.statSync(mp4Path).size,
    tags: ['render', name],
    notes: `Rendered from videos/${name}`,
    uploadedAt: new Date().toISOString(),
  };
  assets.unshift(entry);
  writeJson(ASSETS_FILE, assets);
  return entry;
}

app.post('/api/render/:name', (req, res) => {
  const name = req.params.name;
  const dir = validProject(name);
  if (!dir) return res.status(404).json({ error: 'unknown project' });
  if (renderJobs[name] && renderJobs[name].status === 'running')
    return res.status(409).json({ error: 'render already running' });
  const uploadAfter = !!(req.body && req.body.upload);
  const job = { status: 'running', startedAt: new Date().toISOString(), tail: [] };
  renderJobs[name] = job;
  const child = spawn('npm', ['run', 'render'], { cwd: dir, env: process.env });
  const onData = (buf) => {
    job.tail.push(...buf.toString().split('\n').filter(Boolean));
    if (job.tail.length > 30) job.tail.splice(0, job.tail.length - 30);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('error', (err) => {
    job.status = 'error';
    job.error = String(err);
  });
  child.on('close', (code) => {
    if (job.status === 'error') return;
    if (code !== 0) {
      job.status = 'error';
      job.error = `render exited with code ${code}`;
      return;
    }
    const out = findRender(dir);
    job.output = out ? `/videos-files/${name}/${out.rel}` : null;
    if (uploadAfter && out) {
      try {
        job.asset = addRenderToAssets(name, out.file);
      } catch (e) {
        job.assetError = String(e);
      }
    }
    job.status = 'done';
    job.finishedAt = new Date().toISOString();
  });
  res.json({ started: true, name });
});

app.get('/api/render/:name', (req, res) => {
  res.json(renderJobs[req.params.name] || { status: 'idle' });
});

// Copy a project's existing render into the asset library
app.post('/api/library/:name/upload', (req, res) => {
  const dir = validProject(req.params.name);
  if (!dir) return res.status(404).json({ error: 'unknown project' });
  const out = findRender(dir);
  if (!out) return res.status(404).json({ error: 'no rendered mp4 in this project' });
  try {
    res.json(addRenderToAssets(req.params.name, out.file));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

// ---- Second Brain (AI team + Xenorita's customer pipeline) ----
const AGENTS_DIR = path.join(__dirname, '../.agents');
const CUSTOMERS_DIR = path.join(AGENTS_DIR, 'customer-success', 'customers');
app.use('/brain-files', express.static(AGENTS_DIR));

const TEAM = [
  {
    id: 'xenorita', name: 'Xenorita', pronouns: 'she/her', kind: 'agent',
    role: 'Customer Success Manager',
    portrait: '/brain-files/customer-success/xenorita.png',
    owns: 'Customer pipeline, follow-ups, and her self-improving playbook',
    definedBy: '.claude/agents/xenorita.md',
  },
  {
    id: 'rinjani', name: 'Rinjani', pronouns: 'she/her', kind: 'persona',
    role: 'Content & Social Manager',
    portrait: '/brain-files/team/rinjani.png',
    owns: 'Social posts, captions, copy — via the marketing-skills plugin',
  },
  {
    id: 'bima', name: 'Bima', pronouns: 'he/him', kind: 'persona',
    role: 'Video Producer',
    portrait: '/brain-files/team/bima.png',
    owns: 'HyperFrames video projects in videos/',
  },
  {
    id: 'nala', name: 'Nala', pronouns: 'she/her', kind: 'persona',
    role: 'Outlier Analyst',
    portrait: '/brain-files/team/nala.png',
    owns: 'Outlier scraping pipeline + this Content Studio',
  },
];

app.get('/api/team', (req, res) => res.json(TEAM));

function parseCustomerMd(slug, md) {
  const name = (md.match(/^#\s+(.+)$/m) || [, slug])[1].trim();
  const field = (label) => {
    const m = md.match(new RegExp(`^-\\s+\\*\\*${label}[^:]*:\\*\\*\\s*(.+)$`, 'mi'));
    return m ? m[1].trim() : '';
  };
  const health = field('Health');
  const healthKey = health.includes('🔴') ? 'red' : health.includes('🟡') ? 'yellow' : health.includes('🟢') ? 'green' : '';
  const nextSection = (md.split(/^##\s+Next action\s*$/m)[1] || '').split(/^##\s/m)[0];
  const nextLine = (nextSection.match(/^-\s+\[[ x]\]\s+(.+)$/m) || [, ''])[1];
  const due = (nextLine.match(/(\d{4}-\d{2}-\d{2})/) || [, null])[1];
  const log = [];
  const logSection = (md.split(/^##\s+Interaction log\s*$/m)[1] || '').split(/^##\s/m)[0];
  for (const m of logSection.matchAll(/^-\s+(\d{4}-\d{2}-\d{2})\s+—\s+(.+)$/gm)) {
    log.push({ date: m[1], text: m[2].trim() });
  }
  return {
    slug,
    name,
    type: field('Type'),
    stage: field('Stage'),
    health,
    healthKey,
    contact: field('Contact'),
    location: field('Location'),
    deal: field('The deal'),
    added: field('Added'),
    next: { text: nextLine.replace(/\*\*/g, '').replace(/^OVERDUE\s*—\s*/i, '').trim(), due },
    log,
    testData: /TEST DATA/i.test(md),
  };
}

app.get('/api/customers', (req, res) => {
  const customers = [];
  try {
    for (const f of fs.readdirSync(CUSTOMERS_DIR)) {
      if (!f.endsWith('.md') || f.startsWith('_')) continue;
      try {
        const md = fs.readFileSync(path.join(CUSTOMERS_DIR, f), 'utf8');
        customers.push(parseCustomerMd(f.replace(/\.md$/, ''), md));
      } catch {}
    }
  } catch {}
  res.json(customers);
});

app.listen(PORT, () => {
  console.log(`AI Club Lombok content dashboard running at http://localhost:${PORT}`);
});
