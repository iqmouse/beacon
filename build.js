/* Beacon build — bundles the ES modules into deployable files.
   Zero dependencies: a line-level transform, not a compiler. It relies
   on this repo's conventions — imports only at the top of a file, and
   only `export const` / `export function` / `export { ... };` forms.

   Outputs:
     dist/index.html        full HTML5 document (Cloudflare Pages)
     dist/city/<slug>/      one static page per city (indexable long tail)
     dist/sitemap.xml       home + every city page
     dist/robots.txt        points at the sitemap
     dist/404.html          a real 404 so unknown paths stop soft-200ing
     build/artifact.html    body-content for the claude.ai artifact wrapper
                            (kept OUT of dist so it never deploys as a
                            quirks-mode duplicate of the app) */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { CITIES } from './src/data.js';

const ORIGIN = 'https://beacon-ejo.pages.dev';
const ORDER = ['util','data','questions','visas','scoring','skyline','audio','homes','jobs','main'];

const strip = src => src.split('\n').filter(l => {
  const t = l.trim();
  return !(t.startsWith('import ') || (t.startsWith('export {') && t.endsWith(';')));
}).map(l => l
  .replace(/^export const /, 'const ')
  .replace(/^export function /, 'function ')
).join('\n');

const js = ORDER.map(m => strip(readFileSync(`src/${m}.js`, 'utf8'))).join('\n\n');
const css = readFileSync('styles/beacon.css', 'utf8');

const full = readFileSync('index.html', 'utf8')
  .replace('<link rel="stylesheet" href="styles/beacon.css">', () => '<style>\n' + css + '</style>')
  .replace('<script type="module" src="src/main.js"></script>', () => '<script>\n' + js + '</script>');
  /* function replacements: a literal $' in the code must never trigger
     String.replace's special substitution patterns */

mkdirSync('dist', { recursive: true });
mkdirSync('build', { recursive: true });
writeFileSync('dist/index.html', full);

/* artifact variant: charset + short title + fonts + style + body content */
const body = full.match(/<body>\n([\s\S]*)\n<\/body>/)[1];
const fonts = full.match(/<link rel="preconnect"[\s\S]*?display=swap">/)[0];
const style = full.match(/<style>\n[\s\S]*?<\/style>/)[0];
writeFileSync('build/artifact.html',
  '<meta charset="utf-8">\n<title>Beacon</title>\n' + fonts + '\n' + style + '\n' + body + '\n');

/* ---------- static city pages ---------- */
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const plain = s => s.replace(/&rsquo;/g, '’').replace(/&mdash;/g, '—')
  .replace(/&ndash;/g, '–').replace(/<[^>]*>/g, '');

const PAGE_CSS = `
:root{color-scheme:dark}
body{margin:0;font-family:Karla,system-ui,sans-serif;background:#0F1B22;color:#E7EFEE;line-height:1.6}
main{max-width:640px;margin:0 auto;padding:9vh 20px 12vh}
h1{font-family:Ephesis,cursive;font-weight:400;font-size:clamp(3rem,10vw,4.6rem);color:#F0B24E;margin:0;line-height:1.1}
.sub{font-size:.75rem;letter-spacing:.16em;text-transform:uppercase;color:#6E858D;margin:0 0 .4rem}
.why{font-family:Newsreader,Georgia,serif;font-style:italic;font-weight:300;font-size:1.25rem;color:#A7BBC0;margin:1rem 0 2rem}
table{width:100%;border-collapse:collapse;margin:0 0 2rem}
td{padding:.55rem 0;border-top:1px solid rgba(231,239,238,.1);font-size:.95rem}
td:first-child{color:#6E858D;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase}
td:last-child{text-align:right;font-variant-numeric:tabular-nums}
.hoods{color:#A7BBC0;font-size:.9rem;margin:0 0 2.4rem}
.cta{display:inline-block;background:#F0B24E;color:#1E1607;font-weight:600;text-decoration:none;border-radius:999px;padding:.85rem 2rem}
.note{font-size:.75rem;color:#6E858D;margin-top:2.6rem}
a{color:#F0B24E}`;

const cityPage = c => {
  const desc = (plain(c.why) + ' See how ' + c.name + ' scores across fourteen dimensions on Beacon.').slice(0, 158);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Living in ${c.name} — Beacon</title>
<meta name="description" content="${desc.replace(/"/g, '&quot;')}">
<link rel="canonical" href="${ORIGIN}/city/${slug(c.name)}/">
<meta property="og:title" content="Living in ${c.name} — Beacon">
<meta property="og:description" content="${desc.replace(/"/g, '&quot;')}">
<meta property="og:type" content="article">
<meta property="og:url" content="${ORIGIN}/city/${slug(c.name)}/">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Ephesis&family=Newsreader:ital,wght@1,300&family=Karla:wght@400;600&display=swap">
<style>${PAGE_CSS}</style>
</head>
<body>
<main>
<p class="sub">${c.country}</p>
<h1>${c.name}</h1>
<p class="why">${c.why}</p>
<table>
<tr><td>Metro population</td><td>${c.f.pop}</td></tr>
<tr><td>Language</td><td>${c.f.lang}</td></tr>
<tr><td>Typical city-centre one-bed</td><td>${c.f.rent}/mo</td></tr>
<tr><td>Sunshine a year</td><td>${Number(c.f.sun).toLocaleString('en-US')} hours</td></tr>
<tr><td>Strong industries</td><td>${c.ind.join(', ')}</td></tr>
</table>
<p class="hoods">Neighborhoods worth knowing: ${c.hoods.join(' · ')}</p>
<a class="cta" href="/">Is ${c.name} your city? Take the quiz →</a>
<p class="note">Rents and sunshine from Numbeo and Wikipedia climate tables; the rest are Beacon&rsquo;s own hand-authored judgments. Free, deterministic, no AI — <a href="/">beacon-ejo.pages.dev</a>.</p>
</main>
</body>
</html>`;
};

const urls = [ORIGIN + '/'];
for (const c of CITIES){
  const dir = `dist/city/${slug(c.name)}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(dir + '/index.html', cityPage(c));
  urls.push(`${ORIGIN}/city/${slug(c.name)}/`);
}

writeFileSync('dist/sitemap.xml',
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join('\n') + '\n</urlset>\n');

writeFileSync('dist/robots.txt', `User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);

writeFileSync('dist/404.html', `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Lost in the dark — Beacon</title><meta name="robots" content="noindex"><style>${PAGE_CSS}</style></head>
<body><main><h1>Lost in the dark</h1>
<p class="why">This street doesn&rsquo;t exist — but the light is still on at home.</p>
<a class="cta" href="/">Back to Beacon →</a></main></body></html>\n`);

console.log('dist/index.html —', (full.length/1024).toFixed(0) + 'KB · ' + CITIES.length +
  ' city pages · sitemap/robots/404 · build/artifact.html');
