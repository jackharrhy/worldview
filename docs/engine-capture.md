# Native engine screenshots

The repo can capture QSS-M and Xash3D FWGS frames without a desktop session. Docker runs Xvfb,
Mesa software OpenGL and the real game engine. The driver positions the camera, reads its pose
back before and after the screenshot, and fails if it moved or never reached the requested pose.

## Build and run

Use Node 24 and Docker with Linux amd64 containers and 32-bit x86 executable support. This has
been verified on the project's Linux x86-64 host. ARM emulation has not been verified.

```sh
npm run engines:build

npm run engines:capture -- \
  --engine qssm --bsp /path/to/map.bsp \
  --game-root /path/to/Quake \
  --position 128.03125,-199.96875,72.03125 --angles 0,90,0

npm run engines:capture -- \
  --engine xash --bsp /path/to/map.bsp \
  --game-root /path/to/Half-Life \
  --position 128.03125,-199.96875,72.03125 --angles 0,90,0
```

`--game-root` defaults to the local Steam corpus: `steam-installs/2310` for Quake and
`steam-installs/10` for CS, under `apps/viewer/public/local`. Quake needs `id1/pak0.pak`;
uppercase Steam PAK filenames are supported. CS needs `cstrike`, `valve`, the Linux
`cstrike/dlls/cs.so` server library, and its Steam runtime libraries. Required external WADs,
models and skyboxes must be present in the supplied game installation.

`--position` is the **eye position in map coordinates**. `--angles` is pitch, yaw, roll in degrees;
positive pitch looks down, yaw 0 faces +X and yaw 90 faces +Y. Pitch is limited to ±89°, roll to 0.
The default frame is 800×600 with the engine's native FOV setting at 90. `--width`, `--height`
and `--fov` override these; Quake supports FOV settings 90–120. CS captures require FOV 90 because
the original server overrides the client's `default_fov` setting. At 4:3, FOV 90 is horizontal;
match each engine's aspect-ratio handling when comparing other frame shapes with Worldview.

A known CS 1.6 `de_dust` view near the CT spawn is:

```sh
npm run engines:capture -- --engine xash \
  --bsp apps/viewer/public/local/steam-installs/10/cstrike/maps/de_dust.bsp \
  --position=-511.96875,-1727.96875,130.03125 --angles 10,31,0
```

## Evidence and camera control

Each run creates a new directory under `artifacts/verification/engines`, or the path passed to
`--output`. Existing output directories are rejected. It contains:

- `capture.png`: the engine's own PNG screenshot, with the HUD and weapon hidden.
- `request.json` and `report.json`: requested/observed cameras, BSP SHA-256, engine/client
  revisions, Docker image ID, settings, command line and screenshot hash.
- `engine.log` and `xvfb.log`: initialization, graphics backend, native settings and camera output.
- `runtime/`: generated configs, the staged BSP and any camera entity override.

The input BSP and game installation are mounted read-only. Each engine gets its own writable
scratch game directory, no network access and no shared display. The input BSP is staged as
`capture.bsp` without changing its bytes. A neighboring Quake `.lit` is also staged and hashed.
Other map sidecars are not automatically loaded. Local startup/server configs are replaced by
capture configs in the scratch directory. `--timeout` bounds runtime; failures retain their logs
and return a nonzero exit code. Completed, failed and interrupted runs remove their containers.

QSS-M uses `setpos` for the body, then its `edict` commands to set angles and `fixangle` because
the 1.6.5 release does not apply `setpos` angle arguments correctly. Pose verification uses
`edict 1 origin` and `edict 1 v_angle`, which retain more precision than `viewpos`. Standing eye
height is 22 units, with an additional 1/32-unit offset on each axis; bob, roll and idle motion
are disabled.

Xash uses a scratch `.ent` override to supply CT/T spawn points, preserving other entities. After
joining the CT team, its built-in `ent_fire` commands put the player in noclip and set origin,
angles, velocity and `fixangle`. This avoids CS snapping the initial spawn down to a nearby floor.
The CS client adds a 17-unit standing eye height and a 1/32-unit offset. Native `viewpos` verifies
the actual rendered eye and angles. The driver allows 0.15 map units and 0.05° for printed/network
rounding, then waits for startup messages to clear before capturing.

## Engine versions and comparison limits

The Dockerfile builds Xash3D FWGS at `1de8289f2980aa34c70760ae0ebfb2e00ddb0f9e` and CS16Client
at `57607ab038be0fc49b67c7a4a741ef8a44031577`, including their pinned submodules. QSS-M is the
official Linux 1.6.5 release, checked against its archive SHA-256. Engine sources and binaries
stay in the local Docker image; no GPL engine code or commercial game data belongs in this repo.
See [source provenance](../THIRD_PARTY_NOTICES.md#engine-lighting-compatibility-research).

Xash uses the supplied original CS server library and game assets with **CS16Client**, the client
recommended by Xash for CS. The Steam client uses unsupported VGUI2 behavior and crashed during
initialization on this host. This setup verifies Xash plus CS16Client; it does not establish
pixel parity with Valve's original GoldSrc engine or client.

QSS-M captures use neutral gamma/contrast 1 with overbrights and palette fullbrights enabled.
Xash captures retain its native defaults; the log queries gamma, brightness, texture/light gamma
and overbright settings. Observed defaults on the pinned build are gamma 2.5, brightness 0,
texgamma 2, lightgamma 2.5, gl_overbright 1 and gl_vbo_overbrightmode 0. The images can consequently
differ even for the same BSP29 map. See [rendering compatibility](./rendering-compatibility.md)
for the Worldview policies and comparisons.

Actual captures have been checked on the retained hosted test BSP in both engines, and on the
installed BSP30 `de_dust` in Xash, including nonzero pitch/yaw. Map animation and simulation time
are not frozen, and base-image/system-library updates can change rendering; retain the recorded
Docker image for comparisons. These local engine checks are optional and require owned game
data. `npm run test:engine-capture` checks parsing and camera validation without Docker or assets.
