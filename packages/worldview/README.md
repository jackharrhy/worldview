# @jackharrhy/worldview

Worldview is an embeddable WebGPU renderer for Quake BSP29 and GoldSrc BSP30 maps, with static
Quake II BSP38 previews.

Documentation, examples, the custom-element setup, and development notes live in the
[Worldview monorepo](https://github.com/jackharrhy/worldview#readme).

Version 0.4 makes `<world-view>` the canonical embeddable lifecycle owner with atomic `WorldSource`
assignment, non-blocking persisted walkability, public visibility state, and mirrored typed events.
It also separates GPU-independent stores and scheduling under the `/runtime` entrypoint. Version 0.3
added concurrent caller-supplied WAD/palette loading and persisted walkability through the viewer.
Version 0.2 added BSP38 static geometry and RGB lightmaps, WAL decoding primitives, GoldSrc
scrolling textures, stricter walkability serialization, and visibility-aware frame scheduling.
Packaged BSP38 previews do not yet resolve WAL roots or provide collision and PVS; see the
[format support notes](https://github.com/jackharrhy/worldview#viewer-format-support) before using
Quake II maps.

```sh
npm install @jackharrhy/worldview
```

Worldview is released under the [MIT license](./LICENSE). It does not include game assets.
[Third-party notices and source provenance](https://github.com/jackharrhy/worldview/blob/main/THIRD_PARTY_NOTICES.md)
are maintained in the monorepo.
