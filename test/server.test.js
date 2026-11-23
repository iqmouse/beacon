import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validEmail, validPassword, randomToken, hashPassword, verifyPassword,
  safeEqual, adzunaUrl, normalizeAdzuna, readSessionCookie, ADZ_COUNTRY,
} from '../functions/api/_lib.js';
import { CITIES } from '../src/data.js';

test('email and password validation', () => {
  assert.ok(validEmail('a@b.co'));
  assert.ok(!validEmail('not-an-email'));
  assert.ok(!validEmail('a@b'));
  assert.ok(validPassword('eightchr'));
  assert.ok(!validPassword('short'));
});

test('password hashing round-trips and rejects wrong passwords', async () => {
  const { hash, salt } = await hashPassword('correct horse battery');
  assert.ok(await verifyPassword('correct horse battery', salt, hash));
  assert.ok(!(await verifyPassword('wrong horse', salt, hash)));
  const again = await hashPassword('correct horse battery', salt);
  assert.equal(again.hash, hash, 'same salt, same hash — deterministic');
});

test('tokens are long, hex, and never repeat', () => {
  const a = randomToken(32), b = randomToken(32);
  assert.match(a, /^[0-9a-f]{64}$/);
  assert.notEqual(a, b);
});

test('safeEqual is exact', () => {
  assert.ok(safeEqual('abc123', 'abc123'));
  assert.ok(!safeEqual('abc123', 'abc124'));
  assert.ok(!safeEqual('abc', 'abcd'));
});

test('adzuna url only forms for covered countries and known fields', () => {
  assert.ok(adzunaUrl('Germany', 'Berlin', 'tech', 'id', 'key').includes('/jobs/de/'));
  assert.equal(adzunaUrl('Japan', 'Tokyo', 'tech', 'id', 'key'), null);
  assert.equal(adzunaUrl('Germany', 'Berlin', 'nonsense', 'id', 'key'), null);
});

test('adzuna normalization strips markup and prices sanely', () => {
  const sample = { results: [
    { title: 'Senior <b>Designer</b>', company: { display_name: 'Acme GmbH' },
      salary_min: 60000, salary_max: 80000, redirect_url: 'https://example.com/x' },
    { title: 'Junior Role', company: null, contract_time: 'part_time' },
  ]};
  const out = normalizeAdzuna(sample);
  assert.equal(out[0].role, 'Senior Designer');
  assert.equal(out[0].pay, '$60k–$80k');
  assert.equal(out[1].co, 'Company');
  assert.equal(out[1].mode, 'Part-time');
  assert.equal(normalizeAdzuna({ results: [] }), null);
});

test('session cookie parsing is strict', () => {
  const tok = randomToken(32);
  const req = cookie => ({ headers: { get: () => cookie } });
  assert.equal(readSessionCookie(req('beacon_session=' + tok)), tok);
  assert.equal(readSessionCookie(req('other=1; beacon_session=' + tok + '; x=2')), tok);
  assert.equal(readSessionCookie(req('beacon_session=short')), null);
  assert.equal(readSessionCookie(req('')), null);
});

test('server country coverage matches cities that claim it', () => {
  const covered = CITIES.filter(c => ADZ_COUNTRY[c.country]).length;
  assert.ok(covered >= 60, 'expected a broad live-jobs footprint, got ' + covered);
});
