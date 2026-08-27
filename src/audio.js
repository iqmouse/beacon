import { $, store } from './util.js';

/* A soft, slightly mystical loop: a slow drone pad drifting between
   chords, and pentatonic bell tones falling through a long echo. */

let AC = null, master = null, bellBus = null, muted = store.get('beacon-muted') === '1';
let padOscs = [], chordStep = 0, bellTimer = null, chordTimer = null;
let padSwell = null;
const BELL_SCALE = [293.66, 349.23, 392.00, 440.00, 523.25, 587.33, 698.46, 880.00]; /* D min pentatonic */
const CHORDS = [[73.42,110.00],[65.41,98.00],[87.31,130.81]]; /* D+A, C+G, F+C */

function startAudio(){
  if (AC) { if (AC.state==='suspended') AC.resume(); return; }
  AC = new (window.AudioContext||window.webkitAudioContext)();

  const comp = AC.createDynamicsCompressor();
  comp.threshold.value = -28; comp.ratio.value = 6;
  comp.connect(AC.destination);

  master = AC.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(comp);

  /* echo network for the bells */
  bellBus = AC.createGain(); bellBus.gain.value = 1;
  const delay = AC.createDelay(2); delay.delayTime.value = .48;
  const fb = AC.createGain(); fb.gain.value = .32;
  const tone = AC.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1400;
  bellBus.connect(master);
  bellBus.connect(delay); delay.connect(tone); tone.connect(fb); fb.connect(delay);
  tone.connect(master);

  /* drone pad */
  const padFilter = AC.createBiquadFilter();
  padFilter.type = 'lowpass'; padFilter.frequency.value = 320; padFilter.Q.value = .4;
  const padGain = AC.createGain(); padGain.gain.value = 0;
  padFilter.connect(padGain); padGain.connect(master);
  padGain.gain.linearRampToValueAtTime(.05, AC.currentTime + 6);   /* slow fade in */
  padSwell = padGain;

  CHORDS[0].forEach(f=>{
    [-4, 4].forEach(det=>{
      const osc = AC.createOscillator();
      osc.type = 'triangle'; osc.frequency.value = f; osc.detune.value = det;
      const g = AC.createGain(); g.gain.value = .5;
      osc.connect(g); g.connect(padFilter);
      osc.start();
      padOscs.push(osc);
    });
  });

  /* the filter breathes */
  const lfo = AC.createOscillator(); lfo.frequency.value = .045;
  const lfoG = AC.createGain(); lfoG.gain.value = 110;
  lfo.connect(lfoG); lfoG.connect(padFilter.frequency);
  lfo.start();

  /* slow chord drift */
  chordTimer = setInterval(()=>{
    chordStep = (chordStep+1) % CHORDS.length;
    const chord = CHORDS[chordStep];
    padOscs.forEach((osc,i)=>{
      const f = chord[Math.floor(i/2) % chord.length];
      osc.frequency.exponentialRampToValueAtTime(f, AC.currentTime + 7);
    });
  }, 26000);

  scheduleBell();
}

function playBell(){
  const t = AC.currentTime;
  const f = BELL_SCALE[Math.floor(Math.random()*BELL_SCALE.length)];
  const vol = .045 + Math.random()*.07;
  const dur = 3.5 + Math.random()*1.5;

  const pan = AC.createStereoPanner ? AC.createStereoPanner() : null;
  const out = pan || bellBus;
  if (pan){ pan.pan.value = (Math.random()*1.2)-.6; pan.connect(bellBus); }

  const g = AC.createGain();
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t+.04);
  g.gain.exponentialRampToValueAtTime(.0001, t+dur);
  g.connect(out);

  const o1 = AC.createOscillator(); o1.type='sine'; o1.frequency.value = f;
  o1.connect(g); o1.start(t); o1.stop(t+dur+.1);

  /* a faint inharmonic partial gives it the bell shimmer */
  const g2 = AC.createGain();
  g2.gain.setValueAtTime(.0001, t);
  g2.gain.exponentialRampToValueAtTime(vol*.22, t+.02);
  g2.gain.exponentialRampToValueAtTime(.0001, t+dur*.6);
  g2.connect(out);
  const o2 = AC.createOscillator(); o2.type='sine'; o2.frequency.value = f*2.76;
  o2.connect(g2); o2.start(t); o2.stop(t+dur);

  /* occasionally answer with a consonant second note */
  if (Math.random() < .22){
    setTimeout(()=>{ if (AC && !muted) playBell(); }, 340);
  }
}

function scheduleBell(){
  bellTimer = setTimeout(()=>{
    if (AC && !muted) playBell();
    scheduleBell();
  }, 2200 + Math.random()*3200);
}

/* ---------- reactive UI sound ---------- */

function tone(freq, dur, vol, delay, type, dest){
  if (!AC || muted) return;
  const t = AC.currentTime + (delay||0);
  const g = AC.createGain();
  g.gain.setValueAtTime(.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t+.015);
  g.gain.exponentialRampToValueAtTime(.0001, t+dur);
  g.connect(dest || bellBus);
  const o = AC.createOscillator();
  o.type = type || 'sine'; o.frequency.value = freq;
  o.connect(g); o.start(t); o.stop(t+dur+.05);
}
function swish(vol){
  if (!AC || muted) return;
  const t = AC.currentTime, dur = .45;
  const buf = AC.createBuffer(1, Math.floor(AC.sampleRate*dur), AC.sampleRate);
  const ch = buf.getChannelData(0);
  for (let i=0;i<ch.length;i++) ch[i] = (Math.random()*2-1) * (1 - i/ch.length);
  const s = AC.createBufferSource(); s.buffer = buf;
  const bp = AC.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=760; bp.Q.value=.8;
  const g = AC.createGain(); g.gain.value = vol || .05;
  s.connect(bp); bp.connect(g); g.connect(master);
  s.start(t);
}
let lastSlideT = 0;
const SFX = {
  pick(){ tone(659.26, 1.2, .05); },                                   /* choosing a card: a small bright answer */
  next(){ tone(146.83, .9, .06, 0, 'triangle', master); },             /* moving on: a low, felt step */
  slide(){ const n = Date.now(); if (n - lastSlideT > 90){ lastSlideT = n; tone(880, .22, .016, 0, 'sine', master); } },
  save(){ tone(587.33, 1.4, .06); tone(880, 1.6, .05, .13); },         /* into the lantern: two notes rising */
  unsave(){ tone(587.33, 1.1, .05); tone(440, 1.3, .045, .13); },      /* out again: two notes falling */
  drawer(){ swish(.05); },
  reveal(){                                                            /* the city arrives: a pentatonic cascade over a pad swell */
    [293.66, 392, 440, 587.33, 880].forEach((f,i)=> tone(f, 3.2, .075, .5 + i*.22));
    if (padSwell && AC){
      const t = AC.currentTime;
      padSwell.gain.cancelScheduledValues(t);
      padSwell.gain.setValueAtTime(padSwell.gain.value, t);
      padSwell.gain.linearRampToValueAtTime(.1, t+1.4);
      padSwell.gain.linearRampToValueAtTime(.05, t+5);
    }
  },
};

function setMuted(m){
  muted = m;
  store.set('beacon-muted', m ? '1' : '0');
  if (master){
    const t = AC.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.linearRampToValueAtTime(m ? 0 : 1, t + 1.2);
  }
  drawSoundIcon();
}

function drawSoundIcon(){
  $('sound-fab').innerHTML =
    '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+
    '<path d="M9 17.5V6.8l9-2.3v10.7"/>'+
    '<circle cx="6.8" cy="17.5" r="2.2"/>'+
    '<circle cx="15.8" cy="15.2" r="2.2"/>'+
    (muted ? '<line x1="3.5" y1="3.5" x2="20.5" y2="20.5"/>' : '')+
    '</svg>';
  $('sound-fab').title = muted ? 'Music is off' : 'Music is on';
}
drawSoundIcon();

$('sound-fab').onclick = ()=>{
  if (!AC && muted){ setMuted(false); startAudio(); return; }
  if (!AC){ startAudio(); setMuted(true); return; }
  setMuted(!muted);
};


export { startAudio, SFX };
