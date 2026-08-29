/* Beacon visas — pure and DOM-free, tested under node.
   Group-level tourist-entry rules: which passports walk into which
   countries without paperwork, which need a quick e-permit, which need
   a real visa. Deliberately coarse — blocs and typical entry rules,
   not per-person immigration advice — and the app says so.
   Entry tiers fold light e-authorizations (ESTA/eTA/ETA) into 'free'. */

export const PASSPORTS = [
  {label:'United States', g:'US', home:['United States','Puerto Rico']},
  {label:'Canada', g:'CA', home:['Canada']},
  {label:'United Kingdom', g:'UK', home:['United Kingdom','Scotland']},
  {label:'Ireland', g:'EU', home:['Ireland']},
  {label:'Germany', g:'EU', home:['Germany']},
  {label:'France', g:'EU', home:['France']},
  {label:'Spain', g:'EU', home:['Spain']},
  {label:'Portugal', g:'EU', home:['Portugal']},
  {label:'Italy', g:'EU', home:['Italy']},
  {label:'Netherlands', g:'EU', home:['Netherlands']},
  {label:'Another EU / EEA country', g:'EU', home:[]},
  {label:'Switzerland', g:'EU', home:['Switzerland']},
  {label:'Australia', g:'AU', home:['Australia']},
  {label:'New Zealand', g:'NZ', home:['New Zealand']},
  {label:'Japan', g:'JP', home:['Japan']},
  {label:'South Korea', g:'KR', home:['South Korea']},
  {label:'Singapore', g:'SG', home:['Singapore']},
  {label:'Malaysia', g:'MY', home:['Malaysia']},
  {label:'China', g:'CN', home:['China']},
  {label:'India', g:'IN', home:['India']},
  {label:'Thailand', g:'TH', home:['Thailand']},
  {label:'Vietnam', g:'VN', home:['Vietnam']},
  {label:'Philippines', g:'PH', home:['Philippines']},
  {label:'Indonesia', g:'ID', home:['Indonesia']},
  {label:'Brazil', g:'BR', home:['Brazil']},
  {label:'Argentina', g:'AR', home:['Argentina']},
  {label:'Mexico', g:'MX', home:['Mexico']},
  {label:'Colombia', g:'CO', home:['Colombia']},
  {label:'Chile', g:'CL', home:['Chile']},
  {label:'Turkey', g:'TR', home:['Turkey']},
  {label:'United Arab Emirates', g:'AE', home:['United Arab Emirates']},
  {label:'Israel', g:'IL', home:['Israel']},
  {label:'South Africa', g:'ZA', home:['South Africa']},
  {label:'Nigeria', g:'NG', home:['Nigeria']},
  {label:'Kenya', g:'KE', home:['Kenya']},
  {label:'Egypt', g:'EG', home:['Egypt']},
  {label:'Pakistan', g:'PK', home:['Pakistan']},
  {label:'Somewhere else', g:null, home:[]},
];

/* EU/EEA/Swiss freedom-of-movement destinations */
const EU_DEST = new Set(['Portugal','Spain','France','Belgium','Netherlands','Germany',
  'Switzerland','Italy','Sweden','Norway','Finland','Iceland','Ireland','Poland','Hungary',
  'Romania','Croatia','Slovenia','Greece','Estonia','Latvia','Lithuania','Malta','Denmark',
  'Austria','Czechia']);
/* South American residence-agreement destinations (Mercosur & associates) */
const SAM_DEST = new Set(['Brazil','Argentina','Chile','Colombia','Peru','Uruguay']);
const SAM_PASS = new Set(['BR','AR','CL','CO']);

const STRONG = ['EU','UK','US','CA','AU','NZ','JP','KR','SG','MY'];
const LATAM  = ['BR','AR','MX','CO','CL'];

/* Per destination country: vf = visa-free / on-arrival / light e-permit;
   evisa = straightforward online visa; no = effectively closed.
   'ALL' opens that tier to every passport group. Anything unlisted: visa. */
const VISAS = {
  'United States':        {vf:['EU','UK','CA','AU','NZ','JP','KR','SG','CL','IL'], evisa:[]},
  'Puerto Rico':          {vf:['EU','UK','CA','AU','NZ','JP','KR','SG','CL','IL'], evisa:[]},
  'Canada':               {vf:['EU','UK','US','AU','NZ','JP','KR','SG','CL','IL'], evisa:['MX']},
  'Mexico':               {vf:[...STRONG,'BR','AR','CO','CL','AE','IL'], evisa:['TR']},
  'Costa Rica':           {vf:[...STRONG,'MX','BR','AR','CL','CO','AE','IL'], evisa:[]},
  'Panama':               {vf:[...STRONG,...LATAM,'AE','IL','ZA'], evisa:[]},
  'Dominican Republic':   {vf:[...STRONG,...LATAM,'AE','IL','ZA','TR'], evisa:[]},
  'Brazil':               {vf:['EU','UK','JP','KR','SG','MY','MX','CL','AR','CO','ZA','IL','TR'], evisa:['US','CA','AU','NZ']},
  'Argentina':            {vf:[...STRONG,...LATAM.filter(g=>g!=='AR'),'ZA','IL','TR','AE'], evisa:[]},
  'Chile':                {vf:[...STRONG,'BR','AR','CO','MX','ZA','IL','TR','AE'], evisa:[]},
  'Peru':                 {vf:[...STRONG,...LATAM,'ZA','IL','TR','AE'], evisa:[]},
  'Colombia':             {vf:[...STRONG,'BR','AR','CL','MX','IL','TR','AE'], evisa:[]},
  'Uruguay':              {vf:[...STRONG,...LATAM,'ZA','IL','TR','AE'], evisa:[]},
  /* Schengen Europe — one shared entry list */
  'Portugal':   'SCHENGEN','Spain':'SCHENGEN','France':'SCHENGEN','Belgium':'SCHENGEN',
  'Netherlands':'SCHENGEN','Germany':'SCHENGEN','Switzerland':'SCHENGEN','Italy':'SCHENGEN',
  'Sweden':'SCHENGEN','Norway':'SCHENGEN','Finland':'SCHENGEN','Iceland':'SCHENGEN',
  'Poland':'SCHENGEN','Hungary':'SCHENGEN','Romania':'SCHENGEN','Croatia':'SCHENGEN',
  'Slovenia':'SCHENGEN','Greece':'SCHENGEN','Estonia':'SCHENGEN','Latvia':'SCHENGEN',
  'Lithuania':'SCHENGEN','Malta':'SCHENGEN','Denmark':'SCHENGEN','Austria':'SCHENGEN',
  'Czechia':'SCHENGEN',
  'Ireland':              {vf:['UK','US','CA','AU','NZ','JP','KR','SG','MY','BR','AR','MX','CO','CL','AE','IL','ZA'], evisa:[]},
  'United Kingdom':       {vf:['EU','US','CA','AU','NZ','JP','KR','SG','MY','BR','AR','MX','CO','CL','AE','IL'], evisa:[]},
  'Scotland':             {vf:['EU','US','CA','AU','NZ','JP','KR','SG','MY','BR','AR','MX','CO','CL','AE','IL'], evisa:[]},
  'Serbia':               {vf:[...STRONG,...LATAM,'AE','IL','TR','CN'], evisa:[]},
  'Georgia':              {vf:[...STRONG,...LATAM,'AE','IL','TR','ZA','CN'], evisa:['IN','PH','VN','ID','EG','NG','KE','PK']},
  'Turkey':               {vf:['EU','UK','US','CA','AU','NZ','JP','KR','SG','MY','BR','AR','CL','CO','MX','AE','IL','ZA','TH','ID','KZ'], evisa:['VN','PH','IN','EG']},
  'Morocco':              {vf:[...STRONG,...LATAM,'AE','TR','ID','PH'], evisa:[]},
  'Ghana':                {vf:['NG','KE','ZA'], evisa:[]},
  'Nigeria':              {vf:['KE'], evisa:[]},
  'Kenya':                {vf:[], evisa:'ALL'},
  'Rwanda':               {vf:'ALL', evisa:[]},
  'South Africa':         {vf:['EU','UK','US','CA','AU','NZ','JP','KR','SG','MY','BR','AR','CL','IL','KE'], evisa:[]},
  'Egypt':                {vf:[...STRONG,'AE','IL'], evisa:['IN','CN','BR','AR','MX','CL','CO','TR','ZA']},
  'Israel':               {vf:['EU','UK','US','CA','AU','NZ','JP','KR','SG','MX','BR','AR','CL','CO','ZA'], evisa:[]},
  'Qatar':                {vf:[...STRONG,...LATAM,'AE','TR','ZA','IN','TH','ID','KZ'], evisa:[]},
  'United Arab Emirates': {vf:[...STRONG,'CN','MX','BR','AR','CL','CO','IL','KZ'], evisa:['IN','ZA','TR','TH','PH','VN','ID','EG','NG','KE','PK']},
  'Oman':                 {vf:[...STRONG,'AE','TR'], evisa:['IN','CN','BR','AR','MX','CL','CO','ZA','TH','PH','VN','ID','EG']},
  'Japan':                {vf:['EU','UK','US','CA','AU','NZ','KR','SG','MY','MX','BR','AR','CL','TR','AE','IL','TH'], evisa:['ID','VN','CN','IN','PH']},
  'South Korea':          {vf:['EU','UK','US','CA','AU','NZ','JP','SG','MY','MX','BR','AR','CL','CO','TR','AE','IL','TH'], evisa:['ID','VN','CN','IN','PH','KZ']},
  'China':                {vf:['EU','MY','SG','TH','JP','KR','AU','NZ'], evisa:[]},
  'Hong Kong':            {vf:[...STRONG,...LATAM,'ZA','IL','TR','AE','TH','ID','PH','VN','KE','EG','KZ'], evisa:['IN']},
  'Vietnam':              {vf:['EU','UK','JP','KR','MY','SG','TH','ID','PH'], evisa:'ALL'},
  'Cambodia':             {vf:['MY','SG','TH','ID','PH','VN'], evisa:'ALL'},
  'Thailand':             {vf:[...STRONG,'CN','IN','BR','AR','MX','CL','CO','ZA','TR','AE','IL','ID','PH','VN','KZ'], evisa:'ALL'},
  'Malaysia':             {vf:['EU','UK','US','CA','AU','NZ','JP','KR','SG','CN','IN','BR','AR','MX','CL','CO','ZA','TR','AE','TH','ID','PH','VN','EG','KE','KZ'], evisa:[]},
  'Singapore':            {vf:['EU','UK','US','CA','AU','NZ','JP','KR','MY','CN','BR','AR','MX','CL','CO','ZA','TR','AE','IL','TH','ID','PH','VN','KZ'], evisa:[]},
  'Indonesia':            {vf:['EU','UK','US','CA','AU','NZ','JP','KR','SG','MY','CN','IN','BR','AR','MX','CL','CO','ZA','TR','AE','TH','PH','VN','KE','EG'], evisa:[], no:['IL']},
  'Philippines':          {vf:['EU','UK','US','CA','AU','NZ','JP','KR','SG','MY','BR','AR','MX','CL','CO','ZA','TR','AE','IL','TH','ID','VN','KE'], evisa:['IN','CN']},
  'India':                {vf:[], evisa:'ALL', no:['PK']},
  'Sri Lanka':            {vf:['IN','CN','MY','JP','ID','TH'], evisa:'ALL'},
  'Nepal':                {vf:'ALL', evisa:[]},
  'Kazakhstan':           {vf:[...STRONG,'TR','AE','IL','CN','IN','TH'], evisa:[]},
  'Taiwan':               {vf:['EU','UK','US','CA','AU','NZ','JP','KR','SG','MY','IL','CL'], evisa:['TH','VN','PH','ID','IN'], no:['CN']},
  'Australia':            {vf:['EU','UK','US','CA','JP','KR','SG','MY'], evisa:[]},
  'New Zealand':          {vf:['EU','UK','US','CA','JP','KR','SG','MY','BR','AR','CL','MX','AE','IL'], evisa:[]},
};

const SCHENGEN_ENTRY = {vf:['UK','US','CA','AU','NZ','JP','KR','SG','MY','BR','AR','MX','CO','CL','AE','IL'], evisa:[]};

function entryFor(country){
  const v = VISAS[country];
  if (v === 'SCHENGEN') return SCHENGEN_ENTRY;
  return v || null;
}

export function resolvePassports(labels){
  const lower = (labels||[]).map(l=>String(l).toLowerCase());
  return PASSPORTS.filter(p=>lower.includes(p.label.toLowerCase()) && p.g);
}

/* best access any of the held passports gets to this country */
export function access(passports, country){
  if (!passports || !passports.length) return 'unknown';
  /* best starts empty — a lone passport's tier stands even when it is 'no';
     across several passports the highest tier wins */
  let best = null;
  const rank = {home:6, union:5, free:4, evisa:3, visa:2, no:1};
  const entry = entryFor(country);
  for (const p of passports){
    let a = 'visa';
    if (p.home.includes(country)) a = 'home';
    else if (p.g === 'EU' && EU_DEST.has(country)) a = 'union';
    else if ((p.g === 'AU' && country === 'New Zealand') || (p.g === 'NZ' && country === 'Australia')) a = 'union';
    else if (p.g === 'UK' && country === 'Ireland') a = 'union';       /* Common Travel Area */
    else if (SAM_PASS.has(p.g) && SAM_DEST.has(country)) a = 'union';  /* Mercosur residence agreement */
    else if (entry){
      if (entry.no && entry.no.includes(p.g)) a = 'no';
      else if (entry.vf === 'ALL' || (Array.isArray(entry.vf) && entry.vf.includes(p.g))) a = 'free';
      else if (entry.evisa === 'ALL' || (Array.isArray(entry.evisa) && entry.evisa.includes(p.g))) a = 'evisa';
    }
    if (rank[a] > (rank[best] || 0)) best = a;
  }
  return best;
}

export const ACCESS_LABEL = {
  home:  'this is home',
  union: 'right to live & work',
  free:  'visa-free entry',
  evisa: 'quick e-visa',
  visa:  'needs a visa',
  no:    'effectively closed',
  unknown: '',
};

export function visaFit(a){
  return {home:1, union:1, free:.85, evisa:.7, visa:.5, no:.15, unknown:1}[a] ?? 1;
}
