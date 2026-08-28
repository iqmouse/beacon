import { rngFor } from './skyline.js';


export const HOME_TYPES = [
  {t:'Studio',      mult:.72, s:[32,45]},
  {t:'1-bedroom',   mult:1.0, s:[45,65]},
  {t:'2-bedroom',   mult:1.38, s:[65,95]},
  {t:'Loft',        mult:1.15, s:[55,85]},
  {t:'Small house', mult:1.85, s:[90,140]},
];
export const HOME_QUIRKS = [
  'morning light on the kitchen table','a balcony over the lane','five minutes from the water',
  'bookshelves left by the last tenant','a rooftop shared with three neighbors',
  'floors that creak in a friendly way','bikes welcome in the hallway','a lemon tree in the courtyard',
  'windows that open all the way','the good kind of quiet street','market stalls at the corner',
  'sunset side of the building',
];
export const PORTALS = {
  'United States': c=>['Zillow','https://www.zillow.com/homes/'+encodeURIComponent(c.name)+'_rb/'],
  'Netherlands':   c=>['Funda','https://www.funda.nl/huur/'+slug(c.name)+'/'],
  'Spain':         c=>['Idealista','https://www.idealista.com/en/alquiler-viviendas/'+slug(c.name)+'/'],
  'Italy':         c=>['Idealista','https://www.idealista.it/affitto-case/'+slug(c.name)+'/'],
  'Portugal':      c=>['Idealista','https://www.idealista.pt/arrendar-casas/'+slug(c.name)+'/'],
  'United Kingdom':c=>['Zoopla','https://www.zoopla.co.uk/to-rent/property/'+slug(c.name)+'/'],
  'Scotland':      c=>['Zoopla','https://www.zoopla.co.uk/to-rent/property/'+slug(c.name)+'/'],
};
export function slug(s){
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}
export function baseRent(city){ return parseInt(String(city.f.rent).replace(/[^0-9]/g,''), 10) || 1000; }
export function hoodsFor(city){
  const suf = /\s(Studio|Works|Labs|Collective|& Co|Digital|Capital|House|Group|Atelier|Systems|Craft|Kollektiv|& Fils|& Main|& Field|& Pearl)$/;
  const hs = city.cos.map(c=>c.replace(suf,'').trim()).filter(h=>h.length>2);
  return hs.length ? [...new Set(hs)] : [city.name];
}
export function genHomes(city){
  const rnd = rngFor('homes:'+city.name);
  const hoods = (city.hoods && city.hoods.length) ? city.hoods : hoodsFor(city);
  const base = baseRent(city), out = [];
  for (let i=0;i<12;i++){
    const ty = HOME_TYPES[Math.floor(rnd()*HOME_TYPES.length)];
    const rent = Math.round(base*ty.mult*(0.88+rnd()*0.28)/10)*10;
    const sqm = Math.round(ty.s[0] + rnd()*(ty.s[1]-ty.s[0]));
    const hood = hoods[Math.floor(rnd()*hoods.length)];
    out.push({
      id:'home|'+city.name+'|'+i,
      city:city.name,
      title:ty.t+' in '+hood,
      hood, type:ty.t, kind:ty.t,
      rentN:rent, rent:'$'+rent.toLocaleString('en-US')+'/mo',
      size:sqm+' m²',
      quirk:HOME_QUIRKS[Math.floor(rnd()*HOME_QUIRKS.length)],
      furnished:rnd()<.4,
      walk: city.d.transit >= 7 ? (3 + Math.floor(rnd()*10)) + ' min to the metro'
          : city.d.transit >= 5 ? (5 + Math.floor(rnd()*12)) + ' min walk to the tram'
          : 'parking on the street',
    });
  }
  return out.sort((a,b)=>a.rentN-b.rentN);
}
