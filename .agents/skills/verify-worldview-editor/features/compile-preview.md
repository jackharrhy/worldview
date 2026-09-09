# Compile and preview

## Sub-features

Logical build profiles, compiler binding, diagnostics/logs, BSP/portal/leak artifacts, build
history, and compiled BSP preview. Compile and launch capabilities are game-matched before binding.
Hosted maps use the same build contract while the service compiles its canonical MapCell snapshot;
the browser polls the authenticated build record and downloads membership-checked artifacts.
Each newly installed preview starts in fly mode at the perspective camera position, orientation, and
field of view captured when the user requested the build. The compiled viewer receives that camera
before its first frame; later source-camera movement must not change the requested preview view.
Quake II uses an explicitly configured q2tools-220 capability. Successful BSP38 artifacts install
as compiled previews and reuse the project's ordered game-root assets for PCX palettes, WALs,
replacement images, and skyboxes; genuinely missing materials use the visible fallback.

## How to get to it (user POV)

Open a configured project, choose a profile and quality, compile the current revision, inspect
artifacts, and switch to the compiled preview.
Choose the top-right Build menu → Build results → Download BSP to save the selected build's compiled map. Build history can
select older artifacts; the download button is disabled when the selected build has no BSP.

## Driving it with Playwright

Start the real configured loopback service in isolated scratch state, drive accessible build
controls, and capture request/result logs, visible status, artifact state, and rendered preview.
Capture `worldview_inspect_editor.camera.perspective`, request a build, and verify the installed
preview reports the same position, yaw, pitch, and field of view in
`worldview_inspect_editor.build.compiledCamera`, plus `compiledMovementMode: "fly"`. Hold the
compiler response while moving the source camera when testing the click-time snapshot rule.
Check browser page errors after the preview renders and after switching back to source: the hidden
source viewport must skip GPU frames with zero layout extent, then resume rendering when shown.
Assert visible rendered pixels, including fallback geometry when the compiler emits missing MIPTEX
entries. A visible canvas and successful build status alone do not prove that the map renders.
`tests/browser/viewer-lighting.spec.ts` verifies dark sampleless faces, wholly unlit BSPs, and
smooth lighting with nearest-filtered textures through the shared public viewer. For lighting
reports, inspect the actual retained BSP and compiler logs and capture it before and after changes;
do not replace authored shadows with ambient light just to make the preview brighter.
Capture Playwright's download event and compare the saved BSP bytes and filename with the selected
compiler artifact.
`editor-build-export.spec.ts` additionally checks automatic BSP output, ZIP source/WAD contents,
remembered quality, and export-after-build writes through a real browser filesystem directory handle.
The native-compiler case downloads the real compiled BSP through Build & export and checks exact bytes.
Export settings select downloads or a remembered directory; out-of-date builds cannot use automatic
export. Missing dependencies produce an explicit message, while raw BSP downloads stay available.
For a hosted map, additionally prove the submitted revision equals the canonical map version and
that anonymous artifact retrieval is rejected.
For Quake II, prove the helper advertises `game: quake2`, preserves the requested document revision,
returns an `IBSP` version 38 artifact, and installs that artifact through the same revision-safe
preview boundary as BSP29/30. The editor must report the matching compiled revision and show visible
rendered geometry on the compiled canvas without a viewport error.

## Gotchas

WebMCP intentionally cannot compile, launch software, save files, or accept commands. Do not mock a
successful compile and call it end-to-end proof. Never launch an external game without explicit
authorization.

Browsers cannot grant pointer lock after an asynchronous compile without a fresh user gesture. Fly
mode is active immediately, but mouse-look begins when the user clicks the compiled preview. Camera
seeding happens only when a new preview is installed; toggling between source and an existing
compiled preview preserves each view's own camera.
