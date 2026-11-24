// Builds Local LLM Picker as one self-contained HTML file from src/ and data/.
//
// Two themes:
//   THEME=open (default)  our own open theme (src/theme/open.css and open.js). Needs Node.js only:
//                         no Python, no design-system skill, no network.
//                         Output: dist/Local-LLM-Picker-plain.html
//   THEME=rise            the RISE-branded build. Assembles dist/Local-LLM-Picker.src.html and runs the
//                         RISE design-system build (python build.py), which inlines the RISE fonts,
//                         rise.css, rise.js, the RISE logo and the icons.
//                         Output: dist/Local-LLM-Picker.html
//
// Usage: node build.mjs                 (PowerShell: $env:THEME='rise'; node build.mjs)
//        THEME=rise node build.mjs
// Env:   THEME      open | rise (default open)
//        DATA_DIR   other data folder (default ./data)
//        OUT        output file (default as above); for THEME=rise the .src.html is written next to it
//        RISE_BUILD path to the RISE build.py (default ~/.claude/skills/rise-design/scripts/build.py)
//        PYTHON     Python executable for THEME=rise (default: python, then py, then python3)
//
// Markup that exists in one theme only is wrapped in src/index.template.html as
//   <!--THEME:rise--> ... <!--/THEME:rise-->   and   <!--THEME:open--> ... <!--/THEME:open-->
// The build keeps the blocks of the chosen theme (without the markers) and drops the others.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const fail = msg => { console.error(msg); process.exit(1); };
const read = (p, fallback = '') => {
  const f = path.join(root, p);
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : fallback;
};
const b64 = p => fs.readFileSync(path.join(root, p)).toString('base64');

const THEMES = ['open', 'rise'];
const THEME = (process.env.THEME || 'open').trim().toLowerCase();
if (!THEMES.includes(THEME)) fail(`Unknown THEME "${process.env.THEME}". Use one of: ${THEMES.join(', ')}.`);

const DEFAULT_OUT = { open: 'dist/Local-LLM-Picker-plain.html', rise: 'dist/Local-LLM-Picker.html' };
const DATA_DIR = process.env.DATA_DIR || path.join(root, 'data');
const OUT = path.resolve(process.env.OUT || path.join(root, DEFAULT_OUT[THEME]));
const SRC_OUT = OUT.replace(/\.html?$/i, '') + '.src.html';
const RISE_BUILD = process.env.RISE_BUILD || path.join(os.homedir(), '.claude', 'skills', 'rise-design', 'scripts', 'build.py');

/* ---------- Data ---------- */
const json = p => {
  const f = path.join(DATA_DIR, p.replace(/^data\//, ''));
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : [];
};

const meta = fs.existsSync(path.join(DATA_DIR, 'meta.json')) ? json('data/meta.json') : {};
const overrides = fs.existsSync(path.join(DATA_DIR, 'overrides.json')) ? json('data/overrides.json') : {};
const hwOverrides = fs.existsSync(path.join(DATA_DIR, 'hardware-overrides.json')) ? json('data/hardware-overrides.json') : {};
const llm = json('data/models-llm.json').map(m => Object.assign({}, m, overrides[m.id] || {}));
const data = {
  meta: Object.assign({ updated: '2026-11-19' }, meta),
  llm,
  media: json('data/models-media.json'),
  hardware: json('data/hardware.json').map(h => Object.assign({}, h, hwOverrides[h.id] || {})),
  runtimes: json('data/runtimes.json'),
  pricing: fs.existsSync(path.join(DATA_DIR, 'pricing.json')) ? JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'pricing.json'), 'utf8')) : null
};

// "</script" inside a JSON string would end the script tag early
const dataJs = 'window.DATA = ' + JSON.stringify(data).replace(/<\/(script)/gi, '<\\/$1') + ';';
// the same guard for our own scripts and the Learn markup
const safe = s => s.replace(/<\/(script)/gi, '<\\/$1');

/* ---------- Page ---------- */
let html = read('src/index.template.html');
if (!html) fail('src/index.template.html is missing.');

// Theme blocks: a marker on a line of its own takes its line with it, so the kept markup keeps its layout.
const keepTheme = (t, body) => {
  if (!THEMES.includes(t)) fail(`Unknown theme "${t}" in a THEME marker in src/index.template.html.`);
  return t === THEME ? body : '';
};
html = html.replace(/^[ \t]*<!--THEME:(\w+)-->[ \t]*\r?\n([\s\S]*?)^[ \t]*<!--\/THEME:\1-->[ \t]*\r?\n/gm, (_, t, body) => keepTheme(t, body));
html = html.replace(/<!--THEME:(\w+)-->([\s\S]*?)<!--\/THEME:\1-->/g, (_, t, body) => keepTheme(t, body));
if (/<!--\/?THEME:/.test(html)) fail('Unmatched THEME marker in src/index.template.html.');

const put = (marker, text) => {
  if (!html.includes(marker)) fail('marker missing in src/index.template.html: ' + marker);
  html = html.replace(marker, () => text);
};
html = html.replace(/<!--IMG:([\w.\-]+)-->/g, (_, f) => 'data:image/webp;base64,' + b64('src/img/' + f));
put('/*STYLES*/', read('src/styles.css'));
put('/*LEARN_CSS*/', read('src/learn.css'));
put('<!--LEARN_HTML-->', read('src/learn.html', '<div class="wrap"><p>Tutorial is being written.</p></div>'));
put('/*DATA*/', dataJs);
put('/*ENGINE*/', safe(read('src/engine.js')));
put('/*APP*/', safe([read('src/app.js'), read('src/media.js'), read('src/costs.js')].join('\n')));
put('/*LEARN_JS*/', safe(read('src/learn.js')));

const counts = `llm ${data.llm.length}, media ${data.media.length}, hardware ${data.hardware.length}, runtimes ${data.runtimes.length}`;
fs.mkdirSync(path.dirname(OUT), { recursive: true });

if (THEME === 'open') {
  // The open theme goes where the design-system build would put its stylesheet and runtime.
  put('<!-- rise:head -->', '<style id="theme-css">\n' + read('src/theme/open.css') + '\n</style>');
  put('<!-- rise:scripts -->', '<script id="theme-js">\n' + safe(read('src/theme/open.js')) + '\n</script>');
  fs.writeFileSync(OUT, html);
  console.log(`${path.basename(OUT)} written (open theme): ${Math.round(Buffer.byteLength(html) / 1024)} KB  (${counts})`);
} else {
  // Stage 1: our page in the RISE source format; stage 2: the RISE build inlines fonts, CSS, runtime, logo and icons.
  if (!fs.existsSync(RISE_BUILD)) {
    fail(`RISE build script not found: ${RISE_BUILD}\nSet RISE_BUILD to the path of rise-design/scripts/build.py, or build the open theme instead (THEME=open, the default).`);
  }
  fs.writeFileSync(SRC_OUT, html);
  console.log(`${path.basename(SRC_OUT)} written: ${Math.round(Buffer.byteLength(html) / 1024)} KB  (${counts})`);
  const pythons = process.env.PYTHON ? [process.env.PYTHON] : ['python', 'py', 'python3'];
  let res = null;
  for (const py of pythons) {
    res = spawnSync(py, [RISE_BUILD, SRC_OUT, '-o', OUT], { encoding: 'utf8' });
    if (!res.error) break;
  }
  if (!res || res.error) fail('Python not found. Install Python 3.8+ or set PYTHON to its path.');
  process.stdout.write(res.stdout || '');
  process.stderr.write(res.stderr || '');
  if (res.status !== 0) process.exit(res.status || 1);
}

/* ---------- Checks on the finished file ---------- */
const built = fs.readFileSync(OUT, 'utf8');
const problems = [];

// Self-contained: the page must not load anything from the network.
const remote = built.match(/<(?:script|link|img)\b[^>]*\b(?:src|href)=["'](?:https?:)?\/\/[^"']+/gi);
if (remote) problems.push('Remote resources:\n    ' + remote.slice(0, 5).join('\n    '));
if (/@font-face\s*\{[^}]*(?:Instrument|Space Mono)/.test(built)) problems.push('Fonts of the first design are still embedded.');

// No personal paths of the machine that built it.
const personal = built.match(/[A-Za-z]:[\\/]+(?:Users|Documents and Settings)[\\/]+[^\\/"'\s]+|\/(?:Users|home)\/[^/"'\s]+\/|[\\/]\.claude[\\/]skills/g);
if (personal) problems.push('Personal paths:\n    ' + [...new Set(personal)].slice(0, 5).join('\n    '));

if (THEME === 'open') {
  // The open build carries no fonts and nothing of the RISE design system.
  const forbidden = [
    [/@font-face/i, 'an @font-face block'],
    [/data:(?:font\/|application\/(?:x-)?font)/i, 'an embedded font file'],
    [/url\([^)]*\.(?:woff2?|ttf|otf|eot)\b/i, 'a font file reference'],
    [/rise\.css|rise\.js|rise-fonts|rise-icons|id=["']rise-(?:css|js)["']/i, 'a RISE stylesheet or script'],
    [/RISE_(?:LOGOS|ICONS)/, 'RISE logo or icon data'],
    [/RISE design system/i, 'the RISE banner'],
    [/Research Institutes of Sweden/i, 'RISE brand text'],
    [/\bCode Pro\b|\bRoboto Mono\b|\bLato\b/, 'a RISE font name'],
    [/data-logo=/, 'a RISE logo placeholder']
  ];
  for (const [re, what] of forbidden) {
    const m = built.match(re);
    if (m) problems.push(`Open build contains ${what}: "${m[0]}"`);
  }
  // When the RISE design system is installed here, also check that none of its files' text ended up
  // in the open build: no line of rise.css or rise.js, and no path of the RISE logo.
  const assets = path.resolve(path.dirname(RISE_BUILD), '..', 'assets');
  const riseFiles = ['css/rise.css', 'js/rise.js', 'logos/rise-mark.svg', 'logos/rise-lockup.svg'].map(f => path.join(assets, f)).filter(f => fs.existsSync(f));
  for (const f of riseFiles) {
    const text = fs.readFileSync(f, 'utf8');
    const pieces = /\.svg$/.test(f)
      ? [...text.matchAll(/\bd="([^"]{40,})"/g)].map(m => m[1])
      : text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length >= 60);
    const hits = pieces.filter(p => built.includes(p));
    if (hits.length) problems.push(`Open build contains ${hits.length} piece(s) of ${path.basename(f)}, e.g. "${hits[0].slice(0, 90)}"`);
  }
  if (!riseFiles.length) console.log('  (RISE design system not installed here: skipped the line-by-line comparison with its files)');
}

if (problems.length) {
  console.error('Build check failed for ' + path.basename(OUT) + ':\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`  checks passed: self-contained, no personal paths${THEME === 'open' ? ', no fonts, no RISE material' : ''}`);
