# Interface system

Worldview uses native CSS with semantic custom properties and focused React primitives. The same
semantic color model serves pre-editor routes, editor chrome, and the WebGPU theme bridge. `/design`
is the development specimen for dark and light palettes, controls, forms, project rows, empty states,
and representative editor chrome.

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

Shared route components live in `apps/editor/src/components/ui.tsx`. New pre-editor UI should use
these components instead of introducing route-specific button, field, heading, or empty-state
markup. Editor internals may keep focused class-based components where presenters need stable DOM
contracts.

StyleX and Tailwind are intentionally not part of the current stack. Either would create a second
token and styling model beside the CSS-variable renderer bridge, while much of the editor relies on
stable semantic class names for presenter-driven state. Native CSS keeps runtime theme changes and
WebGPU color resolution direct, inspectable, and dependency-free.
