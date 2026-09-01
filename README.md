# Worldview

Worldview renders static Quake, GoldSrc, and Quake II maps in ordinary web pages.

It supports Quake BSP29 and GoldSrc BSP30 through WebGPU and TypeGPU. Quake II BSP38 static
preview support is available with the limits described below.

[Open the viewer](https://jackharrhy.github.io/worldview/?fixture=goldsrc) or load your own BSP from
the **Load → Local files** control.

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

## Viewer format support

- Quake BSP29 and GoldSrc BSP30 include static world and brush-model geometry, textures,
  lightmaps, visibility, collision, walking and fly navigation, entities, skyboxes, sprites,
  sounds, and map overviews where the source map provides them.
- Quake II BSP38 currently includes static world and brush-model geometry, entities, material
  classification, RGB lightmaps, and fly navigation. The package can decode WAL textures through
  its core API, but `createWorldview()` does not yet resolve WAL roots. BSP38 collision and PVS are
  also pending, so missing materials use the fallback texture and walking is unavailable.

The detailed Quake II implementation evidence and remaining acceptance work live in
[docs/quake2-compatibility.md](docs/quake2-compatibility.md).

### Editor development

The separate browser editor authors Valve 220 `.map` source in synchronized perspective, XY, XZ,
and YZ views:

```sh
npm run dev:editor
```

The canonical roadmap and architecture are in [docs/plan.md](docs/plan.md). The complete delivered
interaction matrix and its test evidence are in
[docs/editor-capabilities.md](docs/editor-capabilities.md).

It can browse local WADs, load read-only `.map` references, and compile the current revision into a
flyable BSP preview. Brush creation, movement, duplication, deletion, entity-property editing, and
face extrusion or splitting use revision-safe previews with undo and redo. From the Select tool,
Shift-dragging a face of an already selected brush resizes it directly in either 3D or 2D; adding
Ctrl/Command splits, Alt moves the face on the active editing plane, and Ctrl/Command+Alt stamps a
new brush. Face selection supports
Shift-toggle, empty-area handle lassos, Ctrl/Command+Shift paint selection in 3D and orthographic
views, all faces on a brush, connected coplanar flood selection, and atomic multi-face material
edits across brushes. In Face mode, Arrow keys move the selected face set by one grid step on the
last pointed viewport axes, including camera-relative perspective movement and Alt+Up/Down for Z.
Escape clears face handles before leaving the tool. A selected source face can project its material and Valve 220 attributes onto
3D targets with Alt-click, rotate the alignment with Alt+Shift, or transfer only the material with
Alt+Ctrl/Command. Dragging paints a chained transfer and double-click affects the whole target
brush; each gesture is one undo step and preserves target contents. The Textures inspector marks
loaded materials used by the map, can sort or filter the catalog by usage, and can select every
visible face or brush using the current material. Its Find/Replace controls follow the current
selection: with no selection they replace across the map, while a face or brush selection limits
the transaction to those faces or brushes. Every changed face is selected afterward and the entire
replacement is one undo step. The inspector also contains a graphical UV editor that draws the
selected polygon over the repeating material. Drag
the face to pan, the ring to rotate, the red or green handles to scale one axis, or the yellow
origin to choose a snapped pivot; Shift enables fine rotation or proportional scaling, and Escape
cancels a live preview. Relative gestures preserve distinct transforms across multi-face sets.
The inspector also
resets face/world alignment, flips U or V, and rotates face sets or whole object selections by 90
degrees. It can align the texture to successive face edges, justify against any face side, fit
integer repeats or 1/n subdivisions from loaded texture dimensions, and auto-fit both axes; Shift
cycles backward. Selecting
adjacent brushes also exposes their coincident face handles: dragging one moves the shared plane for
both brushes, including opposing face normals, in one validated transaction. Ctrl/Command-dragging
a face instead creates two adjacent brushes: outward movement adds a slab, while inward movement
partitions the original volume. Ctrl/Command+Alt-dragging a face's center handle—or adding Shift
to that modifier combination while dragging an already selected brush from Select—stamps an
independent prismatic brush between that face and its translated copy, leaving the source volume
unchanged; the same signed distance is available from the inspector. Alt-dragging moves the
selected face vertices on the active viewport plane for freeform convex shaping, with the same
snapped preview and texture-lock path. The modal
Clip tool supports snapped two- or three-point planes, face-plane matching, keep-front/back
previews, and atomic splitting across every selected brush. Placed clip points can be repositioned
with 2D axis locking or re-snapped directly onto brush surfaces in perspective. Ctrl/Command-click
builds an object selection set whose movement, material edits, duplication, and deletion commit as
one transaction. Ctrl/Command-drag paints unselected brushes into that set, but starting the drag
on a selected brush clones and moves the entire set through one live preview. The tool strip records
committed duplicate, move, rotate, mirror, scale, and shear commands until
the selection changes. **Repeat** or Ctrl/Command+Shift+R replays the whole sequence with fresh IDs
as one undoable transaction for fast staircase and array-like construction. Use **Clear repeat** to
start a new sequence. The status bar opens a live **Issues** drawer that checks map structure,
invalid brushes, point-entity origins, unresolved targets, and TrenchBroom group/layer metadata.
Findings can be filtered or hidden, selected in the viewports, revealed and framed, or repaired with
an individual undoable quick fix. In perspective,
Ctrl/Command-wheel drills the primary selection through occluding brushes and point entities;
double-click expands a brush entity to all of its sibling brushes. Select All (Ctrl/Command+A) and
Invert (Ctrl/Command+Shift+A) respect hidden and locked objects. Selected structural brushes can be
used as temporary selection volumes from the Object inspector: Touching finds convex contact,
Enclosed requires full 3D containment, and Enclosed in 2D uses the last pointed orthographic view.
The temporary brushes are consumed with the resulting selection in one undoable transaction. The Entity tool places preset or
custom point entities against 3D brush surfaces or at the latest selection depth in 2D. Their
wireframe bounds can be selected, painted, moved, duplicate-moved, deleted, nudged, and edited like
other source objects. Heading arrows visualize supported Quake orientation properties; brushes and
point entities can rotate together about X/Y/Z with optional `angles`/`mangle`/`angle` updates, or
mirror across an exact world axis through their snapped selection center. Directed entity-link
arrows resolve `target` and `killtarget` properties against `targetname` on point or brush entities.
The Map inspector can show all links, only the direct or transitive links of the selection, or none;
selected connections are red and other visible connections are green. Selected brushes can be converted to a custom brush entity or returned to
`worldspawn` with Make Structural. The Object inspector also exposes convex merge, intersection, subtraction, and
grid-thickness hollow. These CSG commands preserve matching face attributes, replace every input or
generated convex fragment atomically, and restore document order and selection through undo/redo.
The tool strip can hide a selection, isolate it, reveal everything, lock objects against picking, or
unlock everything. These overview commands are undoable editor state: they leave map source and its
revision unchanged, while locked objects remain visible in blue and hidden or locked brushes are
excluded from CSG subtraction targets.
The **View** menu filters live viewport clutter without adding history or rewriting source. It can
show or hide every entity classname independently, filter all entity definitions at once, hide
world geometry, or toggle detail, trigger, clip, hint/skip, liquid, and sky brushes using their
owner classnames and face materials. Filtered objects are excluded consistently from rendering,
picking, Select All, component tools, and CSG targets; the toolbar badge reports the affected count.
The Map inspector also manages TrenchBroom-compatible layers. Default and custom layers can be
activated, created, renamed, reordered, hidden, isolated, locked, or omitted from compile export;
the selected objects can be moved into a layer or every layer member selected at once. New brushes,
point entities, root groups, and pasted top-level objects enter the active layer unless a group is
open. Removing a custom layer moves its contents to Default and remains undoable. Save/source keeps
all authoring metadata, while compile snapshots exclude omitted layer contents.
Named regular groups combine brushes, brush entities, point entities, and nested groups into one
selectable and transformable object using TrenchBroom-compatible map metadata. Blue bounds show each
group in every viewport. Double-click or Open edits its members while the rest of the map is locked;
double-click empty space, Close, or Escape returns to the aggregate group. The Object inspector can
create, rename, and ungroup containers without deleting their contents. Group structure survives
copy, paste, and duplication with fresh persistent IDs, and new brushes, point entities, or pasted
objects join the currently open group.
The same inspector can create a linked duplicate for reusable structures. Linked copies keep
independent translation, rotation, scale, shear, and mirror transforms while member edits made in
any open copy synchronize through the rest of the set in one undoable transaction. Purple bounds
and directed arrows show the affected siblings. Entity-property shield checkboxes keep selected
values local to one copy, and Unlink turns a copy back into a regular independent group. The map
source uses TrenchBroom-compatible `_tb_linked_group_id`, `_tb_transformation`, and
`_tb_protected_properties` metadata throughout.
Copy emits parseable map text for structural brushes, brush entities, point entities, or mixed
selections. Paste remaps every stable ID and inserts the set in one undo step; Paste here places the
copied bounds on the brush surface under the 3D pointer, or beyond the latest selection in a 2D view.
When faces are selected, Copy instead emits a versioned plain-text snapshot of the primary face's
material, Valve 220 projection, and surface attributes. Paste applies it to the complete target face
set in one undo step while preserving each destination brush's contents. The controls are also
available through Ctrl/Command+C, Ctrl/Command+V, and Ctrl/Command+Shift+V.
The Brush tool also exposes a Simple Shape palette for cuboids, stairs, arches, cylinders, cones,
UV spheroids, and subdivided icospheres. Circular shapes support edge-aligned, vertex-aligned, and
integer-grid scalable profiles; cylinders can be hollow, stairs choose their rise direction, and
compound shapes remain one preview and one undo step. Shift constrains a drag to equal visible
dimensions, Shift+Alt makes a cube in perspective, and Alt adjusts only height after a 3D drag has
started.
The perspective-only Hull tool creates arbitrary convex brushes from points placed on reference
faces: click adds one point, double-click captures a face polygon, drag places a rectangle, and
Shift-drag duplicates a coplanar point polygon along its normal. Enter commits the smallest valid
convex hull as one undoable brush; Escape discards the point set.
The perspective Sweep tool takes one or more selected faces and fills the path to a live destination
cap with validated convex brushes. Its yellow center moves on XY or, with Alt, Z; colored rings
rotate around X/Y/Z; and the green handle scales uniformly. Exact translation, Euler rotation,
scale, segment count, repeated iterations, integer snapping, and Straight, Arc, or S-bend paths are
available in the Object inspector. Enter or Apply Sweep commits every generated brush as one undo
step, while Escape resets the destination and then leaves the tool. Texture lock carries the source
face's material, surface attributes, and Valve 220 alignment through the generated path.
Perspective navigation keeps editing and camera gestures separate: right-drag looks around without
moving the eye, Alt+right-drag orbits the point under the pointer, middle-drag pans, and the wheel
moves along the viewing direction. W/S/A/D fly forward, back, left, and right while Q/X move
vertically; wheel input during a right drag changes fly speed, and Shift+wheel changes field of
view. **Focus** or Home frames the current object or component selection in every pane. In 2D,
right- or middle-drag pans and wheel zoom keeps the world coordinate under the pointer fixed.
A stationary right-click opens a TrenchBroom-style map-view menu without stealing right-drag camera
look. It exposes the exact brush face under the cursor for face, whole-brush-face, and connected
coplanar selection; reveals its material; selects the pointed object; and applies focus, hide,
isolate, grouping, active-layer, brush-entity, and structural actions to the current selection.
The pointed face can copy its attributes or receive the current face clipboard directly.
Point entities are created directly at a bounds-aware surface position, while Paste Here reuses the
same snapped pointer context.
The active construction grid updates immediately in every pane and is projected across visible
brush faces in perspective, including stretched world-aligned lines on sloped geometry. Object
drags draw an origin-to-destination trace, while Vertex and Edge moves draw one yellow positioning
guide per selected handle; Shift-restricted traces become heavier.
Rotate, Scale, and Shear support snapped direct viewport gestures plus exact
controls around one combined selection pivot; perspective rotation rings choose X, Y, or Z, and
the yellow rotate center moves directly in every viewport with live coordinates, an XY/Z mode,
dominant-axis locking, and a movement trace. Each transform previews every selected object before one
undoable commit and can preserve Valve 220 texture alignment. Scale handles constrain sides,
edges, and corners to one, two, or three axes, anchor to the opposite handle by default, and accept
Alt center anchoring or Shift proportional scaling. Vertex and Edge tools add click or
rectangle-lasso multi-handle shaping directly in
perspective or orthographic views. Ctrl/Command builds handle sets and toggles absolute vertex
snapping; perspective movement stays on XY unless Alt switches to vertical Z, and Shift locks the
dominant axis. With a vertex set active, Shift+Alt-clicking another vertex immediately snaps the
nearest selected vertex onto it and translates the rest of the set by the same delta. Arrow keys
nudge selected vertex or edge handles by one grid step on the last active viewport axes; in
perspective they follow the camera, while Alt+Up/Down uses Z. Component deletion remains hull-safe.
Escape first clears the active vertex or edge handles, then leaves the component tool; a further
Escape clears the retained brush selection.
Their handles span every selected brush, and coincident vertices or
identical edges reshape all owner brushes in one atomic edit. A selected handle set also carries
into Rotate, Scale, and Shear, where direct gestures and exact controls transform the components
around their own bounds and rebuild every owner brush atomically. Holding Shift over a selected
brush surface exposes a green snapped handle that can be dragged outward to insert a new vertex.
Every preview, insertion, deletion, or component transform rebuilds a validated convex hull so
corner edits can safely split, fuse, or remove derived geometry. Native compilation requires
separately installed ericw-tools executables; see
[apps/compiler-service/README.md](apps/compiler-service/README.md) for the loopback service setup.

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

GPU-independent scheduling and external-store primitives use a separate entrypoint, so tools can
share them without loading the BSP renderer:

```ts
import { AnimationFrameScheduler, SnapshotStore } from '@jackharrhy/worldview/runtime';
```

Caller-supplied `wads` and `palette` sources begin loading alongside the BSP. `resolveWad` remains
parse-dependent because its references come from the BSP entity data. Progress events keep
`loaded` and `total` scoped to the current transfer and provide stable concurrent item counts when
`phaseProgress` is present:

```ts
viewer.addEventListener('progress', ({ detail }) => {
  if (detail.phase === 'wad' && detail.phaseProgress) {
    const { completed, total } = detail.phaseProgress;
    console.log(`${completed}/${total} WAD files complete`);
  }
});
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

// Or fetch, parse, fingerprint-check, and apply an existing sidecar in one operation.
await viewer.loadWalkability('/maps/c1a0.worldview-walkability.json', { signal });
```

The development viewer can generate and inspect the graph from **Map → Walkability**. Downloaded
JSON can be loaded in later sessions. `loadWalkability()` accepts the same URL, `Blob`,
`ArrayBuffer`, and typed-array sources as map assets, emits `walkability` progress, rejects a graph
from a different BSP, and is cancelled by a newer walkability operation or map load. For local
fixtures, place `<map>.worldview-walkability.json` beside `<map>.bsp` and the viewer loads it
automatically.

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
