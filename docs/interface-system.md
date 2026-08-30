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

## Primitive rollout

The initial primitive set is button, icon button, text field, number field, select, checkbox, menu,
popover, dialog, tabs, and tooltip. Adoption is incremental but one-way: once a primitive exists,
new raw equivalents require a documented native-browser reason.

The first slice establishes button/field/menu styling and converts the viewport context menu from
imperative DOM construction to a React-owned React Aria surface. `/design` must show this slice in
both themes with ordinary, hover/pressed reference, focus-visible, disabled, invalid, selected/open,
busy, and long-label cases before broader replacement begins.
