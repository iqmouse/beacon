export const $ = id => document.getElementById(id);

export const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
};

export const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));

/* HTML-escape for every dynamic string that reaches innerHTML.
   Server data, synced book data, and third-party job fields are all
   untrusted text — this is the one gate they pass through. */
export function esc(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
  }[c]));
}

/* Only plain web links may become hrefs. */
export function safeHttpUrl(u){
  try{
    const p = new URL(String(u));
    return (p.protocol === 'https:' || p.protocol === 'http:') ? p.href : null;
  }catch(e){ return null; }
}

/* Sign-in must never eat this device's saves: union of two books.
   Account scalars win; lanterns union by id. */
export function mergeBooks(account, local){
  const out = { v: 1, profiles: {} };
  const names = new Set([
    ...Object.keys((account && account.profiles) || {}),
    ...Object.keys((local && local.profiles) || {}),
  ]);
  for (const name of names){
    const a = (account && account.profiles && account.profiles[name]) || null;
    const l = (local && local.profiles && local.profiles[name]) || null;
    if (!a){ out.profiles[name] = l; continue; }
    if (!l){ out.profiles[name] = a; continue; }
    const byId = arr => new Map((arr || []).map(x => [x.id, x]));
    const union = (x, y) => [...new Map([...byId(y), ...byId(x)]).values()];
    out.profiles[name] = { ...l, ...a,
      jobs: union(a.jobs, l.jobs), homes: union(a.homes, l.homes) };
  }
  return out;
}
