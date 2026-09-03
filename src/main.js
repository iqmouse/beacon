import { $, store, clamp } from './util.js';
import { FIELDS, CITIES, ROLES, MODES, payBand, CONTINENT_OF, CONTS } from './data.js';
import { QUESTIONS } from './questions.js';
import { DIMS, DIM_LABELS, buildUser, rankAll, traitWords, costFit } from './scoring.js';
import { drawCitySky, drawHomePortrait } from './skyline.js';
import { startAudio, SFX } from './audio.js';
import { PORTALS, baseRent, genHomes, HOME_TYPES } from './homes.js';
import { buildJobs, altLabel } from './jobs.js';
import { access, ACCESS_LABEL } from './visas.js';

/* ================= state ================= */

let user = {};
let answers = {};
let qIndex = 0;
let matches = [];
let ranked = [];
let currentCity = null;



/* ================= view transitions ================= */

let activeView = 'view-hero';
function go(id){
  const from = $(activeView), to = $(id);
  if (from === to) return;
  from.classList.add('leaving');
  setTimeout(()=>{
    from.classList.remove('active','leaving');
    to.classList.add('active');
    activeView = id;
    window.scrollTo({top:0, behavior:'instant'});
  }, 360);
}


/* ================= lantern & profiles ================= */

let saved = [], savedHomes = [];
try{ saved = JSON.parse(store.get('beacon-lantern')||'[]'); }catch(e){ saved = []; }
try{ savedHomes = JSON.parse(store.get('beacon-homes')||'[]'); }catch(e){ savedHomes = []; }
if (!Array.isArray(saved)) saved = [];
if (!Array.isArray(savedHomes)) savedHomes = [];

/* ---------- profiles (the Beacon book) ----------
   Cloud persistence rides the artifact capability: the page saves
   data/beacon-state.json as a new version of itself. Outside claude.ai
   (localhost, saved file) claude.use resolves null and everything
   falls back to this browser's localStorage. */
let AF = null;                 /* artifact capability namespace, or null */
let BOOK = {v:1, profiles:{}};
let activeProfile = store.get('beacon-profile') || null;
let syncState = 'local';       /* local | cloud | saving | readonly */
let bookLoaded = false;

function setSyncChip(){
  const chip = $('sync-chip');
  if (!chip) return;
  const label = {local:'this device', cloud:'saved to the beacon', saving:'saving…', readonly:'read-only here'}[syncState];
  chip.textContent = label;
  chip.classList.toggle('on', syncState==='cloud' || syncState==='saving');
}

function adoptProfile(name){
  const p = BOOK.profiles[name];
  if (!p) return;
  activeProfile = name;
  store.set('beacon-profile', name);
  saved = Array.isArray(p.jobs) ? p.jobs : [];
  savedHomes = Array.isArray(p.homes) ? p.homes : [];
  updateBadge(); syncHearts();
}

let bookTimer = null;
function persistBook(){
  if (activeProfile && BOOK.profiles[activeProfile]){
    const p = BOOK.profiles[activeProfile];
    p.jobs = saved; p.homes = savedHomes;
    p.updated = new Date().toISOString();
  }
  store.set('beacon-book', JSON.stringify(BOOK));
  if (!AF || !activeProfile) return;
  clearTimeout(bookTimer);
  syncState = 'saving'; setSyncChip();
  bookTimer = setTimeout(()=>{
    AF.publish({'data/beacon-state.json': JSON.stringify(BOOK)})
      .then(()=>{ syncState = 'cloud'; setSyncChip(); })
      .catch(err=>{
        const code = err && err.code;
        if (code === 'conflict') return;             /* the reload delivers the new truth */
        if (code === 'not_writer' || code === 'not_granted' ||
            code === 'capability_disabled' || code === 'capability_removed' ||
            code === 'not_declared'){ AF = null; syncState = 'readonly'; }
        else syncState = 'local';
        setSyncChip();
      });
  }, 1500);
}

function snapshotMatches(){
  if (!activeProfile || !BOOK.profiles[activeProfile] || !matches.length) return;
  BOOK.profiles[activeProfile].matches = matches.map(m=>({name:m.city.name, score:m.score}));
  BOOK.profiles[activeProfile].answers = answers;
  persistBook();
}

function renderProfiles(){
  const body = $('prof-body');
  let html = '';
  if (activeProfile){
    const p = BOOK.profiles[activeProfile] || {};
    const last = (p.matches && p.matches.length)
      ? 'last search: ' + p.matches[0].name + ' ' + p.matches[0].score + '%' : 'no search saved yet';
    html += '<div class="prof-active"><div><b>'+activeProfile+'</b>'+
      '<div style="font-size:.75rem;color:var(--ink-soft)">'+last+'</div></div>'+
      '<button class="ghost" id="prof-signout">set down</button></div>';
  }
  const others = Object.keys(BOOK.profiles).filter(n=>n!==activeProfile);
  html += others.map(n=>{
    const p = BOOK.profiles[n];
    const counts = ((p.jobs||[]).length) + ' jobs · ' + ((p.homes||[]).length) + ' homes';
    return '<div class="prof-row" data-p="'+n.replace(/"/g,'&quot;')+'">'+
      '<span class="pn">'+n+'<small>'+counts+'</small></span>'+
      '<span class="open-btn">pick up &rarr;</span></div>';
  }).join('');
  if (!activeProfile && !others.length){
    html += '<p style="font-family:Newsreader,serif;font-style:italic;color:var(--ink-faint);text-align:center;padding:.8rem 0">No one has lit a lantern here yet.</p>';
  }
  body.innerHTML = html;
  body.querySelectorAll('.prof-row').forEach(el=>{
    el.onclick = ()=>{ adoptProfile(el.dataset.p); renderProfiles(); toast('Welcome back, '+el.dataset.p); };
  });
  const out = $('prof-signout');
  if (out) out.onclick = ()=>{
    persistBook();
    activeProfile = null; store.set('beacon-profile','');
    try{ saved = JSON.parse(store.get('beacon-lantern')||'[]'); }catch(e){ saved = []; }
    try{ savedHomes = JSON.parse(store.get('beacon-homes')||'[]'); }catch(e){ savedHomes = []; }
    updateBadge(); syncHearts(); renderProfiles();
  };
}

function initBook(){
  try{ const local = JSON.parse(store.get('beacon-book')||'null'); if (local && local.profiles) BOOK = local; }catch(e){}
  const arm = ()=>{ bookLoaded = true; if (activeProfile && BOOK.profiles[activeProfile]) adoptProfile(activeProfile); setSyncChip(); };
  if (!(window.claude && window.claude.use)){ arm(); return; }
  window.claude.use('artifact').then(a=>{
    AF = a;
    if (!AF){ arm(); return; }
    fetch('data/beacon-state.json')
      .then(r=> r.ok ? r.json() : null)
      .then(cloud=>{
        if (cloud && cloud.profiles) BOOK = cloud;
        syncState = 'cloud'; arm();
      })
      .catch(()=>{ syncState = 'cloud'; arm(); });
  }).catch(arm);
}
initBook();

const jobId = (cityName, role, co)=> cityName+'|'+role+'|'+co;

function persistLantern(){
  if (!activeProfile){
    store.set('beacon-lantern', JSON.stringify(saved));
    store.set('beacon-homes', JSON.stringify(savedHomes));
  }
  persistBook();
}

function updateBadge(pop){
  const b = $('lantern-badge');
  const n = saved.length + savedHomes.length;
  b.textContent = n;
  b.classList.toggle('show', n>0);
  if (pop){ b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
}

function renderLantern(){
  const list = $('lantern-list');
  if (!saved.length && !savedHomes.length){
    list.innerHTML = '<p class="lantern-empty">Nothing glowing in here yet.<br>Save a job or a home and it will wait for you, lit.</p>';
    return;
  }
  const section = (title, items, line1, line2)=>{
    if (!items.length) return '';
    const groups = {};
    items.forEach(s=>{ (groups[s.city] = groups[s.city]||[]).push(s); });
    return '<div class="lgroup" style="letter-spacing:.22em;color:var(--amber)">'+title+'</div>'+
      Object.keys(groups).map(cityName=>
        '<div class="lgroup">'+cityName+'</div>'+
        groups[cityName].map(s=>
          '<div class="litem"><div><h5>'+line1(s)+'</h5>'+
          '<div class="sub">'+line2(s)+'</div></div>'+
          '<button class="ghost" data-id="'+s.id.replace(/"/g,'&quot;')+'" aria-label="Remove">&#10005;</button></div>'
        ).join('')
      ).join('');
  };
  list.innerHTML =
    section('Jobs', saved, s=>s.role, s=>s.co+' · '+s.mode+' · '+s.pay) +
    section('Homes', savedHomes, s=>s.title, s=>s.hood+' · '+s.rent+' · '+s.size);
  list.querySelectorAll('.ghost').forEach(btn=>{
    btn.onclick = ()=>{
      saved = saved.filter(s=>s.id !== btn.dataset.id);
      savedHomes = savedHomes.filter(s=>s.id !== btn.dataset.id);
      persistLantern(); updateBadge(); renderLantern(); syncHearts();
    };
  });
}

function openDrawer(){ SFX.drawer(); renderLantern(); $('drawer').classList.add('open'); $('scrim').classList.add('open'); }
function closeDrawer(){ $('drawer').classList.remove('open'); $('scrim').classList.remove('open'); }
$('lantern-fab').onclick = openDrawer;
$('drawer-close').onclick = closeDrawer;
$('scrim').onclick = closeDrawer;
updateBadge();

function syncHearts(){
  document.querySelectorAll('#job-list .save, #home-list .save').forEach(btn=>{
    const on = saved.some(s=>s.id === btn.dataset.id) || savedHomes.some(s=>s.id === btn.dataset.id);
    btn.classList.toggle('on', on);
    btn.innerHTML = on ? '&#9829;' : '&#9825;';
    btn.setAttribute('aria-pressed', on);
  });
}


/* ================= quiz rendering ================= */

function renderQuestion(){
  const q = QUESTIONS[qIndex];
  $('prog-count').textContent = (qIndex+1) + ' / ' + QUESTIONS.length;
  $('prog-fill').style.width = ((qIndex+1)/QUESTIONS.length*100) + '%';
  $('q-back').style.visibility = qIndex === 0 ? 'hidden' : 'visible';

  const holder = $('q-holder');
  holder.style.animation = 'none';
  void holder.offsetWidth;
  holder.style.animation = 'rise .55s cubic-bezier(.22,.8,.3,1) both';

  let html = '<h2 class="q-title">' + q.title + '</h2><div class="q-body">';

  if (q.type === 'cards'){
    html += '<div class="opts">';
    q.opts.forEach((o,i)=>{
      const picked = answers[q.key] === i ? ' picked' : '';
      html += '<button class="opt'+picked+'" data-i="'+i+'">'+o.t+'<small>'+o.s+'</small></button>';
    });
    html += '</div>';
  } else if (q.type === 'slider'){
    const v = answers[q.key] ?? 5;
    html += '<div class="slider-wrap"><div class="slider-labels"><span>'+q.left+'</span><span>'+q.right+'</span></div>'
          + '<input type="range" min="0" max="10" step="1" value="'+v+'" id="q-slider" aria-label="'+q.title+'"></div>';
  } else if (q.type === 'multichips'){
    html += '<div class="chips">';
    q.opts.forEach(o=>{
      const v = o.toLowerCase();
      const picked = (answers[q.key]||[]).includes(v) ? ' picked' : '';
      html += '<button class="chip'+picked+'" data-v="'+v+'">'+o+'</button>';
    });
    html += '</div><p class="q-hint" style="margin-top:1.1rem">pick as many as you like</p>';
  } else if (q.type === 'chips'){
    html += '<div class="chips">';
    FIELDS.forEach(f=>{
      const picked = answers[q.key] === f.id ? ' picked' : '';
      html += '<button class="chip'+picked+'" data-f="'+f.id+'">'+f.label+'</button>';
    });
    html += '</div>';
  }
  html += '</div>';
  holder.innerHTML = html;

  if (q.type === 'cards'){
    holder.querySelectorAll('.opt').forEach(btn=>{
      btn.onclick = ()=>{
        holder.querySelectorAll('.opt').forEach(b=>b.classList.remove('picked'));
        btn.classList.add('picked');
        answers[q.key] = +btn.dataset.i;
        SFX.pick();
        $('q-next').disabled = false;
      };
    });
  } else if (q.type === 'slider'){
    answers[q.key] = answers[q.key] ?? 5;
    $('q-slider').oninput = e => { answers[q.key] = +e.target.value; SFX.slide(); };
    $('q-next').disabled = false;
  } else if (q.type === 'multichips'){
    holder.querySelectorAll('.chip').forEach(btn=>{
      btn.onclick = ()=>{
        const arr = answers[q.key] = answers[q.key] || [];
        const v = btn.dataset.v;
        const i = arr.indexOf(v);
        if (i >= 0){ arr.splice(i,1); btn.classList.remove('picked'); }
        else { arr.push(v); btn.classList.add('picked'); SFX.pick(); }
        $('q-next').disabled = arr.length === 0;
      };
    });
  } else if (q.type === 'chips'){
    holder.querySelectorAll('.chip').forEach(btn=>{
      btn.onclick = ()=>{
        holder.querySelectorAll('.chip').forEach(b=>b.classList.remove('picked'));
        btn.classList.add('picked');
        answers[q.key] = btn.dataset.f;
        SFX.pick();
        $('q-next').disabled = false;
      };
    });
  }

  const a0 = answers[q.key];
  $('q-next').disabled = a0 === undefined || (Array.isArray(a0) && a0.length === 0);
  $('q-next').textContent = qIndex === QUESTIONS.length-1 ? 'light the beacon' : 'continue';
}


/* ================= matching & results ================= */

function computeUser(){ user = buildUser(answers, QUESTIONS); }

function renderContinents(){
  const grid = $('cont-grid');
  grid.innerHTML = CONTS.map(cont=>{
    const rows = ranked.filter(r=>CONTINENT_OF[r.city.country]===cont).slice(0,3);
    return '<div class="cont-card"><h4>'+cont+'</h4>'+rows.map(r=>
      '<div class="cont-row" data-city="'+r.city.name.replace(/"/g,'&quot;')+'" role="button" tabindex="0">'+
      '<span class="nm">'+r.city.name+'<small>'+r.city.country+'</small></span>'+
      '<span class="pc">'+r.score+'%</span></div>').join('')+'</div>';
  }).join('');
  grid.querySelectorAll('.cont-row').forEach(el=>{
    const open = ()=>{ const c = CITIES.find(x=>x.name===el.dataset.city); if (c) showJobs(c); };
    el.onclick = open;
    el.onkeydown = e=>{ if (e.key==='Enter') open(); };
  });
}

function runMatch(){
  computeUser();
  ranked = rankAll(CITIES, user, answers.field);
  matches = ranked.slice(0,3);
  renderResults();
  snapshotMatches();
  playReveal();
}

/* ---------- the reveal ---------- */

let revealTimer = null;
function playReveal(){
  const R = $('reveal'), c = matches[0].city;
  $('reveal-name').textContent = c.name;
  $('reveal-sub').textContent = matches[0].score + '% match · ' + c.country;
  const cv = $('reveal-canvas');
  const h = Math.max(170, Math.round(innerHeight * .38));
  drawCitySky(cv, c, {P:1200, H:h, copies:3});
  cv.style.height = h + 'px';
  R.classList.add('on');
  SFX.reveal();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  revealTimer = setTimeout(endReveal, reduced ? 1400 : 4600);
}
function endReveal(){
  clearTimeout(revealTimer);
  const R = $('reveal');
  if (!R.classList.contains('on')) return;
  R.classList.remove('on');
  go('view-results');
}

function renderResults(){
  $('top-city-script').textContent = matches[0].city.name;
  if (user.passports && user.passports.length){
    const open = CITIES.filter(c=>['home','union','free'].includes(access(user.passports, c.country))).length;
    $('doors-sub').textContent = 'your passport opens ' + open + ' of ' + CITIES.length + ' of these cities without a visa';
  } else {
    $('doors-sub').textContent = '';
  }
  const list = $('match-list');
  list.innerHTML = matches.map((m,idx)=>{
    const c = m.city;
    const bestDims = Object.entries(m.fits).sort((a,b)=>b[1]-a[1]).slice(0,4);
    const bars = bestDims.map(([k,v])=>
      '<div class="fitbar"><div class="lbl"><span>'+DIM_LABELS[k]+'</span><span>'+v+'%</span></div>'+
      '<div class="rail"><i data-w="'+v+'"></i></div></div>').join('');
    const fieldNote = (answers.field && c.ind.includes(answers.field))
      ? ' <strong style="color:var(--amber);font-style:normal;font-family:Karla,sans-serif;font-size:.8rem;letter-spacing:.06em;">&#9679; strong for your field</strong>' : '';
    const acc = (user.passports && user.passports.length) ? access(user.passports, c.country) : 'unknown';
    const visaNote = acc === 'unknown' ? '' :
      ' <strong style="color:'+(acc==='home'||acc==='union'||acc==='free' ? 'var(--glass)' : 'var(--ink-faint)')+
      ';font-style:normal;font-family:Karla,sans-serif;font-size:.8rem;letter-spacing:.06em;">&#9906; '+ACCESS_LABEL[acc]+'</strong>';
    return '<article class="match">'+
      '<div class="strip"><canvas class="city-sky" data-city="'+idx+'" height="150" style="animation-duration:'+(62+idx*9)+'s"></canvas></div>'+
      '<div class="match-body">'+
      '<div class="match-top"><h3 class="match-name">'+c.name+'<small>'+c.country+'</small></h3>'+
      '<div class="match-pct">'+m.score+'<small> % match</small></div></div>'+
      '<p class="match-why">'+c.why+fieldNote+visaNote+'</p>'+
      '<div class="fitbars">'+bars+'</div>'+
      '<button class="jobs-btn" data-city="'+idx+'">See jobs in '+c.name+' &rarr;</button> '+
      '<button class="jobs-btn homes-link" data-city="'+idx+'">Find a home &rarr;</button>'+
      '</div></article>';
  }).join('');

  list.querySelectorAll('.city-sky').forEach(cv=>{
    drawCitySky(cv, matches[+cv.dataset.city].city);
  });

  renderContinents();

  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    list.querySelectorAll('.rail i').forEach(el=>{ el.style.width = el.dataset.w+'%'; });
  }));

  list.querySelectorAll('.jobs-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const c = matches[+btn.dataset.city].city;
      btn.classList.contains('homes-link') ? showHomes(c) : showJobs(c);
    };
  });
}


/* ================= compare ================= */

function fillCompareSelects(){
  const opts = ranked.map((r,i)=>'<option value="'+i+'">'+r.city.name+' · '+r.score+'%</option>').join('');
  $('cmp-a').innerHTML = opts;
  $('cmp-b').innerHTML = opts;
  $('cmp-a').value = 0;
  $('cmp-b').value = 1;
}

function renderCompare(){
  const A = ranked[+$('cmp-a').value], B = ranked[+$('cmp-b').value];
  $('cmp-fit-a').innerHTML = A.score + '% <small>match for you</small>';
  $('cmp-fit-b').innerHTML = B.score + '% <small>match for you</small>';

  $('cmp-dims').innerHTML = DIMS.map(k=>{
    const av = A.city.d[k], bv = B.city.d[k];
    let aCloser;
    if (k === 'afford'){
      /* cost is one-way: amber goes to the city that fits your budget
         better, and on a tie to the cheaper one — never to expense */
      const fA = costFit(A.city, user), fB = costFit(B.city, user);
      aCloser = fA > fB || (fA === fB && A.city.cost <= B.city.cost);
    } else {
      aCloser = Math.abs(av - user[k]) <= Math.abs(bv - user[k]);
    }
    return '<div class="cmp-row">'+
      '<div class="cmp-rail L'+(aCloser?' win':'')+'"><i style="width:'+(av*10)+'%"></i></div>'+
      '<div class="cmp-mid">'+DIM_LABELS[k]+'</div>'+
      '<div class="cmp-rail'+(!aCloser?' win':'')+'"><i style="width:'+(bv*10)+'%"></i></div>'+
      '</div>';
  }).join('');

  const FACTS = [['pop','Metro population'],['lang','Language'],['rent','One-bed rent · Numbeo'],['sun','Sunshine hours a year']];
  const va = c => (user.passports && user.passports.length) ? (ACCESS_LABEL[access(user.passports, c.country)] || '—') : '—';
  const fmt = (v,k)=> k==='sun' ? Number(v).toLocaleString('en-US')+' h' : v;
  $('cmp-facts').innerHTML = FACTS.map(([k,label])=>
    '<div class="cmp-fact"><div class="v a">'+fmt(A.city.f[k],k)+'</div><div class="k">'+label+'</div><div class="v">'+fmt(B.city.f[k],k)+'</div></div>'
  ).join('') +
  '<div class="cmp-fact"><div class="v a">'+va(A.city)+'</div><div class="k">Visa, for your passport</div><div class="v">'+va(B.city)+'</div></div>';
}


/* ================= share card ================= */


async function renderShareCard(){
  await document.fonts.ready;
  await Promise.all([
    document.fonts.load('120px Ephesis'),
    document.fonts.load('italic 300 60px Newsreader'),
    document.fonts.load('600 26px Karla'),
  ]);

  const W = 1080, H = 1350;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');

  const g = x.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#101C24'); g.addColorStop(1,'#0A141A');
  x.fillStyle = g; x.fillRect(0,0,W,H);

  const halo = x.createRadialGradient(W/2, 400, 40, W/2, 400, 520);
  halo.addColorStop(0,'rgba(240,178,78,.28)');
  halo.addColorStop(1,'rgba(240,178,78,0)');
  x.fillStyle = halo; x.fillRect(0,0,W,H);

  x.save();
  x.globalAlpha = .07;
  x.translate(W/2, -160); x.rotate(.42);
  x.fillStyle = '#F5C97E';
  x.beginPath(); x.moveTo(0,0); x.lineTo(-90,H+400); x.lineTo(90,H+400); x.closePath(); x.fill();
  x.restore();

  /* the top city's skyline along the card's base */
  const sk = document.createElement('canvas');
  drawCitySky(sk, matches[0].city, {P:1080, H:170, copies:1});
  x.globalAlpha = .9;
  x.drawImage(sk, 0, H-170);
  x.globalAlpha = 1;

  x.textAlign = 'center';
  x.fillStyle = '#6E858D';
  x.font = '600 26px Karla, sans-serif';
  try{ x.letterSpacing = '6px'; }catch(e){}
  x.fillText('THE LIGHT POINTS TOWARD', W/2, 220);
  try{ x.letterSpacing = '0px'; }catch(e){}

  x.fillStyle = '#F0B24E';
  x.shadowColor = 'rgba(240,178,78,.8)'; x.shadowBlur = 60;
  x.font = '150px Ephesis, cursive';
  x.fillText(matches[0].city.name, W/2, 430);
  x.shadowBlur = 0;

  x.fillStyle = '#E7EFEE';
  x.font = 'italic 300 58px Newsreader, serif';
  x.fillText(matches[0].score + '% match', W/2, 530);

  x.strokeStyle = 'rgba(231,239,238,.18)'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(W/2-160, 600); x.lineTo(W/2+160, 600); x.stroke();

  x.font = '600 24px Karla, sans-serif';
  x.fillStyle = '#6E858D';
  try{ x.letterSpacing = '5px'; }catch(e){}
  x.fillText('MY THREE CITIES', W/2, 670);
  try{ x.letterSpacing = '0px'; }catch(e){}
  matches.forEach((m,i)=>{
    const y = 745 + i*76;
    x.font = 'italic 300 46px Newsreader, serif';
    x.fillStyle = '#E7EFEE';
    x.textAlign = 'right';
    x.fillText(m.city.name, W/2 + 90, y);
    x.textAlign = 'left';
    x.fillStyle = '#F0B24E';
    x.font = 'italic 400 46px Newsreader, serif';
    x.fillText(m.score + '%', W/2 + 130, y);
  });
  x.textAlign = 'center';

  x.fillStyle = '#A7BBC0';
  x.font = 'italic 300 38px Newsreader, serif';
  x.fillText(traitWords(user).join('  ·  '), W/2, 1035);

  x.fillStyle = '#E7EFEE';
  x.shadowColor = 'rgba(240,178,78,.55)'; x.shadowBlur = 40;
  x.font = '92px Ephesis, cursive';
  x.fillText('Beacon', W/2, 1140);
  x.shadowBlur = 0;

  $('share-img').src = cv.toDataURL('image/png');
}

function shareText(){
  return 'My Beacon cities — ' +
    matches.map((m,i)=>(i+1)+'. '+m.city.name+' '+m.score+'%').join('  ') +
    '  · ' + traitWords(user).join(', ') +
    '  · Beacon: find the city that feels like you';
}


/* ================= jobs ================= */

function renderJobList(city, items){
  const list = $('job-list');
  list.innerHTML = items.map(it=>{
    const id = jobId(city.name, it.role, it.co);
    const title = it.url
      ? '<a href="'+it.url+'" target="_blank" rel="noopener" style="color:inherit;text-decoration:none;">'+it.role+' &nearr;</a>'
      : it.role;
    return '<div class="job"><div>'+
      '<h4>'+title+'</h4><div class="co">'+it.co+' · '+city.name+'</div>'+
      '<div class="meta"><span class="tag">'+it.mode+'</span><span class="tag pay">'+it.pay+'</span>'+
      (it.alt?'<span class="tag" style="background:var(--amber-glow);color:var(--amber)">'+altLabel(it.field)+' · hiring here</span>':'')+
      '</div></div>'+
      '<button class="save" data-id="'+id.replace(/"/g,'&quot;')+'" data-role="'+it.role.replace(/"/g,'&quot;')+'" data-co="'+it.co.replace(/"/g,'&quot;')+'" data-mode="'+it.mode+'" data-pay="'+it.pay+'" aria-label="Save this job" aria-pressed="false">&#9825;</button></div>';
  }).join('');

  list.querySelectorAll('.save').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.id;
      const exists = saved.some(s=>s.id === id);
      if (exists){
        saved = saved.filter(s=>s.id !== id);
        SFX.unsave();
        toast('Taken out of your lantern');
      } else {
        saved.push({id, role:btn.dataset.role, co:btn.dataset.co, city:city.name, mode:btn.dataset.mode, pay:btn.dataset.pay});
        SFX.save();
        toast('Saved to your lantern');
      }
      persistLantern();
      updateBadge(!exists);
      syncHearts();
    };
  });
  syncHearts();
}

function showJobs(city){
  currentCity = city;
  const fieldId = answers.field || 'remote';
  const field = FIELDS.find(f=>f.id===fieldId);

  $('jobs-city').textContent = city.name;
  drawCitySky($('jobs-canvas'), city);

  const jm = buildJobs(city, fieldId);
  $('jobs-sub').textContent = field.label + ' · ' + jm.note;
  $('jobs-src').textContent = {
    strong: '\u25cf strong market · generated by formula, pay scaled to local cost of living',
    steady: '\u25cf steady market · generated by formula, pay scaled to local cost of living',
    thin:   '\u25cb thin market · the last three are where this city actually hires',
  }[jm.market];

  renderJobList(city, jm.listings);
  go('view-jobs');
}


/* ================= homes (view) ================= */
let homesCity = null, homesAll = [], homeType = 'All', homeHood = 'All', homeSort = 'price';
function renderHomeList(){
  const cap = +$('home-budget').value;
  const base = baseRent(homesCity);
  const capRent = Math.round(base*(0.6 + cap*0.16)/10)*10;   /* slider 0..10 → .6x–2.2x market */
  $('home-bval').textContent = cap===10 ? 'any budget' : '≤ $'+capRent.toLocaleString('en-US');
  let items = homesAll.filter(h=>
    (homeType==='All' || h.type===homeType) &&
    (homeHood==='All' || h.hood===homeHood) &&
    (cap===10 || h.rentN<=capRent));
  items = items.slice().sort((a,b)=> homeSort==='size'
    ? parseInt(b.size)-parseInt(a.size) || a.rentN-b.rentN
    : a.rentN-b.rentN);
  const list = $('home-list');
  if (!items.length){
    list.innerHTML = '<p class="lantern-empty">Nothing in that shape here — loosen the filters a little.</p>';
    return;
  }
  list.innerHTML = items.map(h=>
    '<div class="job home-card" data-id="'+h.id+'" role="button" tabindex="0">'+
    '<canvas class="home-thumb" width="224" height="156"></canvas><div class="home-mid">'+
    '<h4>'+h.title+'</h4><div class="co">'+h.quirk+' · '+h.walk+'</div>'+
    '<div class="meta"><span class="tag pay">'+h.rent+'</span><span class="tag">'+h.size+'</span>'+
    (h.furnished?'<span class="tag">furnished</span>':'')+
    '</div></div><button class="save" data-id="'+h.id+'" aria-label="Save this home" aria-pressed="false">&#9825;</button></div>'
  ).join('');
  list.querySelectorAll('.home-card').forEach(el=>{
    const h = homesAll.find(x=>x.id===el.dataset.id);
    drawHomePortrait(el.querySelector('.home-thumb'), h, homesCity);
    const peek = e=>{ if (e.target.closest('.save')) return; openPeek(h); };
    el.onclick = peek;
    el.onkeydown = e=>{ if (e.key==='Enter' && !e.target.closest('.save')) openPeek(h); };
  });
  list.querySelectorAll('.save').forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.dataset.id;
      const exists = savedHomes.some(s=>s.id===id);
      if (exists){
        savedHomes = savedHomes.filter(s=>s.id!==id);
        SFX.unsave(); toast('Taken out of your lantern');
      } else {
        const h = homesAll.find(x=>x.id===id);
        savedHomes.push({id:h.id, city:h.city, title:h.title, hood:h.hood, rent:h.rent, size:h.size});
        SFX.save(); toast('Saved to your lantern');
      }
      persistLantern(); updateBadge(!exists); syncHearts();
    };
  });
  syncHearts();
}

function openPeek(h){
  const city = homesCity;
  drawHomePortrait($('peek-canvas'), h, city);
  $('peek-title').textContent = h.title;
  $('peek-sub').textContent = h.quirk + ' — ' + h.hood + ', ' + city.name;
  const fieldId = answers.field || 'remote';
  const band = payBand(city, fieldId, 1).match(/\d+/g).map(Number);
  const share = Math.round(h.rentN * 12 / ((band[0]+band[1])/2 * 1000) * 100);
  $('peek-meta').innerHTML =
    '<span class="tag pay">'+h.rent+'</span><span class="tag">'+h.size+'</span>'+
    (h.furnished?'<span class="tag">furnished</span>':'')+
    '<span class="tag">'+h.walk+'</span>'+
    '<span class="tag">≈ '+share+'% of a local '+FIELDS.find(f=>f.id===fieldId).label.toLowerCase()+' salary</span>';
  const pk = $('peek-save');
  const on = savedHomes.some(s=>s.id===h.id);
  pk.textContent = on ? 'in your lantern ♥' : 'save to lantern ♡';
  pk.onclick = ()=>{
    const now = savedHomes.some(s=>s.id===h.id);
    if (now){ savedHomes = savedHomes.filter(s=>s.id!==h.id); SFX.unsave(); }
    else { savedHomes.push({id:h.id, city:h.city, title:h.title, hood:h.hood, rent:h.rent, size:h.size}); SFX.save(); }
    persistLantern(); updateBadge(!now); syncHearts();
    pk.textContent = now ? 'save to lantern ♡' : 'in your lantern ♥';
  };
  $('peek-link').href = 'https://www.google.com/search?q=' +
    encodeURIComponent(h.type + ' for rent ' + h.hood + ' ' + city.name);
  $('peek-modal').classList.add('on');
}

function showHomes(city){
  homesCity = city; currentCity = city;
  homesAll = genHomes(city);
  homeType = 'All';
  $('homes-city').textContent = city.name;
  $('homes-sub').textContent = 'a sample of the market · one-bed median $'+baseRent(city).toLocaleString('en-US')+'/mo';
  drawCitySky($('homes-canvas'), city);
  homeHood = 'All'; homeSort = 'price';
  $('home-types').innerHTML =
    ['All', ...HOME_TYPES.map(t=>t.t)].map(t=>
      '<button class="chip'+(t===homeType?' picked':'')+'" data-k="type" data-t="'+t+'">'+t+'</button>').join('') +
    '<span class="chip-gap"></span>' +
    ['All', ...(city.hoods||[])].map(hd=>
      '<button class="chip hood-chip'+(hd===homeHood?' picked':'')+'" data-k="hood" data-t="'+hd.replace(/"/g,'&quot;')+'">'+(hd==='All'?'Anywhere':hd)+'</button>').join('') +
    '<span class="chip-gap"></span>' +
    '<button class="chip" data-k="sort" data-t="price">cheapest first</button>'+
    '<button class="chip" data-k="sort" data-t="size">biggest first</button>';
  const chipSync = ()=>{
    $('home-types').querySelectorAll('.chip').forEach(b=>{
      if (b.dataset.k==='type') b.classList.toggle('picked', b.dataset.t===homeType);
      if (b.dataset.k==='hood') b.classList.toggle('picked', b.dataset.t===homeHood || (b.dataset.t==='All' && homeHood==='All'));
      if (b.dataset.k==='sort') b.classList.toggle('picked', b.dataset.t===homeSort);
    });
  };
  $('home-types').querySelectorAll('.chip').forEach(btn=>{
    btn.onclick = ()=>{
      if (btn.dataset.k==='type') homeType = btn.dataset.t;
      if (btn.dataset.k==='hood') homeHood = btn.dataset.t;
      if (btn.dataset.k==='sort') homeSort = btn.dataset.t;
      chipSync(); renderHomeList();
    };
  });
  chipSync();
  $('home-budget').value = 10;
  $('home-budget').oninput = renderHomeList;
  const portal = PORTALS[city.country];
  let links = '';
  if (portal){
    const [label, url] = portal(city);
    links += '<a class="btn2" style="text-decoration:none" href="'+url+'" target="_blank" rel="noopener">browse '+label+' &nearr;</a>';
  }
  links += '<a class="btn2" style="text-decoration:none" href="https://www.google.com/search?q='+
    encodeURIComponent('apartments for rent in '+city.name+' '+city.country)+'" target="_blank" rel="noopener">search the local market &nearr;</a>';
  $('portal-row').innerHTML = links;
  renderHomeList();
  go('view-homes');
}


/* ================= misc ================= */

let toastTimer;
function toast(msg){
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove('show'), 1800);
}

function restart(){
  answers = {}; qIndex = 0;
  go('view-hero');
}


/* ================= wiring ================= */

$('begin').onclick = ()=>{
  startAudio();            /* gentle music begins with the journey */
  qIndex = 0; renderQuestion(); go('view-quiz');
};
$('q-next').onclick = ()=>{
  SFX.next();
  if (qIndex < QUESTIONS.length-1){ qIndex++; renderQuestion(); }
  else runMatch();
};
$('q-back').onclick = ()=>{ if (qIndex>0){ qIndex--; renderQuestion(); } };
$('restart').onclick = restart;
$('jobs-restart').onclick = restart;
$('jobs-back').onclick = ()=>go('view-results');
$('jobs-homes').onclick = ()=>{ if (currentCity) showHomes(currentCity); };
$('homes-back').onclick = ()=>go('view-results');
$('homes-jobs').onclick = ()=>{ if (homesCity) showJobs(homesCity); };
$('prof-fab').onclick = ()=>{ renderProfiles(); setSyncChip(); $('prof-modal').classList.add('on'); };
$('prof-close').onclick = ()=> $('prof-modal').classList.remove('on');
$('prof-modal').onclick = e=>{ if (e.target === $('prof-modal')) $('prof-modal').classList.remove('on'); };
$('prof-create').onclick = ()=>{
  const name = $('prof-name').value.trim();
  if (!name) return;
  if (!BOOK.profiles[name]){
    /* a new profile carries this device's lantern in with it */
    BOOK.profiles[name] = {jobs:saved.slice(), homes:savedHomes.slice(), created:new Date().toISOString()};
  }
  $('prof-name').value = '';
  adoptProfile(name);
  persistBook(); renderProfiles();
  toast('Lit — your lantern now travels with "'+name+'"');
};

$('to-compare').onclick = ()=>{ fillCompareSelects(); renderCompare(); go('view-compare'); };
$('cmp-a').onchange = renderCompare;
$('cmp-b').onchange = renderCompare;
$('cmp-back').onclick = ()=>go('view-results');

$('to-share').onclick = ()=>{ renderShareCard(); go('view-share'); };
$('share-back').onclick = ()=>go('view-results');
$('copy-text').onclick = async ()=>{
  try{
    await navigator.clipboard.writeText(shareText());
    toast('Copied — paste it anywhere');
  }catch(e){
    window.prompt('Copy your Beacon summary:', shareText());
  }
};

$('reveal').onclick = endReveal;

$('peek-close').onclick = ()=> $('peek-modal').classList.remove('on');
$('peek-modal').onclick = e=>{ if (e.target === $('peek-modal')) $('peek-modal').classList.remove('on'); };
/* e-transfer address for donations — set it and the support link appears */
const DONATE_EMAIL = 'mikail.iqbal08@gmail.com';
if (DONATE_EMAIL){
  $('donate-link').hidden = false;
  $('donate-email').value = DONATE_EMAIL;
  $('donate-link').onclick = ()=> $('donate-modal').classList.add('on');
  $('donate-close').onclick = ()=> $('donate-modal').classList.remove('on');
  $('donate-modal').onclick = e=>{ if (e.target === $('donate-modal')) $('donate-modal').classList.remove('on'); };
  $('donate-copy').onclick = async ()=>{
    try{ await navigator.clipboard.writeText(DONATE_EMAIL); toast('copied — thank you ♥'); }
    catch(e){ $('donate-email').select(); toast('select and copy — thank you ♥'); }
  };
}

$('how-open').onclick = ()=> $('how-modal').classList.add('on');
$('how-close').onclick = ()=> $('how-modal').classList.remove('on');
$('how-modal').onclick = e=>{ if (e.target === $('how-modal')) $('how-modal').classList.remove('on'); };

document.addEventListener('keydown', e=>{
  if (e.key === 'Escape'){ closeDrawer(); $('prof-modal').classList.remove('on'); $('how-modal').classList.remove('on'); $('peek-modal').classList.remove('on'); $('donate-modal').classList.remove('on'); }
  if (e.key === 'Enter' && activeView === 'view-quiz' && !$('q-next').disabled
      && document.activeElement.tagName !== 'BUTTON'){
    $('q-next').click();
  }
});
