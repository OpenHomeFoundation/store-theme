#!/usr/bin/env node
/*
 * Swatch audit.
 *
 * Reads the real colour out of each colour variant's product photo and compares it to
 * the swatch the store is currently showing, so colour entries can be set from the
 * garment rather than from Shopify's generic taxonomy colours.
 *
 * Usage:
 *   node tools/swatch-audit.mjs                            # against `shopify theme dev`
 *   node tools/swatch-audit.mjs https://your-store.com     # against the live store
 *   node tools/swatch-audit.mjs --json                     # machine-readable
 *
 * No dependencies: images are requested from Shopify's CDN as PNG (`format=png`) and
 * decoded with node:zlib.
 */
import { inflateSync } from 'node:zlib';

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const origin = (args.find((a) => !a.startsWith('--')) ?? 'http://127.0.0.1:9292').replace(/\/$/, '');

/* ---------------------------------------------------------------- PNG decode */

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let pos = 8;
  let width, height, depth, colorType, interlace;
  const idat = [];
  let palette, trns;

  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }

  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // Undo the per-scanline filters (PNG spec §9).
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? cur[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = src[i];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[i] = v & 0xff;
    }
  }

  // Normalise everything to RGBA so the sampler only deals with one layout.
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let i = 0, n = width * height; i < n; i++) {
    const s = i * channels, d = i * 4;
    if (colorType === 2 || colorType === 6) {
      rgba[d] = out[s]; rgba[d + 1] = out[s + 1]; rgba[d + 2] = out[s + 2];
      if (colorType === 6) rgba[d + 3] = out[s + 3];
    } else if (colorType === 0 || colorType === 4) {
      rgba[d] = rgba[d + 1] = rgba[d + 2] = out[s];
      if (colorType === 4) rgba[d + 3] = out[s + 1];
    } else {
      const p = out[s] * 3;
      rgba[d] = palette[p]; rgba[d + 1] = palette[p + 1]; rgba[d + 2] = palette[p + 2];
      if (trns && out[s] < trns.length) rgba[d + 3] = trns[out[s]];
    }
  }
  return { width, height, data: rgba };
}

/* -------------------------------------------------------------- colour maths */

const hex = (r, g, b) => '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

function parseHex(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h ?? '');
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [n >> 16, (n >> 8) & 0xff, n & 0xff];
}

// Perceptual difference, so "is this noticeably wrong?" matches what the eye says.
// CIE76 in Lab: under ~2.3 is invisible, ~5 is noticeable side by side, >10 is obvious.
function deltaE(c1, c2) {
  const lab = ([r, g, b]) => {
    const f = (v) => {
      v /= 255;
      return v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92;
    };
    const [R, G, B] = [f(r), f(g), f(b)];
    const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
    const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
    const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
    const k = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
    const [fx, fy, fz] = [k(x), k(y), k(z)];
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  };
  const [a, b] = [lab(c1), lab(c2)];
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/* ------------------------------------------------------------------ sampling */

function sampleGarment(img) {
  const { width: W, height: H, data } = img;
  const px = (x, y) => {
    const i = (y * W + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]];
  };
  const corners = [px(2, 2), px(W - 3, 2), px(2, H - 3), px(W - 3, H - 3)];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, p) => s + p[c], 0) / 4);
  const far = (p) => Math.max(...[0, 1, 2].map((c) => Math.abs(p[c] - bg[c]))) >= 8;

  // Prints and logos sit centre-chest, so read two vertical strips down the sides of
  // the garment instead — on a flat-lay those are plain fabric.
  const buckets = new Map();
  let n = 0;
  for (const [x0, x1] of [[0.2, 0.32], [0.68, 0.8]]) {
    for (let y = Math.round(H * 0.3); y < H * 0.72; y++) {
      for (let x = Math.round(W * x0); x < W * x1; x++) {
        const p = px(x, y);
        if (p[3] < 200 || !far(p)) continue;
        n++;
        const k = `${p[0] >> 4},${p[1] >> 4},${p[2] >> 4}`;
        const b = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
        b.n++; b.r += p[0]; b.g += p[1]; b.b += p[2];
        buckets.set(k, b);
      }
    }
  }
  if (n < 200) return null;
  const ranked = [...buckets.values()].sort((a, b) => b.n - a.n);
  const t = ranked[0];
  const second = ranked[1];
  return {
    measured: hex(t.r / t.n, t.g / t.n, t.b / t.n),
    share: t.n / n,
    // Low dominance across several distinct buckets means the fabric isn't one flat
    // colour — a stripe, marl or print, which wants an image swatch rather than a hex.
    patterned: ranked.length > 4 && t.n / n < 0.55,
    secondary: second ? hex(second.r / second.n, second.g / second.n, second.b / second.n) : null,
  };
}

/* ---------------------------------------------------------------------- main */

// products.json caps at 250 per page, so walk pages until one comes back short. The
// seen-ids check is a belt-and-braces stop for a host that ignores ?page and would
// otherwise serve the same full page forever.
async function fetchAllProducts() {
  const all = [];
  const seen = new Set();
  for (let page = 1; ; page++) {
    const { products } = await (await fetch(`${origin}/products.json?limit=250&page=${page}`)).json();
    const fresh = products.filter((p) => !seen.has(p.id));
    fresh.forEach((p) => seen.add(p.id));
    all.push(...fresh);
    if (products.length < 250 || fresh.length === 0) break;
  }
  return all;
}

const products = await fetchAllProducts();

// What the store is showing today. The configured swatch lives in a metaobject, not in
// products.json, so read it back off a rendered collection page instead.
const configured = new Map();
try {
  const html = await (await fetch(`${origin}/collections/all`)).text();
  for (const chunk of html.split('class="card__swatch')) {
    const name = /title="([^"]+)"/.exec(chunk);
    const rgb = /--swatch--background:\s*rgb\(([\d\s,.]+)\)/.exec(chunk);
    if (name && rgb) {
      const [r, g, b] = rgb[1].trim().split(/[\s,]+/).map(Number);
      configured.set(name[1], hex(r, g, b));
    }
  }
} catch {
  /* audit still works without it, just without the comparison */
}

const rows = [];

for (const product of products) {
  const idx = product.options.findIndex((o) => /colou?r/i.test(o.name));
  if (idx === -1) continue;

  for (const value of product.options[idx].values) {
    const variant = product.variants.find((v) => v[`option${idx + 1}`] === value);
    const src = variant?.featured_image?.src;
    if (!src) {
      rows.push({ product: product.title, colour: value, note: 'no variant image' });
      continue;
    }
    const url = `${src.split('?')[0]}?width=300&format=png`;
    let sample = null;
    try {
      sample = sampleGarment(decodePng(Buffer.from(await (await fetch(url)).arrayBuffer())));
    } catch (e) {
      rows.push({ product: product.title, colour: value, note: `could not read image (${e.message})` });
      continue;
    }
    if (!sample) {
      rows.push({ product: product.title, colour: value, note: 'not enough fabric visible' });
      continue;
    }
    rows.push({ product: product.title, colour: value, ...sample });
  }
}

if (asJson) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

// Group by colour name, because a Shopify colour entry is shared store-wide: every
// product using the value "Blue" renders the same swatch.
const byColour = new Map();
for (const r of rows) {
  if (!r.colour) continue;
  byColour.set(r.colour, [...(byColour.get(r.colour) ?? []), r]);
}

console.log(`\nSwatch audit — ${origin}\n${'='.repeat(60)}\n`);

for (const [colour, entries] of [...byColour].sort()) {
  const good = entries.filter((e) => e.measured);
  console.log(`${colour}`);
  for (const e of entries) {
    if (e.note) {
      console.log(`   ${e.product.padEnd(38).slice(0, 38)}  — ${e.note}`);
      continue;
    }
    const flags = [
      e.patterned ? 'PATTERNED — use an image swatch' : null,
      e.share < 0.5 ? `only ${Math.round(e.share * 100)}% of the sample` : null,
    ].filter(Boolean);
    console.log(`   ${e.product.padEnd(38).slice(0, 38)}  ${e.measured}${flags.length ? '  ⚠ ' + flags.join('; ') : ''}`);
  }

  // Do the products sharing this name actually share a colour?
  const hexes = good.map((e) => parseHex(e.measured));
  if (hexes.length > 1) {
    let worst = 0;
    for (let i = 0; i < hexes.length; i++)
      for (let j = i + 1; j < hexes.length; j++) worst = Math.max(worst, deltaE(hexes[i], hexes[j]));
    if (worst > 5) {
      console.log(`   ⚠ these differ by ΔE ${worst.toFixed(1)} — they are not the same colour.`);
      console.log(`     One shared "${colour}" entry cannot represent them; split into separate entries.`);
    } else {
      const avg = [0, 1, 2].map((c) => hexes.reduce((s, h) => s + h[c], 0) / hexes.length);
      console.log(`   → set the "${colour}" colour entry to ${hex(...avg)}  (consistent, ΔE ${worst.toFixed(1)})`);
    }
  } else if (hexes.length === 1) {
    console.log(`   → set the "${colour}" colour entry to ${good[0].measured}`);
  }

  const now = configured.get(colour);
  if (now && hexes.length) {
    const avg = [0, 1, 2].map((c) => hexes.reduce((s, h) => s + h[c], 0) / hexes.length);
    const gap = deltaE(parseHex(now), avg);
    const verdict = gap < 2.3 ? 'already a good match' : gap < 5 ? 'slightly off' : gap < 10 ? 'noticeably off' : 'clearly wrong';
    console.log(`     currently showing ${now} — ΔE ${gap.toFixed(1)} from the garment (${verdict})`);
  }
  console.log();
}
