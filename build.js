/* Beacon build — bundles the ES modules into deployable single files.
   Zero dependencies: a line-level transform, not a compiler. It relies
   on this repo's conventions — imports only at the top of a file, and
   only `export const` / `export function` / `export { ... };` forms.

   Outputs:
     dist/index.html    full HTML5 document (Cloudflare Pages, any host)
     dist/artifact.html body-content only — the claude.ai artifact
                        wrapper supplies doctype/html/head/body itself */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const ORDER = ['util','data','questions','visas','scoring','skyline','audio','homes','jobs','main'];

const strip = src => src.split('\n').filter(l => {
  const t = l.trim();
  return !(t.startsWith('import ') || (t.startsWith('export {') && t.endsWith(';')));
}).map(l => l
  .replace(/^export const /, 'const ')
  .replace(/^export function /, 'function ')
).join('\n');

const js = ORDER.map(m => strip(readFileSync(`src/${m}.js`, 'utf8'))).join('\n\n');
const css = readFileSync('styles/beacon.css', 'utf8');

const full = readFileSync('index.html', 'utf8')
  .replace('<link rel="stylesheet" href="styles/beacon.css">', () => '<style>\n' + css + '</style>')
  .replace('<script type="module" src="src/main.js"></script>', () => '<script>\n' + js + '</script>');
  /* function replacements: a literal $' in the code must never trigger
     String.replace's special substitution patterns */

mkdirSync('dist', { recursive: true });
writeFileSync('dist/index.html', full);

/* artifact variant: charset + short title + fonts + style + body content */
const body = full.match(/<body>\n([\s\S]*)\n<\/body>/)[1];
const fonts = full.match(/<link rel="preconnect"[\s\S]*?display=swap">/)[0];
const style = full.match(/<style>\n[\s\S]*?<\/style>/)[0];
const artifact = '<meta charset="utf-8">\n<title>Beacon</title>\n' + fonts + '\n' + style + '\n' + body + '\n';
writeFileSync('dist/artifact.html', artifact);

console.log('dist/index.html —', (full.length/1024).toFixed(0) + 'KB · dist/artifact.html —', (artifact.length/1024).toFixed(0) + 'KB');
