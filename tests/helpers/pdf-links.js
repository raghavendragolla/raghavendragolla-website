/**
 * Extract link targets (/URI entries) from a PDF buffer, for smoke tests.
 *
 * Why this exists: pdfTeX/hyperref writes URI strings with PDF escape
 * sequences (e.g. `https\072\057\057github\056com` for `https://github.com`)
 * and may place link annotations inside compressed object streams (/ObjStm).
 * A plain regex over the raw bytes therefore finds nothing even though the
 * links are present. This helper inflates every FlateDecode stream, then
 * decodes PDF literal and hex strings before returning the URIs.
 *
 * Dependency-free (Node's zlib only).
 */

'use strict';

const zlib = require('zlib');

/** Decode the body of a PDF literal string (the text between the parentheses). */
function decodeLiteral(body) {
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch !== '\\') { out += ch; continue; }
    const next = body[++i];
    if (next === undefined) break;
    if (/[0-7]/.test(next)) {
      let oct = next;
      while (oct.length < 3 && /[0-7]/.test(body[i + 1] || '')) oct += body[++i];
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
    } else if (next === 'n') out += '\n';
    else if (next === 'r') out += '\r';
    else if (next === 't') out += '\t';
    else if (next === 'b') out += '\b';
    else if (next === 'f') out += '\f';
    else if (next === '\r' || next === '\n') { if (next === '\r' && body[i + 1] === '\n') i++; }
    else out += next; // \( \) \\ and any other escaped character
  }
  return out;
}

/** Return the raw PDF text plus every successfully inflated stream, as latin1 strings. */
function pdfTextSources(buffer) {
  const raw = buffer.toString('latin1');
  const sources = [raw];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    try {
      sources.push(zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'));
    } catch {
      // Not a FlateDecode stream (or not compressed); the raw text is already included.
    }
  }
  return sources;
}

/** All distinct /URI targets in the PDF, decoded. */
function extractPdfUris(buffer) {
  const uris = new Set();
  for (const src of pdfTextSources(buffer)) {
    // Fresh regex per source: a shared /g regex would carry lastIndex across strings.
    const uriRe = /\/URI\s*(?:\(((?:\\[\s\S]|[^\\)])*)\)|<([0-9A-Fa-f\s]*)>)/g;
    let m;
    while ((m = uriRe.exec(src)) !== null) {
      if (m[1] !== undefined) uris.add(decodeLiteral(m[1]));
      else uris.add(Buffer.from(m[2].replace(/\s+/g, ''), 'hex').toString('latin1'));
    }
  }
  return [...uris];
}

/** Distinct github.com account handles linked from the PDF. */
function githubHandles(buffer) {
  const handles = new Set();
  for (const uri of extractPdfUris(buffer)) {
    const m = uri.match(/^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9._-]+)/i);
    if (m) handles.add(m[1]);
  }
  return [...handles];
}

module.exports = { decodeLiteral, extractPdfUris, githubHandles };
