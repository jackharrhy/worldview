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

All workspace unit tests and viewer host helpers participate in strict TypeScript checking.
Prioritize observable failures over setter/getter mirrors: history properties include cancelling
edits, stale previews must leave the whole session unchanged, and pointer cancellation is exercised
in the real browser. Compiler contract tests pass actual native subprocess results through the
browser adapter and test hosted rejection of mismatched revisions. The synthetic native executable
uses a POSIX shebang, so those two subprocess cases skip on Windows; protocol tests still run there.

## Architecture contracts

Run the architecture gate directly while changing package or ownership boundaries:

```sh
npm run check:architecture
```

Every failure links to its governing section in [the architecture plan](./plan.md). The gate keeps
the checks intentionally structural:

| Contract                                                             | Evidence                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| GPU-independent viewer and editor cores                              | A DOM-free TypeScript configuration plus source-boundary checks          |
| Public workspace entrypoints and appropriate dependency declarations | Repository import-graph and lockfile checks                              |
| No static runtime cycles between production modules or workspaces    | Repository import-graph checks; type-only and dynamic edges are excluded |
| React confined to applications                                       | Manifest and production-source checks                                    |
| Renderer direction and TypeGPU resource ownership                    | Repository renderer checks plus the focused editor frame check           |
| Lightweight public routes and isolated hosted-service routes         | Source and production route-graph checks                                 |
| Session, presenter, DOM, and retained-renderer ownership             | Focused editor architecture checks                                       |
| Production and named coordination-module ceilings                    | Repository and editor line ceilings                                      |

Licensing, provenance, and whether a new abstraction preserves product intent remain human review
responsibilities: syntax cannot establish where an algorithm or game asset came from. Review
`THIRD_PARTY_NOTICES.md`, focused source comments, fixture licensing, and package contents whenever
those areas change. Behavioral authority—authorization, `MapCell` persistence, undo, rendering,
and collaboration—belongs in domain and browser tests rather than static architecture rules.

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
cadence, actual GPU submissions, adapter identity, and retained-scene invalidation. It waits for
submitted GPU work to finish and rejects page errors, GPU validation messages, and visible renderer
failure. On Linux the hardware run explicitly uses Vulkan for ANGLE; ordinary browser verification
continues to use SwiftShader. RAF cadence includes browser/compositor work and is not a GPU timing
measurement. Its fixed envelope is deliberately broad enough for the
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

The live test uses `CELLD_BIN` with an isolated SQLite store and random loopback port. Set
`CELLD_TEST_IMAGE` to test a built collaboration image through Docker instead. It deploys the
real Worker, submits a WebSocket operation and checkpoint, kills Celld, removes local replica
state, and verifies the exact map snapshot, checkpoint, and idempotent operation receipt from a
fresh node. It creates only disposable fixture data.

## Test data

Generated fixtures and redistributable source fixtures may run in ordinary CI. Commercial,
shareware, and behavior-oracle game data stays in ignored local directories. Optional local tests
must skip clearly when their corpus or required GPU infrastructure is absent; they must never copy
that data into package or production artifacts.
