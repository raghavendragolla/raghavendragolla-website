#!/usr/bin/env node
/**
 * Privacy / PII Scanner
 * ---------------------------------------------------------------------------
 * Scans *every* public-facing artefact for unintended personal information —
 * not just HTML and JS.
 *
 * Why this exists: the previous guard read 9 hardcoded text files. The one file
 * that historically contained a private phone number was the resume PDF, which
 * that guard could not read at all. This scanner therefore covers text files,
 * PDFs (via real ToUnicode text extraction), DOCX, SVGs and image metadata.
 *
 * Design rules:
 *  - Never scan raw compressed PDF bytes; that produces false positives from
 *    font glyph tables. Only decoded document text is checked.
 *  - Allowlist information that is deliberately public (name, published email,
 *    public profile URLs, city/region).
 *  - Fail loudly on anything else that looks like PII.
 *
 * Usage: node scripts/privacy-scan.js [--verbose]
 * Exit code 0 = clean, 1 = findings.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const VERBOSE = process.argv.includes('--verbose');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Directories that are never published, so they are out of scope. */
const EXCLUDE_DIRS = new Set([
  '.git', 'node_modules', 'scratch', '.zwork', '.lighthouseci',
  'test-results', 'playwright-report', '.vscode', '.github'
]);

/**
 * Individual files that are out of scope.
 * package-lock.json is a generated dependency manifest that embeds third-party
 * package authors' contact addresses (e.g. npm maintainers). Those are not this
 * site's data and must not be reported.
 */
const EXCLUDE_FILES = new Set([
  'package-lock.json',
  // This scanner necessarily contains PII regex/constant literals; scanning
  // itself would produce infinite false positives.
  'scripts/privacy-scan.js'
]);

/** File extensions worth scanning, mapped to the strategy used. */
const TEXT_EXT = new Set(['.html', '.htm', '.js', '.mjs', '.css', '.json',
  '.xml', '.txt', '.md', '.yml', '.yaml', '.svg', '.webmanifest']);
const PDF_EXT = new Set(['.pdf']);
const DOCX_EXT = new Set(['.docx']);
const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp']);

/**
 * Deliberately public values. Anything matching these is not reported.
 * Kept intentionally narrow: only things the site openly publishes.
 */
const ALLOWED_EMAILS = new Set([
  'raghavendrayadavgolla@gmail.com',
  'contact@raghavendragolla.com'
]);

const ALLOWED_HOSTS = [
  'raghavendragolla.com', 'www.raghavendragolla.com', 'career.raghavendragolla.com',
  'linkedin.com', 'github.com', 'coursera.org', 'elearn.smarted.pro',
  'ibm-capstone.streamlit.app', 'house-price-prediction-raghav.streamlit.app',
  'handwritten-digit-recognition.streamlit.app', 'cuchd.in', 'kru.ac.in',
  'web3forms.com', 'schema.org',
  'w3.org', 'example.com', 'company.com'
];

/** Placeholders that are not real data. */
const PLACEHOLDER_PATTERNS = [
  /98765\s*43210/,          // form field placeholder
  /\bXXXX+\b/i,
  /example\.(com|org|net)/i,
  /alex@company\.com/i,
  /your[._-]?email/i
];

// Detection patterns --------------------------------------------------------

/** Indian mobile numbers, with optional country code. */
const PHONE_RE = /(?:\+?91[\s.-]?)?[6-9]\d{9}\b/g;

/** Any email address. */
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** 12+ digit runs that look like account/ID numbers (not dates or timestamps). */
const LONG_DIGITS_RE = /\b\d{12,}\b/g;

/**
 * True when a long digit run is benign: calendar timestamps rather than an
 * identifier. Covers YYYYMMDDHHMMSS (14 digits, as found in PDF /CreationDate)
 * and 13-digit epoch-millisecond values.
 */
function isBenignDigitRun(value) {
  // PDF date format D:YYYYMMDDHHMMSS
  if (/^(19|20)\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])\d{2}\d{2}$/.test(value)) return true;
  // 13-digit epoch milliseconds (1 Jan 2001 .. 1 Jan 2100)
  if (/^\d{13}$/.test(value)) {
    const n = Number(value);
    if (n > 978307200000 && n < 4102444800000) return true;
  }
  return false;
}

/** Common secret shapes. Kept generic so it catches leaks early. */
const SECRET_RE = new RegExp([
  '-----BEGIN [A-Z ]*PRIVATE KEY-----',
  '\\bAKIA[0-9A-Z]{16}\\b',                       // AWS access key id
  '\\bsk-[A-Za-z0-9]{20,}\\b',                    // OpenAI-style key
  '\\bgh[pousr]_[A-Za-z0-9]{20,}\\b',             // GitHub token
  '\\beyJ[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\b' // JWT
].join('|'), 'g');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.well-known') {
      if (EXCLUDE_DIRS.has(entry.name) || entry.isDirectory()) continue;
    }
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (EXCLUDE_DIRS.has(entry.name)) continue;
      walk(full, out);
    } else {
      out.push(rel);
    }
  }
  return out;
}

function isPlaceholder(text) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(text));
}

function allowedEmail(email) {
  const lower = email.toLowerCase();
  if (ALLOWED_EMAILS.has(lower)) return true;
  const domain = lower.split('@')[1] || '';
  // allow any address whose domain is a known published host or a doc/example domain
  return ALLOWED_HOSTS.some((h) => domain === h || domain.endsWith('.' + h)) ||
    /\.(invalid|test|local)$/.test(domain) ||
    ALLOWED_EMAILS.has(lower);
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function contextOf(text, index, span = 60) {
  return text.slice(Math.max(0, index - span), index + span).replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Extractors
// ---------------------------------------------------------------------------

/** Extract decoded text from a PDF using Python pypdf (ToUnicode-aware). */
function extractPdfText(absPath) {
  const py = `
import re, sys, json
try:
    from pypdf import PdfReader
except ImportError:
    print(json.dumps({"error": "pypdf-not-installed"}))
    sys.exit(0)
try:
    r = PdfReader(sys.argv[1])
    parts = []
    for p in r.pages:
        parts.append(p.extract_text() or "")
    meta = {k: str(v) for k, v in (r.metadata or {}).items()}
    print(json.dumps({"text": "\\n".join(parts), "meta": meta, "pages": len(r.pages)}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
  try {
    const out = execFileSync('python', ['-c', py, absPath], {
      encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024
    });
    return JSON.parse(out.trim());
  } catch (e) {
    return { error: 'python-failed: ' + e.message };
  }
}

/** Extract text + metadata from a DOCX (a zip of XML). */
function extractDocx(absPath) {
  const py = `
import zipfile, re, sys, json
try:
    z = zipfile.ZipFile(sys.argv[1])
    text = []
    for n in z.namelist():
        if n.startswith('word/') and n.endswith('.xml'):
            try:
                x = z.read(n).decode('utf-8', 'replace')
                x = re.sub(r'<[^>]+>', ' ', x)
                text.append(x)
            except Exception:
                pass
    meta = {}
    for n in ('docProps/core.xml', 'docProps/app.xml'):
        if n in z.namelist():
            x = z.read(n).decode('utf-8', 'replace')
            for tag in ('dc:creator','cp:lastModifiedBy','dc:title','dc:subject','cp:keywords','Company','Application'):
                m = re.search('<'+tag+'>([^<]*)</'+tag+'>', x)
                if m:
                    meta[tag] = m.group(1)
    print(json.dumps({"text": " ".join(text), "meta": meta}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
  try {
    const out = execFileSync('python', ['-c', py, absPath], {
      encoding: 'utf8', timeout: 60000, maxBuffer: 32 * 1024 * 1024
    });
    return JSON.parse(out.trim());
  } catch (e) {
    return { error: 'python-failed: ' + e.message };
  }
}

/** Extract EXIF/GPS metadata summary from an image. */
function extractImageMetadata(absPath) {
  const py = `
import sys, json
try:
    from PIL import Image, ExifTags
except ImportError:
    print(json.dumps({"error": "pillow-not-installed"})); sys.exit(0)
try:
    img = Image.open(sys.argv[1])
    ex = img.getexif()
    tags = {}
    if ex:
        for k, v in ex.items():
            tags[ExifTags.TAGS.get(k, k)] = str(v)[:200]
    print(json.dumps({"tags": tags, "size": list(img.size), "mode": img.mode}))
except Exception as e:
    print(json.dumps({"error": str(e)}))
`;
  try {
    const out = execFileSync('python', ['-c', py, absPath], {
      encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024
    });
    return JSON.parse(out.trim());
  } catch (e) {
    return { error: 'python-failed: ' + e.message };
  }
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

const findings = [];
const notes = [];

function addFinding(file, kind, detail, extra) {
  findings.push({ file, kind, detail, extra });
}

function scanTextForPii(file, text, label) {
  // Phones
  for (const m of text.matchAll(PHONE_RE)) {
    if (isPlaceholder(m[0])) continue;
    addFinding(file, 'PHONE', `${label}: "${m[0]}" — ...${contextOf(text, m.index)}...`);
  }
  // Emails
  for (const m of text.matchAll(EMAIL_RE)) {
    if (isPlaceholder(m[0]) || allowedEmail(m[0])) continue;
    addFinding(file, 'EMAIL', `${label}: "${m[0]}" — ...${contextOf(text, m.index)}...`);
  }
  // Long digit runs (skip calendar timestamps)
  for (const m of text.matchAll(LONG_DIGITS_RE)) {
    if (isPlaceholder(m[0]) || isBenignDigitRun(m[0])) continue;
    addFinding(file, 'LONG_DIGITS', `${label}: "${m[0]}" — ...${contextOf(text, m.index)}...`);
  }
  // Secrets
  for (const m of text.matchAll(SECRET_RE)) {
    addFinding(file, 'SECRET', `${label}: redacted match (${m[0].slice(0, 12)}...)`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const files = walk(ROOT).sort();
  console.log('Privacy / PII scan');
  console.log('='.repeat(72));
  console.log(`Scanning ${files.length} tracked/public files under ${ROOT}\n`);

  let scannedCount = 0;

  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    const ext = path.extname(rel).toLowerCase();

    if (TEXT_EXT.has(ext)) {
      if (EXCLUDE_FILES.has(rel)) {
        if (VERBOSE) notes.push(`skip   ${rel} (excluded generated manifest)`);
        continue;
      }
      let text;
      try {
        text = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      scannedCount++;
      scanTextForPii(rel, text, 'text');
      if (VERBOSE) notes.push(`text   ${rel}`);
      continue;
    }

    if (PDF_EXT.has(ext)) {
      const r = extractPdfText(abs);
      if (r.error) {
        notes.push(`WARN   ${rel}: could not extract text (${r.error})`);
        addFinding(rel, 'EXTRACTION_FAILED', `PDF text extraction failed: ${r.error}`);
        continue;
      }
      scannedCount++;
      scanTextForPii(rel, r.text, 'pdf-text');
      // PDF metadata: report informative fields, but not Author/Title (expected)
      const metaStr = Object.entries(r.meta || {})
        .filter(([k]) => !['/Author', '/Title'].includes(k))
        .map(([k, v]) => `${k}=${v}`).join(' ');
      if (VERBOSE) notes.push(`pdf    ${rel} (${r.pages}pp) meta: ${metaStr}`);
      // metadata can itself leak PII
      scanTextForPii(rel, metaStr, 'pdf-metadata');
      continue;
    }

    if (DOCX_EXT.has(ext)) {
      const r = extractDocx(abs);
      if (r.error) {
        notes.push(`WARN   ${rel}: could not extract (${r.error})`);
        continue;
      }
      scannedCount++;
      scanTextForPii(rel, r.text, 'docx-text');
      const metaStr = Object.entries(r.meta || {}).map(([k, v]) => `${k}=${v}`).join(' ');
      if (VERBOSE) notes.push(`docx   ${rel} meta: ${metaStr}`);
      scanTextForPii(rel, metaStr, 'docx-metadata');
      continue;
    }

    if (IMAGE_EXT.has(ext)) {
      const r = extractImageMetadata(abs);
      if (r.error) {
        notes.push(`WARN   ${rel}: metadata not read (${r.error})`);
        continue;
      }
      scannedCount++;
      const tags = r.tags || {};
      const gps = Object.keys(tags).filter((k) => /GPS/i.test(k));
      const personal = ['Make', 'Model', 'DateTimeOriginal', 'Artist', 'Copyright',
        'ImageDescription', 'UserComment', 'HostComputer', 'Software'];
      const present = personal.filter((k) => tags[k]);
      if (gps.length) {
        addFinding(rel, 'IMAGE_GPS', `GPS metadata present: ${gps.join(', ')}`);
      }
      if (present.length && VERBOSE) {
        notes.push(`image  ${rel} — EXIF fields: ${present.join(', ')}`);
      }
      if (present.length === 0 && gps.length === 0 && VERBOSE) {
        notes.push(`image  ${rel} — clean (no EXIF)`);
      }
      continue;
    }
  }

  console.log(`Files scanned: ${scannedCount}\n`);

  if (VERBOSE) {
    console.log('--- detail ---');
    notes.forEach((n) => console.log('  ' + n));
    console.log('');
  }

  if (findings.length) {
    console.log('FINDINGS');
    console.log('-'.repeat(72));
    // group by file
    const byFile = new Map();
    for (const f of findings) {
      if (!byFile.has(f.file)) byFile.set(f.file, []);
      byFile.get(f.file).push(f);
    }
    for (const [file, list] of byFile) {
      console.log(`\n${file}`);
      for (const f of list) {
        console.log(`  [${f.kind}] ${f.detail}`);
      }
    }
    console.log('\n' + '='.repeat(72));
    console.error(`FAIL: ${findings.length} potential PII finding(s).`);
    console.error('If a finding is a false positive, add a narrow allowlist entry');
    console.error('near the top of scripts/privacy-scan.js rather than disabling the scan.');
    process.exit(1);
  }

  console.log('='.repeat(72));
  console.log('PASS: no unintended personal information or secrets detected.');
}

main();
