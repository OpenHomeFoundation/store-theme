// Reskins one of Shopify's default notification templates with the OHF brand.
//
// Deliberately surgical: Shopify's Liquid logic and markup are left untouched
// (split deliveries, bundles, subscriptions, RTL, PDF policy attachments, the
// managed taxes footer…). Only three things change:
//   1. the accent-colour <style> block (driven by shop.email_accent_color) is removed
//   2. the shop logo / shop name slot in the header gets the OHF logo
//   3. the OHF stylesheet is added as the last thing in <head>, so it wins the
//      cascade when Shopify inlines CSS at send time
//
// Every anchor must match exactly once, so if Shopify changes a default upstream
// the build fails loudly instead of shipping a half-branded email.
//
// No Node APIs here: the same module runs in the build and in the admin
// render snippet (scripts/admin/render-previews.js).

export class ReskinError extends Error {}

function fail(handle, what, detail) {
  throw new ReskinError(`${handle}: ${what}${detail ? ` (${detail})` : ''}`);
}

// Find the Liquid {% if %} block that starts at `start`, honouring nesting.
function matchingEndif(source, start, handle) {
  const tag = /\{%-?\s*(if|unless|endif|endunless)\b[^%]*-?%\}/g;
  tag.lastIndex = start;
  let depth = 0;
  for (let m; (m = tag.exec(source)); ) {
    const name = m[1];
    if (name === 'if' || name === 'unless') depth++;
    else depth--;
    if (depth === 0) return m.index + m[0].length;
  }
  fail(handle, 'unterminated logo {% if %} block');
}

function replaceLogo(source, logo, handle) {
  const cell = source.indexOf('class="shop-name__cell"');
  if (cell === -1) fail(handle, 'shop-name__cell not found');
  if (source.indexOf('class="shop-name__cell"', cell + 1) !== -1) fail(handle, 'more than one shop-name__cell');

  const open = /\{%-?\s*if shop\.email_logo_url\s*-?%\}/g;
  open.lastIndex = cell;
  const m = open.exec(source);
  if (!m) fail(handle, 'logo {% if shop.email_logo_url %} block not found after shop-name__cell');
  const end = matchingEndif(source, m.index, handle);
  return source.slice(0, m.index) + logo + source.slice(end);
}

function removeAccentStyle(source, handle) {
  const blocks = [...source.matchAll(/<style>[\s\S]*?<\/style>/g)].filter((b) => b[0].includes('email_accent_color'));
  if (blocks.length !== 1) fail(handle, 'expected exactly one accent-colour <style> block', `found ${blocks.length}`);
  const [block] = blocks;
  return source.slice(0, block.index) + source.slice(block.index + block[0].length);
}

function appendToHead(source, html, handle) {
  const parts = source.split('</head>');
  if (parts.length !== 2) fail(handle, 'expected exactly one </head>', `found ${parts.length - 1}`);
  return `${parts[0]}${html}\n</head>${parts[1]}`;
}

// Totals sit in an unclassed cell beside Shopify's 40% .subtotal-spacer. With no
// width of its own, the Gmail app shrinks the totals tables in it to their
// content, so the charges and the total stop lining up. Tag it so the stylesheet
// can size it explicitly (60% beside the spacer on desktop, 100% on mobile).
const SUBTOTAL_CONTENT = /<td class="subtotal-spacer"><\/td>(\s*)<td>/g;

function tagSubtotalContent(source, handle) {
  const spacers = (source.match(/class="subtotal-spacer"/g) || []).length;
  const out = source.replace(SUBTOTAL_CONTENT, '<td class="subtotal-spacer"></td>$1<td class="subtotal-content">');
  const tagged = (out.match(/class="subtotal-content"/g) || []).length;
  if (tagged !== spacers) fail(handle, 'untagged totals cell', `${tagged} of ${spacers} tagged`);
  return out;
}

/**
 * @param {string} source   Shopify default template (current/<handle>/template.liquid)
 * @param {{ css: string, logo: string, head: string }} parts  token-resolved brand parts
 * @param {string} handle   notification handle, for error messages
 */
export function reskin(source, parts, handle) {
  let out = removeAccentStyle(source, handle);
  out = replaceLogo(out, parts.logo.trim(), handle);
  out = tagSubtotalContent(out, handle);
  out = appendToHead(out, `${parts.head.trim()}\n<style>\n${parts.css.trim()}\n</style>`, handle);
  if (out.includes('email_accent_color')) fail(handle, 'shop.email_accent_color still referenced after reskin');
  if (out.includes('email_logo_url')) fail(handle, 'shop.email_logo_url still referenced after reskin');
  return out;
}

const TOKEN = /\[\[\s*([\w.]+)\s*\]\]/g;

export function applyTokens(source, tokens, label) {
  return source.replace(TOKEN, (_, key) => {
    const value = key.split('.').reduce((obj, k) => obj?.[k], tokens);
    if (value === undefined || value === null || typeof value === 'object') {
      throw new ReskinError(`Unknown brand token [[${key}]] in ${label}`);
    }
    return String(value);
  });
}
