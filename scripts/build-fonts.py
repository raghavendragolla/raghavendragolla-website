"""Build the character-subset web fonts served by the site.

The site self-hosts Fraunces, IBM Plex Sans and IBM Plex Mono as WOFF2. The upstream "latin" files cover
all of Latin-1 plus extra punctuation, but the site's content uses only printable ASCII, a handful of
Latin-1 symbols and typographic punctuation. Subsetting the five files that every page downloads to that
character set cuts about 58 KiB (~27%) from the critical path.

What changes and what does not:
  * Glyph outlines, hinting, variation axes and all OpenType features (kerning, ligatures) are kept,
    so rendered text is pixel-identical to the upstream files.
  * Characters outside CODEPOINTS (for example accented letters) are no longer in these files and would
    fall back to the next font in the stack. tests/fonts.spec.js reads each file's real cmap and fails if
    the site's text needs a character the subset lacks.
  * CODEPOINTS may list characters an upstream file never had (e.g. arrows, Greek mu/sigma); those were
    rendered by fallback fonts before and still are. Each output file therefore gets its own
    unicode-range, computed from the glyphs it actually contains.

Requirements (development only): Python 3 with `fonttools` and `brotli` (pip install fonttools brotli).

Usage:
    python scripts/build-fonts.py <source_dir> <output_dir>

<source_dir> holds the upstream files (SOURCES keys + ".woff2"). They were the files in assets/fonts/
before this subset was introduced and can be recovered from Git history, e.g.
    git show bf2361f:assets/fonts/<name>.woff2 > <source_dir>/<name>.woff2
For each output file the script prints the CSS unicode-range of the characters it really contains;
use that value for the matching @font-face rules in assets/css/shared/fonts.css.
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

# Printable ASCII, NBSP, Latin-1 symbols (no letters), typographic punctuation, and the arrow/math
# characters that appear in the content. Only those present in each upstream file end up in the subset.
CODEPOINTS = sorted(set(
    list(range(0x20, 0x7F))
    + [0xA0, 0xA9, 0xAB, 0xAE, 0xB0, 0xB2, 0xB3, 0xB7, 0xB9, 0xBB, 0xD7, 0xF7]
    + [0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E,
       0x2020, 0x2021, 0x2022, 0x2026, 0x2030, 0x2032, 0x2033, 0x2039, 0x203A, 0x2044,
       0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2197, 0x2212, 0x2248, 0x2260,
       0x2264, 0x2265, 0x03BC, 0x03C3]
))

# upstream "latin" file stem -> subset file stem
SOURCES = {
    "fraunces-yevdiide9ea92uemak-wbq8u-9v0c2wa0kxc9tea": "fraunces-latin-subset",
    "fraunces-italic-jucmhvn85ni7emae9lkqztnbb-gztk0k1chjeveq": "fraunces-italic-latin-subset",
    "ibmplexsans-lmyyaje8bplhncwdkr932-g7dytd-dmu1syxekyy": "ibmplexsans-latin-subset",
    "ibmplexmono--f63fjptagt5vm-kvkqdyu8n1i8q1w": "ibmplexmono-400-latin-subset",
    "ibmplexmono--f6qfjptagt5vm-kvkqdyu8n3twjwlbfgg": "ibmplexmono-500-latin-subset",
}


def unicode_range(cps):
    """Collapse sorted codepoints into a CSS unicode-range value."""
    parts, start, prev = [], cps[0], cps[0]
    for cp in cps[1:] + [None]:
        if cp is not None and cp == prev + 1:
            prev = cp
            continue
        parts.append(f"U+{start:04X}" if start == prev else f"U+{start:04X}-{prev:04X}")
        if cp is not None:
            start = prev = cp
    return ", ".join(parts)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    src_dir, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    for src_stem, out_stem in SOURCES.items():
        src = os.path.join(src_dir, src_stem + ".woff2")
        font = TTFont(src)
        opts = subset.Options()
        opts.flavor = "woff2"
        opts.layout_features = ["*"]   # keep kerning, ligatures and every OpenType feature
        opts.name_IDs = ["*"]
        opts.name_languages = ["*"]
        opts.notdef_outline = True
        opts.hinting = True
        subsetter = subset.Subsetter(opts)
        available = set(font.getBestCmap())
        subsetter.populate(unicodes=[cp for cp in CODEPOINTS if cp in available])
        subsetter.subset(font)
        dst = os.path.join(out_dir, out_stem + ".woff2")
        font.flavor = "woff2"
        font.save(dst)
        print(f"{out_stem:<32} {os.path.getsize(src) / 1024:6.1f} KiB -> {os.path.getsize(dst) / 1024:6.1f} KiB")
        print(f"  unicode-range: {unicode_range(sorted(TTFont(dst).getBestCmap()))}")


if __name__ == "__main__":
    main()
