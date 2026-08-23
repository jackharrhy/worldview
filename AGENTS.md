# Worldview

`docs/plan.md` is the canonical product and architecture document. Keep it aligned with
intentional changes to scope, public API, data flow, and delivery status.

Project invariants:

- `packages/worldview/src/core` remains free of DOM, WebGPU, and TypeGPU imports.
- `apps/viewer` consumes public package entrypoints and may not import package internals.
- Adapted noclip.website code keeps source provenance in `THIRD_PARTY_NOTICES.md` and in
  focused source comments.
- New implementation sources must be license-compatible with this MIT package and recorded before
  merge. GPL engine releases may inform compatibility research, but their code does not belong in
  the package.
- Root documentation and `THIRD_PARTY_NOTICES.md` are canonical. Package copies should link to
  them instead of duplicating them; the package keeps its own `LICENSE`.
- Never commit commercial or shareware BSP, WAD, PAK, palette, sprite, or sound data. Local test
  data belongs in `apps/viewer/public/local`, which is ignored.
- V0.1 supports Quake BSP29 and GoldSrc BSP30 static map exhibits with a bounded, static-world
- Use npm workspaces and the committed `package-lock.json`.
