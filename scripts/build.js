#!/usr/bin/env node
/*
 * Copies the publishable site into dist/.
 *
 * The site needs no compilation — this exists so deploy targets and Lighthouse
 * get a directory containing only what should ship, rather than the whole repo
 * (node_modules, tests, workflows).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const INCLUDE = ['index.html', 'assets', '_headers'];

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let files = 0;
for (const entry of INCLUDE) {
  const from = path.join(ROOT, entry);
  if (!fs.existsSync(from)) {
    console.error(`build: missing ${entry}`);
    process.exit(1);
  }
  fs.cpSync(from, path.join(OUT, entry), { recursive: true });
}

// Report what shipped, so an accidentally empty build is obvious in CI logs.
const walk = dir => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else { files++; console.log('  ' + path.relative(OUT, p)); }
  }
};
walk(OUT);
console.log(`build: ${files} files -> dist/`);
if (files < 5) { console.error('build: suspiciously few files'); process.exit(1); }
