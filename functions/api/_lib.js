/* Beacon server helpers — pure where possible, WebCrypto elsewhere.
   Imported by the Pages Function and by the node --test suite
   (Node 20+ ships the same crypto.subtle). */

const PBKDF2_ITERATIONS = 150000;

export function validEmail(s){
  /* the character class deliberately refuses HTML/quote metacharacters:
     this value is stored, echoed by the API, and shown in the client */
  return typeof s === 'string' && s.length <= 254 &&
    /^[^\s@<>"'&]+@[^\s@<>"'&]+\.[^\s@<>"'&]{2,}$/.test(s);
}

export function validPassword(s){
  return typeof s === 'string' && s.length >= 8 && s.length <= 200;
}

const toHex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = hex => new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));

export function randomToken(bytes = 32){
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return toHex(a.buffer);
}

export async function hashPassword(password, saltHex){
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { hash: toHex(bits), salt: toHex(salt.buffer ?? salt) };
}

/* constant-time hex compare */
export function safeEqual(a, b){
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPassword(password, saltHex, expectedHash){
  const { hash } = await hashPassword(password, saltHex);
  return safeEqual(hash, expectedHash);
}

/* Cross-site form POSTs must die at the door: a text/plain form can
   smuggle valid JSON, and SameSite=Lax still lets the response SET a
   cookie — the classic login-CSRF. Same-origin + JSON content type. */
export function crossSiteBlocked(request, url){
  if (request.method === 'GET' || request.method === 'HEAD') return false;
  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return true;
  const ct = (request.headers.get('content-type') || '').toLowerCase();
  if (request.method === 'POST' || request.method === 'PUT'){
    if (!ct.startsWith('application/json')) return true;
  }
  return false;
}

/* ---- Adzuna ---- */

export const ADZ_COUNTRY = {
  'United States':'us','United Kingdom':'gb','Scotland':'gb','Canada':'ca','Australia':'au',
  'Germany':'de','Spain':'es','France':'fr','Netherlands':'nl','New Zealand':'nz',
  'Singapore':'sg','South Africa':'za','Mexico':'mx','Brazil':'br','Austria':'at',
  'Italy':'it','Poland':'pl','India':'in','Switzerland':'ch','Belgium':'be',
};

export const FIELD_TERMS = {
  tech:'software engineer', creative:'designer', finance:'financial analyst',
  health:'nurse', edu:'teacher', hosp:'chef hospitality', trades:'electrician', remote:'remote',
};

export function adzunaUrl(country, city, fieldId, appId, appKey){
  const cc = ADZ_COUNTRY[country];
  if (!cc || !FIELD_TERMS[fieldId]) return null;
  return 'https://api.adzuna.com/v1/api/jobs/' + cc + '/search/1' +
    '?app_id=' + encodeURIComponent(appId) + '&app_key=' + encodeURIComponent(appKey) +
    '&results_per_page=5&what=' + encodeURIComponent(FIELD_TERMS[fieldId]) +
    '&where=' + encodeURIComponent(city) + '&content-type=application/json';
}

export function normalizeAdzuna(data){
  if (!data || !Array.isArray(data.results) || !data.results.length) return null;
  return data.results.slice(0, 5).map(r => ({
    role: String(r.title || 'Role').replace(/<[^>]*>/g, ''),
    co: (r.company && r.company.display_name) || 'Company',
    mode: r.contract_time === 'part_time' ? 'Part-time' : 'Full-time',
    pay: r.salary_min
      ? '$' + Math.round(r.salary_min / 1000) + 'k–$' + Math.round((r.salary_max || r.salary_min) / 1000) + 'k'
      : 'salary unlisted',
    url: r.redirect_url || null,
  }));
}

/* ---- small response helpers ---- */

export const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers },
  });

export function sessionCookie(token, maxAgeSeconds){
  return 'beacon_session=' + token +
    '; HttpOnly; Secure; SameSite=Lax; Path=/api; Max-Age=' + maxAgeSeconds;
}

export function readSessionCookie(request){
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(/(?:^|;\s*)beacon_session=([0-9a-f]{64})/);
  return m ? m[1] : null;
}
