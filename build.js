/* Beacon build — bundles the ES modules back into one self-contained
   dist/index.html (for the claude.ai artifact and any static host).
   Zero dependencies: a line-level transform, not a compiler. It relies
   on this repo's conventions — imports only at the top of a file, and
   only `export const` / `export function` / `export { ... };` forms. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ORDER = ['util','data','questions','scoring','skyline','audio','homes','main'];

const strip = src => src.split('\n').filter(l => {
  const t = l.trim();
  return !(t.startsWith('import ') || (t.startsWith('export {') && t.endsWith(';')));
}).map(l => l
  .replace(/^export const /, 'const ')
  .replace(/^export function /, 'function ')
).join('\n');

const js = ORDER.map(m => strip(readFileSync(`src/${m}.js`, 'utf8'))).join('\n\n');
const css = readFileSync('styles/beacon.css', 'utf8');
const html = readFileSync('index.html', 'utf8')
  .replace('<link rel="stylesheet" href="styles/beacon.css">', () => '<style>\n' + css + '</style>')
  .replace('<script type="module" src="src/main.js"></script>', () => '<script>\n' + js + '</script>');
  /* function replacements: a literal $' in the code must never trigger
     String.replace's special substitution patterns */

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', html);
console.log('dist/index.html —', (html.length/1024).toFixed(0) + 'KB');
