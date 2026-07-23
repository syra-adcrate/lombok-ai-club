// Build the standalone shareable "Outlier Radar" page from content.json.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const dir = path.dirname(fileURLToPath(import.meta.url)) + path.sep;
const data = JSON.parse(fs.readFileSync(dir + 'content.json', 'utf8')).posts;
const tpl = fs.readFileSync(dir + 'dashboard-template.html', 'utf8');
const json = JSON.stringify(data).replace(/<\/script>/gi, '<\\/script>');
fs.writeFileSync(dir + 'outlier-radar.html', tpl.replace('/*__DATA__*/', json));
console.log('built outlier-radar.html with', data.length, 'posts,', (json.length/1024).toFixed(0) + 'KB data');
