# Face inspector implementation plan

This is the canonical implementation checklist for rebuilding Worldview's Face inspector and
material workflow. [`plan.md`](./plan.md) remains authoritative for product scope and
[`cleanup-plan.md`](./cleanup-plan.md) remains authoritative for structural workstream order. This
document defines the behavior, ownership, delivery slices, and verification for this program.

**Status:** delivered on `feat/face-inspector` on 2026-08-31. The implementation, TrenchBroom
behavior/source audit, application-wide icon migration, and verification gates are complete.

## Outcome

The Face tab should feel like one dense editing instrument rather than a stack of forms. It gives
the selected face's texture plane visual priority, keeps common projection operations permanently
available, and dedicates the lower inspector to a fast material browser. Asset-source configuration
remains available from project/map settings but does not compete with routine face editing.

```text
Face
├── UV plane
│   ├── material tiled across the visible plane
│   ├── selected-face outline and direct manipulation handles
│   └── compact reset, flip, rotate, and grid controls
├── Face attributes
│   ├── material, size, offset, scale, and angle
│   └── always-visible align, justify, and fit controls
├── Draggable splitter
└── Material Browser
    ├── Browser / Settings title row
    ├── virtualized material cells
    └── Name / Group / Used / Search controls
```

This direction is informed by TrenchBroom's `FaceInspector`, `FaceAttribsEditor`, `UvEditor`,
`UvView`, `UvViewHelper`, UV tool controllers, and `MaterialBrowser` at upstream commit
`b19dad059dc6db517c8505ddfffc8f7e24fa1d36`. TrenchBroom is a behavior and architecture oracle only:
its GPL source and SVG assets must not be copied into Worldview.

## Product decisions

- The UV plane is a persistent editor camera, not a diagram recomputed from projection values after
  every edit.
- The material repeats across the full visible plane. The selected face is an overlay on that plane,
  not the only textured region.
- Face projection updates remain reversible `EditorSession` transactions. A pointer gesture has one
  begin/update/commit/cancel lifecycle and creates one history entry.
- Immediate local feedback does not wait for collaboration acknowledgement or broad inspector
  recomputation. Collaboration may publish the same preview without becoming its local authority.
- The graphical UV editor is active for one selected face. Multiple faces use mixed-value fields and
  batch commands rather than a misleading composite plane.
- Alignment controls are always visible and icon-led, not hidden inside a disclosure.
- Material browsing is the primary lower-panel task. WADs, palettes, and other sources belong in
  project/map resource settings.
- Secondary operations such as select every use, copy name, and find/replace live in context menus
  or settings rather than permanent rows.
- The Face inspector is a React DOM ownership slice. React owns controls, labels, material cells,
  state, and overlays; a focused renderer may own pixels inside a React-owned UV surface.
- The UV surface need not use WebGPU merely because the main viewports do. A small Canvas 2D, SVG,
  or comparable renderer is preferable to coupling inspector UI to the main TypeGPU renderer.

## Application-wide icon system

Phosphor is Worldview's icon family across the browser product, not a Face-inspector-only choice.
`@phosphor-icons/web` is already installed and used by the editor; this program turns that informal
usage into a shared system.

### Contract

- Add one React-owned `Icon` component and typed semantic icon registry. Components request meanings
  such as `save`, `fit-horizontal`, or `rotate-clockwise`, not raw `ph-*` class strings.
- Use Phosphor Regular by default with shared optical size and weight. Theme/component layers own
  color, disabled, pressed, selected, and high-contrast behavior.
- The same command uses the same icon everywhere; the accessible label remains the source of truth.
- Icon-only controls use the shared `IconButton`, accessible name, tooltip, focus treatment, and a
  keyboard path where the command is frequent.
- Decorative icons are hidden from assistive technology. Status remains available as text rather
  than relying on color or shape alone.
- Do not mix emoji, Unicode action glyphs, copied SVGs, another icon font, or arbitrary inline paths
  into product controls. Mathematical characters remain acceptable when they are data.
- Prefer a Phosphor symbol or composition. If a map-editor-specific symbol is genuinely missing,
  create an original MIT-compatible icon normalized to the same view box and optical rules, and
  record its provenance. Never trace or copy a TrenchBroom/GPL icon.
- Import Phosphor at one application boundary; routes and features do not own icon-font loading.
- Migration covers Worldview-authored UI in `apps/editor` and `apps/viewer`: pre-editor routes,
  dialogs, menus, inspectors, viewport chrome, status, and `/design`.

### Checklist

- [x] Inventory raw `ph-*` strings, inline SVGs, Unicode action/status glyphs, CSS marks, and
      icon-like images in both browser applications.
- [x] Define the semantic icon-name union and its Phosphor mapping in one module.
- [x] Add `Icon` and `IconButton` with size, tooltip, accessibility, busy, pressed, selected, and
      disabled contracts.
- [x] Add every semantic icon/state to `/design` in dark and light themes.
- [x] Convert shared primitives and editor chrome before building the Face toolbar.
- [x] Convert remaining inspectors, menus, dialogs, collaboration, project routes, status surfaces,
      and viewer controls.
- [x] Replace build-history check/cross glyphs and other status/action impostors.
- [x] Add an architecture check rejecting raw Phosphor classes and action SVGs outside the icon
      implementation and a short documented renderer allowlist.
- [x] Remove duplicate route-level icon imports and unused icon CSS.
- [x] Complete an application-wide visual and accessible-name audit. The Face program is not done if
      it is the only surface using the new contract.

## Interaction contract

| Input                                    | UV-plane behavior                                    |
| ---------------------------------------- | ---------------------------------------------------- |
| Primary drag on material                 | Changes offset with active-grid snapping             |
| Primary drag on a scale guide            | Changes U or V scale without moving the camera       |
| Primary drag on pivot/axes               | Repositions the projection origin                    |
| Primary drag on rotation control         | Rotates around the pivot with angle snapping         |
| Middle or secondary drag on empty space  | Pans only the UV camera                              |
| Wheel/trackpad zoom                      | Zooms around the pointer without changing projection |
| Platform modifier during projection drag | Temporarily bypasses snapping                        |
| Escape during a gesture                  | Restores gesture-start projection and camera state   |
| Pointer release                          | Commits once without recentering or jumping          |

Camera actions never change the document revision. Projection actions never reset the camera.
Selecting another primary face may frame it once; rerendering, editing a field, or receiving the
commit must not frame it again.

## State and ownership contracts

### Face domain

React consumes an immutable snapshot and narrow command port, never `EditorState`, `EditorElements`,
or presenter-to-presenter access. The snapshot distinguishes no face, one face, and multiple faces;
represents mixed values explicitly; and includes command availability rather than asking components
to infer it. It covers:

- primary face identity and selection count;
- material name/dimensions, offset, scale, angle, surface flags/value, and mixed states;
- UV camera and projection overlay data for exactly one face;
- availability of reset, align, justify, fit, flip, rotate, sample, and apply commands;
- material filters, cells, active material, in-use counts, and loading/error state.

### UV camera and renderer

Introduce explicit view state equivalent to:

```ts
interface UvViewportState {
  readonly center: readonly [number, number];
  readonly zoom: number;
  readonly subdivisions: readonly [number, number];
}
```

It is view state, not map source. It survives edits for the same face and resets only through a
named command or primary-face change. Render, in order: full-plane repeated material, readable UV
grid, selected face boundary, U/V axes and handles, then hover/drag/snap/focus overlays.

### Preview and commit pipeline

- Pointer movement updates a local gesture candidate immediately.
- UV pixels and compact readouts update from it on the next animation frame.
- Main-viewport preview is coalesced to at most one update per animation frame.
- Broad summaries, issue scans, organization derivation, and material usage aggregation do not run
  on every movement.
- Collaboration preview is lossy and rate-bounded. It cannot overwrite the local candidate or create
  history.
- Release commits the latest candidate once; cancel restores the start; remote acknowledgement
  causes no second local transition.

### Material browser

React owns cell DOM, selection, controls, states, and context menu. The presenter publishes snapshots
and opaque commands; it does not create or mutate visible nodes. Large real catalogs use grid
virtualization with stable material identity, retained thumbnails, and focus that survives recycling.

One activation applies a material to an applicable face/brush selection and updates the current
material; with no selection it only updates the current material. Active and in-use materials have
distinct theme-backed states. Permanent bottom controls are Name/Usage sort, Group/source, Used, and
Search. Select-all-uses, select-brushes, copy name, and find/replace assignment belong in a context
menu. Bulk replacement is a secondary workflow, not a permanent form.

## Delivery slices

Each slice must be independently reviewable. Completing a slice does not imply later criteria pass.

### F0 — Baseline and contracts

- [x] Capture current one-face, multi-face, missing-material, large-catalog, dark, and light states.
- [x] Add focused regressions for release-time jump, face-only fill, and broad preview cost.
- [x] Define typed snapshots, commands, gesture state, and semantic icons without moving transaction
      ownership out of `EditorSession`.
- [x] Record behavioral reference files/commit and any new dependency provenance in the pull request.

### F1 — Shared icon foundation

- [x] Complete the registry, `Icon`, and `IconButton` foundation.
- [x] Convert shared primitives and editor chrome before Face controls consume it.
- [x] Add architecture enforcement and `/design` coverage before adding new Face icons.

### F2 — Stable UV plane

- [x] Separate camera state from face projection state.
- [x] Tile the active material across the full plane, including outside the face.
- [x] Frame only on primary-face change or explicit reset/frame.
- [x] Add pan and pointer-anchored bounded zoom.
- [x] Render crisp grid, face, axes, handles, interaction, and focus layers in both themes.
- [x] Preserve intentional missing-material and non-editable states.

### F3 — Direct manipulation and preview performance

- [x] Implement offset, scale-guide, pivot/axis, and rotation gestures under one lifecycle.
- [x] Preserve grid/angle snapping and modifier bypass.
- [x] Update local visuals immediately and coalesce main-viewport previews with animation frames.
- [x] Replace full `updateInspector()` calls during movement with narrow updates.
- [x] Keep remote preview bounded and independent from local responsiveness.
- [x] Commit one undo entry on release and restore exactly on cancel.

### F4 — Dense Face attributes

- [x] Remove redundant Selected face, format, UV editor, and Projection headings.
- [x] Replace raw inputs/separate Apply with shared number fields and explicit mixed values.
- [x] Keep material, dimensions, offset U/V, scale U/V, and angle in a compact aligned grid.
- [x] Move raw U/V vectors behind advanced details unless the format requires direct editing.
- [x] Keep reset, world-align, flip, rotate, justify, fit, and edge-align permanently visible as
      grouped icon controls.
- [x] Give each icon an accessible label, tooltip, state, and stable command ID.
- [x] Integrate profile-specific surface attributes without nested-card hierarchy.
- [x] Make no-face and multi-face states intentional and keyboard-operable.

### F5 — Split layout and material browser

- [x] Add a keyboard-operable splitter with usable minimums and machine-local persistence.
- [x] Move material cells/interactions from `materials-presenter.ts` into React.
- [x] Virtualize the catalog and preserve focus/selection through filter/sort/recycling.
- [x] Build the fixed Name/Group/Used/Search bottom strip.
- [x] Implement apply/current semantics and distinct active/in-use states.
- [x] Move usage, copy, and replacement assignments into a React Aria context menu.
- [x] Add Browser/Settings navigation without an inline nested settings card.

### F6 — Resource settings

- [x] Remove first-class Load WAD and Palette actions from Face.
- [x] Give project/map settings ownership of ordered resources, palettes, directories, remote mounts,
      load state, and errors.
- [x] Keep native file/directory pickers behind typed React refs and commands.
- [x] Update the catalog incrementally while preserving valid material/filter state.
- [x] Keep profile defaults and local-only handles distinct from serialized project data.

### F7 — Product-wide convergence and cleanup

- [x] Finish the application-wide Phosphor migration and audit.
- [x] Remove obsolete Face markup, IDs, presenter DOM contracts, CSS, and tests.
- [x] Remove Face/material UI references from `EditorElements`; keep only their explicit UV surface
      and native-file boundaries while the broader C1 migration continues.
- [x] Extend the imperative-visible-DOM architecture gate to Face/material surfaces.
- [x] Update `/design`, product docs, cleanup status, and this status with delivered behavior.

## Verification gates

### Behavior and performance

- [x] A material repeats beyond every side of a small face at multiple pan/zoom levels.
- [x] Offset, scale, origin, and rotation stay under the pointer and do not jump on release.
- [x] Camera actions do not change revision/history; one projection gesture makes one undo entry.
- [x] Fields, icon commands, and manipulation produce equivalent projection results.
- [x] One-face, multi-face, brush, no-selection, mixed, and missing-material states are reversible.
- [x] UV input presents at most once per frame and broad derivation does not run per movement.
- [x] A representative large catalog mounts only visible/overscan cells and scrolls without decoding
      or recreating every thumbnail per frame.
- [x] Main preview and collaboration publishing are independently bounded; network delay never delays
      local feedback.

### Accessibility, design, and architecture

- [x] Every icon command is keyboard-reachable, named, tooled, and exposes its state correctly.
- [x] UV gestures have named field/button equivalents where spatial keyboard input is impractical.
- [x] Splitter, grid, filters, menus, fields, and tabs follow React Aria focus contracts.
- [x] Dark/light themes keep material states, grid, handles, focus, hover, and disabled UI legible.
- [x] Face has no collapsed common controls, nested cards, permanent replacement form, or asset row.
- [x] The product has one icon family and semantic registry after the final audit.
- [x] React owns visible Face/material DOM; the UV renderer owns only its explicit pixel surface.
- [x] Core projection/transaction modules remain free of DOM, React, WebGPU, and TypeGPU.
- [x] `EditorSession` remains the only document/history commit authority.
- [x] No TrenchBroom GPL source or icon enters the repository.
- [x] Focused unit/component/browser/WebMCP tests, architecture checks, and `npm run check` pass.

## Definition of done

This program is complete: every slice and verification gate above is satisfied, the old imperative
material/Face UI has been removed, and the application-wide icon audit is complete. The broader C1
conversion of unrelated editor surfaces remains tracked in [`cleanup-plan.md`](./cleanup-plan.md).
