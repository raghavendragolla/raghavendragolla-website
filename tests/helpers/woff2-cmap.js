/**
 * Read the set of Unicode code points a WOFF2 font actually maps to glyphs (its cmap).
 *
 * Used by tests/fonts.spec.js to check real glyph coverage instead of trusting a
 * declared character list. Dependency-free: WOFF2 stores every table in one Brotli
 * stream, and Node's zlib can decompress Brotli. The cmap table is never transformed
 * in WOFF2, so it can be read directly once its offset in the stream is known.
 */

'use strict';

const zlib = require('zlib');

const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ',
  'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS',
  'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc',
  'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop',
  'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill',
];

/** WOFF2 UIntBase128 variable-length integer. */
function readBase128(buf, pos) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    const byte = buf[pos.i++];
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) return value;
  }
  throw new Error('invalid UIntBase128');
}

/** Locate a table inside the decompressed WOFF2 data stream. */
function findTable(buf, wanted) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 file');
  const numTables = buf.readUInt16BE(12);
  const pos = { i: 48 }; // fixed-size WOFF2 header
  let offset = 0;
  let found = null;
  for (let t = 0; t < numTables; t++) {
    const flags = buf[pos.i++];
    const tag = (flags & 0x3f) === 0x3f ? buf.toString('latin1', pos.i, (pos.i += 4)) : KNOWN_TAGS[flags & 0x3f];
    const origLength = readBase128(buf, pos);
    const version = flags >> 6;
    // glyf/loca use transform version 0 for "transformed"; every other table uses 0 for "untransformed".
    const transformed = tag === 'glyf' || tag === 'loca' ? version !== 3 : version !== 0;
    const length = transformed ? readBase128(buf, pos) : origLength;
    if (tag === wanted) found = { offset, length, transformed };
    offset += length;
  }
  const compressedSize = buf.readUInt32BE(20);
  const data = zlib.brotliDecompressSync(buf.subarray(pos.i, pos.i + compressedSize));
  if (!found) throw new Error(`table ${wanted} not found`);
  if (found.transformed) throw new Error(`table ${wanted} is transformed`);
  return data.subarray(found.offset, found.offset + found.length);
}

/** Code points mapped to a non-zero glyph by the best Unicode cmap subtable (format 12 or 4). */
function cmapCodePoints(woff2Buffer) {
  const cmap = findTable(woff2Buffer, 'cmap');
  const numSubtables = cmap.readUInt16BE(2);
  let best = null;
  for (let i = 0; i < numSubtables; i++) {
    const platform = cmap.readUInt16BE(4 + i * 8);
    const encoding = cmap.readUInt16BE(6 + i * 8);
    const off = cmap.readUInt32BE(8 + i * 8);
    const format = cmap.readUInt16BE(off);
    const rank = format === 12 && (platform === 3 || platform === 0) ? 2 : format === 4 && ((platform === 3 && encoding === 1) || platform === 0) ? 1 : 0;
    if (rank && (!best || rank > best.rank)) best = { rank, off, format };
  }
  if (!best) throw new Error('no Unicode cmap subtable');
  const cps = new Set();
  const o = best.off;
  if (best.format === 12) {
    const groups = cmap.readUInt32BE(o + 12);
    for (let g = 0; g < groups; g++) {
      const start = cmap.readUInt32BE(o + 16 + g * 12);
      const end = cmap.readUInt32BE(o + 20 + g * 12);
      const glyph = cmap.readUInt32BE(o + 24 + g * 12);
      for (let c = start; c <= end; c++) if (glyph + (c - start) !== 0) cps.add(c);
    }
    return cps;
  }
  const segX2 = cmap.readUInt16BE(o + 6);
  const ends = o + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const rangeOffsets = deltas + segX2;
  for (let s = 0; s < segX2 / 2; s++) {
    const end = cmap.readUInt16BE(ends + s * 2);
    const start = cmap.readUInt16BE(starts + s * 2);
    const delta = cmap.readInt16BE(deltas + s * 2);
    const ro = cmap.readUInt16BE(rangeOffsets + s * 2);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let glyph;
      if (ro === 0) glyph = (c + delta) & 0xffff;
      else {
        const g = cmap.readUInt16BE(rangeOffsets + s * 2 + ro + (c - start) * 2);
        glyph = g === 0 ? 0 : (g + delta) & 0xffff;
      }
      if (glyph !== 0) cps.add(c);
    }
  }
  return cps;
}

module.exports = { cmapCodePoints };
