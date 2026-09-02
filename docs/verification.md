# Verification

This document owns repository-wide verification commands and test tiers. Feature documents explain
what a contract means; tests and generated reports remain the executable evidence.

## Baseline gate

Run the complete repository gate before merging cross-cutting work:

```sh
npm run check
```

It covers formatting, architecture checks, theme checks, lint, types, unit tests, collaboration
bake-off and compatibility checks, builds, route boundaries, consumer compilation, and package
contents.

Use the smallest production-domain suite while iterating:

```sh
npm test --workspace @jackharrhy/worldview-editor -- test/session-materials.test.ts
npm test --workspace @worldview/editor -- test/project-workspace.test.ts
npx playwright test tests/browser/editor/editor-materials.spec.ts --project=chromium --workers=1
```

Editor package tests are split by core command domain. Editor browser tests live under
`tests/browser/editor` and share only deterministic fixture builders and spatial browser helpers.
The root `package.json` remains the canonical command list; `npm run test:editor` runs both editor
workspaces, while `npm run test:browser:editor` builds their dependencies and runs the complete
editor Playwright directory serially.

## Browser editor

```sh
npm run test:browser:ci
npm run test:browser:editor
npm run test:browser
node .agents/skills/verify-worldview-editor/scripts/verify-editor.mjs
```

The CI browser suite is a bounded serial smoke test. The full Playwright suite and the editor
verification skill cover the real application, WebMCP authoring, visible state, undo, map loading,
and headless WebGPU behavior.

The performance gate is explicit because shared CI hardware is not a useful renderer benchmark:

```sh
npm run test:editor-performance
```

It exercises an 8,000-brush fixture and records load, selection, transform, material, undo, frame
cadence, and retained-scene invalidation. Its fixed envelope is deliberately broad enough for the
project's older headless Xeon workstation and is recorded in every report. Use the attached
measurements for hardware-specific comparisons instead of silently changing the fixture.

## Viewer and package

```sh
npm run check:viewer
npm run test:browser:viewer
npm run test:package
npm run corpus:check
```

The package check builds the npm tarball without publishing it. The corpus check uses ignored local
game data when available; setup belongs in the
[local fixture README](../apps/viewer/public/local/README.md).

## Collaboration

```sh
npm run test:collaboration-bakeoff
npm run test:collaboration-celld-compat
npm run test:collaboration-celld-live
```

The live test needs Docker and host infrastructure. It starts or reuses loopback Azurite, deploys
the real Worker through celld, submits a WebSocket operation, kills celld, removes local replica
state, and requires recovery from blob storage.

## Test data

Generated fixtures and redistributable source fixtures may run in ordinary CI. Commercial,
shareware, and behavior-oracle game data stays in ignored local directories. Optional local tests
must skip clearly when their corpus or required GPU infrastructure is absent; they must never copy
that data into package or production artifacts.
