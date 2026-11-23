/* Beacon sensitivity analysis — the experiment behind METHODS.md §7.
   Zero dependencies, fixed seed, fully reproducible:  node tools/sensitivity.mjs

   Two studies:
   A. QUESTION INFLUENCE — sample N answer vectors uniformly over each
      question's domain; for each of the 27 questions, redraw ONLY that
      answer (to a different value) and measure what happens to the
      ranking. Reported per question: P(top-1 changes), median rank the
      old #1 falls to, and mean Jaccard overlap of the top-10 sets.
   B. WEIGHT ROBUSTNESS (rank-reversal) — multiply every weight by
      exp(sigma * N(0,1)) and measure ranking stability: P(top-1 changes),
      mean top-3 Jaccard, mean Spearman rho over all 173 ranks.

   The script rebuilds the aggregation from the same exported fit
   functions and ASSERTS exact agreement with rankAll() at base weights,
   so the analysis provably measures the shipped model. */

import { CITIES, FIELDS } from '../src/data.js';
import { QUESTIONS } from '../src/questions.js';
import { buildUser, rankAll, langFit, costFit, safeFit, divFit, WEIGHTS } from '../src/scoring.js';
import { access, visaFit, PASSPORTS } from '../src/visas.js';

/* ---------- seeded RNG (mulberry32) ---------- */
let s = 42 >>> 0;
const rnd = () => {
  s = (s + 0x6D2B79F5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = n => Math.floor(rnd() * n);
let g2 = null;
const gauss = () => {           /* Box–Muller */
  if (g2 !== null) { const v = g2; g2 = null; return v; }
  const u1 = Math.max(rnd(), 1e-12), u2 = rnd();
  const r = Math.sqrt(-2 * Math.log(u1)), a = 2 * Math.PI * u2;
  g2 = r * Math.sin(a);
  return r * Math.cos(a);
};

/* ---------- uniform sampling of the answer space ---------- */
const LANG_OPTS = QUESTIONS.find(q => q.key === 'languages').opts.map(o => o.toLowerCase());
const PASS_OPTS = QUESTIONS.find(q => q.key === 'passports').opts.map(o => o.toLowerCase());
const FIELD_OPTS = [...FIELDS.map(f => f.id), ''];   /* '' = not looking */

function drawAnswer(q){
  if (q.type === 'cards') return ri(q.opts.length);
  if (q.type === 'slider') return ri(11);
  if (q.key === 'languages'){
    const n = 1 + (rnd() < 0.35 ? 1 : 0) + (rnd() < 0.12 ? 1 : 0);
    const out = new Set();
    while (out.size < n) out.add(LANG_OPTS[ri(LANG_OPTS.length)]);
    return [...out];
  }
  if (q.key === 'passports'){
    const out = new Set([PASS_OPTS[ri(PASS_OPTS.length)]]);
    if (rnd() < 0.15) out.add(PASS_OPTS[ri(PASS_OPTS.length)]);
    return [...out];
  }
  if (q.type === 'chips') return FIELD_OPTS[ri(FIELD_OPTS.length)];
  throw new Error('unknown question type ' + q.type);
}
const sampleAnswers = () => Object.fromEntries(QUESTIONS.map(q => [q.key, drawAnswer(q)]));
function redraw(q, prev){
  for (let i = 0; i < 50; i++){
    const v = drawAnswer(q);
    if (JSON.stringify(v) !== JSON.stringify(prev)) return v;
  }
  return prev;      /* single-valued domain — never happens with ≥4 options */
}

/* ---------- aggregation with injectable weights ---------- */
const SYM = Object.keys(WEIGHTS);
function rawScore(c, user, fieldId, w){
  let sum = 0, wsum = 0;
  for (const k of SYM){
    const f = 1 - Math.abs(c.d[k] - user[k]) / 10;
    sum += f * w[k]; wsum += w[k];
  }
  const hasPass = user.passports && user.passports.length;
  const extras = [
    [langFit(c, user), w.lang],
    [costFit(c, user), w.afford],
    [safeFit(c, user), w.safeBase + w.safeSlope * user.safe],
    [divFit(c, user),  w.divBase + w.divSlope * user.div],
    [hasPass ? visaFit(access(user.passports, c.country)) : 1, hasPass ? w.visa : 0],
  ];
  for (const [f, wk] of extras){ sum += f * wk; wsum += wk; }
  let raw = Math.pow(sum / wsum, 2.1) * 100;
  if (fieldId && c.ind.includes(fieldId)) raw += 6;
  return raw;
}
const BASE_W = { ...WEIGHTS, lang: 1.2, afford: 1.15, safeBase: .7, safeSlope: .06,
                 divBase: .3, divSlope: .07, visa: 1 };
function rankWith(answers, w){
  const user = buildUser(answers, QUESTIONS);
  return CITIES.map(c => ({ name: c.name, raw: rawScore(c, user, answers.field, w) }))
    .sort((a, b) => b.raw - a.raw || a.name.localeCompare(b.name))
    .map(x => x.name);
}

/* ---------- fidelity check: this harness IS the shipped model ---------- */
for (let i = 0; i < 25; i++){
  const a = sampleAnswers();
  const ours = rankWith(a, BASE_W).join('|');
  const shipped = rankAll(CITIES, buildUser(a, QUESTIONS), a.field).map(r => r.city.name).join('|');
  if (ours !== shipped) throw new Error('harness diverges from shipped model at probe ' + i);
}
console.log('fidelity: harness ranking === rankAll on 25 random profiles ✓\n');

const jaccard = (a, b) => {
  const A = new Set(a), B = new Set(b);
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
};

/* ---------- Study A: question influence ---------- */
const N = 1200;
const bases = [];
for (let i = 0; i < N; i++){
  const a = sampleAnswers();
  bases.push({ a, r: rankWith(a, BASE_W) });
}
const stats = {};
for (const q of QUESTIONS){
  let flips = 0, jacc = 0;
  const falls = [];
  for (const { a, r } of bases){
    const a2 = { ...a, [q.key]: redraw(q, a[q.key]) };
    const r2 = rankWith(a2, BASE_W);
    if (r2[0] !== r[0]) flips++;
    falls.push(r2.indexOf(r[0]) + 1);
    jacc += jaccard(r.slice(0, 10), r2.slice(0, 10));
  }
  falls.sort((x, y) => x - y);
  stats[q.key] = {
    flip: flips / N,
    medianFall: falls[Math.floor(N / 2)],
    top10: jacc / N,
  };
}
console.log('STUDY A — question influence (N=' + N + ' profiles, one-at-a-time redraw)');
console.log('question        P(top-1 flips)  median rank of old #1  mean top-10 Jaccard');
for (const [k, v] of Object.entries(stats).sort((a, b) => b[1].flip - a[1].flip)){
  console.log(k.padEnd(16) + (v.flip * 100).toFixed(1).padStart(8) + '%' +
    String(v.medianFall).padStart(16) + v.top10.toFixed(3).padStart(22));
}

/* ---------- Study B: weight robustness ---------- */
const PROFILES = 40, PERTS = 10, SIGMA = 0.10;
let bFlips = 0, bJac3 = 0, bRho = 0, trials = 0;
for (let p = 0; p < PROFILES; p++){
  const a = sampleAnswers();
  const base = rankWith(a, BASE_W);
  const baseRank = new Map(base.map((n, i) => [n, i]));
  for (let m = 0; m < PERTS; m++){
    const w = {};
    for (const k of Object.keys(BASE_W)) w[k] = BASE_W[k] * Math.exp(SIGMA * gauss());
    const r = rankWith(a, w);
    if (r[0] !== base[0]) bFlips++;
    bJac3 += jaccard(base.slice(0, 3), r.slice(0, 3));
    let d2 = 0;
    r.forEach((n, i) => { const d = i - baseRank.get(n); d2 += d * d; });
    const n = r.length;
    bRho += 1 - (6 * d2) / (n * (n * n - 1));
    trials++;
  }
}
console.log('\nSTUDY B — weight robustness (' + PROFILES + ' profiles × ' + PERTS +
  ' perturbations, every weight × exp(' + SIGMA + '·N(0,1)))');
console.log('P(top-1 changes): ' + (bFlips / trials * 100).toFixed(1) + '%');
console.log('mean top-3 Jaccard: ' + (bJac3 / trials).toFixed(3));
console.log('mean Spearman rho (all 173 ranks): ' + (bRho / trials).toFixed(4));
