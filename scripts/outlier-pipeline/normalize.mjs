// Normalize scraped social posts into one schema + compute outlier scores.
// Inputs: raw/{tiktok,instagram,linkedin,reddit}.json — Apify get-dataset-items
// output ({items: [...]}) for the actors listed in scripts/outlier-pipeline/README.md.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'content.json');

const files = {
  tiktok: path.join(DIR, 'raw/tiktok.json'),
  instagram: path.join(DIR, 'raw/instagram.json'),
  linkedin: path.join(DIR, 'raw/linkedin.json'),
  reddit: process.argv[2] || path.join(DIR, 'raw/reddit.json'),
};

const load = (p) => JSON.parse(fs.readFileSync(p, 'utf8')).items;

const hook = (t) => (t || '').split('\n').map(s => s.trim()).filter(Boolean)[0]?.slice(0, 140) || '(no text)';

let posts = [];

// TikTok
for (const it of load(files.tiktok)) {
  const views = it.playCount || 0;
  const likes = it.diggCount || 0, comments = it.commentCount || 0, shares = it.shareCount || 0, saves = it.collectCount || 0;
  const followers = it['authorMeta.fans'] || 0;
  posts.push({
    platform: 'tiktok', id: it.id, url: it.webVideoUrl, hook: hook(it.text), text: it.text || '',
    author: it['authorMeta.name'], followers, date: it.createTimeISO,
    metrics: { views, likes, comments, shares, saves },
    // views vs. audience size = how far the algorithm pushed it beyond its follower base
    reachRatio: followers > 0 ? views / followers : 0,
    engRate: views > 0 ? (likes + comments + shares + saves) / views : 0,
    raw: views + likes * 20 + shares * 60 + saves * 40,
    source: it['searchHashtag.name'] ? '#' + it['searchHashtag.name'] : 'search',
  });
}

// Instagram
for (const it of load(files.instagram)) {
  // Instagram returns -1 when the account hides like counts
  const likes = Math.max(0, it.likesCount || 0), comments = it.commentsCount || 0;
  posts.push({
    platform: 'instagram', id: it.id, url: it.url, hook: hook(it.caption), text: it.caption || '',
    author: it.ownerUsername, followers: null, date: it.timestamp,
    metrics: { views: null, likes, comments, shares: null, saves: null },
    reachRatio: null, engRate: null,
    raw: likes + comments * 20,
    source: (it.inputUrl || '').includes('/tags/') ? '#' + it.inputUrl.split('/tags/')[1].replace(/\/$/, '') : 'hashtag',
    format: it.type,
  });
}

// LinkedIn
for (const it of load(files.linkedin)) {
  const likes = it['engagement.likes'] ?? it.engagement?.likes ?? 0;
  const comments = it['engagement.comments'] ?? it.engagement?.comments ?? 0;
  const shares = it['engagement.shares'] ?? it.engagement?.shares ?? 0;
  posts.push({
    platform: 'linkedin', id: it.id, url: it.linkedinUrl, hook: hook(it.content), text: it.content || '',
    author: it['author.name'] ?? it.author?.name, followers: null, date: it['postedAt.date'] ?? it.postedAt?.date,
    authorInfo: it['author.info'] ?? it.author?.info,
    metrics: { views: null, likes, comments, shares, saves: null },
    reachRatio: null, engRate: null,
    raw: likes + comments * 8 + shares * 15,
    source: it['query.search'] ?? it.query?.search ?? 'search',
  });
}

// Reddit (optional until run finishes)
if (files.reddit && fs.existsSync(files.reddit)) {
  const aiRe = /\b(ai|a\.i\.?|chatgpt|claude|gpt|gemini|llm|artificial intelligence|automation|palantir|anthropic|openai|copilot|suno|midjourney)\b/i;
  for (const it of load(files.reddit)) {
    if (it.dataType && it.dataType !== 'post') continue;
    if (!aiRe.test([it.title, it.body, it.communityName].join(' '))) continue;
    const ups = it.upVotes || 0, comments = it.numberOfComments || 0;
    posts.push({
      platform: 'reddit', id: it.id, url: it.url || it.link, hook: hook(it.title || it.body), text: [it.title, it.body].filter(Boolean).join('\n\n'),
      author: it.username, followers: null, date: it.createdAt,
      metrics: { views: null, likes: ups, comments, shares: null, saves: null },
      reachRatio: null, engRate: null,
      raw: ups + comments * 5,
      source: it.communityName || it.parsedCommunityName || 'search',
    });
  }
}

// Outlier score: per-platform multiplier vs. the median non-zero peer, blended
// with reach ratio where available (TikTok). Expressed as "x median".
const byPlatform = {};
for (const p of posts) (byPlatform[p.platform] ??= []).push(p);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

for (const [plat, arr] of Object.entries(byPlatform)) {
  const med = median(arr.map(p => p.raw).filter(v => v > 0)) || 1;
  for (const p of arr) {
    p.xMedian = +(p.raw / med).toFixed(2);
    let score = p.xMedian;
    if (p.reachRatio) score *= Math.min(Math.max(p.reachRatio, 0.5), 5); // TikTok: reward beyond-audience reach
    p.outlierScore = +score.toFixed(2);
  }
  arr.sort((a, b) => b.outlierScore - a.outlierScore);
}

posts = Object.values(byPlatform).flat();
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), posts }, null, 1));
console.log('total:', posts.length);
for (const [plat, arr] of Object.entries(byPlatform)) {
  console.log(`\n== ${plat} (${arr.length}) top 5 ==`);
  for (const p of arr.slice(0, 5)) console.log(`  ${p.outlierScore}x | ${(p.metrics.views ?? p.raw)} | ${p.hook.slice(0, 80)}`);
}
