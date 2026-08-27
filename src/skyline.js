
export function rngFor(str){
  let h = 2166136261 >>> 0;
  for (let i=0;i<str.length;i++){ h ^= str.charCodeAt(i); h = Math.imul(h,16777619); }
  return function(){
    h += 0x6D2B79F5; let t = h;
    t = Math.imul(t ^ t>>>15, t|1);
    t ^= t + Math.imul(t ^ t>>>7, t|61);
    return ((t ^ t>>>14)>>>0)/4294967296;
  };
}
function hexRgb(hex){
  hex = hex.replace('#','').trim();
  if (hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
}
const mixC = (a,b,t)=>a.map((v,i)=>Math.round(v+(b[i]-v)*t));
const rgb = c=>'rgb('+c.join(',')+')';
const rgba = (c,a)=>'rgba('+c.join(',')+','+a+')';

/* Draws a seamless, periodic dusk skyline for a city.
   copies=2 with the CSS pan of exactly one period gives an endless loop. */
export function drawCitySky(cv, city, o){
  o = Object.assign({transparent:false, P:720, H:150, copies:2}, o||{});
  const P=o.P, H=o.H;
  cv.width = P*o.copies; cv.height = H;
  const x = cv.getContext('2d');
  const rnd = rngFor(city.name);
  const d = city.d, w = d.warmth/10;
  const offs = []; for(let i=0;i<o.copies;i++) offs.push(i*P);
  const inkC = o.transparent
    ? hexRgb(getComputedStyle(document.documentElement).getPropertyValue('--ink') || '#1F3038')
    : null;

  if (!o.transparent){
    const top = mixC([15,26,35],[36,29,41], w);
    const bot = mixC([28,52,63],[92,60,35], w);
    const g = x.createLinearGradient(0,0,0,H);
    g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot));
    x.fillStyle = g; x.fillRect(0,0,cv.width,H);

    /* stars */
    const stars = 26 + Math.round(d.nature*2.5);
    x.fillStyle = 'rgba(233,240,238,.5)';
    for (let i=0;i<stars;i++){
      const sx = rnd()*P, sy = rnd()*H*.5, a = .1+rnd()*.35;
      x.globalAlpha = a;
      offs.forEach(off=> x.fillRect(sx+off, sy, 1.4, 1.4));
    }
    x.globalAlpha = 1;

    /* horizon glow */
    const gl = x.createLinearGradient(0,H*.4,0,H);
    gl.addColorStop(0,'rgba(240,178,78,0)');
    gl.addColorStop(1,'rgba(240,178,78,'+(0.14+w*0.14)+')');
    x.fillStyle = gl; x.fillRect(0,H*.4,cv.width,H*.6);

    /* moon */
    const mx = 60+rnd()*(P-120), my = 16+rnd()*24, mr = 6+rnd()*5;
    x.save();
    x.shadowColor = 'rgba(245,201,126,.9)'; x.shadowBlur = 16;
    x.fillStyle = '#F2E9D8';
    offs.forEach(off=>{ x.beginPath(); x.arc(mx+off,my,mr,0,7); x.fill(); });
    x.restore();
  }

  const backC  = o.transparent ? rgba(inkC,.10) : rgb(mixC([30,56,68],[70,52,45], w*.6));
  const frontC = o.transparent ? rgba(inkC,.18) : '#0C1922';
  const hillC  = o.transparent ? rgba(inkC,.07) : rgba(mixC([24,44,54],[62,44,34], w), .85);
  const treeC  = o.transparent ? rgba(inkC,.22) : '#0A141A';
  const winC   = 'rgba(240,178,78,'+(o.transparent?0.38:0.6)+')';

  /* periodic hills */
  if (d.nature >= 4){
    const amp = 6 + d.nature*2.6, base = H*.66;
    const k1 = 1+Math.floor(rnd()*2), k2 = 2+Math.floor(rnd()*3);
    const p1 = rnd()*6.28, p2 = rnd()*6.28;
    x.fillStyle = hillC;
    x.beginPath(); x.moveTo(0,H);
    for (let px=0; px<=cv.width; px+=8){
      const t = px/P*6.28318;
      x.lineTo(px, base - amp*Math.sin(t*k1+p1)*.7 - amp*Math.sin(t*k2+p2)*.3);
    }
    x.lineTo(cv.width,H); x.closePath(); x.fill();
  }

  /* buildings — two silhouetted rows */
  const fronts = [];
  const nb = Math.round(7 + d.scale*1.5);
  x.fillStyle = backC;
  for (let i=0;i<nb;i++){
    const bx = rnd()*P, bw = 26+rnd()*46;
    const bh = (H*.16) + (H*.05)*d.scale*(0.35+rnd()*0.65)*.8;
    offs.forEach(off=> x.fillRect(bx+off, H-bh-8, bw, bh));
  }
  const nf = Math.round(5 + d.scale*1.2);
  for (let i=0;i<nf;i++){
    const bx = rnd()*P, bw = 22+rnd()*40;
    const bh = (H*.12) + (H*.055)*d.scale*(0.3+rnd()*0.7);
    fronts.push([bx,bw,bh]);
  }
  x.fillStyle = frontC;
  fronts.forEach(([bx,bw,bh])=> offs.forEach(off=> x.fillRect(bx+off, H-bh-4, bw, bh)));

  /* one landmark for culture-rich skylines */
  if (d.culture >= 8){
    const lx = 40+rnd()*(P-80), kind = rnd();
    x.fillStyle = frontC;
    offs.forEach(off=>{
      if (kind < .5){ /* spire */
        const bh = H*.55;
        x.fillRect(lx+off-4, H-bh-4, 8, bh);
        x.beginPath();
        x.moveTo(lx+off-7, H-bh-4); x.lineTo(lx+off, H-bh-26); x.lineTo(lx+off+7, H-bh-4);
        x.closePath(); x.fill();
      } else { /* dome */
        const bh = H*.34, r = 15;
        x.fillRect(lx+off-r, H-bh-4, r*2, bh);
        x.beginPath(); x.arc(lx+off, H-bh-4, r, Math.PI, 0); x.fill();
        x.fillRect(lx+off-1.5, H-bh-4-r-8, 3, 8);
      }
    });
  }

  /* lit windows on the front row */
  x.fillStyle = winC;
  fronts.forEach(([bx,bw,bh])=>{
    const rows = Math.floor(bh/13), cols = Math.floor(bw/11);
    for (let r=0;r<rows;r++) for (let c=0;c<cols;c++){
      if (rnd() < .3){
        const wx = bx+6+c*11, wy = H-bh-4+7+r*13;
        offs.forEach(off=> x.fillRect(wx+off, wy, 3.2, 4.6));
      }
    }
  });

  /* trees along the ground */
  if (d.nature >= 6){
    x.fillStyle = treeC;
    const nt = 6+Math.round(d.nature*1.4);
    for (let i=0;i<nt;i++){
      const tx = rnd()*P, tr = 4+rnd()*8;
      offs.forEach(off=>{ x.beginPath(); x.arc(tx+off, H-7-tr*.4, tr, 0, 7); x.fill(); });
    }
  }

  /* ground line */
  x.fillStyle = o.transparent ? rgba(inkC,.25) : '#08121A';
  x.fillRect(0, H-6, cv.width, 6);
}

/* hero horizon — a "Beacon" city of its own, silhouette only */
function drawHero(){
  const cv = document.getElementById('hero-canvas');
  drawCitySky(cv, {name:'Beacon', d:{pace:5,nature:7,culture:8,social:5,warmth:5,afford:5,food:5,transit:5,openness:5,scale:6}},
    {transparent:true, P:1200, H:130, copies:3});
}
/* browser only — under node (tests import rngFor) there is no DOM */
if (typeof document !== 'undefined'){
  drawHero();
  try{
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawHero);
  }catch(e){}
}

