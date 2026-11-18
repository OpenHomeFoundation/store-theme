#!/usr/bin/env node
// npm run compare        ->  compare/index.html   (self-contained side-by-side of every template)
// npm run compare:png    ->  also compare/png/<handle>.png and <handle>-mobile.png
//
// Reads renders/<handle>/{current,new}.html, produced by the admin render
// snippet (scripts/admin/render-previews.js) and `npm run import`.
// PNGs use your installed Google Chrome via playwright-core (no browser download).
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rendersDir = path.join(root, 'renders');
const outDir = path.join(root, 'compare');
const withPng = process.argv.includes('--png');

if (!existsSync(rendersDir)) {
  console.error('No renders/ yet. Run the admin render snippet, then npm run import -- <renders.json>.');
  process.exit(1);
}

const { templates: order } = JSON.parse(await readFile(path.join(root, 'emails.config.json'), 'utf8'));
const index = JSON.parse(await readFile(path.join(root, 'current/index.json'), 'utf8'));
const names = Object.fromEntries(index.templates.map((t) => [t.handle, t.displayName]));
const available = new Set(await readdir(rendersDir));
const handles = order.filter((h) => available.has(h));

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const items = [];
for (const h of handles) {
  const dir = path.join(rendersDir, h);
  items.push({
    handle: h,
    name: names[h] ?? h,
    meta: JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8')),
    current: await readFile(path.join(dir, 'current.html'), 'utf8'),
    next: await readFile(path.join(dir, 'new.html'), 'utf8'),
  });
}

const frame = (html, label) =>
  `<iframe title="${esc(label)}" srcdoc="${esc(html)}" loading="lazy" onload="fit(this)"></iframe>`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Email comparison</title>
<script>
  // Defined in <head> so frames that finish loading early can call it.
  function fit(f) {
    try { const d = f.contentDocument; f.style.height = (d.documentElement.scrollHeight + 2) + 'px'; } catch (e) {}
  }
</script>
<style>
  :root { --ink:#09202E; --muted:#51606B; --line:#DDE3EC; --canvas:#F2F4F9; --brand:#18BCF2; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 15px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--ink); background: var(--canvas); }
  header { position: sticky; top: 0; z-index: 2; display: flex; gap: 16px; align-items: center; padding: 12px 24px; background: #fff; border-bottom: 1px solid var(--line); }
  header h1 { font-size: 16px; margin: 0; flex: 1; }
  .toggle button { font: inherit; padding: 6px 12px; border: 1px solid var(--line); background: #fff; color: var(--ink); cursor: pointer; }
  .toggle button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
  .toggle button:first-child { border-radius: 6px 0 0 6px; } .toggle button:last-child { border-radius: 0 6px 6px 0; }
  nav { padding: 12px 24px; display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 13px; }
  nav a { color: var(--muted); }
  section { padding: 24px; border-top: 1px solid var(--line); }
  section h2 { font-size: 20px; margin: 0 0 4px; }
  .handle { color: var(--muted); font: 12px ui-monospace, monospace; }
  .pair { display: flex; gap: 24px; margin-top: 16px; overflow-x: auto; }
  .side { flex: 0 0 auto; }
  .side h3 { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); margin: 0 0 4px; }
  .subject { font-size: 13px; margin: 0 0 8px; max-width: var(--w); }
  iframe { display: block; width: var(--w); height: 900px; border: 1px solid var(--line); border-radius: 8px; background: #fff; }
  body { --w: 640px; } body.mobile { --w: 375px; }
  .warn { color: #8a4b00; font-size: 13px; }
</style>
</head>
<body>
<header>
  <h1>Notification emails — current vs new <span class="handle">${items.length} templates · rendered ${esc(items[0]?.meta.renderedAt ?? '')}</span></h1>
  <div class="toggle" role="group" aria-label="Viewport">
    <button type="button" aria-pressed="true" data-w="desktop">Desktop</button><button type="button" aria-pressed="false" data-w="mobile">Mobile</button>
  </div>
</header>
<nav>${items.map((i) => `<a href="#${i.handle}">${esc(i.name)}</a>`).join('')}</nav>
${items.map((i) => `
<section id="${i.handle}">
  <h2>${esc(i.name)}</h2>
  <div class="handle">${i.handle}</div>
  ${i.meta.approximate ? `<p class="warn">“New” is approximate: Shopify's preview renderer won't preview edited code for this template, so it shows Shopify's render with the brand stylesheet applied in the browser. Check it with a real test email.</p>` : ''}
  ${i.meta.userErrors?.length ? `<p class="warn">Shopify reported: ${esc(i.meta.userErrors.map((e) => e.message).join('; '))}</p>` : ''}
  <div class="pair">
    <div class="side"><h3>Current</h3><p class="subject">Subject: ${esc(i.meta.currentSubject)}</p>${frame(i.current, `${i.name} — current`)}</div>
    <div class="side"><h3>New</h3><p class="subject">Subject: ${esc(i.meta.newSubject)}</p>${frame(i.next, `${i.name} — new`)}</div>
  </div>
</section>`).join('')}
<script>
  document.querySelectorAll('.toggle button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.toggle button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    document.body.classList.toggle('mobile', b.dataset.w === 'mobile');
    document.querySelectorAll('iframe').forEach((f) => { f.style.height = '900px'; requestAnimationFrame(() => fit(f)); });
  }));
</script>
</body>
</html>`;

await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, 'index.html'), page);
console.log(`✓ compare/index.html (${items.length} templates)`);

if (withPng) {
  let chromium;
  try {
    ({ chromium } = await import('playwright-core'));
  } catch {
    console.error('playwright-core is missing — run npm install.');
    process.exit(1);
  }
  const browser = await chromium.launch({ channel: 'chrome' }).catch((err) => {
    console.error(`Couldn't start Google Chrome (${err.message.split('\n')[0]}). Install Chrome, or run: npx playwright install chromium`);
    process.exit(1);
  });
  await mkdir(path.join(outDir, 'png'), { recursive: true });

  const shot = async (item, width, suffix) => {
    const page = await browser.newPage({ viewport: { width: width * 2 + 72, height: 900 }, deviceScaleFactor: 2 });
    const one = (html, label, subject) => `
      <div style="width:${width}px">
        <div style="font:600 12px system-ui;letter-spacing:.06em;text-transform:uppercase;color:#51606B;margin:0 0 4px">${label}</div>
        <div style="font:13px system-ui;color:#09202E;margin:0 0 8px">Subject: ${esc(subject)}</div>
        <iframe srcdoc="${esc(html)}" style="display:block;width:${width}px;height:600px;border:1px solid #DDE3EC;border-radius:8px;background:#fff"></iframe>
      </div>`;
    await page.setContent(`<!doctype html><body style="margin:0;padding:24px;background:#F2F4F9;display:flex;gap:24px;align-items:flex-start">
      ${one(item.current, 'Current', item.meta.currentSubject)}${one(item.next, 'New', item.meta.newSubject)}</body>`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.evaluate(async () => {
      const frames = [...document.querySelectorAll('iframe')];
      await Promise.all(frames.map((f) => Promise.all([...f.contentDocument.images].map((img) => img.decode().catch(() => {})))));
      for (const f of frames) f.style.height = `${f.contentDocument.documentElement.scrollHeight + 2}px`;
    });
    await page.screenshot({ path: path.join(outDir, 'png', `${item.handle}${suffix}.png`), fullPage: true });
    await page.close();
  };

  for (const item of items) {
    await shot(item, 640, '');
    await shot(item, 375, '-mobile');
    console.log(`✓ compare/png/${item.handle}.png, ${item.handle}-mobile.png`);
  }
  await browser.close();
}
