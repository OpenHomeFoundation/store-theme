#!/usr/bin/env node
// npm run build  ->  current/<handle>/template.liquid  =>  dist/<handle>.liquid
// npm run dev    ->  same, rebuilding on change
//
// Also writes dist/_bundle.json (every built template + its subject), which the
// admin render snippet reads to produce Shopify-rendered previews.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reskin, applyTokens } from './lib/reskin.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFile(path.join(root, p), 'utf8');

export async function loadParts() {
  const tokens = JSON.parse(await read('brand.config.json'));
  const [css, logo, head] = await Promise.all(['src/brand.css', 'src/logo.liquid', 'src/head.html'].map(read));
  return {
    css: applyTokens(css, tokens, 'src/brand.css').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n{3,}/g, '\n\n'),
    logo: applyTokens(logo, tokens, 'src/logo.liquid'),
    head: applyTokens(head, tokens, 'src/head.html'),
  };
}

export async function buildAll({ quiet = false } = {}) {
  const started = Date.now();
  const { templates } = JSON.parse(await read('emails.config.json'));
  const parts = await loadParts();
  await mkdir(path.join(root, 'dist'), { recursive: true });

  const bundle = { builtAt: new Date().toISOString(), templates: {} };
  const failures = [];
  for (const handle of templates) {
    try {
      const source = await read(`current/${handle}/template.liquid`);
      const meta = JSON.parse(await read(`current/${handle}/meta.json`));
      const html = reskin(source, parts, handle);
      await writeFile(path.join(root, 'dist', `${handle}.liquid`), html);
      bundle.templates[handle] = { subject: meta.subject, bodyHtml: html };
      if (!quiet) console.log(`✓ ${handle}`);
    } catch (err) {
      failures.push(handle);
      console.error(`✗ ${err.message}`);
    }
  }
  await writeFile(path.join(root, 'dist', '_bundle.json'), JSON.stringify(bundle));
  console.log(`${templates.length - failures.length}/${templates.length} built in ${Date.now() - started}ms`);
  return failures;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = await buildAll();
  if (process.argv.includes('--watch')) {
    console.log('Watching src/, current/, brand.config.json and emails.config.json…');
    let timer;
    const rebuild = () => { clearTimeout(timer); timer = setTimeout(() => buildAll({ quiet: true }), 100); };
    for (const p of ['src', 'current']) watch(path.join(root, p), { recursive: true }, rebuild);
    for (const p of ['brand.config.json', 'emails.config.json']) watch(path.join(root, p), rebuild);
  } else if (failures.length) {
    process.exit(1);
  }
}
