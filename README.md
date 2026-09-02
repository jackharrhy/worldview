# Worldview

Worldview is a browser map editor and an embeddable WebGPU viewer for Quake-family maps.

The editor works with Quake, GoldSrc, and Quake II `.map` projects. The viewer renders Quake
BSP29, sanitized BSP2, GoldSrc BSP30, and Quake II IBSP/QBSP version 38 with TypeGPU.

[Try the viewer](https://jackharrhy.github.io/worldview/?fixture=goldsrc), or read the
[viewer API guide](docs/viewer-api.md) to embed it in another site.

## Editor

The editor has synchronized perspective and orthographic views, source-safe saving, brush and
entity tools, materials, native compile previews, and optional multiplayer for hosted maps. The
[editor capability reference](docs/editor-capabilities.md) records the current behavior.

The local compiler helper is separate. Its setup and safety model are documented in the
[compiler service README](apps/compiler-service/README.md).

## Viewer

The npm package can render a map in a canvas or register the `<world-view>` custom element. It also
supports map overviews, persisted walkability graphs, game-root asset resolution, and typed load
events. See the [viewer API guide](docs/viewer-api.md) for installation and examples.

The exact Quake II boundary and test corpus are recorded in the
[Quake II compatibility notes](docs/quake2-compatibility.md).

Local BSPs and game assets belong under `apps/viewer/public/local`, which Git ignores. The
[development viewer README](apps/viewer/README.md) describes the fixture layout.

## Development

Worldview requires Node.js 24 or newer and npm 11.

```sh
npm install
npm run dev:editor # editor
npm run dev        # viewer
npm run check
```

The main project documents have distinct jobs:

- [Product and architecture plan](docs/plan.md)
- [Backlog](docs/cleanup-plan.md)
- [Editor capability reference](docs/editor-capabilities.md)
- [Viewer API guide](docs/viewer-api.md)
- [Complete documentation index](docs/README.md)

Worldview does not include game data. You must provide the BSPs, WADs, palettes, textures,
skyboxes, sprites, and sounds you use, and you must have permission to use them.

Worldview is licensed under the [MIT license](LICENSE). Adapted code and research sources are
listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
