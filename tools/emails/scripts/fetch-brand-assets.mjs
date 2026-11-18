#!/usr/bin/env node
// npm run assets
// Builds the email logo from the OHF Brand Assets API (vector SVG):
//
//   assets/brand/ohf-lockup-email@2x.png   the colour lockup on a white rounded
//                                           plate, at 2× the display size
//
// Why a plate: Gmail's apps (and Outlook for Windows) repaint emails in dark
// mode but never touch images. A transparent logo's dark-ink parts vanish on
// the repainted dark background; a logo with its own white plate stays
// readable. On the white light-mode page the plate is invisible, and the
// template offsets it by the plate padding so the logo aligns with the text.
//
// Then upload the PNG to Shopify → Content → Files and put its cdn.shopify.com
// URL in brand.config.json → logo.src.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { logo } = JSON.parse(await readFile(path.join(root, 'brand.config.json'), 'utf8'));

// Same construction as the comparison/preview tooling: the API SVG nested
// inside a white rounded rect.
export function plateSvg(src, { lockupWidth, pad, radius, scale = 2 }) {
  const vb = src.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
  const lw = lockupWidth * scale;
  const lh = Math.round((lw * vb[3]) / vb[2]);
  const p = pad * scale;
  const W = lw + p * 2;
  const H = lh + p * 2;
  const inner = src.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  return {
    W,
    H,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" rx="${radius * scale}" fill="#FFFFFF"/><svg x="${p}" y="${p}" width="${lw}" height="${lh}" viewBox="${vb.join(' ')}" fill="none">${inner}</svg></svg>`,
  };
}

const res = await fetch(logo.api);
if (!res.ok) throw new Error(`${res.status} fetching ${logo.api}`);
const { W, H, svg } = plateSvg(await res.text(), logo);

const out = path.join(root, 'assets/brand');
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'ohf-lockup-email.svg'), svg);
const png = await sharp(Buffer.from(svg), { density: 300 }).resize(W, H).png({ compressionLevel: 9 }).toBuffer();
await writeFile(path.join(out, 'ohf-lockup-email@2x.png'), png);
console.log(`✓ assets/brand/ohf-lockup-email@2x.png  ${W}×${H}  ${(png.length / 1024).toFixed(1)} KB`);
console.log('Next: upload it to Shopify → Content → Files, then set logo.src in brand.config.json.');
