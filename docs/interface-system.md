# Interface system

Worldview uses React Aria Components for conventional interaction behavior, React-owned Worldview
primitives for product UI, and native CSS with semantic custom properties for appearance. The same
semantic color model serves pre-editor routes, editor chrome, and the WebGPU theme bridge. `/design`
is the development specimen for dark and light palettes, complete control states, forms, menus,
project rows, empty states, and representative editor chrome.

The visual language is compact and geometric. Containers use borders or spacing for hierarchy,
with two-pixel control corners and square structural surfaces. Gradients, decorative glass, floating
cards, and large ambient shadows do not belong on product routes. Motion is reserved for direct
interaction feedback and must respect reduced-motion preferences.

The live editor is viewport-first. Its top command bar keeps Home, New, Save, Undo, Redo, Source,
and Compile visible, while open/create, recovery, build-result, and other document commands live in
short named menus. Editing modes occupy a single vertical rail beside the viewports. Selection
commands appear contextually in that rail, and persistent grid, texture-lock, visibility, and less
common edit controls remain anchored at its foot. This is command hierarchy, not feature removal:
stable action contracts and keyboard paths remain available to presenters and automation.

Shared route components begin in `apps/editor/src/components/ui.tsx`; focused control primitives may
be split beneath `apps/editor/src/components/ui/` as the system grows. New UI must use these
components instead of introducing route-specific buttons, fields, headings, menus, dialogs, tabs, or
empty-state markup. Presenters expose immutable snapshots and commands rather than retaining visible
DOM contracts. Canvas, pointer capture, focus, measurement, native file inputs, and native dialog
lifetimes remain explicit ref boundaries.

StyleX and Tailwind are intentionally not part of the current stack. Either would create a second
token and styling model beside the CSS-variable renderer bridge, while much of the editor relies on
stable semantic class names for presenter-driven state. Native CSS keeps runtime theme changes and
WebGPU color resolution direct, inspectable, and dependency-free.

## Control language

The editor is a dense desktop tool, not a consumer web form. Its controls should feel precise,
quiet, and durable under repeated use:

- Two-pixel corners are the default. Structural surfaces remain square; circular geometry is
  reserved for genuinely radial controls, avatars, and status indicators.
- Neutral surfaces carry hierarchy through border, fill, and text contrast. The application accent
  indicates focus, selection, and primary intent rather than decorating every control.
- Buttons use explicit `primary`, `secondary`, `quiet`, `danger`, and icon-only variants with shared
  compact height and padding tiers. Text does not wrap inside ordinary controls.
- Fields read as inset editing surfaces with persistent labels, legible values and placeholders,
  tabular numeric text where useful, and errors adjacent to the field.
- Menus and popovers use one overlay elevation, compact rows, stable icon/label/shortcut columns,
  restrained separators, clear disabled states, and submenus only for real hierarchy. They do not
  contain nested card surfaces.
- Every primitive implements default, hover, pressed, selected, focus-visible, disabled, invalid,
  busy, and open states where applicable. Hover never carries information that focus lacks.
- Press feedback is a small fill/border change and at most a one-pixel translation. Decorative
  animation, glow, glass, large shadows, and spring motion do not belong in routine editor controls.
- Dark and light themes preserve the same hierarchy and meet WCAG AA contrast. Focus remains obvious
  against every surface without relying on color alone.

React Aria supplies semantics, focus management, keyboard behavior, overlay dismissal, and pointer
modality. Worldview owns the DOM composition, labels, iconography, density, theme tokens, and visual
states. React Spectrum styling is not used.

## Iconography

Phosphor is the single icon family for Worldview-authored browser UI. Product components consume a
typed semantic `Icon` registry instead of embedding raw `ph-*` names, Unicode action glyphs, copied
SVGs, or icons from another family. Phosphor Regular is the default weight; shared components own
optical size, color, focus, pressed, selected, disabled, tooltip, and accessible-name behavior.

An original MIT-compatible map-editor icon may be added only when Phosphor has no suitable symbol or
composition. It must use the shared view box and optical rules and have its provenance recorded;
GPL editor artwork is a behavior reference, not an asset source. The application-wide migration is
complete and the architecture check rejects raw Phosphor classes, action SVGs, and competing icon
dialects outside the documented renderer allowlist.

## Implemented primitives

The shared set includes button, icon button, text field, number field, select/listbox, checkbox,
menu/submenu, popover, modal dialog, tabs, tooltip, splitter, compact field groups, and virtualized
catalog cells. New raw equivalents require a documented native-browser reason.

Viewport menus, inspectors, catalogs, collaboration/project dialogs, toolbar overflow, and
pre-editor routes use these primitives. `/design` shows their dark/light states, including ordinary,
hover, pressed, focus-visible, disabled, invalid, selected/open, busy, and long-label cases.

React Aria's focus-scope sentinels and visually hidden native inputs may carry library-generated
inline clipping styles; application-authored visible layout remains class- and token-driven.

## Face inspector

The Face tab is one dense editing workspace rather than a stack of cards:

```text
Face
├── persistent tiled UV plane and direct manipulation
├── compact projection values and always-visible alignment commands
├── draggable split
└── virtualized material browser with fixed sort/filter/search controls
```

The UV camera is machine-local view state and changes neither document revision nor projection.
Offset, pivot, rotation, and scale gestures update locally on the next frame, publish collaboration
preview independently, and commit or cancel exactly once through `EditorSession`. Multi-face edits
use mixed values and relative batch commands; the graphical plane represents only the primary face.

React owns controls, material cells, state, and overlays. A focused SVG/canvas renderer owns only
pixels and high-frequency geometry inside its React-provided root. WADs, palettes, directories, and
remote mounts belong to project/map resources, not to routine face editing. The complete current
behavior is summarized in [`editor-capabilities.md`](./editor-capabilities.md#faces-and-materials).
