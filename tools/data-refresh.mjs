/* Beacon quarterly data refresh — the drift-monitoring half of the
   sensitivity story. Fetches Numbeo's public rankings (rent, cost of
   living plus rent, safety), matches them to our 173 cities, and:

     node tools/data-refresh.mjs            dry run: report only
     node tools/data-refresh.mjs --write    also patch src/data.js

   Always writes build/data-refresh-report.md (the PR body). With
   --write it then measures IMPACT: rankings under old vs new data
   across seeded sample profiles, so the PR can say "this update
   changes the top city for N% of profiles."

   Design stance: this runs quarterly under human review (a PR), never
   at runtime — the app stays deterministic per data release. Visa
   rules cannot be fetched reliably; the report carries a manual
   checklist instead. Zero dependencies. */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';

const WRITE = process.argv.includes('--write');
const UA = 'beacon-data-refresh/1.0 (quarterly; github.com/iqmouse/beacon)';

/* ---------- fetch & parse Numbeo ---------- */

const sleep = ms => new Promise(r => setTimeout(r, ms));
const CACHE = process.env.NUMBEO_CACHE || '';
import { existsSync } from 'node:fs';
function cachePath(url){
  const parts = new URL(url).pathname.split('/').filter(Boolean);
  return CACHE + '/' + parts.slice(-2).join('_').replace(/[^a-z0-9_.-]/gi, '') + '.html';
}

/* a quarterly visitor should knock politely: sequential fetches,
   a pause between pages, and one patient retry on 429 */
async function page(url){
  if (CACHE && existsSync(cachePath(url))){
    console.log('  cache hit:', cachePath(url));
    return readFileSync(cachePath(url), 'utf8');
  }
  for (let attempt = 0; attempt < 2; attempt++){
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } });
    if (res.ok){
      const text = await res.text();
      if (CACHE) writeFileSync(cachePath(url), text);
      return text;
    }
    if (res.status === 429 && attempt === 0){
      console.log('  429 on', url.split('/').pop().split('?')[0], '— waiting 60s');
      await sleep(60000);
      continue;
    }
    throw new Error(url + ' -> ' + res.status);
  }
}

const deent = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
  .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&apos;/g, "'");
const norm = s => deent(String(s)).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/\s+/g, ' ').trim();

/* rankings pages: header row names the columns; rows carry a city label
   cell and numeric cells. Parse generically, pick columns by header. */
function parseRankings(html, wantedHeader){
  const headers = [...html.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)]
    .map(m => norm(m[1].replace(/<[^>]*>/g, '')));
  const col = headers.findIndex(h => h.includes(norm(wantedHeader)));
  if (col < 0) throw new Error('column not found: ' + wantedHeader + ' in [' + headers.join(' | ') + ']');
  const out = new Map();
  for (const row of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)){
    const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m => m[1]);
    if (cells.length <= col) continue;
    const labelCell = cells.find(c => /cityOrCountryInIndicesTable|\/cost-of-living\/in\/|\/crime\/in\//.test(c)) ?? cells[1];
    if (!labelCell) continue;
    const label = norm(labelCell.replace(/<[^>]*>/g, ''));
    const num = parseFloat(String(cells[col]).replace(/<[^>]*>/g, '').replace(/,/g, ''));
    if (label && Number.isFinite(num)) out.set(label, num);
  }
  return out;
}

/* the per-item price page embeds its data as JS tuples:
   [lat, lng, "City, Country", price], — parse those directly */
function parsePrices(html){
  const out = new Map();
  for (const m of html.matchAll(/\[\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*"([^"]+)"\s*,\s*([\d.]+)\s*\]/g)){
    const label = norm(m[1]);
    const num = parseFloat(m[2]);
    if (label && Number.isFinite(num)) out.set(label, num);
  }
  return out;
}

/* ---------- match our cities to Numbeo labels ---------- */

const CITY_ALIAS = {
  'Canggu': 'Denpasar', 'Québec City': 'Quebec City', 'Washington': 'Washington',
};
const COUNTRY_ALIAS = {
  'Scotland': ['united kingdom'], 'Czechia': ['czech republic', 'czechia'],
  'Turkey': ['turkey', 'turkiye'], 'Hong Kong': ['hong kong', 'china'],
  'Puerto Rico': ['puerto rico', 'united states'],
};

function matcherFor(city){
  const names = [norm(CITY_ALIAS[city.name] || city.name)];
  const countries = (COUNTRY_ALIAS[city.country] || [city.country]).map(norm);
  return label => {
    const parts = label.split(',').map(s => s.trim());
    if (parts.length < 2) return false;
    const cityPart = parts[0], countryPart = parts[parts.length - 1];
    return names.includes(cityPart) && countries.some(c => countryPart === c || countryPart.includes(c));
  };
}

function lookup(map, city){
  const match = matcherFor(city);
  for (const [label, value] of map) if (match(label)) return value;
  return null;
}

/* ---------- main ---------- */

const CITIES = (await import('../src/data.js')).CITIES;

console.log('fetching Numbeo…');
const rentHtml = await page('https://www.numbeo.com/cost-of-living/prices_by_city.jsp?itemId=26&displayCurrency=USD');
await sleep(5000);
const colHtml = await page('https://www.numbeo.com/cost-of-living/rankings_current.jsp');
await sleep(5000);
const crimeHtml = await page('https://www.numbeo.com/crime/rankings_current.jsp');
const rents = parsePrices(rentHtml);
const cols = parseRankings(colHtml, 'Cost of Living Plus Rent Index');
const safeties = parseRankings(crimeHtml, 'Safety Index');
console.log('parsed rows — rents:', rents.size, '· col+rent:', cols.size, '· safety:', safeties.size, '\n');

const changes = [], unmatched = [];
for (const c of CITIES){
  const rent = lookup(rents, c);
  const col = lookup(cols, c);
  const safe = lookup(safeties, c);
  const row = { name: c.name, updates: [] };
  const oldRent = parseInt(String(c.f.rent).replace(/[^0-9]/g, ''), 10);
  if (rent !== null){
    const newRent = Math.round(rent);
    if (Math.abs(newRent - oldRent) / oldRent > 0.005)
      row.updates.push({ field: 'rent', old: oldRent, new: newRent,
        pct: ((newRent - oldRent) / oldRent * 100) });
  }
  if (col !== null){
    const newCost = Math.round(Math.min(10, Math.max(1, col / 10)) * 10) / 10;
    if (Math.abs(newCost - c.cost) >= 0.1)
      row.updates.push({ field: 'cost', old: c.cost, new: newCost,
        pct: ((newCost - c.cost) / c.cost * 100) });
  }
  if (safe !== null){
    const newSafe = Math.round(safe) / 10;
    if (Math.abs(newSafe - c.d.safe) >= 0.1)
      row.updates.push({ field: 'safe', old: c.d.safe, new: newSafe,
        pct: ((newSafe - c.d.safe) / c.d.safe * 100) });
  }
  const missing = [rent === null && 'rent', col === null && 'cost', safe === null && 'safety'].filter(Boolean);
  if (missing.length) unmatched.push(c.name + ' (' + missing.join(', ') + ')');
  if (row.updates.length) changes.push(row);
}

/* ---------- apply ---------- */

function applyToSource(){
  let src = readFileSync('src/data.js', 'utf8');
  let applied = 0;
  for (const row of changes){
    const esc = row.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    for (const u of row.updates){
      let re, make;
      if (u.field === 'rent'){
        re = new RegExp("(name:'" + esc + "',[\\s\\S]*?rent:')\\$[\\d,]+(')");
        make = (m, a, b) => a + '$' + u.new.toLocaleString('en-US') + b;
      } else if (u.field === 'cost'){
        re = new RegExp("(name:'" + esc + "',[\\s\\S]*?\\n   cost:)[\\d.]+(,)");
        make = (m, a, b) => a + u.new + b;
      } else {
        re = new RegExp("(name:'" + esc + "',[\\s\\S]*?,safe:)[\\d.]+(,)");
        make = (m, a, b) => a + u.new + b;
      }
      const before = src;
      src = src.replace(re, make);
      if (src !== before) applied++;
      else console.warn('  ! could not apply', row.name, u.field);
    }
    /* afford stays derived from cost */
    const cu = row.updates.find(u => u.field === 'cost');
    if (cu){
      const afford = Math.max(0, Math.min(10, 10 - Math.round(cu.new)));
      src = src.replace(new RegExp("(name:'" + esc + "',[\\s\\S]*?afford:)\\d+"), (m, a) => a + afford);
    }
  }
  writeFileSync('src/data.js', src);
  return applied;
}

/* ---------- impact: old vs new rankings over sampled profiles ---------- */

async function measureImpact(){
  const oldSrc = execSync('git show HEAD:src/data.js', { encoding: 'utf8', maxBuffer: 1 << 25 });
  const tmp = 'build/_old-data.mjs';
  writeFileSync(tmp, oldSrc);
  const OLD = (await import('../' + tmp + '?v=' + Date.now())).CITIES;
  const NEW = (await import('../src/data.js?v=' + Date.now())).CITIES;
  const { QUESTIONS } = await import('../src/questions.js');
  const { buildUser, rankAll } = await import('../src/scoring.js');
  const { FIELDS } = await import('../src/data.js?f=' + Date.now());

  let s = 7 >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const ri = n => Math.floor(rnd() * n);
  const LANGS = QUESTIONS.find(q => q.key === 'languages').opts.map(o => o.toLowerCase());
  const PASSES = QUESTIONS.find(q => q.key === 'passports').opts.map(o => o.toLowerCase());
  const FIELD_IDS = [...FIELDS.map(f => f.id), ''];
  const sample = () => Object.fromEntries(QUESTIONS.map(q => {
    if (q.type === 'cards') return [q.key, ri(q.opts.length)];
    if (q.type === 'slider') return [q.key, ri(11)];
    if (q.key === 'languages') return [q.key, [LANGS[ri(LANGS.length)]]];
    if (q.key === 'passports') return [q.key, [PASSES[ri(PASSES.length)]]];
    return [q.key, FIELD_IDS[ri(FIELD_IDS.length)]];
  }));

  const M = 600;
  let flips = 0, jac3 = 0;
  const rankSum = new Map(NEW.map(c => [c.name, { o: 0, n: 0 }]));
  for (let i = 0; i < M; i++){
    const a = sample();
    const u = buildUser(a, QUESTIONS);
    const ro = rankAll(OLD, u, a.field).map(r => r.city.name);
    const rn = rankAll(NEW, u, a.field).map(r => r.city.name);
    if (ro[0] !== rn[0]) flips++;
    const A = new Set(ro.slice(0, 3)), B = new Set(rn.slice(0, 3));
    let inter = 0; for (const x of A) if (B.has(x)) inter++;
    jac3 += inter / (6 - inter);
    ro.forEach((n, idx) => { const e = rankSum.get(n); if (e) e.o += idx; });
    rn.forEach((n, idx) => { const e = rankSum.get(n); if (e) e.n += idx; });
  }
  const movers = [...rankSum.entries()]
    .map(([n, { o, n: nn }]) => ({ n, d: (nn - o) / M }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d)).slice(0, 10);
  return { M, flipPct: flips / M * 100, jac3: jac3 / M, movers };
}

/* ---------- report ---------- */

mkdirSync('build', { recursive: true });
const today = new Date().toISOString().slice(0, 10);
const big = changes.flatMap(r => r.updates.filter(u => Math.abs(u.pct) >= 15).map(u => ({ ...u, name: r.name })));

let md = `# Beacon quarterly data refresh — ${today}

Sources fetched this run: Numbeo 1-bed city-centre prices (USD), Cost of
Living Plus Rent Index, Safety Index. Sunshine (climate normals) and the
hand-authored dimensions are not touched. **Visas cannot be fetched —
see the manual checklist.**

## Summary

- Cities with changes: **${changes.length}** of ${CITIES.length}
- Individual value updates: **${changes.reduce((a, r) => a + r.updates.length, 0)}**
- Large moves (|Δ| ≥ 15%), flagged for eyeballs: **${big.length}**
- Unmatched on at least one source (left untouched): ${unmatched.length}

`;

if (big.length){
  md += `## Large moves — review these first\n\n| City | Field | Old | New | Δ |\n|---|---|---|---|---|\n`;
  for (const u of big) md += `| ${u.name} | ${u.field} | ${u.old} | ${u.new} | ${u.pct > 0 ? '+' : ''}${u.pct.toFixed(1)}% |\n`;
  md += '\n';
}
md += `## All changes\n\n| City | Field | Old | New | Δ |\n|---|---|---|---|---|\n`;
for (const r of changes) for (const u of r.updates)
  md += `| ${r.name} | ${u.field} | ${u.old} | ${u.new} | ${u.pct > 0 ? '+' : ''}${u.pct.toFixed(1)}% |\n`;
if (unmatched.length)
  md += `\n## Unmatched (manual review)\n\n${unmatched.map(u => '- ' + u).join('\n')}\n`;

if (WRITE && changes.length){
  const applied = applyToSource();
  console.log('applied', applied, 'updates to src/data.js');
  const imp = await measureImpact();
  md += `\n## Ranking impact (${imp.M} seeded profiles, old data vs new)

- Top-1 city changes for **${imp.flipPct.toFixed(1)}%** of profiles
- Mean top-3 Jaccard: **${imp.jac3.toFixed(3)}**
- Biggest mean-rank movers: ${imp.movers.map(m => `${m.n} (${m.d > 0 ? '+' : ''}${m.d.toFixed(1)})`).join(', ')}
`;
}

md += `\n## Manual checklist before merging

- [ ] Spot-check two or three large moves against numbeo.com directly
- [ ] Scan visa news for the quarter (waivers added/dropped) and update \`src/visas.js\` if needed
- [ ] \`npm test\` and \`npm run build\` are green (CI runs them anyway)
- [ ] Merge = new data release; the app stays deterministic per release
`;

writeFileSync('build/data-refresh-report.md', md);
console.log('report → build/data-refresh-report.md');
console.log(changes.length ? `${changes.length} cities changed` : 'no changes above thresholds');
if (!WRITE && changes.length) console.log('(dry run — rerun with --write to patch src/data.js)');
