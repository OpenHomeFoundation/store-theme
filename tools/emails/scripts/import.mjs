#!/usr/bin/env node
// npm run import -- ~/Downloads/shopify-notifications-export.json
// npm run import -- ~/Downloads/shopify-notification-renders.json
//
// Imports files downloaded by the admin snippets in scripts/admin/:
//   export   -> current/<handle>/{template.liquid, meta.json} + current/index.json
//   renders  -> renders/<handle>/{current.html, new.html, meta.json}
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run import -- <path to downloaded .json>');
  process.exit(1);
}
const data = JSON.parse(await readFile(file, 'utf8'));

async function put(rel, content) {
  const p = path.join(root, rel);
  await mkdir(path.dirname(p), { recursive: true });
  await writeFile(p, content);
}

if (data.kind === 'renders') {
  for (const [handle, r] of Object.entries(data.templates)) {
    await put(`renders/${handle}/current.html`, r.current.bodyHtml);
    await put(`renders/${handle}/new.html`, r.new.bodyHtml);
    await put(`renders/${handle}/meta.json`, JSON.stringify({
      handle,
      renderedAt: data.renderedAt,
      currentSubject: r.current.subject,
      newSubject: r.new.subject,
      userErrors: [...(r.current.userErrors ?? []), ...(r.new.userErrors ?? [])],
      // Shopify's preview renderer ignores submitted code for some templates (returns,
      // payment error); for those the snippet applies the brand CSS to Shopify's render instead.
      approximate: Boolean(r.new.approximate),
    }, null, 2) + '\n');
    console.log(`✓ renders/${handle}`);
  }
} else {
  // Template export. current/<handle>/ only ever receives Shopify's DEFAULT
  // template; what's live on the store is backed up to live/<handle>.liquid.
  const index = [];
  const skipped = [];
  const drift = [];
  let bundle = null;
  try { bundle = JSON.parse(await readFile(path.join(root, 'dist/_bundle.json'), 'utf8')); } catch {}

  for (const [handle, t] of Object.entries(data.templates)) {
    const live = t.live ?? { subject: t.subject, bodyHtml: t.bodyHtml };
    if (live.bodyHtml) await put(`live/${handle}.liquid`, live.bodyHtml);

    // First exports had no live/default split; then bodyHtml is the default only
    // if the template wasn't customised.
    const defaultBody = t.live ? t.bodyHtml : (t.hasDefaultBody === false ? null : t.bodyHtml);
    if (!defaultBody) {
      skipped.push(handle);
    } else {
      await put(`current/${handle}/template.liquid`, defaultBody);
    }
    const meta = {
      handle,
      displayName: t.displayName,
      group: t.group,
      subject: t.subject ?? live.subject,
      hasDefaultBody: t.hasDefaultBody,
      hasDefaultTitle: t.hasDefaultTitle,
    };
    if (defaultBody) await put(`current/${handle}/meta.json`, JSON.stringify(meta, null, 2) + '\n');
    index.push(meta);

    // Customised templates should be exactly our build; anything else means an
    // admin edit or a template that hasn't been re-pasted after a rebuild.
    const built = bundle?.templates?.[handle]?.bodyHtml;
    if (t.hasDefaultBody === false && built && live.bodyHtml !== built) drift.push(handle);
  }
  await put('current/index.json', JSON.stringify({ exportedAt: data.exportedAt, store: data.store, templates: index }, null, 2) + '\n');

  const custom = index.filter((t) => t.hasDefaultBody === false).map((t) => t.handle);
  console.log(`✓ ${index.length - skipped.length} Shopify defaults → current/, ${index.length} live templates backed up → live/`);
  if (custom.length) console.log(`  customised on the store: ${custom.join(', ')}`);
  if (skipped.length) console.log(`⚠ no Shopify default in the export for: ${skipped.join(', ')} (current/ left as it was)`);
  if (drift.length) console.log(`⚠ live template differs from dist/ (edited in the admin, or needs re-pasting): ${drift.join(', ')}`);
  console.log('Next: git diff current/ to see what Shopify changed, then npm run build.');
}
