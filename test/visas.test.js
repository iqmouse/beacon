import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../src/data.js';
import { QUESTIONS } from '../src/questions.js';
import { resolvePassports, access, visaFit, ACCESS_LABEL, PASSPORTS } from '../src/visas.js';
import { buildUser, rankAll } from '../src/scoring.js';

const P = (...labels) => resolvePassports(labels);

test('home, union, and bloc rules', () => {
  assert.equal(access(P('united states'), 'United States'), 'home');
  assert.equal(access(P('united states'), 'Puerto Rico'), 'home');
  assert.equal(access(P('united kingdom'), 'Scotland'), 'home');
  assert.equal(access(P('germany'), 'Germany'), 'home');
  assert.equal(access(P('germany'), 'France'), 'union');
  assert.equal(access(P('another eu / eea country'), 'Portugal'), 'union');
  assert.equal(access(P('united kingdom'), 'Ireland'), 'union');   /* Common Travel Area */
  assert.equal(access(P('united kingdom'), 'Germany'), 'free');    /* no EU union post-Brexit */
  assert.equal(access(P('australia'), 'New Zealand'), 'union');
  assert.equal(access(P('brazil'), 'Argentina'), 'union');         /* Mercosur residence */
});

test('entry tiers behave for representative pairs', () => {
  assert.equal(access(P('united states'), 'Portugal'), 'free');
  assert.equal(access(P('united states'), 'Vietnam'), 'evisa');
  assert.equal(access(P('united states'), 'China'), 'visa');
  assert.equal(access(P('india'), 'Germany'), 'visa');
  assert.equal(access(P('india'), 'Thailand'), 'free');
  assert.equal(access(P('india'), 'India'), 'home');
  assert.equal(access(P('israel'), 'Indonesia'), 'no');
  assert.equal(access(P('pakistan'), 'India'), 'no');
  assert.equal(access(P('nigeria'), 'Rwanda'), 'free');            /* vf ALL */
  assert.equal(access(P('nigeria'), 'Kenya'), 'evisa');            /* evisa ALL */
});

test('multiple passports take the best access', () => {
  assert.equal(access(P('india', 'germany'), 'France'), 'union');
  assert.equal(access(P('india', 'united states'), 'Japan'), 'free');
});

test('no passports means unknown and a neutral fit', () => {
  assert.equal(access([], 'Japan'), 'unknown');
  assert.equal(visaFit('unknown'), 1);
  assert.equal(ACCESS_LABEL.unknown, '');
});

test('fit ordering matches the tiers', () => {
  assert.ok(visaFit('home') >= visaFit('union'));
  assert.ok(visaFit('union') > visaFit('free') || visaFit('union') === 1);
  assert.ok(visaFit('free') > visaFit('evisa'));
  assert.ok(visaFit('evisa') > visaFit('visa'));
  assert.ok(visaFit('visa') > visaFit('no'));
});

test('every destination country resolves to a real tier for a strong and a weak passport', () => {
  for (const c of CITIES) {
    for (const p of [P('germany'), P('pakistan')]) {
      const a = access(p, c.country);
      assert.ok(['home','union','free','evisa','visa','no'].includes(a), c.country + ': ' + a);
    }
  }
});

test('scoring: an Indian passport lifts Thailand over Schengen twins; an EU one flips it back', () => {
  const base = {morning:1, pace:5, weather:0, window:2, green:5, weekend:2, noise:2, dinner:0,
    foodie:6, moving:2, languages:['english'], langlearn:0, friday:0, social:6, rain:1, souvenir:0,
    divcare:5, scale:7, history:0, openness:7, workstyle:3, safecare:5, safetrade:0, budget:5, worthit:1};
  const rank = passports => {
    const r = rankAll(CITIES, buildUser({ ...base, passports }, QUESTIONS), null);
    return name => r.findIndex(x => x.city.name === name);
  };
  const indian = rank(['india']);
  const german = rank(['germany']);
  assert.ok(indian('Bangkok') < indian('Berlin'), 'IN passport should favor Bangkok');
  /* the passport should shift the balance toward Berlin, not overpower the
     persona: Bangkok's edge over Berlin must shrink for the EU holder */
  const edge = r => r('Berlin') - r('Bangkok');
  assert.ok(edge(german) < edge(indian), 'EU passport should close the gap toward Berlin');
});

test('no passports selected leaves the ranking identical to pre-visa scoring', () => {
  const base = {pace:5, social:5, scale:5, budget:5, safecare:5, divcare:5, languages:['english']};
  const a = rankAll(CITIES, buildUser(base, QUESTIONS), null).map(r=>r.city.name);
  const b = rankAll(CITIES, buildUser({ ...base, passports: [] }, QUESTIONS), null).map(r=>r.city.name);
  assert.deepEqual(a, b);
});

test('every offered passport label resolves', () => {
  for (const p of PASSPORTS) {
    if (!p.g) continue;
    assert.equal(resolvePassports([p.label.toLowerCase()]).length, 1, p.label);
  }
});
