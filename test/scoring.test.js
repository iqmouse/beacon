import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, CONTINENT_OF, CONTS } from '../src/data.js';
import { QUESTIONS } from '../src/questions.js';
import {
  DIMS, WEIGHTS, buildUser, scoreCity, rankAll,
  langFit, costFit, safeFit, divFit, traitWords,
} from '../src/scoring.js';

/* a mild, centered set of answers to build variations on */
const BASE = {
  morning:1, pace:5, weather:3, window:3, green:5, weekend:0, noise:1, dinner:0,
  foodie:5, moving:0, languages:['english'], langlearn:1, friday:1, social:5,
  rain:3, souvenir:1, divcare:5, scale:5, history:3, openness:5, workstyle:2,
  safecare:5, safetrade:3, budget:5, worthit:0, field:null,
};
const u = extra => buildUser({ ...BASE, ...extra }, QUESTIONS);
const rank = (extra, field = null) => rankAll(CITIES, u(extra), field);
const rankOf = (list, name) => list.findIndex(r => r.city.name === name) + 1;

/* ---------------- determinism & sanity ---------------- */

test('same answers always produce the same ranking', () => {
  const a = rank({}).map(r => r.city.name + r.score);
  const b = rank({}).map(r => r.city.name + r.score);
  assert.deepEqual(a, b);
});

test('every city gets a score in [1, 99], no negatives ever', () => {
  const extremes = [
    {},
    { pace:0, green:10, foodie:0, social:0, scale:0, divcare:0, safecare:10, budget:0, langlearn:3 },
    { pace:10, green:0, foodie:10, social:10, scale:10, divcare:10, safecare:0, budget:10, langlearn:0 },
  ];
  for (const e of extremes) {
    for (const r of rank(e)) {
      assert.ok(r.score >= 1 && r.score <= 99, `${r.city.name}: ${r.score}`);
    }
  }
});

test('ranking is monotonic in raw score with alphabetical tiebreak', () => {
  const r = rank({});
  for (let i = 1; i < r.length; i++) {
    assert.ok(r[i - 1].raw >= r[i].raw);
    if (r[i - 1].raw === r[i].raw) {
      assert.ok(r[i - 1].city.name.localeCompare(r[i].city.name) < 0);
    }
  }
});

test('per-dimension fits are percentages', () => {
  const r = rank({})[0];
  for (const k of [...Object.keys(WEIGHTS), 'lang', 'afford', 'safe', 'div']) {
    assert.ok(r.fits[k] >= 0 && r.fits[k] <= 100, k);
  }
});

test('field bonus lifts matching-industry cities, never others', () => {
  const user = u({});
  for (const c of CITIES.slice(0, 20)) {
    const plain = scoreCity(c, user, null).raw;
    const boosted = scoreCity(c, user, 'tech').raw;
    if (c.ind.includes('tech')) assert.ok(boosted > plain, c.name);
    else assert.equal(boosted, plain, c.name);
  }
});

/* ---------------- language: capability, not preference ---------------- */

test('shared language is always full credit', () => {
  const tokyo = CITIES.find(c => c.name === 'Tokyo');
  assert.equal(langFit(tokyo, u({ languages:['japanese'], langlearn:3 })), 1);
});

test('a language dealbreaker pins matching-language cities to the top', () => {
  const r = rank({ languages:['japanese'], langlearn:3 });
  const top5 = r.slice(0, 5).map(x => x.city.country);
  assert.ok(top5.filter(c => c === 'Japan').length >= 3, top5.join(','));
});

test('willingness to learn reopens the world', () => {
  const strict = rank({ languages:['japanese'], langlearn:3 });
  const eager = rank({ languages:['japanese'], langlearn:0 });
  const nonJa = list => list.slice(0, 10).filter(x => x.city.country !== 'Japan').length;
  assert.ok(nonJa(eager) > nonJa(strict));
});

test('English-friendliness earns partial credit for English speakers only', () => {
  const cph = CITIES.find(c => c.name === 'Copenhagen'); /* Danish, English everywhere */
  assert.ok(langFit(cph, u({ languages:['english'] })) >= 0.8);
  assert.ok(langFit(cph, u({ languages:['thai'], langlearn:2 })) < 0.6);
});

/* ---------------- cost: asymmetric by design ---------------- */

test('cheaper than your comfort is never penalized', () => {
  const user = u({ budget:8 });
  for (const c of CITIES) {
    if (c.cost <= 2 + 0.8 * user.tol) assert.equal(costFit(c, user), 1, c.name);
  }
});

test('a big budget stops the penalty but never makes expensive rank better', () => {
  const zurich = CITIES.find(c => c.name === 'Zurich');
  const tight = costFit(zurich, u({ budget:1, worthit:3 }));
  const rich = costFit(zurich, u({ budget:9, worthit:3 }));
  assert.ok(rich >= tight);
  assert.ok(rich < 1, 'Zurich must still carry a cost penalty even for big spenders');
});

test('the QoL dividend only softens cost where the city delivers the named quality', () => {
  const zurich = CITIES.find(c => c.name === 'Zurich');   /* superb transit+safety */
  const strict = costFit(zurich, u({ budget:6, worthit:3 }));
  const infra = costFit(zurich, u({ budget:6, worthit:0 }));
  assert.ok(infra > strict);
});

test('tight budget ranks cheap cities far above expensive twins', () => {
  const r = rank({ budget:1, worthit:3 });
  assert.ok(rankOf(r, 'Prague') < 20, 'Prague should be near the top');
  assert.ok(rankOf(r, 'Zurich') > 120, 'Zurich should be near the bottom');
});

/* ---------------- safety: personal floor with a personal escape valve ---------------- */

test('not caring about safety makes the dimension nearly neutral', () => {
  const rio = CITIES.find(c => c.name === 'Rio de Janeiro');
  assert.ok(safeFit(rio, u({ safecare:0 })) > 0.95);
});

test('the chosen tradeoff forgives exactly the right cities', () => {
  const rio = CITIES.find(c => c.name === 'Rio de Janeiro');      /* nature 9 */
  const none = safeFit(rio, u({ safecare:9, safetrade:3 }));
  const nature = safeFit(rio, u({ safecare:9, safetrade:2 }));
  assert.ok(nature > none, 'nature tradeoff must soften Rio');
  const jhb = CITIES.find(c => c.name === 'Johannesburg');        /* nature 6 */
  assert.equal(
    safeFit(jhb, u({ safecare:9, safetrade:2 })),
    safeFit(jhb, u({ safecare:9, safetrade:3 })),
    'nature tradeoff must NOT soften a city without the nature to justify it',
  );
});

/* ---------------- diversity: one-sided care ---------------- */

test('caring favors mixed cities; not caring penalizes no one', () => {
  const kyoto = CITIES.find(c => c.name === 'Kyoto');
  const toronto = CITIES.find(c => c.name === 'Toronto');
  assert.ok(divFit(toronto, u({ divcare:10 })) > divFit(kyoto, u({ divcare:10 })));
  assert.equal(divFit(kyoto, u({ divcare:0 })), 1);
  assert.equal(divFit(toronto, u({ divcare:0 })), 1);
});

/* ---------------- profile building ---------------- */

test('sliders set the base and cards refine it', () => {
  const user = u({ pace:9 });
  assert.ok(user.pace >= 8, 'slider base survives card nudges');
  assert.equal(u({ budget:3 }).tol, 3);
  assert.equal(u({ budget:3 }).afford, 7);
});

test('trait words come from the strongest deviations', () => {
  const words = traitWords(u({ pace:0, green:10, foodie:10 }));
  assert.equal(words.length, 3);
  assert.ok(words.includes('slow tide') || words.includes('wild at heart') || words.includes('led by appetite'));
});

/* ---------------- database integrity ---------------- */

test('173 cities, all structurally complete', () => {
  assert.equal(CITIES.length, 173);
  const seen = new Set();
  for (const c of CITIES) {
    assert.ok(!seen.has(c.name), 'duplicate ' + c.name);
    seen.add(c.name);
    for (const k of DIMS) {
      assert.ok(typeof c.d[k] === 'number' && c.d[k] >= 0 && c.d[k] <= 10, `${c.name}.${k}`);
    }
    assert.ok(c.cost >= 1 && c.cost <= 10, c.name + ' cost');
    assert.ok(Array.isArray(c.langs) && c.langs.length, c.name + ' langs');
    assert.equal(c.cos.length, 5, c.name + ' cos');
    assert.ok(c.why && c.f.pop && c.f.rent && c.f.sun && c.f.lang, c.name + ' facts');
    assert.ok(CONTINENT_OF[c.country], c.name + ' continent for ' + c.country);
  }
});

test('every continent can fill a top three', () => {
  for (const cont of CONTS) {
    const n = CITIES.filter(c => CONTINENT_OF[c.country] === cont).length;
    assert.ok(n >= 3, cont + ': ' + n);
  }
});
