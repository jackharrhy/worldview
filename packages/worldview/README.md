# @jackharrhy/worldview

Worldview is an embeddable WebGPU renderer for Quake BSP29 and GoldSrc BSP30 maps, with static
Quake II BSP38 previews.

Documentation, examples, the custom-element setup, and development notes live in the
[Worldview monorepo](https://github.com/jackharrhy/worldview#readme).

Version 0.3 starts caller-supplied WAD and palette requests concurrently with the BSP, exposes
aggregate WAD progress, and can load and validate persisted walkability through the viewer. Version
0.2 added BSP38 static geometry and RGB lightmaps, WAL decoding primitives, GoldSrc scrolling
textures, stricter walkability serialization, and visibility-aware frame scheduling.
Packaged BSP38 previews do not yet resolve WAL roots or provide collision and PVS; see the
[format support notes](https://github.com/jackharrhy/worldview#viewer-format-support) before using
Quake II maps.

```sh
npm install @jackharrhy/worldview
```

Worldview is released under the [MIT license](./LICENSE). It does not include game assets.
[Third-party notices and source provenance](https://github.com/jackharrhy/worldview/blob/main/THIRD_PARTY_NOTICES.md)
are maintained in the monorepo.
