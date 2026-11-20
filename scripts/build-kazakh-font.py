"""The typeface of titles (Unbounded SemiBold) with the Kazakh letters it does not have: Ә Ғ Қ Ң Ө Ұ Ү Һ.

Unbounded has Russian and Latin but no Kazakh Cyrillic, so a Kazakh title showed these letters in another font.
This script makes mobile/assets/fonts/Unbounded-SemiBold.ttf again from the original variable font:

  python3 scripts/build-kazakh-font.py "Unbounded[wght].ttf"      (needs: pip install fonttools)

The original: https://github.com/google/fonts/tree/main/ofl/unbounded (SIL Open Font License 1.1, no reserved name).
How the letters are made, all from the font's own shapes:
  Ә ә Ө ө   the font's Latin Ə ə Ɵ ɵ, which are drawn the same;
  Ү        the Latin Y;      ү   the Latin v on a straight stem;
  Ұ ұ      Ү ү with a bar across the stem;
  Һ һ      the Latin h;
  Қ қ Ң ң  К к Н н with the tail of Ц ц;
  Ғ ғ      Г г with a bar across the stem.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from fontTools.subset import Subsetter, Options
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.boundsPen import BoundsPen

source, target = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'mobile/assets/fonts/Unbounded-SemiBold.ttf'
# What the app's font had before, so nothing else changes.
KEPT = (list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + list(range(0x400, 0x460)) + [0x490, 0x491]
        + [0x2013, 0x2014, 0x2018, 0x2019, 0x201A, 0x201C, 0x201D, 0x201E, 0x2020, 0x2021, 0x2022, 0x2026, 0x20B8, 0x2116])
BORROWED = [0x18F, 0x259, 0x19F, 0x275]

font = instancer.instantiateVariableFont(TTFont(source), {'wght': 600})
options = Options(); options.layout_features = ['*']; options.name_IDs = ['*']; options.notdef_outline = True; options.glyph_names = True
subsetter = Subsetter(options); subsetter.populate(unicodes=KEPT + BORROWED); subsetter.subset(font)

glyphs, cmap, glyf, hmtx = font.getGlyphSet(), font.getBestCmap(), font['glyf'], font['hmtx']
name = lambda ch: cmap[ord(ch)]

def outline(ch):
    pen = DecomposingRecordingPen(glyphs); glyphs[name(ch)].draw(pen); return pen.value
def bounds(ch):
    pen = BoundsPen(glyphs); glyphs[name(ch)].draw(pen); return pen.bounds
def points(ch):
    return [p for op, args in outline(ch) for p in args]
def box(x0, y0, x1, y1):
    # Clockwise, as the outer contours of a TrueType glyph.
    return [('moveTo', ((x0, y0),)), ('lineTo', ((x0, y1),)), ('lineTo', ((x1, y1),)), ('lineTo', ((x1, y0),)), ('closePath', ())]
def add(code, parts, width):
    pen = TTGlyphPen(None)
    for op, args in parts: getattr(pen, op)(*args)
    glyph_name = 'uni%04X' % code
    glyf[glyph_name] = pen.glyph(); hmtx[glyph_name] = (round(width), 0)
    glyf[glyph_name].recalcBounds(glyf); hmtx[glyph_name] = (round(width), glyf[glyph_name].xMin)
    for table in font['cmap'].tables:
        if table.isUnicode(): table.cmap[code] = glyph_name
def alias(code, ch):
    for table in font['cmap'].tables:
        if table.isUnicode(): table.cmap[code] = name(ch)
width = lambda ch: glyphs[name(ch)].width

# The same shapes under the Kazakh codes.
for code, ch in [(0x4D8, 'Ə'), (0x4D9, 'ə'), (0x4E8, 'Ɵ'), (0x4E9, 'ɵ'), (0x4AE, 'Y'), (0x4BA, 'h'), (0x4BB, 'h')]: alias(code, ch)

def tail_of(ch):
    """The tail of Ц or ц: how far it sticks out to the right of the letter's stem, its width, bottom and top."""
    pts = points(ch); x_max = max(x for x, y in pts); y_min = min(y for x, y in pts)
    left = min(x for x, y in pts if abs(y - y_min) < 1); top = max(y for x, y in pts if abs(x - x_max) < 1)
    stem_right = max(x for x, y in pts if x < x_max - 1 and y > top + 1)
    return {'out': x_max - stem_right, 'width': x_max - left, 'bottom': y_min, 'top': top, 'rsb': width(ch) - x_max}

for code, base, model in [(0x49A, 'К', 'Ц'), (0x49B, 'к', 'ц'), (0x4A2, 'Н', 'Ц'), (0x4A3, 'н', 'ц')]:
    tail, (_, _, x_max, _) = tail_of(model), bounds(base)
    right = x_max + tail['out']
    add(code, outline(base) + box(right - tail['width'], tail['bottom'], right, tail['top']), right + tail['rsb'])

# The bar of Ғ, Ұ: as thick as the thin strokes of the font (the bar of the hyphen), across the stem.
_, hyphen_bottom, _, hyphen_top = bounds('-'); bar = hyphen_top - hyphen_bottom
for code, base, height in [(0x492, 'Г', 750), (0x493, 'г', 570)]:
    x0, _, _, _ = bounds(base); stem = min(x for x, y in points(base) if x > x0 + 1) - x0
    reach = stem * .55; middle = height * .46
    add(code, outline(base) + box(x0 - reach, middle - bar / 2, x0 + stem + reach, middle + bar / 2), width(base))
    glyph_name = 'uni%04X' % code; shift = round(reach - x0 + 30)
    if shift > 0:
        # Room for the bar on the left.
        glyf[glyph_name].coordinates.translate((shift, 0)); glyf[glyph_name].recalcBounds(glyf); hmtx[glyph_name] = (round(width(base)) + shift, glyf[glyph_name].xMin)

# ү: the Latin v standing on a straight stem as deep as the tail of у.
x0, _, x1, _ = bounds('v'); centre = (x0 + x1) / 2; stem = bounds('н')[0] and (min(x for x, y in points('н') if x > bounds('н')[0] + 1) - bounds('н')[0])
depth = bounds('у')[1]
small_u = outline('v') + box(centre - stem / 2, depth, centre + stem / 2, 150)
add(0x4AF, small_u, width('v'))
# Ұ ұ: a bar across the stem.
x0, _, x1, _ = bounds('Y'); centre_cap = (x0 + x1) / 2
add(0x4B0, outline('Y') + box(centre_cap - 250, 150, centre_cap + 250, 150 + bar), width('Y'))
add(0x4B1, small_u + box(centre - 215, depth + 45, centre + 215, depth + 45 + bar * .85), width('v'))

font['name'].setName('Version 1.701; Kazakh letters added for AiQonaq (scripts/build-kazakh-font.py)', 5, 3, 1, 0x409)
font.save(target)
print('saved', target, len(font.getBestCmap()), 'characters')
