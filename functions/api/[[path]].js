/* Beacon API — one Cloudflare Pages Function.
   Routes: /api/health, /api/signup, /api/login, /api/logout, /api/me,
           /api/book (GET/PUT), /api/jobs (GET).
   Bindings: DB (D1). Secrets: ADZUNA_APP_ID, ADZUNA_APP_KEY.
   The client works fully without any of this — the API only adds
   accounts, cross-device sync, and live job listings. */
import {
  validEmail, validPassword, randomToken, hashPassword, verifyPassword,
  adzunaUrl, normalizeAdzuna, json, sessionCookie, readSessionCookie,
  crossSiteBlocked,
} from './_lib.js';

const SESSION_DAYS = 30;
const BOOK_LIMIT = 256 * 1024;          /* a lantern should not be a warehouse */
const JOBS_CACHE_SECONDS = 6 * 60 * 60;

async function currentUser(request, env){
  const token = readSessionCookie(request);
  if (!token) return null;
  const row = await env.DB.prepare(
    'SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id ' +
    'WHERE s.token = ?1 AND s.expires_at > ?2')
    .bind(token, Date.now()).first();
  return row || null;
}

async function createSession(env, userId){
  const token = randomToken(32);
  const expires = Date.now() + SESSION_DAYS * 86400000;
  await env.DB.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?1, ?2, ?3)')
    .bind(token, userId, expires).run();
  return token;
}

async function readBody(request){
  try { return await request.json(); } catch (e) { return null; }
}

export async function onRequest(context){
  const { request, env } = context;
  const url = new URL(request.url);
  const route = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  try {
    if (crossSiteBlocked(request, url)) return json({ error: 'cross-site request refused' }, 403);
    if (route === '/api/health') return json({ ok: true });

    if (route === '/api/signup' && method === 'POST'){
      const body = await readBody(request);
      if (!body || !validEmail(body.email)) return json({ error: 'That email does not look right.' }, 400);
      if (!validPassword(body.password)) return json({ error: 'Passwords need at least 8 characters.' }, 400);
      const email = body.email.trim().toLowerCase();
      const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?1').bind(email).first();
      if (existing) return json({ error: 'That email already has a lantern — sign in instead.' }, 409);
      const { hash, salt } = await hashPassword(body.password);
      const id = randomToken(16);
      await env.DB.prepare(
        'INSERT INTO users (id, email, pw_hash, pw_salt, created_at) VALUES (?1, ?2, ?3, ?4, ?5)')
        .bind(id, email, hash, salt, new Date().toISOString()).run();
      const token = await createSession(env, id);
      return json({ email }, 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400) });
    }

    if (route === '/api/login' && method === 'POST'){
      const body = await readBody(request);
      if (!body || !validEmail(body.email) || typeof body.password !== 'string')
        return json({ error: 'Email and password, please.' }, 400);
      const email = body.email.trim().toLowerCase();
      const user = await env.DB.prepare(
        'SELECT id, email, pw_hash, pw_salt FROM users WHERE email = ?1').bind(email).first();
      /* same answer whether the email or the password is wrong */
      if (!user || !(await verifyPassword(body.password, user.pw_salt, user.pw_hash)))
        return json({ error: 'That email and password do not match.' }, 401);
      const token = await createSession(env, user.id);
      return json({ email: user.email }, 200, { 'set-cookie': sessionCookie(token, SESSION_DAYS * 86400) });
    }

    if (route === '/api/logout' && method === 'POST'){
      const token = readSessionCookie(request);
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?1').bind(token).run();
      return json({ ok: true }, 200, { 'set-cookie': sessionCookie('gone', 0) });
    }

    if (route === '/api/me'){
      const user = await currentUser(request, env);
      return user ? json({ email: user.email }) : json({ error: 'signed out' }, 401);
    }

    if (route === '/api/book'){
      const user = await currentUser(request, env);
      if (!user) return json({ error: 'signed out' }, 401);
      if (method === 'GET'){
        const row = await env.DB.prepare('SELECT data, updated_at FROM books WHERE user_id = ?1')
          .bind(user.id).first();
        return json(row ? { book: JSON.parse(row.data), updated: row.updated_at } : { book: null });
      }
      if (method === 'PUT'){
        const text = await request.text();
        if (text.length > BOOK_LIMIT) return json({ error: 'That lantern is too heavy to carry.' }, 413);
        let parsed;
        try { parsed = JSON.parse(text); } catch (e) { return json({ error: 'bad json' }, 400); }
        if (!parsed || typeof parsed !== 'object' || !parsed.profiles) return json({ error: 'bad book' }, 400);
        await env.DB.prepare(
          'INSERT INTO books (user_id, data, updated_at) VALUES (?1, ?2, ?3) ' +
          'ON CONFLICT(user_id) DO UPDATE SET data = ?2, updated_at = ?3')
          .bind(user.id, text, new Date().toISOString()).run();
        return json({ ok: true });
      }
    }

    if (route === '/api/jobs' && method === 'GET'){
      const city = (url.searchParams.get('city') || '').slice(0, 60);
      const country = (url.searchParams.get('country') || '').slice(0, 60);
      const field = (url.searchParams.get('field') || '').slice(0, 20);
      if (!env.ADZUNA_APP_ID || !env.ADZUNA_APP_KEY) return json({ live: false, reason: 'no upstream' });
      const upstream = adzunaUrl(country, city, field, env.ADZUNA_APP_ID, env.ADZUNA_APP_KEY);
      if (!upstream) return json({ live: false, reason: 'uncovered' });

      /* cache by city+field so the free Adzuna tier lasts */
      const cacheKey = new Request(url.origin + '/api/jobs?c=' +
        encodeURIComponent(country + '|' + city + '|' + field));
      const cache = caches.default;
      const hit = await cache.match(cacheKey);
      if (hit) return hit;

      const res = await fetch(upstream, { signal: AbortSignal.timeout(6000) });
      if (!res.ok) return json({ live: false, reason: 'upstream ' + res.status });
      const listings = normalizeAdzuna(await res.json());
      if (!listings) return json({ live: false, reason: 'empty' });
      const out = json({ live: true, listings }, 200,
        { 'cache-control': 'public, max-age=' + JOBS_CACHE_SECONDS });
      context.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    }

    return json({ error: 'not found' }, 404);
  } catch (err) {
    return json({ error: 'something slipped in the dark' }, 500);
  }
}
