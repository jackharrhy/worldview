# Worldview documentation

Each document has one job. Link to the owner instead of copying its contents into another README.

## Start here

| Need                                            | Canonical document                              |
| ----------------------------------------------- | ----------------------------------------------- |
| Product scope, architecture, and data authority | [Product and architecture](./plan.md)           |
| Unfinished work and acceptance criteria         | [Backlog](./cleanup-plan.md)                    |
| Current editor behavior                         | [Editor capabilities](./editor-capabilities.md) |
| Published viewer usage                          | [Viewer API](./viewer-api.md)                   |

## Focused architecture contracts

These documents expand one boundary from the architecture plan. They do not maintain separate
roadmaps or completion diaries.

- [React UI ownership](./react-ui-ownership.md): React, presenter, ref, and imperative-browser
  boundaries.
- [Interface system](./interface-system.md): controls, themes, iconography, and editor UI language.
- [Server-side projects](./server-side-projects.md): hosted storage, permissions, routes, and builds.
- [4orm OAuth](./4orm-oauth.md): login, sessions, identity, and authorization separation.
- [Artbin integration](./artbin-integration.md): remote asset authentication, mounts, and content
  verification.
- [Collaboration](./collaboration.md): map authority, semantic operations, presence, reconnect, and
  room runtime.

## Behavior and compatibility references

These documents say what works now or record evidence for a supported boundary. Future work belongs
in the backlog.

- [Editor capabilities](./editor-capabilities.md): concise current feature matrix and verification
  entrypoints.
- [TrenchBroom conformance](./trenchbroom-conformance.md): pinned reference behavior, matches, and
  intentional differences.
- [Quake II compatibility](./quake2-compatibility.md): source, BSP38, asset, and corpus evidence.
- [Viewer API](./viewer-api.md): consumer installation and examples.

## Operations and local setup

- [Publishing](./releasing.md): npm release procedure.
- [Verification](./verification.md): repository gates, browser tiers, GPU checks, corpora, and live
  infrastructure tests.
- [Compiler service](../apps/compiler-service/README.md): local and production compiler adapter.
- [Development viewer](../apps/viewer/README.md): ignored local fixture layout.
- [Local fixture directory](../apps/viewer/public/local/README.md): generated corpus location and
  safety rules.

Package READMEs are short npm or workspace landing pages. Root documentation owns shared product,
architecture, API, and provenance material. `THIRD_PARTY_NOTICES.md` remains the source-provenance
record; package copies link back to it.

## Maintenance rule

- Put a settled cross-cutting decision in `plan.md`.
- Put detailed rules for one subsystem in its focused architecture contract and link it from the
  plan.
- Put current user-visible support in a capability or compatibility reference.
- Put every unfinished task in `cleanup-plan.md` and link to it instead of restating the task.
- Put commands that operate one app beside that app.
- Put release-consumer examples in `viewer-api.md`; keep package READMEs brief.
