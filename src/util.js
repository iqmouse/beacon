export const $ = id => document.getElementById(id);

export const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} },
};

export const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
