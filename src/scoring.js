/* Beacon scoring — the whole matching engine, pure and DOM-free.
   Twenty-seven answers in, a ranked list of 173 cities out, and not a
   single Math.random() on the way: same answers, same result, forever.
   The interesting parts are the asymmetric fits below — language is a
   capability, cost is one-way, safety is a floor with a personal
   escape valve, diversity only counts if you care. */
import { clamp } from './util.js';
import { resolvePassports, access, visaFit } from './visas.js';

export const DIMS = ['pace','nature','culture','social','warmth','afford','food','transit','openness','scale','safe','div'];

export const DIM_LABELS = {
  pace:'Pace of life', nature:'Nature', culture:'Culture', social:'Social scene',
  warmth:'Climate', afford:'Cost of living', food:'Food scene',
  transit:'Getting around', openness:'Ease of arriving', scale:'City size',
  safe:'Safety', div:'Diversity', lang:'Language ease', visa:'Visa ease'
};

export const WEIGHTS = {
  pace:1.15, nature:1, culture:1, social:1, warmth:1.05,
  food:.9, transit:.9, openness:.8, scale:1.05
};

export const TRAIT_WORDS = {
  pace:    {hi:'full current', lo:'slow tide'},
  nature:  {hi:'wild at heart', lo:'city creature'},
  culture: {hi:'culture-hungry', lo:'simple pleasures'},
  social:  {hi:'people person', lo:'quiet company'},
  warmth:  {hi:'sun-seeker', lo:'sweater weather'},
  afford:  {hi:'travels light', lo:'comfort first'},
  food:    {hi:'led by appetite', lo:'eats to live'},
  transit: {hi:'goes on foot', lo:'open road'},
  openness:{hi:'newcomer at home', lo:'deep roots'},
  scale:   {hi:'megacity hum', lo:'cozy scale'},
  safe:    {hi:'sleeps easy', lo:'edge-friendly'},
  div:     {hi:'world on one street', lo:'close to home'},
};

/* Twenty-six answers become a user profile: sliders set the base,
   card choices refine it, capability answers ride alongside. */
export function buildUser(answers, QUESTIONS){
  const user = {};
  DIMS.forEach(k=>user[k]=5);
  QUESTIONS.forEach(q=>{
    const a = answers[q.key];
    if (q.type === 'slider' && a !== undefined){
      if (q.key === 'budget'){ user.tol = a; user.afford = clamp(10 - a, 0, 10); }
      else user[q.dim] = a;
    }
  });
  QUESTIONS.forEach(q=>{
    const a = answers[q.key];
    if (q.type === 'cards' && a !== undefined){
      const fx = q.opts[a].fx || {};
      for (const k in fx) user[k] = clamp(user[k] + fx[k]*0.7, 0, 10);
    }
  });
  user.tol = user.tol ?? 5;
  user.langs = (answers.languages && answers.languages.length) ? answers.languages : ['english'];
  user.learn = [9,6,3,0][answers.langlearn ?? 1];
  user.trade = ['culture','cheap','nature','none'][answers.safetrade ?? 3];
  user.qolDims = [['transit','safe'],['food','culture'],['nature','transit'],null][answers.worthit ?? 0];
  user.passports = resolvePassports(answers.passports);
  return user;
}

/* language: capability, not preference */
export function langFit(c, user){
  if (c.langs.some(l=>user.langs.includes(l))) return 1;
  if (c.eng && user.langs.includes('english')) return .8 + .02*user.learn;
  return .3 + .06*user.learn;
}
/* cost: strictly monotonic — a cheaper city NEVER scores worse on cost,
   no matter how big the budget. Inside your comfort zone the slope is
   gentle; beyond it the penalty steepens, softened only where the cost
   buys the quality the user named. A big budget flattens the cliff —
   it never turns expense into a virtue. */
export function costFit(c, user){
  const tol = 2 + .8*user.tol;
  const gentle = 1 - c.cost * .012;
  if (c.cost <= tol) return gentle;
  const excess = c.cost - tol;
  const qol = user.qolDims ? (c.d[user.qolDims[0]] + c.d[user.qolDims[1]])/20 : 0;
  return clamp(gentle - excess * .13 * (1.35 - .85*qol), 0, 1);
}
/* safety: a one-sided floor, softened by the user's chosen tradeoff */
export function safeFit(c, user){
  const gap = Math.max(0, user.safe * .9 - c.d.safe);
  let forgive = 0;
  if (user.trade === 'culture' && (c.d.culture + c.d.food)/2 >= 7.5) forgive = .45;
  if (user.trade === 'cheap'   && c.cost <= 3) forgive = .45;
  if (user.trade === 'nature'  && c.d.nature >= 8) forgive = .45;
  return clamp(1 - (gap/10) * 1.3 * (1 - forgive), 0, 1);
}
/* diversity: one-sided care — not caring is neutral, never a penalty */
export function divFit(c, user){
  const gap = Math.max(0, user.div - c.d.div);
  return clamp(1 - (gap/10) * 1.1, 0, 1);
}

export function scoreCity(c, user, fieldId){
  let sum = 0, wsum = 0;
  const fits = {};
  for (const k in WEIGHTS){
    const fit = 1 - Math.abs(c.d[k] - user[k])/10;
    fits[k] = Math.round(fit*100);
    sum += fit * WEIGHTS[k];
    wsum += WEIGHTS[k];
  }
  const hasPass = user.passports && user.passports.length;
  const extras = [
    ['lang',   langFit(c, user), 1.2],
    ['afford', costFit(c, user), 1.15],
    ['safe',   safeFit(c, user), .7 + .06*user.safe],
    ['div',    divFit(c, user), .3 + .07*user.div],
    /* visa ease: a paperwork question, weighted only when we know the passport */
    ['visa',   hasPass ? visaFit(access(user.passports, c.country)) : 1, hasPass ? 1.0 : 0],
  ];
  for (const [k,f,w] of extras){
    fits[k] = Math.round(f*100);
    sum += f*w; wsum += w;
  }
  let raw = Math.pow(sum/wsum, 2.1) * 100;
  if (fieldId && c.ind.includes(fieldId)) raw += 6;
  /* raw drives the ranking; the rounded score is only for display */
  return {city:c, raw, score:clamp(Math.round(raw),1,99), fits};
}

/* deterministic: raw float ranks, alphabetical tiebreak */
export function rankAll(cities, user, fieldId){
  return cities.map(c=>scoreCity(c, user, fieldId))
    .sort((a,b)=> b.raw - a.raw || a.city.name.localeCompare(b.city.name));
}

export function traitWords(user){
  return DIMS.map(k=>({k, dev:Math.abs(user[k]-5)}))
    .sort((a,b)=>b.dev-a.dev).slice(0,3)
    .map(o=> user[o.k] >= 5 ? TRAIT_WORDS[o.k].hi : TRAIT_WORDS[o.k].lo);
}
