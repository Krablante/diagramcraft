// Regenerates assets/fonts/metrics.json from the bundled TTF files.
// Run after changing or adding bundled fonts: npm run metrics
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fontsDir = join(root, "assets", "fonts");

// Explicit family/weight mapping so the metrics keys match what themes request
// in SVG (e.g. family "Inter" with weight 500), not the static file's internal
// style-suffixed family name.
const known = {
  "Inter-Regular.ttf": ["Inter", 400],
  "Inter-Medium.ttf": ["Inter", 500],
  "Inter-SemiBold.ttf": ["Inter", 600],
  "SourceSerif4-Regular.ttf": ["Source Serif 4", 400],
  "SourceSerif4-Semibold.ttf": ["Source Serif 4", 600],
  "JetBrainsMono-Regular.ttf": ["JetBrains Mono", 400],
  "JetBrainsMono-Bold.ttf": ["JetBrains Mono", 700],
};

const ranges = [
  [0x20, 0x7e], // printable ASCII
  [0xa0, 0xff], // latin-1 supplement
  [0x391, 0x3ce], // greek
  [0x400, 0x4ff], // cyrillic
  [0x2010, 0x2027], // general punctuation
  [0x2030, 0x205e], // more punctuation
  [0x2190, 0x2199], // arrows
  [0x2200, 0x22ff], // math operators
  [0x2116, 0x2116], // numero sign
  [0x20ac, 0x20ac], // euro
];

const charset = [];
for (const [from, to] of ranges) {
  for (let cp = from; cp <= to; cp++) charset.push(String.fromCodePoint(cp));
}

const out = {};
for (const file of readdirSync(fontsDir).filter((f) => f.endsWith(".ttf")).sort()) {
  const font = opentype.loadSync(join(fontsDir, file));
  const [family, weight] = known[file] ?? [font.names.fontFamily?.en ?? file, font.tables.os2?.usWeightClass ?? 400];
  const actualWeight = font.tables.os2?.usWeightClass ?? 400;
  if (actualWeight !== weight) console.warn(`${file}: OS/2 weight ${actualWeight} does not match mapping ${weight}`);
  const unitsPerEm = font.unitsPerEm;
  const chars = [];
  const advances = [];
  for (const ch of charset) {
    const glyphIndex = font.charToGlyphIndex(ch);
    if (!glyphIndex) continue;
    const glyph = font.glyphs.get(glyphIndex);
    if (!glyph || typeof glyph.advanceWidth !== "number") continue;
    chars.push(ch);
    advances.push(Math.round(glyph.advanceWidth));
  }
  out[family] ??= { weights: {} };
  out[family].weights[weight] = { file, unitsPerEm, chars: chars.join(""), advances };
  console.log(`${file}: ${family} ${weight} ${chars.length} chars, upem ${unitsPerEm}`);
}

writeFileSync(join(fontsDir, "metrics.json"), `${JSON.stringify(out)}\n`);
console.log(`wrote ${join(fontsDir, "metrics.json")}`);
