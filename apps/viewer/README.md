# Development viewer

The viewer builds its fixture menu from two sources: generated test scenes in `src/fixture-catalog.ts`
and BSPs found beneath `public/local`. Local game data is ignored by Git and never enters the npm
package.

Put each game or mod in its own directory. The directory is its asset root, so WADs belong at the
root while maps, sounds, sprites, palettes, and skyboxes keep their normal game paths.

```text
public/local/my_mod/
  maps/example.bsp
  sound/
  sprites/
  gfx/env/
  example.wad
```

The Vite plugin finds every BSP recursively. A directory containing one BSP uses the directory name
as its fixture ID. If it contains several maps, each fixture ID also includes the BSP path.

An optional sidecar beside a BSP can provide a label, URL aliases, or a useful camera. For
`maps/example.bsp`, name it `maps/example.worldview.json`:

```json
{
  "label": "Example map",
  "aliases": ["example"],
  "camera": {
    "position": [128, -64, 72],
    "yawDegrees": 90,
    "pitchDegrees": 0,
    "fieldOfView": 75
  }
}
```

Adding, removing, or changing a BSP or sidecar reloads the development page. The entity support
panel summarizes which map entities Worldview handles, partially represents, receives through baked
BSP data, or skips.

The **Walkability** panel can generate and download a collision graph. Save the result beside the
BSP as `maps/example.worldview-walkability.json`; local fixture discovery loads it on later visits.
The **Overview** panel uses a loaded graph for its automatic ceiling cutaway. Disable **Auto
cutaway** when you need the original global lower- and upper-height slice.
