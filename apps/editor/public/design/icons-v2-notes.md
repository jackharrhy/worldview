# Worldview icons V2

Canonical working sheet: `worldview-icons-v2.svg`, linked from `/design`.

Open the SVG in Inkscape, Illustrator, Figma, or another vector editor. Each semantic icon has a
named `icon-*` group containing its editable geometry and label. The background/heading is a
separate group; hide it for transparent artwork. There are no embedded bitmaps, external fonts for
glyphs, or `<use>` references. Labels are ordinary text and may use your editor's fallback font.

Geometry conventions: 24 × 24 logical units; 1.5-unit structural strokes; round caps and joins;
1.5-unit vertex handles. Neutral structure, amber editable geometry, red selection, blue rotation,
green construction operations. Utility icons retain Phosphor Regular's path geometry at the same
24-unit scale. The sheet displays icons at 2× size.

Keep semantic group IDs when editing. Save a copy before replacing this working sheet. SVG edits
are artwork proposals: they do not automatically change the application. Approved geometry edits
must also update `apps/editor/src/components/ui/geometry-icon.tsx`; utility replacements must update
the icon renderer/registry. Verify each at 16, 22, and 24 CSS pixels in both themes on `/design`.

The initial V2 sheet was exported from all 84 live icon names using
`node scripts/export-editor-icons.mjs`. The exporter refuses to overwrite an existing sheet unless
`--replace` is explicitly supplied; preserve external edits before regenerating.

Original Worldview geometry: MIT. Phosphor Icons 2.1.2: MIT, copyright Phosphor Icons.
The full Phosphor license is embedded in the SVG metadata and recorded in THIRD_PARTY_NOTICES.md.
