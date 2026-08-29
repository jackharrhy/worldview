# Quake II compatibility

This document records evidence and remaining work for the Quake II expansion described in
[`plan.md`](./plan.md). Quake II support is not complete merely because its source maps parse.

## Delivered source boundary

- `quake2` is a distinct game profile using classic face syntax, WAL material identity, and DEF or
  ENT definitions. It reuses the `quake-map` document codec because the source grammar does not
  justify a nominal container format.
- Face `contents flags value` integers remain lossless semantic data. The profile supplies names for
  the standard Quake II bits while unknown bits remain numeric and survive editing for compiler and
  mod compatibility.
- Project manifests accept ordered loose-material roots independently from WAD archives.
- The texture inspector exposes profile-owned contents/surface flags and face values. Multi-face
  edits are atomic and undoable, mixed values are explicit, and named-bit edits preserve unknown
  compiler or mod bits.
- Synthetic MIT-owned tests cover exact no-op save, normalized serialize/reparse, named flag
  decoding, unknown-bit retention, and Quake II project-manifest round trips.

## Local corpus evidence

The ignored local smoke corpus is
[`dfsp-spirit/spirit-quake-maps-gpl`](https://github.com/dfsp-spirit/spirit-quake-maps-gpl/tree/2884ac21efb8ef9772373a749ac513f9b2e676d0),
pinned at `2884ac2`. Its map sources are GPL-2.0 and are compatibility inputs only; they are not
copied into this MIT repository or package.

| Observation                         | Result                                        |
| ----------------------------------- | --------------------------------------------- |
| Quake II maps                       | 9                                             |
| Brushes                             | 14,662                                        |
| Faces                               | 89,565                                        |
| Faces with surface attribute values | 66,749                                        |
| Material names                      | 286                                           |
| Exact no-op saves                   | 9/9                                           |
| Normalized serialize/reparse        | 9/9                                           |
| Parser/save failures                | 0                                             |
| Strictly invalid derived brushes    | 7 retained and diagnosed, not silently healed |

All nine files use classic axial syntax. The corpus includes standard and compiler-extension flag
bits, mixed liquid/clip/detail contents, nonzero light values, comments, and large authored maps.
The raw numeric values are the authority when a profile catalog does not recognize an extension.

The standard names and numeric compatibility were checked against id Software's GPL Quake II
`q_shared.h`. That source is a behavior oracle only; no GPL implementation is adapted here.

## Next acceptance slice

1. Parse and validate WAL headers, dimensions, mip offsets, animation links, and surface metadata in
   a DOM-free core module with synthetic fixtures.
2. Resolve loose WAL files through ordered project material roots and browser-local directory
   handles without bundling retail data.
3. Feed decoded WAL pixels and dimensions through the existing source-material resource boundary.
4. Add malformed/truncated WAL diagnostics, duplicate-name precedence tests, and a real-browser
   material-loading scenario.
5. Load Quake II entity definitions and add a configured compiler-capability boundary before
   claiming daily authoring support.

BSP38 parsing/rendering and configured Quake II compilation remain separate later slices.
