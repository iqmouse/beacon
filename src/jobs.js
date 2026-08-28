/* Beacon jobs — pure and DOM-free, tested under node.
   Availability is honest: a field the city's economy actually carries
   gets a full slate; anywhere else the market is thin — a couple of
   remote-leaning listings plus what the city is genuinely strong in. */
import { FIELDS, ROLES, MODES, payBand } from './data.js';

/* deterministic per-city rotation, stable forever */
const spinFor = city => city.name.length;

export function marketFor(city, fieldId){
  if (!city.ind.includes(fieldId)) return 'thin';
  return city.d.scale >= 7 ? 'strong' : 'steady';
}

export function marketNote(city, fieldId){
  const field = FIELDS.find(f=>f.id===fieldId);
  const m = marketFor(city, fieldId);
  if (m === 'strong') return field.label + ' is one of ' + city.name + '’s strong suits';
  if (m === 'steady') return 'a steady ' + field.label.toLowerCase() + ' market';
  const leans = city.ind.map(i=>FIELDS.find(f=>f.id===i).label.toLowerCase()).slice(0,2).join(' and ');
  return 'a thin market for ' + field.label.toLowerCase() + ' — ' + city.name + ' leans ' + leans;
}

export function buildJobs(city, fieldId){
  const spin = spinFor(city);
  const market = marketFor(city, fieldId);
  const listings = [];
  const make = (fid, i, alt)=>{
    const roles = ROLES[fid];
    return {
      role: roles[(i + spin) % roles.length],
      co: city.cos[(i + spin) % city.cos.length],
      mode: alt ? MODES[(i + spin) % MODES.length]
                : (market === 'thin' ? 'Remote-friendly' : MODES[(i + spin) % MODES.length]),
      pay: payBand(city, fid, i),
      field: fid,
      alt,
    };
  };
  if (market === 'thin'){
    /* the honest two in your field, then what this city really hires for */
    for (let i=0;i<2;i++) listings.push(make(fieldId, i, false));
    const local = city.ind[0] === fieldId ? city.ind[1] : city.ind[0];
    for (let i=0;i<3;i++) listings.push(make(local, i, true));
  } else {
    for (let i=0;i<5;i++) listings.push(make(fieldId, i, false));
  }
  return { market, note: marketNote(city, fieldId), listings };
}

export function altLabel(fieldId){
  return FIELDS.find(f=>f.id===fieldId).label;
}
