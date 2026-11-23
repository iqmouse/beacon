import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esc, safeHttpUrl, mergeBooks } from '../src/util.js';
import { validEmail, crossSiteBlocked, normalizeAdzuna } from '../functions/api/_lib.js';

test('esc neutralizes every HTML metacharacter', () => {
  assert.equal(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(esc('a"b\'c&d'), 'a&quot;b&#39;c&amp;d');
  assert.equal(esc(null), '');
  assert.equal(esc(42), '42');
});

test('the unterminated-tag trick survives the server strip but dies at esc', () => {
  /* a title with no ">" passes the server's tag-strip regex untouched */
  const sneaky = 'Engineer <img src=x onerror=alert(1) x=';
  const out = normalizeAdzuna({ results: [{ title: sneaky }] })[0].role;
  assert.ok(out.includes('<img'), 'server strip alone does not catch it');
  assert.ok(!esc(out).includes('<'), 'esc is the real gate');
});

test('only http(s) URLs become hrefs', () => {
  assert.ok(safeHttpUrl('https://www.adzuna.de/land/ad/1'));
  assert.ok(safeHttpUrl('http://example.com/x?y=1'));
  assert.equal(safeHttpUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpUrl('data:text/html,<script>1</script>'), null);
  assert.equal(safeHttpUrl('not a url'), null);
});

test('emails with HTML metacharacters are refused', () => {
  assert.ok(validEmail('a.person@example.com'));
  assert.ok(!validEmail('<img/src=x/onerror=alert(1)>@a.bc'));
  assert.ok(!validEmail('a"b@example.com'));
  assert.ok(!validEmail("a'b@example.com"));
  assert.ok(!validEmail('a&b@example.com'));
});

test('cross-site auth posts are blocked; same-origin JSON passes', () => {
  const req = (method, headers) => ({ method, headers: { get: k => headers[k.toLowerCase()] || null } });
  const url = new URL('https://beacon-ejo.pages.dev/api/login');
  /* the text/plain form-post smuggle */
  assert.ok(crossSiteBlocked(req('POST', { 'content-type': 'text/plain', origin: 'https://evil.example' }), url));
  /* right content type but foreign origin */
  assert.ok(crossSiteBlocked(req('POST', { 'content-type': 'application/json', origin: 'https://evil.example' }), url));
  /* the legitimate client */
  assert.ok(!crossSiteBlocked(req('POST', { 'content-type': 'application/json', origin: 'https://beacon-ejo.pages.dev' }), url));
  assert.ok(!crossSiteBlocked(req('POST', { 'content-type': 'application/json' }), url));
  assert.ok(!crossSiteBlocked(req('GET', {}), url));
});

test('signing in merges books — never eats this device’s saves', () => {
  const local = { v:1, profiles: { Wanderer: { jobs: [{id:'j1', role:'A'}], homes: [{id:'h1'}] } } };
  const account = { v:1, profiles: {
    Wanderer: { jobs: [{id:'j2', role:'B'}], homes: [], matches: [{name:'Lisbon', score:90}] },
    Harbor: { jobs: [], homes: [{id:'h9'}] },
  }};
  const m = mergeBooks(account, local);
  assert.deepEqual(Object.keys(m.profiles).sort(), ['Harbor', 'Wanderer']);
  assert.equal(m.profiles.Wanderer.jobs.length, 2, 'lanterns union by id');
  assert.equal(m.profiles.Wanderer.homes.length, 1);
  assert.equal(m.profiles.Wanderer.matches[0].name, 'Lisbon', 'account scalars win');
  assert.equal(mergeBooks(null, local).profiles.Wanderer.jobs.length, 1);
  assert.equal(mergeBooks(account, null).profiles.Harbor.homes.length, 1);
});
