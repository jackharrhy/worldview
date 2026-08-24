# Worldview

Worldview renders static Quake and GoldSrc maps in ordinary web pages.

It supports Quake BSP29 and GoldSrc BSP30 through WebGPU and TypeGPU.

## Development

Requirements: Node.js 24 or newer and npm 11.

```sh
npm install
npm run dev
```

```sh
npm run check
```

Maintainers can find the local npm release process in [docs/releasing.md](docs/releasing.md).

## JavaScript

```ts
import { createWorldview } from '@jackharrhy/worldview';

const viewer = await createWorldview({
  canvas: document.querySelector('canvas')!,
  source: {
    gameBaseUrl: '/games/valve/',
    bsp: 'maps/c1a0.bsp',
  },
});

// Clicking the canvas enables audio. A separate sound button can call enableAudio() from its click.
// Walking is the default. Press V to switch in and out of noclip.

viewer.setMovement({ mouseSensitivity: 3, mouseAcceleration: 0.04 });
viewer.setPlayerAudioVolume(1.25);

// Start a map-authored ambient_music track.
await viewer.playMusic();
viewer.setMusicVolume(0.7);
```

## Map overviews

The viewer can render a deterministic top-down overview without moving the live camera:

```ts
const { image, layout } = await viewer.captureOverview({
  width: 1024,
  height: 1024,
  rotation: 'auto',
  lighting: 'lightmapped',
  background: 'transparent',
});

const url = URL.createObjectURL(image);
document.querySelector<HTMLImageElement>('.map-icon')!.src = url;
console.log(layout.zMin, layout.zMax, layout.worldUnitsPerPixel);
```

Overview captures use an orthographic camera, draw the whole map without PVS culling, and accept
`zMin` and `zMax` when ceilings or overlapping floors need to be removed. PNG and WebP output,
fullbright rendering, fixed rotation, sky, and sprite inclusion can also be selected. The development
viewer exposes the common settings under **Map → Overview**.

If the viewer has a walkability graph, overview capture automatically removes ceilings near sampled
player space. This uses local floor and ceiling heights instead of one cutoff for the entire map.
Pass `cutaway: 'none'` to keep the original global height slice, or `cutaway: 'walkability'` when a
missing graph should be treated as an error.

## Walkability

Worldview can sample a map's standing-player collision hull and build a directed graph of places a
player can walk, jump to, or drop from:

```ts
import {
  generateWalkability,
  parseWalkability,
  serializeWalkability,
} from '@jackharrhy/worldview/walkability';

const graph = await generateWalkability(viewer.world!, {
  spacing: 32,
  allowJump: true,
});

viewer.setWalkability(graph);
viewer.setWalkabilityVisible(true);

const saved = serializeWalkability(graph);
viewer.setWalkability(parseWalkability(saved));
```

The development viewer can generate and inspect the graph from **Map → Walkability**. Downloaded
JSON is compatible with future sessions. For local fixtures, place
`<map>.worldview-walkability.json` beside `<map>.bsp` and the viewer loads it automatically.

This is a collision-testing graph, not a gameplay navigation mesh. It retains one-way connections,
blocked probes, connected components, and local ceiling heights. Overview capture uses those
heights automatically once the graph is loaded.

## Web component

Register `<world-view>` when you are using the npm package:

```ts
import { defineWorldViewElement } from '@jackharrhy/worldview/element';

defineWorldViewElement();
```

```html
<world-view game-base-url="/games/valve/" src="maps/c1a0.bsp"></world-view>
```

The standalone browser module registers the element for pages without a build step:

```html
<script type="module" src="/vendor/worldview/standalone.js"></script>
<world-view game-base-url="/games/id1/" src="maps/start.bsp"></world-view>
```

`gameBaseUrl` and `game-base-url` point to a Quake or GoldSrc game/mod directory. Worldview resolves
relative BSP paths, WAD basenames, `gfx/palette.lmp`, `gfx/env` skyboxes, sprite paths, and the
`sound` directory from that root. The individual base URL options still work when assets live in a
different layout.

Movement can be tuned at runtime with `viewer.setMovement()`. The available values include maximum
speed, ground and air acceleration, friction, stop speed, mouse sensitivity, mouse acceleration,
and view bob. Stock GoldSrc movement values remain the default; maps with Counter-Strike entities
use a 250-unit player cap.

Worldview does not ship game data. You need to provide any BSP, WAD, palette, skybox, sprite, and
sound files your map uses, and you need permission to use them.
