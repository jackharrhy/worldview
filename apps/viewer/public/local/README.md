# Local fixtures

Put uncommitted game and mod directories here. The development viewer discovers their BSPs when
Vite starts and reloads when a map or sidecar changes. See the [viewer README](../../README.md) for
the directory layout and optional `.worldview.json` sidecar format.

Do not commit BSPs, WADs, palettes, textures, sprites, models, or sounds from commercial games.

## Steam compatibility corpus

SteamCMD can download owned games and extract their loose, PK3/ZIP, and Quake PACK BSPs into this
ignored directory:

```sh
npm run corpus:steam -- research
```

The `research` preset downloads Thirty Flights of Loving (which includes Gravity Bone) and
FLESHCANCER. `supported` adds Quake, Quake II, the relevant GoldSrc games, Sven Co-op, and the
already-installed AVIAOZIN3 when available. `all` also attempts WRATH: Aeon of Ruin. An unowned app
is reported and skipped. SteamCMD asks interactively for the password and Steam Guard code; the
script never accepts either secret in an argument or environment variable.

The script prompts for the Steam login name. The public profile name and login name are not
necessarily identical; set the account explicitly to skip that prompt:

```sh
STEAM_ACCOUNT=my_login_name npm run corpus:steam -- supported
```

Pass one or more `APP_ID[:linux|windows|macos]` values instead of a preset for a focused download.
Set `WORLDVIEW_STEAM_EXTRACT_ONLY=1` to rescan existing installs without contacting Steam. After
extraction, the script builds the public package, parses every discovered BSP, and writes a
`compatibility-report.json`; set `WORLDVIEW_STEAM_SKIP_CHECK=1` only when extraction is the sole
goal.
