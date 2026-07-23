// Convert normalized content.json into dashboard/data/outliers.json (content-studio schema).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url)) + path.sep;
const OUT = path.join(dir, '../../dashboard/data/outliers.json');
let posts = JSON.parse(fs.readFileSync(dir + 'content.json', 'utf8')).posts;
try { posts = posts.concat(JSON.parse(fs.readFileSync(dir + 'ads.json', 'utf8')).posts); } catch {}

// Contract (dashboard/README.md): preserve user's status/myScore/myNotes and all
// icp* fields on rewrite, and never drop previously-triaged items just because
// they're absent from the latest scrape batch.
let prev = {};
try { for (const o of JSON.parse(fs.readFileSync(OUT, 'utf8'))) if (!o.sample) prev[o.id] = o; } catch {}
const keepPrev = (o) => o.status === 'shortlist' || o.myScore > 0 || (o.myNotes || '').trim();

const why = (p) => {
  if (p.ad) {
    const bits = [`spend-validated: ${p.ad.isActive ? 'running' : 'ran'} ${p.ad.daysRunning} days`];
    if (p.ad.variations > 1) bits.push(`${p.ad.variations} creative variations`);
    if (p.ad.euReach) bits.push(`${(p.ad.euReach / 1000).toFixed(0)}K EU reach`);
    bits.push(`found via ${p.source}`);
    return bits.join(' · ');
  }
  const bits = [`${p.xMedian}× its platform's median engagement in this batch`];
  if (p.reachRatio) bits.push(`reached ${p.reachRatio.toFixed(1)}× the creator's follower count (${(p.followers/1000).toFixed(0)}K followers)`);
  if (p.engRate) bits.push(`${(p.engRate*100).toFixed(1)}% engagement rate`);
  bits.push(`found via ${p.source}`);
  return bits.join(' · ');
};

const userFields = (id) => {
  const o = prev[id] || {};
  const f = { status: o.status || 'new', myScore: o.myScore || 0, myNotes: o.myNotes || '' };
  for (const k of ['icpFit', 'icpSegments', 'icpReason']) if (o[k] !== undefined) f[k] = o[k];
  return f;
};

const out = posts.map(p => ({
  id: `${p.platform}-${p.id}`,
  platform: p.platform,
  author: '@' + (p.author || 'unknown'),
  title: p.hook,
  url: p.url || '',
  views: p.metrics.views ?? null,
  likes: p.metrics.likes ?? null,
  comments: p.metrics.comments ?? null,
  shares: p.metrics.shares ?? null,
  outlierScore: p.outlierScore,
  whyOutlier: why(p),
  script: p.text && p.text !== p.hook ? 'ORIGINAL POST TEXT (remix raw material):\n\n' + p.text : '',
  postedAt: p.date ? String(p.date).slice(0, 10) : '',
  ...(p.ad ? { ad: p.ad } : {}),
  ...userFields(`${p.platform}-${p.id}`),
}));

// Keep previously-triaged items that dropped out of the latest batch (B1 fix):
// anything shortlisted, rated, or annotated survives pipeline reruns.
const newIds = new Set(out.map(o => o.id));
for (const o of Object.values(prev)) if (!newIds.has(o.id) && keepPrev(o)) out.push(o);

out.sort((a, b) => b.outlierScore - a.outlierScore);
fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
console.log('wrote', out.length, 'outliers to', OUT);
