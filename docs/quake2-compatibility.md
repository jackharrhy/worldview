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
- Project manifests accept the profile's existing DEF and ENT definition formats and reject
  incompatible formats at the manifest boundary. Definitions flow through the shared catalog and
  entity inspector rather than a Quake II-specific parser or UI path.
- The texture inspector exposes profile-owned contents/surface flags and face values. Multi-face
  edits are atomic and undoable, mixed values are explicit, and named-bit edits preserve unknown
  compiler or mod bits.
- The safe helper protocol accepts Quake II compile and launch capabilities. The local helper
  advertises Quake II only when an external `q2tool` executable is explicitly configured, and the
  editor selects compile/launch profiles only after matching the active game.
- The DOM-free BSP core accepts `IBSP` version 38, validates its 19-lump layout, and produces static
  world and brush-model geometry, entities, Quake II surface classifications, RGB lightmaps, draw
  batches, and bounds through the same renderer contract as BSP29/30. BSP38 artifacts install through
  the editor's revision-safe compiled-preview handoff.
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

The same boundary was smoke-tested against id Software's GPL Quake II game sources at commit
`372afde46e7defc9dd2d719a1732b8ace1fa096e`: all 148 `QUAKED` declarations across 30 source files
parsed with zero diagnostics. Those sources remain an external compatibility oracle and are not
copied into this repository. A small MIT-owned synthetic project fixture keeps the Quake II
definition-loading lifecycle under CI.

The local safe-helper path was smoke-tested with q2tools-220 commit
`07d8d893cb04ba5f39a63d7382e8d9979b3f38da` and the GPL Spirit corpus map `spirit2dm1.map` at the
corpus commit above. A preview request returned HTTP 200, preserved source revision 42, and produced
a 720,216-byte `IBSP` version 38 artifact with non-truncated logs. Missing retail textures were
reported as warnings and no commercial data was supplied. The preview plan deliberately runs BSP
and fast VIS only; final builds add RAD and therefore require the operator's configured game data.

That artifact also passed the DOM-free parser with 27,322 render vertices, 15,906 triangles, 5,708
faces, 87 draw batches, 161 texinfo-derived materials, and three models. A separate MIT-owned sealed
room was compiled with the same real helper and visibly rendered in the editor at revision 0 using
the missing-WAL checkerboard. No GPL map or compiler output is committed.

## Next acceptance slice

Add BSP38 visibility and collision structures without pretending the BSP29/30 layouts apply, then
connect browser-local WAL roots to compiled-preview texture resolution. Compiler choice and
executable paths remain machine-local; portable projects continue to name only logical build
profiles.
