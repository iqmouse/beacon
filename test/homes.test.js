import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CITIES } from '../src/data.js';
import { genHomes, baseRent, slug, PORTALS } from '../src/homes.js';

test('home generation is deterministic per city', () => {
  const lisbon = CITIES.find(c => c.name === 'Lisbon');
  assert.deepEqual(genHomes(lisbon), genHomes(lisbon));
});

test('every city yields 8 priced, sized, located homes sorted by rent', () => {
  for (const c of CITIES) {
    const homes = genHomes(c);
    assert.equal(homes.length, 8, c.name);
    for (let i = 0; i < homes.length; i++) {
      const h = homes[i];
      assert.ok(h.rentN > 0 && h.hood && h.size && h.quirk, c.name);
      if (i) assert.ok(homes[i - 1].rentN <= h.rentN, c.name + ' sort');
    }
  }
});

test('home prices scale with the researched market rent', () => {
  const cheap = CITIES.find(c => c.name === 'Kathmandu');
  const rich = CITIES.find(c => c.name === 'Zurich');
  const median = cs => genHomes(cs).map(h => h.rentN).sort((a, b) => a - b)[4];
  assert.ok(median(rich) > median(cheap) * 5);
  assert.ok(baseRent(rich) > 3000 && baseRent(cheap) < 300);
});

test('slug strips accents for portal URLs', () => {
  assert.equal(slug('São Paulo'), 'sao-paulo');
  assert.equal(slug('Québec City'), 'quebec-city');
});

test('portal links exist for the mapped countries and are https', () => {
  for (const country of Object.keys(PORTALS)) {
    const city = CITIES.find(c => c.country === country);
    if (!city) continue;
    const [label, url] = PORTALS[country](city);
    assert.ok(label && url.startsWith('https://'), country);
  }
});
