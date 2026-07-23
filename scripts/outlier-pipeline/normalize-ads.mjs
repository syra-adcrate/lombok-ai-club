// Normalize scraped ad-library ads into the pipeline schema + compute ad outlier scores.
// Input: raw/ads-meta.json (curious_coder/facebook-ads-library-scraper items, field-projected).
// Ads are spend-validated, so the score rewards longevity + creative iteration + EU reach
// instead of engagement-vs-median (see ../../IMPLEMENTATION_PLAN_ADS.md).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(DIR, 'ads.json');

const aiRe = /\b(ai|a\.i\.?|chatgpt|claude|gpt|gemini|llm|artificial intelligence|automation|machine learning|copilot|midjourney|prompt)\b/i;
const hook = (t) => (t || '').split('\n').map(s => s.trim()).filter(Boolean)[0]?.slice(0, 140) || '(no text)';
const DAY = 86400 * 1000;

const items = JSON.parse(fs.readFileSync(path.join(DIR, 'raw/ads-meta.json'), 'utf8')).items;

const seenCollation = new Set();
let posts = [];
for (const it of items) {
  const body = it['snapshot.body.text'] || '';
  const title = it['snapshot.title'] || '';
  if (!aiRe.test([body, title, it.page_name].join(' '))) continue; // keyword_unordered matches loosely
  // one entry per creative concept — variations share a collation_id
  const coll = it.collation_id || it.ad_archive_id;
  if (seenCollation.has(coll)) continue;
  seenCollation.add(coll);

  const start = it.start_date ? new Date(it.start_date * 1000) : null;
  const end = it.is_active ? new Date() : (it.end_date ? new Date(it.end_date * 1000) : null);
  const daysRunning = start && end ? Math.max(1, Math.round((end - start) / DAY)) : 1;
  const euReach = it['aaa_info.eu_total_reach'] ?? it['transparency_by_location.eu_transparency.eu_total_reach'] ?? null;
  const variations = it.collation_count || 1;

  posts.push({
    platform: 'meta-ads',
    id: String(it.ad_archive_id),
    url: it.ad_library_url,
    hook: hook(body) === '(no text)' ? hook(title) : hook(body),
    text: [body, title && `HEADLINE: ${title}`, it['snapshot.cta_text'] && `CTA: ${it['snapshot.cta_text']}`, it['snapshot.link_url'] && `LANDS ON: ${it['snapshot.link_url']}`].filter(Boolean).join('\n\n'),
    author: it.page_name,
    followers: it['snapshot.page_like_count'] || null,
    date: start ? start.toISOString() : null,
    metrics: { views: null, likes: null, comments: null, shares: null, saves: null },
    ad: {
      daysRunning,
      variations,
      euReach,
      isActive: !!it.is_active,
      cta: it['snapshot.cta_text'] || null,
      landingUrl: it['snapshot.link_url'] || null,
      platformsServed: it.publisher_platform || [],
      mediaUrls: [it['snapshot.images.original_image_url'], it['snapshot.videos.video_preview_image_url']].flat().filter(Boolean).slice(0, 3),
    },
    // spend-validation proxy: longevity × iteration × (EU) reach
    outlierScore: +(((daysRunning / 30) * (1 + Math.log10(1 + variations)) * (1 + Math.log10(1 + (euReach || 0) / 10000))).toFixed(2)),
    source: 'meta ad library',
  });
}

posts.sort((a, b) => b.outlierScore - a.outlierScore);
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), posts }, null, 1));
console.log(`kept ${posts.length} AI-relevant ad concepts of ${items.length} scraped ads\n`);
for (const p of posts.slice(0, 10)) console.log(`  ${p.outlierScore}x | ${p.ad.daysRunning}d, ${p.ad.variations} vars | ${p.author}: ${p.hook.slice(0, 70)}`);
