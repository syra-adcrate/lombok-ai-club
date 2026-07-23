// Generates seed.sql from data/*.json so the existing local data can be
// imported into the D1 `collections` table (run: node scripts/make-seed-sql.js).
// Large JSON is appended in chunks to stay under D1's per-statement size limit.
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const OUT = path.join(__dirname, '..', 'seed.sql');
const names = ['assets', 'outliers', 'remixes', 'schedule'];
const CHUNK = 40000;

const esc = (s) => s.replace(/'/g, "''");
const lines = [];
for (const name of names) {
  let data = [];
  try {
    data = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${name}.json`), 'utf8'));
  } catch {}
  const jsonStr = JSON.stringify(data);
  lines.push(`INSERT INTO collections (name, data) VALUES ('${name}', '') ON CONFLICT(name) DO UPDATE SET data = '';`);
  for (let i = 0; i < jsonStr.length; i += CHUNK) {
    lines.push(`UPDATE collections SET data = data || '${esc(jsonStr.slice(i, i + CHUNK))}' WHERE name = '${name}';`);
  }
}

fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`Wrote ${OUT}`);
