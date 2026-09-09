# Rendering compatibility

The standalone viewer and editor's compiled preview use the same renderer. Lighting policy lives
in `packages/worldview/src/render/world-lighting.ts` and is selected from the parsed BSP format.
The application hosting an engine does not change a BSP29 texture into a GoldSrc texture.

| Format                                              | Palette and fullbrights                                                                                                         | Lighting baseline                                                                                        |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Quake BSP29 / BSP2                                  | Included standard palette or custom override; indices 224–255 bypass lightmaps, except transparent index 255 on masked textures | QSS-M with gamma 1, contrast 1, overbrights enabled; normal lightstyle 264/256                           |
| GoldSrc BSP30, including Half-Life / Counter-Strike | Embedded or WAD3 per-texture palettes; no universal fullbright index range                                                      | Existing neutral preview; native texgamma, lightgamma, brightness, and display settings are not emulated |
| Quake II BSP38                                      | Game PCX palette for WALs; no Quake fullbright index rule                                                                       | Existing Quake II lightmaps and sampleless-surface behavior                                              |

These are engine-family rules, not artistic color filters. A yellow or brown result can originate
in palette interpretation or authored textures and colored lighting. Changing brightness cannot
repair palette indices encoded for a different palette. Imported WAD data is preserved; the
generated developer WAD's restricted color search does not rewrite imported textures.

## Editor and export colors

`developmentTexturePack` generates the WAD for the selected game and decodes the editor material
pixels from it. Quake uses the included standard palette, both locally and in hosted projects;
an explicitly supplied custom palette overrides it.
GoldSrc generates WAD3 textures with their own palettes, so the development pack's original orange
and grey survive export. WAD2 imports use the selected Quake palette; WAD3 imports use only
their embedded palettes. Incompatible WAD versions stop import/build rather than being silently
converted. Imported authored texture data is not re-encoded.

Fresh native builds of the retained user map were captured in QSS-M and Xash/CS with the same
camera. The old diagnostic palette encoded the orange as index 22, which the actual Quake palette
interprets as brown `(63, 47, 23)`. The corrected Quake pack previews and exports its nearest ordinary
palette orange `(175, 103, 35)`. The GoldSrc pack preserves the original `(205, 82, 13)` and compiles
to BSP30 using `-hlbsp`. These are decoded base texture colors; baked lighting and engine display
settings still affect their appearance in a scene. Previously built BSPs require a rebuild.

## Quake engine comparison

QSS-M 1.6.5's Linux release (commit `3de3009ec672492ea06088b2ccca98c500503faf`) was run under Xvfb
with Mesa OpenGL. Worldview was captured through its public custom element using headless WebGPU,
including the machine's Nvidia GPU through Vulkan.
Both consumed identical BSP bytes and the palette extracted from the local Quake installation.
The standard Quake palette is now included under the documented compatibility-data exception;
the comparison maps, game artwork, archives, and GPL engine sources remain external.

The reference settings were `gamma 1`, `contrast 1`, `gl_overbright 1`, `gl_fullbrights 1`,
`gl_texturemode GL_LINEAR_MIPMAP_LINEAR`, `r_drawviewmodel 0`, and `viewsize 120`. At 800×600,
Quake's horizontal FOV 90 corresponds to Worldview's vertical FOV 73.739795°. A stationary Quake
player origin requires its 22-unit view height and 1/32-unit view offset when matching cameras.

The comparison used a retained user BSP plus a controlled variant with constant light samples and
ordinary/fullbright palette bands. It demonstrated two Worldview defects: fullbright pixels were
being lightmapped, while ordinary Quake colors received an extra 1.4× boost and 0.9 power curve.
The renderer now preserves the fullbright contribution separately and uses the reference Quake
lightmap scale. Original decoded RGBA and imported WAD bytes remain intact.

`tests/browser/viewer-lighting.spec.ts` checks rendered colors through the public viewer for Quake
and GoldSrc, including ordinary lighting, fullbright palette boundaries, wholly unlit maps, dark
sampleless faces, and independent lightmap filtering. Decoder coverage includes all four authored
mips and masked index 255. The engine comparison is local evidence, not a mandatory CI dependency.

## Xash and Counter-Strike comparison

The [native capture driver](./engine-capture.md) runs a pinned 32-bit Xash build with the local
CS 1.6 assets, original CS server library and CS16Client. It has captured the same retained
hosted BSP29 and the installed BSP30 `de_dust`, with native camera readback before and after
each screenshot. The latter also verifies loading CS textures and its sky from the game root.

The pinned Xash defaults are gamma 2.5, brightness 0, texgamma 2, lightgamma 2.5, gl_overbright 1
and gl_vbo_overbrightmode 0. These differ from the neutral QSS-M comparison above. In particular,
running a Quake BSP29 through CS does not turn its indexed textures into WAD3 textures. The
retained test BSP's brown palette interpretation and bright grid lines also appear in Xash.

This gives us a reproducible native reference for future GoldSrc lighting comparisons. It does
not yet establish a matched Worldview/Xash gamma transform. CS16Client is used because the Steam
client's unsupported VGUI2 initialization crashes on this host; this is not a Valve-engine capture.

## Limits

QSS-M is a Quake reference, not proof of native Half-Life, Counter-Strike, or Xash gamma parity.
GoldSrc's configurable texture/light gamma still needs a matched Worldview/native comparison
before changing that preview. Quake II has its own [compatibility record](./quake2-compatibility.md).
QSS-M regenerates OpenGL mipmaps from the base image; Worldview currently consumes authored BSP/WAD
mips. Minified pixels can consequently differ. Filtering, multisampling, lightmap precision, and
engine display settings also prevent a claim of universal pixel identity.

SwiftShader produced a clipped-triangle artifact with the comparison camera almost on a polygon
edge. The same bytes and camera rendered correctly with the Vulkan backend; moving that camera
also removed the artifact. Use a second GPU backend before treating headless-only clipping artifacts
as map or lighting errors.
