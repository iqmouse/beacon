import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES, FIELDS } from '../src/data.js';
import { buildJobs, marketFor } from '../src/jobs.js';

test('job availability follows the city economy', () => {
  const chiangmai = CITIES.find(c => c.name === 'Chiang Mai');   /* remote, hosp, creative */
  assert.equal(marketFor(chiangmai, 'finance'), 'thin');
  const nyc = CITIES.find(c => c.name === 'New York');           /* finance hub, scale 10 */
  assert.equal(marketFor(nyc, 'finance'), 'strong');
});

test('a thin market shows two in-field listings plus three the city actually hires for', () => {
  const chiangmai = CITIES.find(c => c.name === 'Chiang Mai');
  const jm = buildJobs(chiangmai, 'finance');
  assert.equal(jm.market, 'thin');
  const own = jm.listings.filter(l => !l.alt);
  const alt = jm.listings.filter(l => l.alt);
  assert.equal(own.length, 2);
  assert.equal(alt.length, 3);
  assert.ok(own.every(l => l.field === 'finance' && l.mode === 'Remote-friendly'));
  assert.ok(alt.every(l => chiangmai.ind.includes(l.field)));
  assert.match(jm.note, /thin market/);
});

test('an in-economy field gets a full slate, deterministically', () => {
  const berlin = CITIES.find(c => c.name === 'Berlin');
  const a = buildJobs(berlin, 'tech');
  const b = buildJobs(berlin, 'tech');
  assert.equal(a.listings.length, 5);
  assert.ok(a.listings.every(l => !l.alt && l.field === 'tech'));
  assert.deepEqual(a, b);
});

test('every field in every city yields five priced listings with valid modes', () => {
  for (const c of CITIES) {
    for (const f of FIELDS) {
      const jm = buildJobs(c, f.id);
      assert.equal(jm.listings.length, 5, c.name + '/' + f.id);
      for (const l of jm.listings) {
        assert.ok(/^\$\d+k–\$\d+k$/.test(l.pay), c.name + ': ' + l.pay);
        assert.ok(l.role && l.co && l.mode, c.name);
      }
    }
  }
});
